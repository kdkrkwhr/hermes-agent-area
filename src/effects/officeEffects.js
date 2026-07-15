/** Runtime particle textures + status emitters + time-of-day lighting. */

const TOD_PRESETS = [
  { name: "morning", hour: 7, color: 0xffe8c8, alpha: 0.06 },
  { name: "day", hour: 13, color: 0xffffff, alpha: 0 },
  { name: "evening", hour: 18, color: 0xffc8a0, alpha: 0.07 },
  { name: "night", hour: 23, color: 0x4a6080, alpha: 0.12 },
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

  // soft rising "Z" for Nap Pod / offline (recolored fx-question silhouette)
  const z = scene.make.graphics({ add: false });
  z.fillStyle(0xb8c8e8, 1);
  z.fillRect(1, 1, 6, 2);
  z.fillRect(4, 3, 2, 2);
  z.fillRect(1, 5, 6, 2);
  z.generateTexture("fx-zzz", 8, 8);
  z.destroy();
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

function zzzConfig(follow) {
  // Nap Pod — denser / floatier Zzz than pre-interaction pass
  return {
    follow,
    followOffset: { x: 2, y: -26 },
    speedX: { min: -6, max: 12 },
    speedY: { min: -22, max: -10 },
    scale: { start: 1.25, end: 0.3 },
    alpha: { start: 0.9, end: 0 },
    lifespan: { min: 1100, max: 1700 },
    frequency: 280,
    quantity: 2,
    tint: [0xb8c8e8, 0xd0d8f0, 0x9aacc8, 0xe8eef8],
    rotate: { min: -12, max: 16 },
  };
}

export function createStatusEmitter(scene, kind, follow) {
  if (kind === "away") return null;
  if (kind === "running") {
    return scene.add.particles(0, 0, "fx-spark", sparkConfig(follow));
  }
  if (kind === "blocked") {
    return scene.add.particles(0, 0, "fx-question", questionConfig(follow));
  }
  if (kind === "sleep" || kind === "offline") {
    return scene.add.particles(0, 0, "fx-zzz", zzzConfig(follow));
  }
  // idle / break lounge steam
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
