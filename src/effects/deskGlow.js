/** Tiny ADD-blend monitor glow for desk running/chatting agents. */

export const DESK_GLOW_COLORS = {
  running: 0x5ee0c8,
  chatting: 0x88aaff,
};

/** `?deskfx=0` (or false/off) disables glow. Default on. */
export function deskFxEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  const v = new URLSearchParams(location.search).get("deskfx");
  if (v == null || v === "") return true;
  return !(v === "0" || v === "false" || v === "off");
}

/** Status that owns a glow — chatting keeps its own tint (not collapsed to running). */
export function resolveDeskGlowKind(agent) {
  if (!agent) return null;
  const status = agent.serverStatus;
  if (status === "running" || status === "chatting") return status;
  // mock wander before first snapshot — desk room implies coding
  if (!agent.live && !status && agent.currentKind === "desk") return "running";
  return null;
}

export function createDeskGlow(scene) {
  const gfx = scene.add.graphics().setDepth(11).setVisible(false);
  gfx.setBlendMode("ADD");
  return gfx;
}

/**
 * Pulse a 2×2 px rect near the head (facing-aware offset).
 * Alpha 0.25–0.7, period ~180ms.
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
  const phase = (Math.sin((t / 180) * Math.PI * 2) + 1) / 2;
  const alpha = 0.25 + phase * 0.45;
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
