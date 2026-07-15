"""Hermes office backend — poll Hermes + broadcast agent positions over WS."""

from __future__ import annotations

import asyncio
import json
import math
import os
import re
import sqlite3
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

HERMES_HOME = Path(os.environ.get("HERMES_HOME", r"D:\develop\e2e\hermes"))
KANBAN_DB = Path(
    os.environ.get(
        "HERMES_KANBAN_DB",
        str(HERMES_HOME / "kanban.db"),
    )
)
GATEWAY_LOG = HERMES_HOME / "logs" / "gateway.log"
POLL_SECONDS = 5.0
TICK_SECONDS = 0.05  # 20 Hz position interpolate
SPEED_PX = 100.0  # px/s
TILE = 16

# Pixel centers — public/assets/office-map.json properties.waypoints (tile → px)
WAYPOINTS = {
    "desks": [
        {"x": 3 * TILE + TILE // 2, "y": 6 * TILE + TILE // 2},
        {"x": 7 * TILE + TILE // 2, "y": 6 * TILE + TILE // 2},
        {"x": 9 * TILE + TILE // 2, "y": 20 * TILE + TILE // 2},
    ],
    "meeting": {"x": 17 * TILE + TILE // 2, "y": 10 * TILE + TILE // 2},
    "break": {"x": 32 * TILE + TILE // 2, "y": 6 * TILE + TILE // 2},
    "sleep": {"x": 32 * TILE + TILE // 2, "y": 21 * TILE + TILE // 2},
}

# Sprite sheets shipped with FE (cycle when profiles > 3)
SHEETS = ["char-mushroom", "char-onion", "char-claude"]

BUBBLES = {
    "running": "코드 작업 중...",
    "blocked": "검토 대기 중...",
    "idle": "휴식 중 ☕",
    "offline": "오프라인",
    "chatting": "응답 중...",
}


def _tile_to_zone(status: str, home_desk: int) -> tuple[str, dict[str, float]]:
    desks = WAYPOINTS["desks"]
    desk = desks[home_desk % len(desks)]
    if status in ("running", "chatting"):
        return "desk", desk
    if status == "blocked":
        return "meeting", WAYPOINTS["meeting"]
    if status == "offline":
        return "away", desk
    if status == "idle":
        return "sleep", WAYPOINTS["sleep"]
    return "break", WAYPOINTS["break"]


def _profile_root(profile: str) -> Path:
    if profile == "default":
        return HERMES_HOME
    return HERMES_HOME / "profiles" / profile


def _gateway_log_path(profile: str) -> Path | None:
    root = _profile_root(profile)
    for p in (root / "logs" / "gateway.log", root / "gateway.log"):
        if p.exists():
            return p
    return None


def _read_area_json(profile: str) -> dict[str, Any]:
    """Optional per-profile override: HERMES_HOME[/profiles/X]/area.json"""
    root = _profile_root(profile)
    for name in ("area.json", "office.json"):
        path = root / name
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            continue
    return {}


def _discord_connected_name(profile: str) -> str | None:
    """Last `[Discord] Connected as NAME#tag` from that profile's gateway log."""
    path = _gateway_log_path(profile)
    if not path:
        return None
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        return None
    found: str | None = None
    for line in lines:
        m = re.search(r"Connected as\s+(.+?)(?:#\d+)?\s*$", line)
        if m:
            found = m.group(1).strip()
    return found or None


def _soul_display_name(profile: str) -> str | None:
    """Parse SOUL.md first heading — prefer `(paren)`, else after em/en dash."""
    soul = _profile_root(profile) / "SOUL.md"
    if not soul.exists():
        return None
    try:
        text = soul.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("#"):
            continue
        title = re.sub(r"^#+\s*", "", line).strip()
        if not title:
            continue
        paren = re.search(r"\(([^)]+)\)\s*$", title)
        if paren:
            return paren.group(1).strip()
        for sep in ("—", "–", "-"):
            if sep in title:
                tail = title.split(sep)[-1].strip()
                if tail:
                    return tail
        return title
    return None


def resolve_display_name(profile: str, alias: str = "") -> str:
    """Local PC Hermes profile → display label (no hardcoded nicknames)."""
    area = _read_area_json(profile)
    raw = area.get("displayName") or area.get("display_name") or area.get("name")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    disc = _discord_connected_name(profile)
    if disc:
        return disc
    soul = _soul_display_name(profile)
    if soul:
        return soul
    if alias and alias not in {"—", "-", "—"}:
        return alias
    return profile


def gateway_turn_active(profile: str, lines: list[str] | None = None) -> bool:
    """디코/게이트웨이 응답 루프 중이면 True.

    kanban running이 없어도 inbound 후 response ready 전이면 작업 중.
    """
    if lines is None:
        path = _gateway_log_path(profile)
        if not path:
            return False
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-120:]
        except Exception:
            return False
    last_inbound = -1
    last_ready = -1
    for i, line in enumerate(lines):
        if "inbound message:" in line:
            last_inbound = i
        elif "response ready:" in line:
            last_ready = i
    return last_inbound > last_ready


def _run_cmd(args: list[str], timeout: float = 20.0) -> str:
    env = os.environ.copy()
    env.setdefault("HERMES_HOME", str(HERMES_HOME))
    try:
        p = subprocess.run(
            args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            env=env,
            shell=False,
        )
        return (p.stdout or "") + ("\n" + p.stderr if p.stderr else "")
    except Exception as e:
        return f"__ERR__ {e}"


def parse_profile_list(text: str) -> dict[str, dict[str, str]]:
    """Parse `hermes profile list` table → {profile: {model, gateway, alias}}."""
    out: dict[str, dict[str, str]] = {}
    for line in text.splitlines():
        # e.g. " ◆default         auto                         running      —            —"
        # or   "  claude          claude-opus-4-8              stopped      —            —"
        m = re.match(
            r"^\s*[◆*]?\s*([A-Za-z0-9_-]+)\s+(\S+)\s+(running|stopped)\s+(\S+)\s+(\S+)\s*$",
            line,
        )
        if not m:
            continue
        name, model, gw, alias, dist = m.groups()
        if name.lower() in {"profile", "─" * 5}:
            continue
        out[name] = {
            "model": model,
            "gateway": gw,
            "alias": "" if alias in {"—", "-"} else alias,
        }
    return out


def _profiles_from_fs() -> dict[str, dict[str, str]]:
    """Fallback when `hermes profile list` fails — scan HERMES_HOME."""
    out: dict[str, dict[str, str]] = {}
    if (HERMES_HOME / "config.yaml").exists() or (HERMES_HOME / "SOUL.md").exists():
        out["default"] = {"model": "?", "gateway": "unknown", "alias": ""}
    pdir = HERMES_HOME / "profiles"
    if pdir.is_dir():
        for child in sorted(pdir.iterdir()):
            if child.is_dir() and (
                (child / "config.yaml").exists() or (child / "SOUL.md").exists()
            ):
                out[child.name] = {"model": "?", "gateway": "unknown", "alias": ""}
    return out


def discover_agent_defs(
    profiles: dict[str, dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    """Build agent roster from local Hermes profiles (not hardcoded nicknames)."""
    if not profiles:
        profiles = _profiles_from_fs()

    names = sorted(profiles.keys(), key=lambda n: (0 if n == "default" else 1, n))
    max_desks = len(WAYPOINTS["desks"])
    if len(names) > max_desks:
        running = [n for n in names if profiles.get(n, {}).get("gateway") == "running"]
        rest = [n for n in names if n not in running]
        names = (running + rest)[:max_desks]

    defs: list[dict[str, Any]] = []
    for i, name in enumerate(names):
        pdata = profiles.get(name, {})
        area = _read_area_json(name)
        sheet = area.get("sheet") if isinstance(area.get("sheet"), str) else None
        defs.append(
            {
                "id": name,
                "displayName": resolve_display_name(name, pdata.get("alias", "")),
                "profile": name,
                "homeDesk": i % max_desks,
                "sheet": sheet or SHEETS[i % len(SHEETS)],
            }
        )
    return defs


def read_kanban_active() -> dict[str, dict[str, Any]]:
    """assignee → best active task {status, id, title} (running > blocked)."""
    if not KANBAN_DB.exists():
        return {}
    try:
        conn = sqlite3.connect(f"file:{KANBAN_DB}?mode=ro", uri=True, timeout=2)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, title, status, assignee
            FROM tasks
            WHERE status IN ('running', 'blocked', 'ready')
              AND assignee IS NOT NULL
            ORDER BY
              CASE status
                WHEN 'running' THEN 0
                WHEN 'blocked' THEN 1
                ELSE 2
              END,
              started_at DESC NULLS LAST,
              created_at DESC
            """
        ).fetchall()
        conn.close()
    except Exception:
        # SQLite older may not like NULLS LAST
        try:
            conn = sqlite3.connect(f"file:{KANBAN_DB}?mode=ro", uri=True, timeout=2)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT id, title, status, assignee
                FROM tasks
                WHERE status IN ('running', 'blocked', 'ready')
                  AND assignee IS NOT NULL
                """
            ).fetchall()
            conn.close()
            rank = {"running": 0, "blocked": 1, "ready": 2}
            rows = sorted(rows, key=lambda r: rank.get(r["status"], 9))
        except Exception as e:
            return {"__error__": {"status": "error", "id": "", "title": str(e)}}

    best: dict[str, dict[str, Any]] = {}
    for r in rows:
        a = r["assignee"]
        if a in best:
            continue
        best[a] = {"status": r["status"], "id": r["id"], "title": r["title"]}
    return best


def tail_gateway_log(n: int = 30) -> list[str]:
    if not GATEWAY_LOG.exists():
        # try common alternates
        for p in [
            HERMES_HOME / "gateway.log",
            HERMES_HOME / "logs" / "gateway.log",
            Path(os.environ.get("HERMES_REAL_HOME", "")) / ".hermes" / "logs" / "gateway.log",
        ]:
            if p and p.exists():
                path = p
                break
        else:
            return []
    else:
        path = GATEWAY_LOG
    try:
        data = path.read_text(encoding="utf-8", errors="replace").splitlines()
        return data[-n:]
    except Exception:
        return []


@dataclass
class AgentState:
    id: str
    display_name: str
    profile: str
    home_desk: int
    sheet: str
    x: float
    y: float
    dest_x: float
    dest_y: float
    zone: str = "break"
    status: str = "idle"
    bubble: str = BUBBLES["idle"]
    task_id: str | None = None
    task_title: str | None = None
    gateway: str = "unknown"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "displayName": self.display_name,
            "profile": self.profile,
            "sheet": self.sheet,
            "status": self.status,
            "zone": self.zone,
            "bubble": self.bubble,
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "dest_x": round(self.dest_x, 2),
            "dest_y": round(self.dest_y, 2),
            "task_id": self.task_id,
            "task_title": self.task_title,
            "gateway": self.gateway,
        }


class OfficeSim:
    def __init__(self) -> None:
        self.agents: list[AgentState] = []
        self.profiles: dict[str, dict[str, str]] = {}
        self.stats: dict[str, Any] = {}
        self.logs: list[str] = []
        self.last_poll_at: float | None = None
        self.poll_error: str | None = None
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        # cold start from filesystem so first WS snapshot isn't empty
        self.sync_agents_from_defs(discover_agent_defs(_profiles_from_fs()))

    def sync_agents_from_defs(self, defs: list[dict[str, Any]]) -> None:
        by_profile = {a.profile: a for a in self.agents}
        next_agents: list[AgentState] = []
        for d in defs:
            desk = WAYPOINTS["desks"][d["homeDesk"] % len(WAYPOINTS["desks"])]
            existing = by_profile.get(d["profile"])
            if existing:
                existing.id = d["id"]
                existing.display_name = d["displayName"]
                existing.home_desk = d["homeDesk"]
                existing.sheet = d.get("sheet") or existing.sheet
                next_agents.append(existing)
            else:
                next_agents.append(
                    AgentState(
                        id=d["id"],
                        display_name=d["displayName"],
                        profile=d["profile"],
                        home_desk=d["homeDesk"],
                        sheet=d.get("sheet") or SHEETS[0],
                        x=float(desk["x"]),
                        y=float(desk["y"]),
                        dest_x=float(desk["x"]),
                        dest_y=float(desk["y"]),
                        zone="desk",
                        status="idle",
                        bubble=BUBBLES["idle"],
                    )
                )
        self.agents = next_agents

    def snapshot(self) -> dict[str, Any]:
        return {
            "type": "snapshot",
            "ts": time.time(),
            "agents": [a.to_dict() for a in self.agents],
            "profiles": self.profiles,
            "stats": self.stats,
            "logs": self.logs[-10:],
            "poll_error": self.poll_error,
            "last_poll_at": self.last_poll_at,
            "kanban_db": str(KANBAN_DB),
            "hermes_home": str(HERMES_HOME),
        }

    def apply_hermes(self, profiles: dict[str, dict[str, str]], tasks: dict[str, dict[str, Any]]) -> None:
        for a in self.agents:
            pdata = profiles.get(a.profile, {})
            gw = pdata.get("gateway", "stopped")
            a.gateway = gw
            if gw != "running":
                status = "offline"
                task = None
            else:
                task = tasks.get(a.profile)
                if task and task.get("status") == "running":
                    status = "running"
                elif task and task.get("status") == "blocked":
                    status = "blocked"
                elif gateway_turn_active(a.profile):
                    # 칸반 없어도 디코 답장 중이면 휴식 취급 금지
                    status = "chatting"
                    task = None
                else:
                    status = "idle"
                    task = None
            zone, dest = _tile_to_zone(status, a.home_desk)
            a.status = status
            a.zone = zone
            a.bubble = BUBBLES.get(status, BUBBLES["idle"])
            a.dest_x = float(dest["x"])
            a.dest_y = float(dest["y"])
            if task:
                a.task_id = task.get("id")
                a.task_title = task.get("title")
                if status == "running" and a.task_title:
                    a.bubble = f"코드 작업 중... ({a.task_title[:24]})"
                elif status == "blocked" and a.task_title:
                    a.bubble = f"검토 대기 중... ({a.task_title[:24]})"
            else:
                a.task_id = None
                a.task_title = None

    def tick(self, dt: float) -> None:
        step = SPEED_PX * dt
        for a in self.agents:
            dx = a.dest_x - a.x
            dy = a.dest_y - a.y
            dist = math.hypot(dx, dy)
            if dist <= step or dist < 0.5:
                a.x, a.y = a.dest_x, a.dest_y
            else:
                a.x += (dx / dist) * step
                a.y += (dy / dist) * step

    async def broadcast(self) -> None:
        if not self._clients:
            return
        payload = json.dumps(self.snapshot(), ensure_ascii=False)
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)

    async def add_client(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)
        await ws.send_text(json.dumps(self.snapshot(), ensure_ascii=False))

    def drop_client(self, ws: WebSocket) -> None:
        self._clients.discard(ws)


office = OfficeSim()
app = FastAPI(title="Hermes Agent Area Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/agents")
def api_agents():
    return {"agents": [a.to_dict() for a in office.agents]}


@app.get("/api/status")
def api_status():
    return {
        "profiles": office.profiles,
        "stats": office.stats,
        "last_poll_at": office.last_poll_at,
        "poll_error": office.poll_error,
        "logs": office.logs[-20:],
        "kanban_db": str(KANBAN_DB),
        "hermes_home": str(HERMES_HOME),
        "clients": len(office._clients),
    }


@app.get("/api/snapshot")
def api_snapshot():
    return office.snapshot()


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await office.add_client(ws)
    try:
        while True:
            # keep alive; ignore client messages
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=60.0)
            except asyncio.TimeoutError:
                await ws.send_text(json.dumps({"type": "ping", "ts": time.time()}))
    except WebSocketDisconnect:
        office.drop_client(ws)
    except Exception:
        office.drop_client(ws)


async def poll_loop() -> None:
    while True:
        try:
            raw_profiles = await asyncio.to_thread(_run_cmd, ["hermes", "profile", "list"])
            profiles = parse_profile_list(raw_profiles)
            if not profiles:
                profiles = _profiles_from_fs()

            tasks = await asyncio.to_thread(read_kanban_active)
            err = None
            if "__error__" in tasks:
                err = tasks.pop("__error__")["title"]

            stats_raw = await asyncio.to_thread(_run_cmd, ["hermes", "kanban", "stats"])
            logs = await asyncio.to_thread(tail_gateway_log, 30)
            defs = discover_agent_defs(profiles)

            async with office._lock:
                office.profiles = profiles
                office.stats = {"raw": stats_raw.strip()[:2000]}
                office.logs = logs
                office.poll_error = err
                office.last_poll_at = time.time()
                office.sync_agents_from_defs(defs)
                office.apply_hermes(profiles, tasks)
        except Exception as e:
            office.poll_error = str(e)
        await asyncio.sleep(POLL_SECONDS)


async def tick_loop() -> None:
    last = time.perf_counter()
    while True:
        await asyncio.sleep(TICK_SECONDS)
        now = time.perf_counter()
        dt = now - last
        last = now
        office.tick(dt)
        await office.broadcast()


@app.on_event("startup")
async def on_startup() -> None:
    # warm first poll synchronously-ish
    asyncio.create_task(poll_loop())
    asyncio.create_task(tick_loop())


def main() -> None:
    import uvicorn

    host = os.environ.get("OFFICE_HOST", "127.0.0.1")
    port = int(os.environ.get("OFFICE_PORT", "8765"))
    uvicorn.run(app, host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
