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
