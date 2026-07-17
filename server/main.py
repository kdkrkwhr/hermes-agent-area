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
ATTENDANCE_PWA = Path(
    os.environ.get("ATTENDANCE_PWA", r"C:\Users\KDK\attendance-pwa")
)
CRON_OUTPUT = HERMES_HOME / "cron" / "output"
WEATHER_CRON_ID = "b7e2c91a4d08"  # company-weather-pwa
NEWS_CRON_ID = "f1a2b3c94d56"  # daily-news-pwa
STOCK_CRON_ID = "3f480c05eb1f"  # morning-kr-stock-report
POLL_SECONDS = 5.0
TICK_SECONDS = 0.05  # 20 Hz position interpolate
SPEED_PX = 200.0  # px/s @ 32px tiles
TILE = 32

def _px(tx: int, ty: int) -> dict[str, float]:
    return {"x": tx * TILE + TILE // 2, "y": ty * TILE + TILE // 2}


# Pixel centers — public/assets/office-map.json properties.waypoints (tile → px)
WAYPOINTS = {
    "desks": [
        _px(3, 5),
        _px(7, 5),
        _px(3, 19),
    ],
    # stand south of Focus furniture desks (GID6 @ 3,17 / 8,17)
    "focusDesks": [
        _px(3, 19),
        _px(8, 19),
    ],
    "meeting": _px(18, 9),
    "break": _px(18, 16),
    "lounge": [
        _px(18, 16),
        _px(20, 17),
        _px(16, 16),
        _px(21, 16),
        _px(17, 18),
        _px(19, 18),
        _px(22, 16),
        _px(15, 17),
        _px(23, 17),
        _px(18, 18),
    ],
    "sleep": _px(31, 21),
    # lobby queue — south corridor outside War Room (ready/todo)
    "queue": [
        _px(18, 27),
        _px(20, 27),
        _px(22, 27),
        _px(24, 27),
    ],
    # south of meeting / near whiteboard (review wait)
    "reviewWait": [
        _px(15, 11),
        _px(19, 12),
        _px(18, 12),
        _px(19, 10),
        _px(20, 10),
    ],
}

# idle agents change lounge spots on this rhythm (seconds)
IDLE_WANDER_SEC = 14.0

# Sprite sheets shipped with FE (cycle when profiles > 3)
SHEETS = ["char-mushroom", "char-onion", "char-claude"]

BUBBLES = {
    "running": "코드 작업 중...",
    "blocked": "검토 대기 중...",
    "ready": "큐 대기 중...",
    "review": "리뷰 대기 중...",
    "todo": "할 일 대기...",
    "idle": "휴식 중 ☕",
    "offline": "오프라인",
    "chatting": "응답 중...",
}


def _queue_dest(home_desk: int) -> dict[str, float]:
    spots = WAYPOINTS.get("queue") or [_px(20, 27)]
    return spots[home_desk % len(spots)]


def _review_dest(home_desk: int) -> dict[str, float]:
    spots = WAYPOINTS.get("reviewWait") or [WAYPOINTS["meeting"]]
    return spots[home_desk % len(spots)]


def _idle_lounge_dest(home_desk: int) -> dict[str, float]:
    """Rotate through lounge tiles so idle agents stroll instead of freezing."""
    spots = WAYPOINTS.get("lounge") or [WAYPOINTS["break"]]
    bucket = int(time.time() / IDLE_WANDER_SEC)
    idx = (bucket + home_desk * 3) % len(spots)
    return spots[idx]


_DEEP_HINT = re.compile(r"focus|deep", re.IGNORECASE)


def _skills_blob(skills: Any) -> str:
    if skills is None:
        return ""
    if isinstance(skills, str):
        return skills
    if isinstance(skills, (list, tuple)):
        parts: list[str] = []
        for s in skills:
            if isinstance(s, str):
                parts.append(s)
            else:
                parts.append(str(s))
        return " ".join(parts)
    return str(skills)


def _is_deep_work(task: dict[str, Any] | None) -> bool:
    """Long runtime and/or focus|deep hint in title/skills → Focus zone."""
    if not task:
        return False
    max_rt = task.get("max_runtime_seconds")
    try:
        if max_rt is not None and float(max_rt) >= 3600:
            return True
    except (TypeError, ValueError):
        pass
    title = str(task.get("title") or "")
    if _DEEP_HINT.search(title):
        return True
    if _DEEP_HINT.search(_skills_blob(task.get("skills"))):
        return True
    return False


def _tile_to_zone(
    status: str,
    home_desk: int,
    task: dict[str, Any] | None = None,
) -> tuple[str, dict[str, float]]:
    desks = WAYPOINTS["desks"]
    desk = desks[home_desk % len(desks)]
    if status in ("running", "chatting"):
        focus = WAYPOINTS.get("focusDesks") or []
        if status == "running" and focus and _is_deep_work(task):
            return "focus", focus[home_desk % len(focus)]
        return "desk", desk
    if status == "blocked":
        return "meeting", WAYPOINTS["meeting"]
    if status == "review":
        return "review", _review_dest(home_desk)
    if status in ("ready", "todo"):
        return "queue", _queue_dest(home_desk)
    if status == "offline":
        # gateway cold/disconnected → Nap Pod (not desk away)
        return "sleep", WAYPOINTS["sleep"]
    if status == "idle":
        return "break", _idle_lounge_dest(home_desk)
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


def _kanban_connect() -> sqlite3.Connection | None:
    if not KANBAN_DB.exists():
        return None
    conn = sqlite3.connect(f"file:{KANBAN_DB}?mode=ro", uri=True, timeout=2)
    conn.row_factory = sqlite3.Row
    return conn


def read_kanban_active() -> dict[str, dict[str, Any]]:
    """assignee → best active task {status, id, title, started_at, max_runtime_seconds}."""
    conn = _kanban_connect()
    if conn is None:
        return {}
    try:
        try:
            rows = conn.execute(
                """
                SELECT id, title, status, assignee, started_at, max_runtime_seconds, skills
                FROM tasks
                WHERE status IN ('running', 'blocked', 'review', 'ready', 'todo')
                  AND assignee IS NOT NULL
                ORDER BY
                  CASE status
                    WHEN 'running' THEN 0
                    WHEN 'blocked' THEN 1
                    WHEN 'review' THEN 2
                    WHEN 'ready' THEN 3
                    ELSE 4
                  END,
                  started_at DESC NULLS LAST,
                  created_at DESC
                """
            ).fetchall()
        except Exception:
            # SQLite older may not like NULLS LAST
            rows = conn.execute(
                """
                SELECT id, title, status, assignee, started_at, max_runtime_seconds, skills
                FROM tasks
                WHERE status IN ('running', 'blocked', 'review', 'ready', 'todo')
                  AND assignee IS NOT NULL
                """
            ).fetchall()
            rank = {"running": 0, "blocked": 1, "review": 2, "ready": 3, "todo": 4}
            rows = sorted(rows, key=lambda r: rank.get(r["status"], 9))
    except Exception as e:
        return {"__error__": {"status": "error", "id": "", "title": str(e)}}
    finally:
        conn.close()

    best: dict[str, dict[str, Any]] = {}
    for r in rows:
        a = r["assignee"]
        if a in best:
            continue
        skills = r["skills"] if "skills" in r.keys() else None
        if isinstance(skills, str) and skills.strip().startswith(("[", "{")):
            try:
                skills = json.loads(skills)
            except Exception:
                pass
        best[a] = {
            "status": r["status"],
            "id": r["id"],
            "title": r["title"],
            "started_at": r["started_at"],
            "max_runtime_seconds": r["max_runtime_seconds"],
            "skills": skills,
        }
    return best


def _task_row_brief(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"],
        "title": r["title"],
        "status": r["status"],
        "assignee": r["assignee"],
        "started_at": r["started_at"],
        "completed_at": r["completed_at"] if "completed_at" in r.keys() else None,
        "created_at": r["created_at"] if "created_at" in r.keys() else None,
    }


def read_kanban_desk_board(active_limit: int = 4, done_limit: int = 3) -> dict[str, Any]:
    """Per-assignee recent active + done tasks from HERMES_HOME kanban.db (no hardcoded bots)."""
    out: dict[str, Any] = {
        "hermes_home": str(HERMES_HOME),
        "kanban_db": str(KANBAN_DB),
        "by_assignee": [],
        "generated_at": time.time(),
        "source": "be-kanban-db",
        "error": None,
    }
    conn = _kanban_connect()
    if conn is None:
        out["error"] = f"kanban db missing: {KANBAN_DB}"
        out["source"] = "empty"
        return out
    try:
        assignees = [
            r[0]
            for r in conn.execute(
                """
                SELECT DISTINCT assignee FROM tasks
                WHERE assignee IS NOT NULL AND assignee != ''
                ORDER BY assignee COLLATE NOCASE
                """
            ).fetchall()
        ]
        groups: list[dict[str, Any]] = []
        for assignee in assignees:
            active = conn.execute(
                """
                SELECT id, title, status, assignee, started_at, completed_at, created_at
                FROM tasks
                WHERE assignee = ?
                  AND status IN ('running', 'blocked', 'ready', 'review', 'todo')
                ORDER BY
                  CASE status
                    WHEN 'running' THEN 0
                    WHEN 'blocked' THEN 1
                    WHEN 'review' THEN 2
                    WHEN 'ready' THEN 3
                    ELSE 4
                  END,
                  COALESCE(started_at, created_at) DESC
                LIMIT ?
                """,
                (assignee, active_limit),
            ).fetchall()
            done = conn.execute(
                """
                SELECT id, title, status, assignee, started_at, completed_at, created_at
                FROM tasks
                WHERE assignee = ? AND status = 'done'
                ORDER BY COALESCE(completed_at, created_at) DESC
                LIMIT ?
                """,
                (assignee, done_limit),
            ).fetchall()
            if not active and not done:
                continue
            groups.append(
                {
                    "assignee": assignee,
                    "display_name": resolve_display_name(assignee),
                    "active": [_task_row_brief(r) for r in active],
                    "done": [_task_row_brief(r) for r in done],
                }
            )
        out["by_assignee"] = groups
        if not groups:
            out["source"] = "empty"
    except Exception as e:
        out["error"] = str(e)
        out["source"] = "error"
    finally:
        conn.close()
    return out


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
    task_started_at: float | None = None
    task_max_runtime_s: float | None = None
    gateway: str = "unknown"

    def to_dict(self) -> dict[str, Any]:
        elapsed: float | None = None
        progress: float | None = None
        if self.task_started_at is not None:
            elapsed = max(0.0, time.time() - float(self.task_started_at))
            max_rt = self.task_max_runtime_s
            if max_rt is not None and float(max_rt) > 0:
                progress = min(1.0, elapsed / float(max_rt))
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
            "task_started_at": self.task_started_at,
            "task_elapsed_s": round(elapsed, 1) if elapsed is not None else None,
            "task_progress": round(progress, 3) if progress is not None else None,
            "gateway": self.gateway,
        }


def build_kpi_from_kanban() -> dict[str, Any]:
    """Build KPI metrics from kanban DB: completion counts, rates, agent rankings."""
    now = time.time()
    week_ago = now - 7 * 86400
    kpi: dict[str, Any] = {
        "total_completed": 0,
        "completion_rate": 0,
        "avg_response_sec": 0,
        "active_agents": 0,
        "total_agents": 0,
        "agent_ranking": [],
        "weekly": {"completed": 0, "avg_speed_sec": 0},
        "generated_at": now,
        "source": "be",
    }

    conn = _kanban_connect()
    if not conn:
        kpi["source"] = "empty"
        return kpi

    try:
        # Total completed (all time)
        total_done = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status = 'done'"
        ).fetchone()
        kpi["total_completed"] = total_done[0] if total_done else 0

        # Total tasks (non-archived)
        total_tasks = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status != 'archived'"
        ).fetchone()
        total_count = total_tasks[0] if total_tasks else 0

        # Completion rate
        done_count = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status = 'done'"
        ).fetchone()
        done = done_count[0] if done_count else 0
        all_count = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status != 'archived' AND status != 'todo'"
        ).fetchone()
        all_t = all_count[0] if all_count else 1
        kpi["completion_rate"] = round((done / max(all_t, 1)) * 100, 1)

        # Active agents (distinct assignees with non-done/archived tasks)
        active = conn.execute(
            "SELECT COUNT(DISTINCT assignee) FROM tasks WHERE status IN ('running','chatting','blocked','ready','review') AND assignee IS NOT NULL AND assignee != ''"
        ).fetchone()
        kpi["active_agents"] = active[0] if active else 0

        # Total agent count (distinct assignees ever)
        total_assignees = conn.execute(
            "SELECT COUNT(DISTINCT assignee) FROM tasks WHERE assignee IS NOT NULL AND assignee != ''"
        ).fetchone()
        kpi["total_agents"] = total_assignees[0] if total_assignees else 0

        # Average response time (completed_at - started_at for recently done tasks)
        avg_res = conn.execute(
            "SELECT AVG(completed_at - started_at) FROM tasks WHERE status = 'done' AND completed_at IS NOT NULL AND started_at IS NOT NULL AND completed_at > started_at AND completed_at > ?",
            (now - 30 * 86400,),
        ).fetchone()
        avg_sec = avg_res[0] if avg_res and avg_res[0] else 0
        kpi["avg_response_sec"] = round(float(avg_sec))

        # Weekly completed
        weekly_done = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status = 'done' AND completed_at > ?",
            (week_ago,),
        ).fetchone()
        kpi["weekly"]["completed"] = weekly_done[0] if weekly_done else 0

        # Weekly avg speed
        weekly_avg = conn.execute(
            "SELECT AVG(completed_at - started_at) FROM tasks WHERE status = 'done' AND completed_at IS NOT NULL AND started_at IS NOT NULL AND completed_at > started_at AND completed_at > ?",
            (week_ago,),
        ).fetchone()
        kpi["weekly"]["avg_speed_sec"] = round(float(weekly_avg[0])) if weekly_avg and weekly_avg[0] else 0

        # Agent ranking: per-assignee completed count + avg speed
        agent_rows = conn.execute(
            """
            SELECT assignee,
                   COUNT(*) as completed,
                   ROUND(AVG(completed_at - started_at)) as avg_speed
            FROM tasks
            WHERE status = 'done'
              AND assignee IS NOT NULL AND assignee != ''
              AND completed_at IS NOT NULL
              AND started_at IS NOT NULL
              AND completed_at > started_at
            GROUP BY assignee
            ORDER BY completed DESC
            LIMIT 10
            """
        ).fetchall()

        for row in agent_rows:
            assignee, completed, avg_speed = row
            # Get recent task titles for this assignee
            recent = conn.execute(
                "SELECT id, title FROM tasks WHERE assignee = ? AND status = 'done' ORDER BY completed_at DESC LIMIT 3",
                (assignee,),
            ).fetchall()
            kpi["agent_ranking"].append({
                "profile": assignee,
                "display_name": resolve_display_name(assignee),
                "completed": completed,
                "avg_speed_sec": int(avg_speed) if avg_speed else 0,
                "recent_tasks": [{"id": r[0], "title": r[1]} for r in recent],
            })

    except Exception as e:
        kpi["error"] = str(e)
        kpi["source"] = "error"
    finally:
        conn.close()

    return kpi


@dataclass
class DeskBrief:
    weather: dict[str, Any] | None = None
    news: dict[str, Any] | None = None
    stock: dict[str, Any] | None = None
    kanban: dict[str, Any] | None = None
    kpi: dict[str, Any] | None = None
    weather_mtime: float | None = None
    news_mtime: float | None = None
    stock_mtime: float | None = None
    generated_at: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "weather": self.weather,
            "news": self.news,
            "stock": self.stock,
            "kanban": self.kanban,
            "kpi": self.kpi,
            "generated_at": self.generated_at,
        }


class OfficeSim:
    def __init__(self) -> None:
        self.agents: list[AgentState] = []
        self.profiles: dict[str, dict[str, str]] = {}
        self.stats: dict[str, Any] = {}
        self.logs: list[str] = []
        self.last_poll_at: float | None = None
        self.poll_error: str | None = None
        self.desk_kanban: dict[str, Any] = read_kanban_desk_board()
        self.desk_brief = DeskBrief()
        self._clients: set[WebSocket] = set()
        self._desk_brief_clients: set[WebSocket] = set()
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
            "deskKanban": self.desk_kanban,
            "deskBrief": self.desk_brief.to_dict(),
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
                elif task and task.get("status") == "review":
                    status = "review"
                elif task and task.get("status") == "ready":
                    status = "ready"
                elif task and task.get("status") == "todo":
                    status = "todo"
                elif gateway_turn_active(a.profile):
                    # 칸반 없어도 디코 답장 중이면 휴식 취급 금지
                    status = "chatting"
                    task = None
                else:
                    status = "idle"
                    task = None
            zone, dest = _tile_to_zone(status, a.home_desk, task)
            a.status = status
            a.zone = zone
            a.bubble = BUBBLES.get(status, BUBBLES["idle"])
            a.dest_x = float(dest["x"])
            a.dest_y = float(dest["y"])
            if task:
                a.task_id = task.get("id")
                a.task_title = task.get("title")
                started = task.get("started_at")
                a.task_started_at = float(started) if started is not None else None
                max_rt = task.get("max_runtime_seconds")
                a.task_max_runtime_s = float(max_rt) if max_rt is not None else None
                if status == "running" and a.task_title:
                    a.bubble = f"코드 작업 중... ({a.task_title[:24]})"
                elif status == "blocked" and a.task_title:
                    a.bubble = f"검토 대기 중... ({a.task_title[:24]})"
                elif status == "review" and a.task_title:
                    a.bubble = f"리뷰 대기... ({a.task_title[:24]})"
                elif status == "ready" and a.task_title:
                    a.bubble = f"큐 대기... ({a.task_title[:24]})"
                elif status == "todo" and a.task_title:
                    a.bubble = f"할 일... ({a.task_title[:24]})"
            else:
                a.task_id = None
                a.task_title = None
                a.task_started_at = None
                a.task_max_runtime_s = None

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

    async def broadcast_desk_brief(self) -> None:
        """Push desk-brief update to all desk-brief WS clients."""
        if not self._desk_brief_clients:
            return
        payload = json.dumps(
            {
                "type": "desk-brief",
                "ts": time.time(),
                "weather": self.desk_brief.weather,
                "news": self.desk_brief.news,
                "stock": self.desk_brief.stock,
                "kanban": self.desk_brief.kanban,
                "kpi": self.desk_brief.kpi,
                "generated_at": self.desk_brief.generated_at,
            },
            ensure_ascii=False,
        )
        dead: list[WebSocket] = []
        for ws in list(self._desk_brief_clients):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._desk_brief_clients.discard(ws)

    async def add_desk_brief_client(self, ws: WebSocket) -> None:
        await ws.accept()
        self._desk_brief_clients.add(ws)
        await ws.send_text(
            json.dumps(
                {
                    "type": "desk-brief",
                    "ts": time.time(),
                    "weather": self.desk_brief.weather,
                    "news": self.desk_brief.news,
                    "stock": self.desk_brief.stock,
                    "kanban": self.desk_brief.kanban,
                    "kpi": self.desk_brief.kpi,
                    "generated_at": self.desk_brief.generated_at,
                },
                ensure_ascii=False,
            )
        )

    def drop_desk_brief_client(self, ws: WebSocket) -> None:
        self._desk_brief_clients.discard(ws)

    def refresh_cron_brief(self) -> bool:
        """Check cron outputs for new data; return True if desk_brief changed."""
        weather = _read_cron_data(WEATHER_CRON_ID)
        news = _read_cron_data(NEWS_CRON_ID)
        stock = _read_cron_data(STOCK_CRON_ID)
        kanban = read_kanban_desk_board()
        w_mtime = weather.get("_cron_mtime") if weather else None
        n_mtime = news.get("_cron_mtime") if news else None
        s_mtime = stock.get("_cron_mtime") if stock else None

        changed = (
            w_mtime != self.desk_brief.weather_mtime
            or n_mtime != self.desk_brief.news_mtime
            or s_mtime != self.desk_brief.stock_mtime
        )
        if changed:
            self.desk_brief.weather = weather
            self.desk_brief.news = news
            self.desk_brief.stock = stock
            self.desk_brief.kanban = kanban
            self.desk_brief.kpi = build_kpi_from_kanban()
            self.desk_brief.weather_mtime = w_mtime
            self.desk_brief.news_mtime = n_mtime
            self.desk_brief.stock_mtime = s_mtime
            self.desk_brief.generated_at = time.time()
        return changed


office = OfficeSim()
app = FastAPI(title="Hermes Agent Area Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "clients": len(office._clients)}


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


def _latest_cron_meta(job_id: str) -> dict[str, Any] | None:
    folder = CRON_OUTPUT / job_id
    if not folder.is_dir():
        return None
    files = sorted(folder.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        return None
    p = files[0]
    head = p.read_text(encoding="utf-8", errors="replace")[:800]
    return {
        "job_id": job_id,
        "path": str(p),
        "mtime": p.stat().st_mtime,
        "name": p.name,
        "header": head.split("## Response", 1)[0].strip()[:400],
    }


def _read_json_file(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _extract_json_from_text(text: str) -> Any | None:
    """Extract JSON from markdown text — code blocks or raw JSON objects."""
    # try ```json / ``` code blocks
    for m in re.finditer(r"```(?:json)?\s*\n(.*?)\n```", text, re.DOTALL):
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            continue
    # try raw JSON object anywhere in the text
    for m in re.finditer(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL):
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            continue
    return None


def _read_cron_data(job_id: str) -> dict[str, Any] | None:
    """Read latest cron output for a job-id; extract JSON data from .md files."""
    folder = CRON_OUTPUT / job_id
    if not folder.is_dir():
        return None
    # prefer .json files
    json_files = sorted(
        folder.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True
    )
    if json_files:
        data = _read_json_file(json_files[0])
        if isinstance(data, dict):
            data["_cron_path"] = str(json_files[0])
            data["_cron_mtime"] = json_files[0].stat().st_mtime
            return data
    # fall back to .md files
    md_files = sorted(
        folder.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True
    )
    if not md_files:
        return None
    path = md_files[0]
    text = path.read_text(encoding="utf-8", errors="replace")
    data = _extract_json_from_text(text)
    if isinstance(data, dict):
        data["_cron_path"] = str(path)
        data["_cron_mtime"] = path.stat().st_mtime
        return data
    return None


def _read_hermes_files_tree(root: Path, max_depth: int = 3, max_files: int = 60) -> dict[str, Any]:
    """Scan HERMES_HOME directory tree for 내PC tab — text files only, sensitive excluded."""
    SENSITIVE = {".env", ".env.local", "credentials", "token", "secret", ".git"}
    SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp3", ".wav", ".ogg",
                ".mp4", ".webm", ".db", ".sqlite", ".sqlite3", ".exe", ".dll",
                ".so", ".bin", ".pyc", ".ttf", ".woff", ".woff2", ".ico", ".zip",
                ".tar", ".gz", ".7z", ".pdf", ".docx", ".pptx"}
    TEXT_EXT = {".py", ".js", ".ts", ".jsx", ".tsx", ".md", ".txt", ".json",
                ".yaml", ".yml", ".toml", ".cfg", ".ini", ".html", ".css",
                ".csv", ".xml", ".sh", ".bash", ".ps1", ".java", ".c", ".cpp",
                ".h", ".cs", ".rs", ".go", ".rb", ".php", ".swift", ".kt"}
    MAX_FILE_SIZE = 100 * 1024  # 100KB

    def _scan_dir(path: Path, depth: int) -> dict[str, Any] | None:
        if depth > max_depth:
            return None
        name = path.name
        if name.startswith(".") or name in SENSITIVE:
            return None
        try:
            entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except (PermissionError, OSError):
            return None

        children: list[dict[str, Any]] = []
        file_count = 0
        for entry in entries:
            if file_count >= max_files:
                break
            ename = entry.name
            if ename.startswith(".") or ename in SENSITIVE:
                continue
            try:
                if entry.is_dir():
                    subtree = _scan_dir(entry, depth + 1)
                    if subtree and subtree.get("children"):
                        children.append(subtree)
                elif entry.is_file():
                    ext = entry.suffix.lower()
                    if ext in SKIP_EXT:
                        continue
                    size = entry.stat().st_size
                    if size > MAX_FILE_SIZE:
                        continue
                    node: dict[str, Any] = {
                        "name": ename,
                        "type": "file",
                        "size": size,
                        "ext": ext,
                        "preview": ext in TEXT_EXT,
                    }
                    children.append(node)
                    file_count += 1
            except (PermissionError, OSError):
                continue
        if not children:
            return None
        return {"name": name, "type": "dir", "children": children}

    result = _scan_dir(root, 0)
    return {
        "root": str(root),
        "tree": result,
        "generated_at": time.time(),
    }


@app.get("/api/desk-brief")
def api_desk_brief():
    """CEO desk panel: weather/news (PWA + cron) + stock + kanban + files (HERMES_HOME)."""
    weather_path = ATTENDANCE_PWA / "data" / "weather" / "latest.json"
    news_path = ATTENDANCE_PWA / "data" / "news" / "latest.json"
    weather = _read_json_file(weather_path)
    news = _read_json_file(news_path)

    # fallback: read from cron outputs if PWA data is missing
    if not weather:
        weather = _read_cron_data(WEATHER_CRON_ID)
    if not news:
        news = _read_cron_data(NEWS_CRON_ID)

    stock = _read_cron_data(STOCK_CRON_ID)
    kanban = read_kanban_desk_board()
    files = _read_hermes_files_tree(HERMES_HOME)
    # keep WS snapshot warm for clients that listen only
    office.desk_kanban = kanban
    return {
        "weather": weather,
        "news": news,
        "stock": stock,
        "kanban": kanban,
        "kpi": build_kpi_from_kanban(),
        "files": files,
        "source": "be-pwa" if weather or news or kanban.get("by_assignee") else "empty",
        "paths": {
            "weather": str(weather_path),
            "news": str(news_path),
            "weather_exists": weather_path.is_file(),
            "news_exists": news_path.is_file(),
            "kanban_db": str(KANBAN_DB),
            "hermes_home": str(HERMES_HOME),
        },
        "cron": {
            "company-weather-pwa": _latest_cron_meta(WEATHER_CRON_ID),
            "daily-news-pwa": _latest_cron_meta(NEWS_CRON_ID),
            "morning-kr-stock-report": _latest_cron_meta(STOCK_CRON_ID),
        },
    }


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


@app.get("/api/file-preview")
def api_file_preview(path: str = ""):
    """Read a text file under HERMES_HOME for 내PC preview (500 chars max, sanitized)."""
    if not path:
        return {"error": "path required", "content": ""}
    try:
        full = Path(path).resolve()
    except Exception:
        return {"error": "invalid path", "content": ""}
    try:
        hermes_resolved = HERMES_HOME.resolve()
    except Exception:
        return {"error": "hermes home resolve failed", "content": ""}
    # security: must be under HERMES_HOME
    if not str(full).startswith(str(hermes_resolved)):
        return {"error": "path outside HERMES_HOME", "content": ""}
    if not full.is_file():
        return {"error": "not a file", "content": ""}
    # skip binary / sensitive
    name = full.name.lower()
    if name in {".env", ".env.local"} or name.startswith("."):
        return {"error": "restricted", "content": ""}
    ext = full.suffix.lower()
    SKIP = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp3", ".wav", ".mp4",
            ".db", ".sqlite", ".exe", ".dll", ".bin", ".zip", ".tar", ".gz"}
    if ext in SKIP:
        return {"error": "binary file", "content": ""}
    try:
        size = full.stat().st_size
        if size > 100 * 1024:
            return {"error": "file too large", "content": ""}
        text = full.read_text(encoding="utf-8", errors="replace")[:500]
        return {"path": path, "content": text, "size": size, "error": None}
    except Exception as e:
        return {"error": str(e), "content": ""}


@app.websocket("/ws/desk-brief")
async def ws_desk_brief(ws: WebSocket):
    """Push weather + news updates when cron outputs change."""
    await office.add_desk_brief_client(ws)
    try:
        while True:
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=60.0)
            except asyncio.TimeoutError:
                await ws.send_text(json.dumps({"type": "ping", "ts": time.time()}))
    except WebSocketDisconnect:
        office.drop_desk_brief_client(ws)
    except Exception:
        office.drop_desk_brief_client(ws)


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

            desk_kanban = await asyncio.to_thread(read_kanban_desk_board)
            stats_raw = await asyncio.to_thread(_run_cmd, ["hermes", "kanban", "stats"])
            logs = await asyncio.to_thread(tail_gateway_log, 30)
            defs = discover_agent_defs(profiles)

            # check cron outputs for weather/news changes
            brief_changed = await asyncio.to_thread(office.refresh_cron_brief)

            async with office._lock:
                office.profiles = profiles
                office.stats = {"raw": stats_raw.strip()[:2000]}
                office.logs = logs
                office.poll_error = err
                office.desk_kanban = desk_kanban
                office.last_poll_at = time.time()
                office.sync_agents_from_defs(defs)
                office.apply_hermes(profiles, tasks)

            # push desk-brief update if cron data changed
            if brief_changed:
                await office.broadcast_desk_brief()
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
