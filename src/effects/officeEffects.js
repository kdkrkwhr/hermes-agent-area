/** Runtime particle textures + status emitters + time-of-day lighting. */

const TOD_PRESETS = [
  { name: "morning", hour: 7, color: 0xa8d8ff, alpha: 0.08 },
  { name: "day", hour: 13, color: 0xffffff, alpha: 0 },
  { name: "evening", hour: 18, color: 0x6688aa, alpha: 0.1 },
  { name: "night", hour: 23, color: 0x3344aa, alpha: 0.18 },
];

export function resolveTimeOfDay(hour, devIndex = null) {
  if (devIndex != null && devIndex >= 0 && devIndex < TOD_PRESETS.length) {
    return TOD_PRESETS[devIndex];
  }
  if (hour >= 6 && hour < 10) return TOD_PRESETS[0];
  if (hour >= 10 && hour < 17) return TOD_PRESETS[1];
  if (hour >= 17 && hour < 21) return TOD_PRESETS[2];
  return TOD_PRESETS[3];
}

export function registerEffectTextures(scene) {
  if (scene.textures.exists("fx-spark")) return;

  const spark = scene.make.graphics({ add: false });
  spark.fillStyle(0xffffff, 1);
  spark.fillRect(3, 3, 2, 2);
  spark.generateTexture("fx-spark", 8, 8);
  spark.destroy();

  const steam = scene.make.graphics({ add: false });
  steam.fillStyle(0xffffff, 0.7);
  steam.fillCircle(4, 4, 3);
  steam.generateTexture("fx-steam", 8, 8);
  steam.destroy();

  const q = scene.make.graphics({ add: false });
  q.fillStyle(0xffee88, 1);
  q.fillRect(2, 1, 4, 2);
  q.fillRect(3, 3, 2, 4);
  q.generateTexture("fx-question", 8, 8);
  q.destroy();
}

function sparkConfig(follow) {
  return {
    follow,
    followOffset: { x: 7, y: -6 },
    speed: { min: 12, max: 36 },
    angle: { min: 210, max: 330 },
    scale: { start: 0.7, end: 0 },
    lifespan: { min: 120, max: 260 },
    frequency: 160,
    quantity: 1,
    tint: [0xfff066, 0xffaa22, 0xffffff],
    blendMode: "ADD",
  };
}

function steamConfig(follow) {
  return {
    follow,
    followOffset: { x: 0, y: -20 },
    speedX: { min: -6, max: 6 },
    speedY: { min: -22, max: -10 },
    scale: { start: 0.55, end: 0.08 },
    alpha: { start: 0.45, end: 0 },
    lifespan: { min: 600, max: 900 },
    frequency: 320,
    quantity: 1,
    tint: 0xdddddd,
  };
}

function questionConfig(follow) {
  return {
    follow,
    followOffset: { x: 0, y: -26 },
    speedX: { min: -4, max: 4 },
    speedY: { min: -18, max: -8 },
    scale: { start: 0.8, end: 0.2 },
    alpha: { start: 0.85, end: 0 },
    lifespan: { min: 500, max: 750 },
    frequency: 420,
    quantity: 1,
    tint: 0xffee88,
    rotate: { min: -15, max: 15 },
  };
}

export function createStatusEmitter(scene, kind, follow) {
  if (kind === "offline" || kind === "away") return null;
  if (kind === "running") {
    return scene.add.particles(0, 0, "fx-spark", sparkConfig(follow));
  }
  if (kind === "blocked") {
    return scene.add.particles(0, 0, "fx-question", questionConfig(follow));
  }
  // idle / break / sleep mock
  return scene.add.particles(0, 0, "fx-steam", steamConfig(follow));
}

export function createLightingOverlay(scene, mapW, mapH) {
  const overlay = scene.add.rectangle(0, 0, mapW, mapH, 0xffffff, 0);
  overlay.setOrigin(0, 0);
  overlay.setDepth(6);
  overlay.setScrollFactor(1);
  return overlay;
}

export function applyLightingOverlay(overlay, preset) {
  if (!overlay || !preset) return;
  overlay.setFillStyle(preset.color, preset.alpha);
}

export { TOD_PRESETS };
