/** Fallback roster for offline/mock only — live names come from local Hermes profiles via BE. */

import { TILE_SIZE } from "./constants.js";

export const SHEETS = ["char-mushroom", "char-onion", "char-claude"];

/** Demo placeholders when BE unreachable (profile-id labels, not personal nicknames). */
export const AGENTS = [
  {
    id: "default",
    displayName: "default",
    profile: "default",
    sheet: "char-onion",
    homeDesk: 0,
    statuses: ["코드 작업 중...", "PR 올리는 중", "버그 고치는 중"],
  },
  {
    id: "profile-2",
    displayName: "profile-2",
    profile: "profile-2",
    sheet: "char-mushroom",
    homeDesk: 1,
    statuses: ["칸반 검토 중", "코드 분석 중...", "스펙 정리 중"],
  },
  {
    id: "profile-3",
    displayName: "profile-3",
    profile: "profile-3",
    sheet: "char-claude",
    homeDesk: 2,
    statuses: ["리뷰 작성 중", "조언 중...", "휴식 중"],
  },
];

export const STATUS_POOL = [
  "코드 분석 중...",
  "칸반 검토 중",
  "휴식 중",
  "회의 중...",
  "배포 확인 중",
];

export function pickStatus(agent, kind) {
  if (kind === "meeting") return "회의 중...";
  if (kind === "break") return "휴식 중";
  if (kind === "sleep") return "수면 중...";
  if (kind === "desk" || kind === "focus") {
    const list = agent.statuses || STATUS_POOL;
    return list[Math.floor(Math.random() * list.length)];
  }
  return STATUS_POOL[Math.floor(Math.random() * STATUS_POOL.length)];
}

export function sheetForIndex(i) {
  return SHEETS[i % SHEETS.length];
}

/** Build Phaser agent def from BE/WS agent payload. */
export function defFromServerAgent(raw, index = 0) {
  const profile = raw.profile || raw.id || `agent-${index}`;
  return {
    id: raw.id || profile,
    displayName: raw.displayName || profile,
    profile,
    sheet: raw.sheet || sheetForIndex(index),
    homeDesk: typeof raw.homeDesk === "number" ? raw.homeDesk : index,
    statuses: ["작업 중..."],
  };
}

const LS_WS = "hermes-area-ws";
const LS_API = "hermes-area-api";

function readLs(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeLs(key, value) {
  try {
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Persist connection overrides (empty string clears). */
export function setConnectionUrls({ ws, api } = {}) {
  if (ws != null) writeLs(LS_WS, String(ws).trim());
  if (api != null) writeLs(LS_API, String(api).trim().replace(/\/$/, ""));
}

/**
 * WS URL priority: ?ws → localStorage → VITE_WS_URL →
 * local FE same-origin `/ws` (Vite proxy) → ws://127.0.0.1:8765/ws
 */
export function resolveWsUrl() {
  const q = new URLSearchParams(location.search).get("ws");
  if (q) {
    writeLs(LS_WS, q);
    return q;
  }
  const saved = readLs(LS_WS);
  if (saved) return saved;
  const fromEnv = import.meta.env.VITE_WS_URL;
  if (fromEnv) return String(fromEnv);
  // Vite dev: proxy /ws → BE (avoids hardcoding port, same-origin)
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
  }
  return "ws://127.0.0.1:8765/ws";
}

/**
 * GitHub Pages(HTTPS) → ws://localhost 는 브라우저가 mixed-content로 막음.
 * 이 상태면 live 상태(응답 중)가 절대 안 오고 가짜 휴식만 보임.
 */
export function isPagesLocalWsBlocked() {
  if (typeof location === "undefined") return false;
  if (location.protocol !== "https:") return false;
  const url = resolveWsUrl();
  return /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

/** Offline/mock kanban snapshot fragment (matches BE shape). */
export function buildMockSnapshot(agents, reason = "mock mode") {
  const running = agents.filter((a) => a.status === "running").length;
  const blocked = agents.filter((a) => a.status === "blocked").length;
  const ready = agents.filter((a) => a.status === "ready").length;
  const review = agents.filter((a) => a.status === "review").length;
  const todo = agents.filter((a) => a.status === "todo").length;
  const now = Date.now() / 1000;
  return {
    type: "snapshot",
    ts: Date.now() / 1000,
    agents,
    stats: {
      raw: `By status:\n  running   ${running}\n  blocked   ${blocked}\n  ready     ${ready}\n  review    ${review}\n  todo      ${todo}\n  done      0\n(${reason})`,
    },
    deskKanban: {
      source: "mock",
      generated_at: now,
      by_assignee: [
        {
          assignee: "default",
          display_name: "default",
          active: [],
          done: [
            { id: "t_done_default_1", title: "가상사무실: 회장실 성과 진열장", status: "done", assignee: "default", completed_at: now - 45, created_at: now - 2400 },
            { id: "t_done_default_2", title: "TOD ambient BGM filter/rate morph", status: "done", assignee: "default", completed_at: now - 3400, created_at: now - 7200 },
          ],
        },
        {
          assignee: "profile-2",
          display_name: "profile-2",
          active: [],
          done: [
            { id: "t_done_profile2_1", title: "가상사무실: ready/review 대기열", status: "done", assignee: "profile-2", completed_at: now - 5400, created_at: now - 9900 },
            { id: "t_done_profile2_2", title: "칸반 상태 패널 정리", status: "done", assignee: "profile-2", completed_at: now - 9400, created_at: now - 14000 },
          ],
        },
        {
          assignee: "profile-3",
          display_name: "profile-3",
          active: [],
          done: [
            { id: "t_done_profile3_1", title: "리뷰 코멘트 triage", status: "done", assignee: "profile-3", completed_at: now - 12400, created_at: now - 18800 },
          ],
        },
      ],
    },
    mock: true,
  };
}

/** Demo snapshot when BE unreachable — not real Hermes status. */
export function buildMockAgents() {
  const focusPx = {
    x: 3 * TILE_SIZE + TILE_SIZE / 2,
    y: 19 * TILE_SIZE + TILE_SIZE / 2,
  };
  const openDeskPx = (homeDesk) => ({
    x: (homeDesk === 1 ? 7 : 3) * TILE_SIZE + TILE_SIZE / 2,
    y: 5 * TILE_SIZE + TILE_SIZE / 2,
  });
  return AGENTS.map((def, i) => {
    // 0 deep-work running @focus, 1 blocked @meeting, 2 ready @lobby queue
    const status = i === 0 ? "running" : i === 1 ? "blocked" : "ready";
    const titles = [
      "deep-work: Focus zone pipeline",
      "가상사무실: 칸반 상태 패널",
      "가상사무실: ready/review 대기열",
    ];
    const zones =
      status === "running" ? "focus" : status === "blocked" ? "meeting" : "queue";
    const bubbles =
      status === "running"
        ? "딥워크 중... (mock)"
        : status === "blocked"
          ? "검토 대기 중... (mock)"
          : "큐 대기 중... (mock)";
    const now = Date.now() / 1000;
    const taskStarted =
      status === "running" ? now - 420 : status === "blocked" ? now - 900 : now - 120;
    const taskProgress = status === "running" ? 0.42 : null;
    const taskElapsed = taskStarted != null ? Math.round(now - taskStarted) : null;
    const atFocus = status === "running";
    const desk = openDeskPx(def.homeDesk);
    const queuePx = {
      x: (18 + i * 2) * TILE_SIZE + TILE_SIZE / 2,
      y: 27 * TILE_SIZE + TILE_SIZE / 2,
    };
    const x = atFocus ? focusPx.x : status === "ready" ? queuePx.x : desk.x;
    const y = atFocus ? focusPx.y : status === "ready" ? queuePx.y : (14 * TILE_SIZE + TILE_SIZE / 2);
    return {
      id: def.id,
      displayName: def.displayName,
      profile: def.profile,
      sheet: def.sheet,
      status,
      zone: zones,
      bubble: bubbles,
      task_id: titles[i] ? `t_mock_${def.id}` : null,
      task_title: titles[i],
      task_started_at: taskStarted,
      task_elapsed_s: taskElapsed,
      task_progress: taskProgress,
      gateway: "running",
      x,
      y,
      dest_x: atFocus ? focusPx.x : status === "ready" ? queuePx.x : x,
      dest_y: atFocus ? focusPx.y : status === "ready" ? queuePx.y : y,
    };
  });
}

/** HTTPS Pages에서 localhost WS 막혔을 때 — 전부 offline → Nap Pod. */
export function buildDisconnectedAgents() {
  const sleepPx = {
    x: 31 * TILE_SIZE + TILE_SIZE / 2,
    y: 21 * TILE_SIZE + TILE_SIZE / 2,
  };
  return AGENTS.map((def) => {
    return {
      id: def.id,
      displayName: def.displayName,
      profile: def.profile,
      sheet: def.sheet,
      status: "offline",
      zone: "sleep",
      bubble: "BE 연결 필요 (로컬 FE)",
      task_id: null,
      task_title: null,
      task_started_at: null,
      task_elapsed_s: null,
      task_progress: null,
      gateway: "stopped",
      x: sleepPx.x,
      y: sleepPx.y,
      dest_x: sleepPx.x,
      dest_y: sleepPx.y,
    };
  });
}

export function resolveApiBase() {
  const q = new URLSearchParams(location.search).get("api");
  if (q) {
    const cleaned = q.replace(/\/$/, "");
    writeLs(LS_API, cleaned);
    return cleaned;
  }
  const saved = readLs(LS_API);
  if (saved) return saved;
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  // Vite dev: same-origin /api proxy
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
    return ""; // relative → /api/... via Vite proxy
  }
  return "http://127.0.0.1:8765";
}
