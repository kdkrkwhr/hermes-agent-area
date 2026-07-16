/** Soft foot footprint trails while walking. `?footprints=0` off. */

/** Above floor shadow (~8), below typical agent sprite (10). */
export const FOOTPRINT_DEPTH_DEFAULT = 8;

const INTERVAL_MS = 220;
const MAX_PER_ENTITY = 6;
const FADE_MS = 520;
const COLOR = 0x2a221c;
const START_ALPHA = 0.34;

/** `?footprints=0` (or false/off) disables. Default on. */
export function footprintsEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("footprints");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/**
 * Per-entity trail state (null when disabled).
 * @param {Phaser.Scene} scene
 * @param {{ depth?: number, interval?: number, max?: number }} [opts]
 * @returns {{ scene: Phaser.Scene, depth: number, interval: number, max: number, marks: any[], lastSpawn: number, foot: number }|null}
 */
export function createFootprintTrail(scene, opts = {}) {
  if (!footprintsEnabledFromQuery()) return null;
  return {
    scene,
    depth: opts.depth ?? FOOTPRINT_DEPTH_DEFAULT,
    interval: opts.interval ?? INTERVAL_MS,
    max: opts.max ?? MAX_PER_ENTITY,
    marks: [],
    lastSpawn: 0,
    foot: 0,
  };
}

/**
 * Spawn fading ellipses at feet while moving; prune oldest over cap.
 * @param {ReturnType<typeof createFootprintTrail>} trail
 * @param {Phaser.GameObjects.Sprite|null} sprite
 * @param {{ moving?: boolean, width?: number, height?: number, oy?: number, dir?: string }} [opts]
 */
export function updateFootprintTrail(trail, sprite, opts = {}) {
  if (!trail) return;
  if (!sprite?.active) return;

  const moving = !!opts.moving;
  if (!moving) return;

  const now = trail.scene.time.now;
  if (now - trail.lastSpawn < trail.interval) return;
  trail.lastSpawn = now;

  while (trail.marks.length >= trail.max) {
    _killMark(trail.marks.shift());
  }

  const w = opts.width ?? 10;
  const h = opts.height ?? 5;
  const oy = opts.oy ?? 2;
  const dir = opts.dir || "down";
  // alternate L/R offset perpendicular to facing
  const side = trail.foot % 2 === 0 ? -1 : 1;
  trail.foot += 1;
  let ox = 0;
  let oyOff = 0;
  if (dir === "left" || dir === "right") {
    oyOff = side * 3;
  } else {
    ox = side * 3;
  }

  const x = sprite.x + ox;
  const y = sprite.y + oy + oyOff;
  const gfx = trail.scene.add.graphics().setDepth(trail.depth);
  gfx.fillStyle(COLOR, START_ALPHA * 0.45);
  gfx.fillEllipse(x, y, w * 1.35, h * 1.35);
  gfx.fillStyle(COLOR, START_ALPHA);
  gfx.fillEllipse(x, y, w, h);

  const mark = { gfx, tween: null };
  trail.marks.push(mark);

  mark.tween = trail.scene.tweens.add({
    targets: gfx,
    alpha: 0,
    duration: FADE_MS,
    ease: "Quad.easeOut",
    onComplete: () => {
      const i = trail.marks.indexOf(mark);
      if (i >= 0) trail.marks.splice(i, 1);
      try {
        gfx.destroy();
      } catch {
        /* ignore */
      }
    },
  });
}

/**
 * @param {ReturnType<typeof createFootprintTrail>} trail
 */
export function destroyFootprintTrail(trail) {
  if (!trail) return;
  while (trail.marks.length) {
    _killMark(trail.marks.shift());
  }
}

function _killMark(mark) {
  if (!mark) return;
  try {
    mark.tween?.stop?.();
  } catch {
    /* ignore */
  }
  try {
    mark.gfx?.destroy?.();
  } catch {
    /* ignore */
  }
}

/** Compact smoke/debug snapshot for window.__HERMES_AREA__. */
export function footprintSnapshot(entities) {
  const enabled = footprintsEnabledFromQuery();
  const list = Array.isArray(entities) ? entities : [];
  let marks = 0;
  let trails = 0;
  for (const e of list) {
    const t = e?.footprintTrail;
    if (!t) continue;
    trails += 1;
    marks += t.marks?.length ?? 0;
  }
  return { enabled, trails, marks };
}
