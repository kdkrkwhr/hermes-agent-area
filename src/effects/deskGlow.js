/** Tiny ADD-blend monitor glow for desk running/chatting/blocked agents. */

export const DESK_GLOW_COLORS = {
  running: 0x5ee0c8,
  chatting: 0x88aaff,
  focus: 0xffb347,
  blocked: 0xff8866,
};

/** `?deskfx=0` (or false/off) disables glow. Default on. */
export function deskFxEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  const v = new URLSearchParams(location.search).get("deskfx");
  if (v == null || v === "") return true;
  return !(v === "0" || v === "false" || v === "off");
}

/**
 * `?focusfx=0` forces open-desk tiles (ignore BE zone=focus). Default on.
 * Regression knob — deep-work still shows as desk on Open Desk rows.
 */
export function focusFxEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  const v = new URLSearchParams(location.search).get("focusfx");
  if (v == null || v === "") return true;
  return !(v === "0" || v === "false" || v === "off");
}

/** Status that owns a glow — chatting/blocked keep own tint (not collapsed to running). */
export function resolveDeskGlowKind(agent) {
  if (!agent) return null;
  const status = agent.serverStatus;
  if (status === "blocked") return "blocked";
  if (status === "running" || status === "chatting") {
    const zone = agent.serverData?.zone || agent.currentKind;
    if (status === "running" && zone === "focus") return "focus";
    return status;
  }
  // mock wander before first snapshot — desk/focus room implies coding
  if (!agent.live && !status && (agent.currentKind === "desk" || agent.currentKind === "focus")) {
    return agent.currentKind === "focus" ? "focus" : "running";
  }
  return null;
}

export function createDeskGlow(scene) {
  const gfx = scene.add.graphics().setDepth(11).setVisible(false);
  gfx.setBlendMode("ADD");
  return gfx;
}

/**
 * Pulse a 2×2 px rect near the head (facing-aware offset).
 * running/chatting/focus: alpha 0.25–0.7, period ~180ms.
 * blocked: slower (~420ms), softer peak (0.20–0.55).
 */
export function updateDeskGlow(gfx, agent, enabled) {
  if (!gfx) return;
  if (!enabled) {
    gfx.clear();
    gfx.setVisible(false);
    return;
  }

  const kind = resolveDeskGlowKind(agent);
  if (!kind || !agent?.sprite) {
    gfx.clear();
    gfx.setVisible(false);
    return;
  }

  const t = agent.scene.time.now;
  const periodMs = kind === "blocked" ? 420 : 180;
  const phase = (Math.sin((t / periodMs) * Math.PI * 2) + 1) / 2;
  const alpha =
    kind === "blocked" ? 0.2 + phase * 0.35 : 0.25 + phase * 0.45;
  const color = DESK_GLOW_COLORS[kind] ?? DESK_GLOW_COLORS.running;

  const dir = agent.lastDir || "down";
  let ox = 6;
  let oy = -14;
  if (dir === "left") {
    ox = -10;
    oy = -14;
  } else if (dir === "right") {
    ox = 10;
    oy = -14;
  } else if (dir === "up") {
    ox = 0;
    oy = -22;
  }

  const size = 2;
  const x = agent.sprite.x + ox - size / 2;
  const y = agent.sprite.y + oy - size / 2;

  gfx.setVisible(true);
  gfx.clear();
  gfx.fillStyle(color, alpha);
  gfx.fillRect(x, y, size, size);
}
