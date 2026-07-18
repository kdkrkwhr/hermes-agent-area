/**
 * Soft ADD status-color foot ring under agents.
 * Always-on (not a one-shot like chatPing). Smaller / dimmer than chatPing.
 * `?statusring=0` off. Agents only — Boss/Visitor skip.
 */

/** Above shadow (9), below sprite (10). */
export const STATUS_RING_DEPTH_DEFAULT = 9.5;

const IDLE_ALPHA = 0.52;
const MOVE_ALPHA = 0.26;

/** Status → soft ring color (hex int). */
export const STATUS_RING_COLORS = {
  running: 0x4ecdc4,
  chatting: 0x88aaff,
  blocked: 0xe8a040,
  review: 0xc9a0ff,
  idle: 0x6a8a7a,
  ready: 0x6a8a7a,
  todo: 0x6a8a7a,
  offline: 0x556070,
};

/** `?statusring=0` (or false/off) disables. Default on. */
export function statusRingEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("statusring");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/**
 * Map agent status / effect kind → ring key.
 * @param {string|null|undefined} status
 * @returns {keyof typeof STATUS_RING_COLORS}
 */
export function statusRingKeyFromStatus(status) {
  const s = String(status || "idle").toLowerCase();
  if (s === "running") return "running";
  if (s === "chatting") return "chatting";
  if (s === "blocked") return "blocked";
  if (s === "review") return "review";
  if (s === "ready" || s === "todo") return s;
  if (s === "offline" || s === "sleep") return "offline";
  return "idle";
}

/**
 * Resolve ring key from an Agent instance (live serverStatus or mock effect kind).
 * @param {{ live?: boolean, serverStatus?: string|null, getEffectKind?: () => string }} agent
 */
export function resolveStatusRingKey(agent) {
  if (!agent) return "idle";
  if (agent.live && agent.serverStatus) {
    return statusRingKeyFromStatus(agent.serverStatus);
  }
  // mock / no WS: effect kind (chatting collapses to running in getEffectKind —
  // prefer raw serverStatus if present even when not live)
  if (agent.serverStatus) {
    return statusRingKeyFromStatus(agent.serverStatus);
  }
  const kind = agent.getEffectKind?.() ?? "idle";
  return statusRingKeyFromStatus(kind);
}

/**
 * @param {Phaser.Scene} scene
 * @param {{ depth?: number }} [opts]
 * @returns {Phaser.GameObjects.Graphics|null}
 */
export function createStatusFootRing(scene, opts = {}) {
  if (!statusRingEnabledFromQuery()) return null;
  if (!scene?.add) return null;
  const depth = opts.depth ?? STATUS_RING_DEPTH_DEFAULT;
  const gfx = scene.add.graphics().setDepth(depth).setVisible(true);
  gfx.setBlendMode("ADD");
  return gfx;
}

/**
 * Follow sprite feet; color from status; lighter alpha while moving.
 * Soft stacked stroke ellipses — smaller/dimmer than chatPing burst.
 * @param {Phaser.GameObjects.Graphics|null} gfx
 * @param {Phaser.GameObjects.Sprite|null} sprite
 * @param {{
 *   moving?: boolean,
 *   statusKey?: string,
 *   width?: number,
 *   height?: number,
 *   oy?: number,
 * }} [opts]
 */
export function updateStatusFootRing(gfx, sprite, opts = {}) {
  if (!gfx) return;
  if (!sprite?.active) {
    gfx.clear();
    gfx.setVisible(false);
    return;
  }

  const key = statusRingKeyFromStatus(opts.statusKey ?? "idle");
  const color = STATUS_RING_COLORS[key] ?? STATUS_RING_COLORS.idle;
  const moving = !!opts.moving;
  const alpha = moving ? MOVE_ALPHA : IDLE_ALPHA;
  // smaller than chatPing (~38) and slightly under shadow footprint
  const w = opts.width ?? 16;
  const h = opts.height ?? 6;
  const oy = opts.oy ?? 2;
  const x = sprite.x;
  const y = sprite.y + oy;

  gfx.setVisible(true);
  gfx.clear();
  // soft stacked ADD stroke ellipses (faux glow ring)
  gfx.lineStyle(2.5, color, alpha * 0.28);
  gfx.strokeEllipse(x, y, w * 1.35, h * 1.35);
  gfx.lineStyle(1.75, color, alpha * 0.55);
  gfx.strokeEllipse(x, y, w, h);
  gfx.lineStyle(1.1, color, alpha * 0.85);
  gfx.strokeEllipse(x, y, w * 0.72, h * 0.72);

  gfx._statusRingKey = key;
  gfx._statusRingColor = color;
  gfx._statusRingAlpha = alpha;
}

/**
 * Compact smoke/debug snapshot for window.__HERMES_AREA__.
 * @param {Array<{ def?: { id?: string }, statusRingGfx?: Phaser.GameObjects.Graphics|null }>} entities
 */
export function statusFootRingSnapshot(entities) {
  const enabled = statusRingEnabledFromQuery();
  const list = Array.isArray(entities) ? entities : [];
  const rings = [];
  for (const e of list) {
    const gfx = e?.statusRingGfx;
    if (!gfx) continue;
    rings.push({
      id: e.def?.id ?? null,
      visible: !!gfx.visible,
      key: gfx._statusRingKey ?? null,
      color: gfx._statusRingColor ?? null,
      alpha: gfx._statusRingAlpha ?? null,
    });
  }
  return {
    enabled,
    count: rings.length,
    visible: rings.filter((r) => r.visible).length,
    rings,
  };
}
