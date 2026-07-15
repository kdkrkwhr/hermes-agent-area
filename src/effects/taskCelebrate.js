/** Soft ADD confetti when agent finishes work (running|chatting → idle). */

/** Above nameplate / status emitters (9); near desk glow (11). */
const DEPTH = 11;
/** Burst size — short pop, not ship_it fireworks. */
const QTY_MIN = 8;
const QTY_MAX = 14;
/** Yellow / mint / white soft bits. */
const TINTS = [0xfff066, 0x7eecc8, 0xffffff];

/**
 * Query: omit = on (edge only). `0`/`off`/`false` = never.
 * `1`/`true`/`force` = also fire a smoke burst on scene start.
 * @returns {"off"|"on"|"force"}
 */
export function celebrateModeFromQuery() {
  if (typeof location === "undefined") return "on";
  try {
    const v = new URLSearchParams(location.search).get("celebrate");
    if (v == null || v === "") return "on";
    if (v === "0" || v === "false" || v === "off") return "off";
    if (v === "1" || v === "true" || v === "force" || v === "on") return "force";
    return "on";
  } catch {
    return "on";
  }
}

export function celebrateEnabledFromQuery() {
  return celebrateModeFromQuery() !== "off";
}

export function celebrateForceFromQuery() {
  return celebrateModeFromQuery() === "force";
}

/** Effect-kind edge: chatting collapses to running in getEffectKind. */
export function isTaskCompleteTransition(prevKind, nextKind) {
  return prevKind === "running" && nextKind === "idle";
}

function ensureConfettiTexture(scene) {
  if (scene.textures.exists("fx-confetti")) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRect(2, 1, 4, 3);
  g.generateTexture("fx-confetti", 8, 8);
  g.destroy();
}

/**
 * One soft ADD burst above the agent head. Lifespan ~0.6–0.9s then destroy.
 * @param {Phaser.Scene} scene
 * @param {{ sprite?: Phaser.GameObjects.Sprite } | Phaser.GameObjects.Sprite} agentOrSprite
 */
export function burstTaskCelebrate(scene, agentOrSprite) {
  if (!scene?.add) return null;
  ensureConfettiTexture(scene);

  const spr = agentOrSprite?.sprite ?? agentOrSprite;
  if (!spr || typeof spr.x !== "number") return null;

  const qty = QTY_MIN + Math.floor(Math.random() * (QTY_MAX - QTY_MIN + 1));
  const x = spr.x;
  const y = spr.y - 28;

  const emitter = scene.add.particles(x, y, "fx-confetti", {
    speed: { min: 28, max: 72 },
    angle: { min: 200, max: 340 },
    gravityY: 40,
    scale: { start: 0.85, end: 0.15 },
    alpha: { start: 0.9, end: 0 },
    lifespan: { min: 600, max: 900 },
    quantity: qty,
    frequency: -1,
    tint: TINTS,
    blendMode: "ADD",
    rotate: { min: -40, max: 40 },
  });
  emitter.setDepth(DEPTH);
  emitter.explode(qty);

  scene.time.delayedCall(1000, () => {
    try {
      emitter.destroy();
    } catch {
      /* ignore */
    }
  });
  return emitter;
}

/**
 * Smoke helper: `?celebrate=1` fires once on the first agent after a short delay.
 * @param {Phaser.Scene} scene
 * @param {Array<{ sprite?: Phaser.GameObjects.Sprite }>} agents
 */
export function maybeForceCelebrate(scene, agents) {
  if (!celebrateForceFromQuery()) return;
  const list = agents || [];
  scene.time.delayedCall(450, () => {
    const a = list[0] || scene.agents?.[0];
    if (a) burstTaskCelebrate(scene, a);
  });
}
