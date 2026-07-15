/** HUD minimap — scrollFactor 0, bottom-right. ?minimap=0 disables. */

const MINI_W = 160;
const MINI_H = 120;
const PAD = 12;
const DEPTH = 55;
const BG_KEY = "minimap-bg";

const STATUS_COLOR = {
  running: 0x3dd68c,
  chatting: 0x3dd68c,
  blocked: 0xe8c547,
  idle: 0x5ee0c8,
  offline: 0x6a7a8a,
};

function statusColor(status) {
  return STATUS_COLOR[status] ?? STATUS_COLOR.idle;
}

function parseMinimapEnabled() {
  if (typeof location === "undefined") return true;
  const q = new URLSearchParams(location.search).get("minimap");
  return q !== "0" && q !== "false";
}

/**
 * Build a 1× texture of the office silhouette (ground fill + collision walls).
 * @param {Phaser.Scene} scene
 * @param {number} miniW
 * @param {number} miniH
 */
function bakeBackground(scene, miniW, miniH) {
  if (scene.textures.exists(BG_KEY)) scene.textures.remove(BG_KEY);

  const map = scene.map;
  const mapW = map.widthInPixels;
  const mapH = map.heightInPixels;
  const sx = miniW / mapW;
  const sy = miniH / mapH;
  const tw = map.tileWidth;
  const th = map.tileHeight;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x121820, 1);
  g.fillRect(0, 0, miniW, miniH);

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const gt = scene.ground?.getTileAt(tx, ty);
      const ct = scene.collision?.getTileAt(tx, ty);
      const px = Math.floor(tx * tw * sx);
      const py = Math.floor(ty * th * sy);
      const pw = Math.max(1, Math.ceil(tw * sx));
      const ph = Math.max(1, Math.ceil(th * sy));
      if (ct && ct.index > 0) {
        g.fillStyle(0x5a7088, 1);
        g.fillRect(px, py, pw, ph);
      } else if (gt && gt.index > 0) {
        g.fillStyle(0x243040, 1);
        g.fillRect(px, py, pw, ph);
      }
    }
  }

  g.lineStyle(1, 0x3a4a5c, 1);
  g.strokeRect(0.5, 0.5, miniW - 1, miniH - 1);
  g.generateTexture(BG_KEY, miniW, miniH);
  g.destroy();
}

export class Minimap {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ width?: number, height?: number }} [opts]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.miniW = opts.width ?? MINI_W;
    this.miniH = opts.height ?? MINI_H;
    this.enabled = parseMinimapEnabled();
    this.root = null;
    this.bg = null;
    this.dyn = null;
    this.hit = null;
    if (!this.enabled) return;

    bakeBackground(scene, this.miniW, this.miniH);

    this.root = scene.add.container(0, 0);
    this.root.setScrollFactor(0);
    this.root.setDepth(DEPTH);

    this.bg = scene.add.image(0, 0, BG_KEY).setOrigin(0, 0);
    this.dyn = scene.add.graphics();
    this.hit = scene.add
      .rectangle(0, 0, this.miniW, this.miniH, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    this.root.add([this.bg, this.dyn, this.hit]);
    this.hit.on("pointerdown", (_pointer, localX, localY) =>
      this.onClick(localX, localY),
    );

    this.layout();
    scene.scale.on("resize", () => this.layout());
  }

  layout() {
    if (!this.root) return;
    const cam = this.scene.cameras.main;
    const x = cam.width - this.miniW - PAD;
    const y = cam.height - this.miniH - PAD;
    this.root.setPosition(x, y);
  }

  /** Map world px → minimap local px. */
  worldToMini(wx, wy) {
    const mapW = this.scene.map.widthInPixels;
    const mapH = this.scene.map.heightInPixels;
    return {
      x: (wx / mapW) * this.miniW,
      y: (wy / mapH) * this.miniH,
    };
  }

  onClick(localX, localY) {
    if (!this.root || this.scene.cameraFollow) return;
    if (localX < 0 || localY < 0 || localX > this.miniW || localY > this.miniH) {
      return;
    }
    const mapW = this.scene.map.widthInPixels;
    const mapH = this.scene.map.heightInPixels;
    const wx = (localX / this.miniW) * mapW;
    const wy = (localY / this.miniH) * mapH;
    this.scene.cameras.main.centerOn(wx, wy);
  }

  update() {
    if (!this.dyn) return;
    const g = this.dyn;
    g.clear();

    // camera viewport box
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const a = this.worldToMini(view.x, view.y);
    const b = this.worldToMini(view.right, view.bottom);
    const vx = Math.max(0, a.x);
    const vy = Math.max(0, a.y);
    const vw = Math.min(this.miniW, b.x) - vx;
    const vh = Math.min(this.miniH, b.y) - vy;
    if (vw > 0 && vh > 0) {
      g.lineStyle(1, 0xf0e6d0, 0.95);
      g.strokeRect(vx + 0.5, vy + 0.5, Math.max(1, vw - 1), Math.max(1, vh - 1));
    }

    // agents
    for (const agent of this.scene.agents || []) {
      if (!agent?.sprite) continue;
      const p = this.worldToMini(agent.sprite.x, agent.sprite.y);
      const color = statusColor(agent.serverStatus || "idle");
      g.fillStyle(color, 1);
      g.fillCircle(p.x, p.y, 2.5);
    }

    // boss: gold cross
    const boss = this.scene.boss?.sprite;
    if (boss) {
      const p = this.worldToMini(boss.x, boss.y);
      g.lineStyle(1.5, 0xffd27a, 1);
      g.beginPath();
      g.moveTo(p.x - 3.5, p.y);
      g.lineTo(p.x + 3.5, p.y);
      g.moveTo(p.x, p.y - 3.5);
      g.lineTo(p.x, p.y + 3.5);
      g.strokePath();
      g.fillStyle(0xffd27a, 1);
      g.fillCircle(p.x, p.y, 1.2);
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      width: this.miniW,
      height: this.miniH,
      x: this.root?.x ?? null,
      y: this.root?.y ?? null,
    };
  }

  destroy() {
    this.root?.destroy(true);
    this.root = null;
    this.bg = null;
    this.dyn = null;
    this.hit = null;
  }
}

export { parseMinimapEnabled, MINI_W, MINI_H };
