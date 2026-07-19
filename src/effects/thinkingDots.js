/** Soft "..." thinking dots above nameplate while chatting.
 *  `?think=0` off · `?think=force` idle도 강제 (smoke).
 */

/** Nameplate depth is 20 → dots sit just above. */
const DEPTH = 21;
/** Above nameplate(-40); clears chatPing feet ring; under tall bubbles (-76). */
const DOTS_OY = -52;
const STEP_MS = 500;
const FRAMES = [".", "..", "..."];
const COLOR = "#a8c8e8";
const FONT = "12px";

/**
 * Query: omit = on (chatting only). `0`/`off`/`false` = never.
 * `force`/`1`/`true`/`on` = also show on idle (smoke).
 * @returns {"off"|"on"|"force"}
 */
export function thinkModeFromQuery() {
  if (typeof location === "undefined") return "on";
  try {
    const v = new URLSearchParams(location.search).get("think");
    if (v == null || v === "") return "on";
    if (v === "0" || v === "false" || v === "off") return "off";
    if (v === "1" || v === "true" || v === "force" || v === "on") return "force";
    return "on";
  } catch {
    return "on";
  }
}

export function thinkEnabledFromQuery() {
  return thinkModeFromQuery() !== "off";
}

export function thinkForceFromQuery() {
  return thinkModeFromQuery() === "force";
}

/**
 * chatting → show. force → idle 포함 (offline/sleep 제외).
 * @returns {boolean}
 */
export function shouldShowThinkingDots(agent, force = false) {
  if (!agent?.sprite) return false;
  const status = agent.serverStatus;
  // chatting always wins (kind may still be sleep briefly during transitions)
  if (status === "chatting") return true;
  if (status === "offline" || status === "sleep" || agent.currentKind === "sleep") {
    return false;
  }
  if (force) {
    // smoke: idle도 강제 — running/blocked도 force면 보이게
    return true;
  }
  return false;
}

/** 1→2→3→1 루프 + soft alpha breathe. */
export function dotsFrameAt(timeMs, seed = 0) {
  const t = Math.max(0, timeMs + (seed % 97) * 13);
  const idx = Math.floor(t / STEP_MS) % FRAMES.length;
  const phase = (t % STEP_MS) / STEP_MS;
  // breathe: 0.55 ↔ 1.0 within each step
  const alpha = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
  return { text: FRAMES[idx], alpha, idx };
}

function hashId(id) {
  const s = String(id ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/**
 * @returns {{ label: Phaser.GameObjects.Text, enabled: boolean, force: boolean }}
 */
export function createThinkingDots(scene) {
  const label = scene.add
    .text(0, 0, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: FONT,
      color: COLOR,
      align: "center",
      stroke: "#0b1016",
      strokeThickness: 4,
    })
    .setOrigin(0.5, 1)
    .setDepth(DEPTH)
    .setVisible(false);
  return {
    label,
    enabled: thinkEnabledFromQuery(),
    force: thinkForceFromQuery(),
  };
}

export function destroyThinkingDots(dots) {
  if (!dots) return;
  try {
    dots.label?.destroy();
  } catch {
    /* ignore */
  }
}

/**
 * Follow sprite head. Hide when off / not chatting (unless force).
 */
export function updateThinkingDots(dots, agent) {
  if (!dots?.label) return;

  if (!dots.enabled) {
    hideDots(dots);
    return;
  }

  if (!shouldShowThinkingDots(agent, dots.force)) {
    hideDots(dots);
    return;
  }

  const timeMs = dots._forceTimeMs ?? agent.scene?.time?.now ?? 0;
  const seed = hashId(agent.def?.id);
  const { text, alpha } = dotsFrameAt(timeMs, seed);
  const spriteAlpha = agent.sprite.alpha ?? 1;

  dots.label.setText(text);
  dots.label.setPosition(agent.sprite.x, agent.sprite.y + DOTS_OY);
  dots.label.setAlpha(alpha * spriteAlpha);
  dots.label.setVisible(true);
}

function hideDots(dots) {
  dots.label.setVisible(false);
  dots.label.setText("");
}

/** Compact smoke/debug snapshot for window.__HERMES_AREA__. */
export function thinkingDotsSnapshot(agents) {
  const active = [];
  for (const a of agents || []) {
    const d = a?.thinkingDots;
    if (!d?.label?.visible) continue;
    active.push({
      id: a.def?.id,
      text: d.label.text,
      force: !!d.force,
    });
  }
  return {
    enabled: thinkEnabledFromQuery(),
    mode: thinkModeFromQuery(),
    count: active.length,
    active,
    depth: DEPTH,
    oy: DOTS_OY,
  };
}

export { DEPTH, DOTS_OY, STEP_MS, FRAMES };
