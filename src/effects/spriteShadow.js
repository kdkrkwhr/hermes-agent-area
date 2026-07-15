/** Soft drop shadow under character sprites. `?shadow=0` off. */

/** Just under typical agent depth (10) so feet sit on the ellipse. */
export const SHADOW_DEPTH_DEFAULT = 9;

const IDLE_ALPHA = 0.38;
const MOVE_ALPHA = 0.24;
const COLOR = 0x1a1210;

/** `?shadow=0` (or false/off) disables. Default on. */
export function shadowEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("shadow");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/**
 * Soft stacked ellipses (pixelArt — no blur filter).
 * @param {Phaser.Scene} scene
 * @param {{ depth?: number }} [opts]
 * @returns {Phaser.GameObjects.Graphics|null}
 */
export function createSpriteShadow(scene, opts = {}) {
  if (!shadowEnabledFromQuery()) return null;
  const depth = opts.depth ?? SHADOW_DEPTH_DEFAULT;
  const gfx = scene.add.graphics().setDepth(depth).setVisible(true);
  return gfx;
}

/**
 * Follow sprite feet; lighter alpha while moving.
 * @param {Phaser.GameObjects.Graphics|null} gfx
 * @param {Phaser.GameObjects.Sprite|null} sprite
 * @param {{ moving?: boolean, width?: number, height?: number, oy?: number }} [opts]
 */
export function updateSpriteShadow(gfx, sprite, opts = {}) {
  if (!gfx) return;
  if (!sprite?.active) {
    gfx.clear();
    gfx.setVisible(false);
    return;
  }

  const moving = !!opts.moving;
  const alpha = moving ? MOVE_ALPHA : IDLE_ALPHA;
  const w = opts.width ?? 22;
  const h = opts.height ?? 8;
  const oy = opts.oy ?? 2;
  const x = sprite.x;
  const y = sprite.y + oy;

  gfx.setVisible(true);
  gfx.clear();
  // soft stacked ellipses — cheap faux blur
  gfx.fillStyle(COLOR, alpha * 0.28);
  gfx.fillEllipse(x, y, w * 1.45, h * 1.45);
  gfx.fillStyle(COLOR, alpha * 0.5);
  gfx.fillEllipse(x, y, w, h);
  gfx.fillStyle(COLOR, alpha * 0.75);
  gfx.fillEllipse(x, y, w * 0.55, h * 0.55);
}

/** Compact smoke/debug snapshot for window.__HERMES_AREA__. */
export function shadowSnapshot(entities) {
  const enabled = shadowEnabledFromQuery();
  const list = Array.isArray(entities) ? entities : [];
  let visible = 0;
  for (const e of list) {
    if (e?.shadowGfx?.visible) visible += 1;
  }
  return {
    enabled,
    count: list.filter((e) => e?.shadowGfx).length,
    visible,
  };
}
