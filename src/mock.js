export const AGENTS = [
  {
    id: "mushroom",
    displayName: "버섯쿵야",
    profile: "nous-work",
    sheet: "char-mushroom",
    homeDesk: 0,
    statuses: ["칸반 검토 중", "코드 분석 중...", "스펙 정리 중"],
  },
  {
    id: "onion",
    displayName: "양파쿵야",
    profile: "default",
    sheet: "char-onion",
    homeDesk: 1,
    statuses: ["코드 작업 중...", "PR 올리는 중", "버그 고치는 중"],
  },
  {
    id: "claude",
    displayName: "클로드",
    profile: "claude",
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
  if (kind === "desk") {
    const list = agent.statuses;
    return list[Math.floor(Math.random() * list.length)];
  }
  return STATUS_POOL[Math.floor(Math.random() * STATUS_POOL.length)];
}

/** WS URL — local BE. Override: ?ws=… or VITE_WS_URL (.env) */
export function resolveWsUrl() {
  const q = new URLSearchParams(location.search).get("ws");
  if (q) return q;
  const fromEnv = import.meta.env.VITE_WS_URL;
  if (fromEnv) return String(fromEnv);
  return "ws://localhost:8765/ws";
}

/**
 * GitHub Pages(HTTPS) → ws://localhost 는 브라우저가 mixed-content로 막음.
 * 이 상태면 live 상태(응답 중)가 절대 안 오고 가짜 휴식만 보임.
 */
export function isPagesLocalWsBlocked() {
  if (typeof location === "undefined") return false;
  if (location.protocol !== "https:") return false;
  const url = resolveWsUrl();
  return /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url);
}

/** Offline/mock kanban snapshot fragment (matches BE shape). */
export function buildMockSnapshot(agents, reason = "mock mode") {
  const running = agents.filter((a) => a.status === "running").length;
  const blocked = agents.filter((a) => a.status === "blocked").length;
  return {
    type: "snapshot",
    ts: Date.now() / 1000,
    agents,
    stats: {
      raw: `By status:\n  running   ${running}\n  blocked   ${blocked}\n  ready     0\n  done      0\n(${reason})`,
    },
    mock: true,
  };
}

/** Demo snapshot when BE unreachable — not real Hermes status. */
export function buildMockAgents() {
  return AGENTS.map((def, i) => {
    const status = i === 0 ? "running" : i === 1 ? "blocked" : "idle";
    const titles = [
      "칸반 보드 UI 검토",
      "가상사무실: 칸반 상태 패널",
      null,
    ];
    const zones = status === "running" ? "desk" : status === "blocked" ? "meeting" : "break";
    const bubbles =
      status === "running"
        ? "코드 작업 중... (mock)"
        : status === "blocked"
          ? "검토 대기 중... (mock)"
          : "휴식 중 ☕";
    return {
      id: def.id,
      displayName: def.displayName,
      profile: def.profile,
      status,
      zone: zones,
      bubble: bubbles,
      task_id: titles[i] ? `t_mock_${def.id}` : null,
      task_title: titles[i],
      gateway: i === 2 ? "stopped" : "running",
      x: (def.homeDesk * 7 + 4) * 16 + 8,
      y: 14 * 16 + 8,
      dest_x: (def.homeDesk * 7 + 4) * 16 + 8,
      dest_y: 14 * 16 + 8,
    };
  });
}

/** HTTPS Pages에서 localhost WS 막혔을 때 — 전부 offline로 표시. */
export function buildDisconnectedAgents() {
  return AGENTS.map((def) => {
    const x = (def.homeDesk * 7 + 4) * 16 + 8;
    const y = 14 * 16 + 8;
    return {
      id: def.id,
      displayName: def.displayName,
      profile: def.profile,
      status: "offline",
      zone: "away",
      bubble: "BE 연결 필요 (로컬 FE)",
      task_id: null,
      task_title: null,
      gateway: "stopped",
      x,
      y,
      dest_x: x,
      dest_y: y,
    };
  });
}

export function resolveApiBase() {
  const q = new URLSearchParams(location.search).get("api");
  if (q) return q.replace(/\/$/, "");
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
    return "http://localhost:8765";
  }
  return "http://localhost:8765";
}
