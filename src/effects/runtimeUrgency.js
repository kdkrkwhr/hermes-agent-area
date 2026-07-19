/**
 * Running-task runtime urgency: progress bar turns rose/red near max_runtime
 * (≥80%), soft pulse + rare sweat droplets above the head.
 * Distinct from overtimeDesk (amber floor) / deskGlow (teal monitor LED).
 * `?urgency=0` off · `?urgency=force` smoke (progress forced 0.9).
 */

/** Soft rose — not overtime amber (0xffb060) / deskGlow teal (0x5ee0c8). */
export const URGENCY_BAR = 0xf06090;
export const URGENCY_PULSE = 0xffa0b8;
/** Normal determinate fill (matches Agent drawProgressBar). */
export const NORMAL_BAR = 0x5be0c8;

export const URGENCY_THRESHOLD = 0.8;
export const FORCE_PROGRESS = 0.9;

const CD_MIN_MS = 8000;
const CD_MAX_MS = 15000;
const FORCE_CD_MS = 1800;

/**
 * @returns {{ enabled: boolean, forced: boolean }}
 */
export function urgencyModeFromQuery() {
  if (typeof location === "undefined") {
    return { enabled: true, forced: false };
  }
  try {
    const v = new URLSearchParams(location.search).get("urgency");
    if (v == null || v === "") return { enabled: true, forced: false };
    if (v === "0" || v === "false" || v === "off") {
      return { enabled: false, forced: false };
    }
    if (v === "force" || v === "1" || v === "true" || v === "on") {
      return { enabled: true, forced: true };
    }
    return { enabled: true, forced: false };
  } catch {
    return { enabled: true, forced: false };
  }
}

/**
 * Resolve fill progress + urgency flag.
 * No task_progress (and not forced) → null progress → indeterminate, no urgency.
 * @param {{ serverData?: { task_progress?: number|null, task_elapsed_s?: number|null, task_max_runtime_s?: number|null }|null }} agent
 * @param {{ enabled: boolean, forced: boolean }} [mode]
 */
export function resolveUrgencyProgress(agent, mode) {
  const m = mode ?? urgencyModeFromQuery();
  if (m.forced) {
    return { progress: FORCE_PROGRESS, urgent: m.enabled, color: URGENCY_BAR };
  }

  let p = agent?.serverData?.task_progress;
  if (typeof p !== "number" || !Number.isFinite(p)) {
    // fallback: elapsed / max_rt when BE exposes max (rare — usually baked into task_progress)
    const elapsed = agent?.serverData?.task_elapsed_s;
    const maxRt = agent?.serverData?.task_max_runtime_s;
    if (
      typeof elapsed === "number" &&
      Number.isFinite(elapsed) &&
      typeof maxRt === "number" &&
      Number.isFinite(maxRt) &&
      maxRt > 0
    ) {
      p = Math.min(1, Math.max(0, elapsed / maxRt));
    } else {
      return { progress: null, urgent: false, color: NORMAL_BAR };
    }
  }

  const progress = Math.max(0, Math.min(1, p));
  const urgent = m.enabled && progress >= URGENCY_THRESHOLD;
  return {
    progress,
    urgent,
    color: urgent ? URGENCY_BAR : NORMAL_BAR,
  };
}

/**
 * Rare soft ADD sweat droplets above agent head (1–2). CD 8–15s (force: ~1.8s).
 * Graphics+tween (no particle texture dep) — soft ADD cyan dots fall down.
 * @param {object} agent
 * @param {boolean} urgent
 * @param {{ enabled: boolean, forced: boolean }} mode
 * @param {number} nowMs
 */
export function maybeSpawnUrgencySweat(agent, urgent, mode, nowMs) {
  if (!agent?.scene?.add || !agent?.sprite) return;
  if (!urgent || !mode?.enabled) return;

  const now = nowMs ?? agent.scene.time?.now ?? 0;
  const nextAt = agent._urgencyNextSweatAt ?? 0;
  if (now < nextAt) return;

  const cd = mode.forced
    ? FORCE_CD_MS
    : CD_MIN_MS + Math.floor(Math.random() * (CD_MAX_MS - CD_MIN_MS + 1));
  agent._urgencyNextSweatAt = now + cd;

  const n = 1 + Math.floor(Math.random() * 2);
  const baseX = agent.sprite.x;
  const baseY = agent.sprite.y - 46;
  for (let i = 0; i < n; i++) {
    const drop = agent.scene.add.circle(
      baseX + (Math.random() * 8 - 4),
      baseY + Math.random() * 2,
      1.8 + Math.random() * 0.6,
      0xa8d8f0,
      0.72,
    );
    drop.setBlendMode("ADD");
    drop.setDepth(23);
    agent.scene.tweens.add({
      targets: drop,
      y: drop.y + 16 + Math.random() * 8,
      x: drop.x + (Math.random() * 6 - 3),
      alpha: 0,
      duration: 580 + Math.random() * 120,
      ease: "Sine.easeIn",
      onComplete: () => {
        try {
          drop.destroy();
        } catch {
          /* ignore */
        }
      },
    });
  }
  agent._urgencySweatCount = (agent._urgencySweatCount || 0) + n;
}

/**
 * Compact smoke/debug snapshot for window.__HERMES_AREA__.urgency
 * Re-resolves from serverData so smoke works even if draw hasn't painted yet.
 * @param {Array<object>} agents
 */
export function urgencySnapshot(agents) {
  const mode = urgencyModeFromQuery();
  const list = Array.isArray(agents) ? agents : [];
  const rows = [];
  for (const a of list) {
    const status = a?.serverStatus;
    const show = status === "running" || status === "chatting";
    const resolved = show
      ? resolveUrgencyProgress(a, mode)
      : { progress: null, urgent: false, color: null };
    // prefer last paint cache when present (sweat side-effects already applied)
    const u = a?._urgency && show ? a._urgency : resolved;
    rows.push({
      id: a.def?.id ?? null,
      status: status ?? null,
      progress: u.progress,
      urgent: !!u.urgent,
      color: u.color ?? null,
      sweatCount: a._urgencySweatCount ?? 0,
    });
  }
  return {
    enabled: mode.enabled,
    forced: mode.forced,
    threshold: URGENCY_THRESHOLD,
    forceProgress: FORCE_PROGRESS,
    barColor: URGENCY_BAR,
    normalColor: NORMAL_BAR,
    overtimeAmber: 0xffb060,
    deskGlowTeal: 0x5ee0c8,
    urgentCount: rows.filter((r) => r.urgent).length,
    agents: rows,
  };
}
