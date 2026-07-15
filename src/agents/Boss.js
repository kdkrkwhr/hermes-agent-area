const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
const SPEED = 90;
const PROXIMITY = 40;
const GREETINGS = ["대장님!", "지시 대기중", "보고 준비됨", "안녕하세요 대장님"];

export class Boss {
  constructor(scene, startTile) {
    this.scene = scene;
    this.tileSize = scene.map.tileWidth;
    this.lastDir = "down";
    this._nearAgent = null;
    this._greetIdx = 0;

    const px = startTile.x * this.tileSize + this.tileSize / 2;
    const py = startTile.y * this.tileSize + this.tileSize / 2;

    this.sprite = scene.add.sprite(px, py, "char-boss", 0);
    this.sprite.setDepth(12);
    this.sprite.setOrigin(0.5, 0.85);

    this.nameLabel = scene.add
      .text(px, py - 20, "대장님", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "8px",
        color: "#7dffb2",
        align: "center",
        stroke: "#0b1016",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.bubbleBg = scene.add.graphics().setDepth(21);
    this.bubbleText = scene.add
      .text(px, py - 26, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "6px",
        color: "#0e1620",
        align: "center",
        wordWrap: { width: 48 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(22)
      .setVisible(false);
    this.bubbleBg.setVisible(false);

    // WASD only
    this.keys = scene.input.keyboard.addKeys({
      up: "W",
      left: "A",
      down: "S",
      right: "D",
    });
    this.ensureAnims();
    this.sprite.anims.play("boss-idle-down", true);
  }

  ensureAnims() {
    const scene = this.scene;
    for (const dir of ["down", "left", "right", "up"]) {
      const row = DIR_ROW[dir];
      const walkKey = `boss-walk-${dir}`;
      const idleKey = `boss-idle-${dir}`;
      if (!scene.anims.exists(walkKey)) {
        scene.anims.create({
          key: walkKey,
          frames: scene.anims.generateFrameNumbers("char-boss", {
            frames: [row * 3, row * 3 + 1, row * 3 + 2, row * 3 + 1],
          }),
          frameRate: 8,
          repeat: -1,
        });
      }
      if (!scene.anims.exists(idleKey)) {
        scene.anims.create({
          key: idleKey,
          frames: [{ key: "char-boss", frame: row * 3 }],
          frameRate: 1,
        });
      }
    }
  }

  blocked(nx, ny) {
    const layer = this.scene.collision;
    if (!layer) return true;
    // feet sample points — avoid wall/furniture pierce
    const pads = [
      [0, 0],
      [-4, 0],
      [4, 0],
      [0, -2],
      [0, 2],
    ];
    for (const [ox, oy] of pads) {
      const tx = Math.floor((nx + ox) / this.tileSize);
      const ty = Math.floor((ny + oy) / this.tileSize);
      const tile = layer.getTileAt(tx, ty);
      if (tile && tile.index > 0) return true;
    }
    return false;
  }

  update(time, delta) {
    const keys = this.keys;
    let dx = 0;
    let dy = 0;
    if (keys.left.isDown) dx -= 1;
    if (keys.right.isDown) dx += 1;
    if (keys.up.isDown) dy -= 1;
    if (keys.down.isDown) dy += 1;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.hypot(dx, dy) || 1;
      const step = (SPEED * delta) / 1000;
      const mx = (dx / len) * step;
      const my = (dy / len) * step;
      let nx = this.sprite.x + mx;
      let ny = this.sprite.y + my;

      if (!this.blocked(nx, this.sprite.y)) this.sprite.x = nx;
      else nx = this.sprite.x;
      if (!this.blocked(this.sprite.x, ny)) this.sprite.y = ny;

      const dir =
        Math.abs(dx) > Math.abs(dy)
          ? dx < 0
            ? "left"
            : "right"
          : dy < 0
            ? "up"
            : "down";
      this.lastDir = dir;
      const walkKey = `boss-walk-${dir}`;
      if (this.sprite.anims.currentAnim?.key !== walkKey) {
        this.sprite.anims.play(walkKey, true);
      }
    } else {
      const idleKey = `boss-idle-${this.lastDir}`;
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        this.sprite.anims.play(idleKey, true);
      }
    }

    this.updateProximity();
    this.syncUi();
  }

  updateProximity() {
    let nearest = null;
    let best = PROXIMITY;
    for (const agent of this.scene.agents || []) {
      const d = Math.hypot(
        agent.sprite.x - this.sprite.x,
        agent.sprite.y - this.sprite.y,
      );
      if (d < best) {
        best = d;
        nearest = agent;
      }
    }

    if (nearest !== this._nearAgent) {
      if (this._nearAgent && this._nearAgent._bossGreetBackup != null) {
        this._nearAgent.setStatus(this._nearAgent._bossGreetBackup);
        this._nearAgent._bossGreetBackup = null;
      }
      this._nearAgent = nearest;
      if (nearest) {
        nearest._bossGreetBackup = nearest.statusText;
        const msg = GREETINGS[this._greetIdx % GREETINGS.length];
        this._greetIdx += 1;
        nearest.setStatus(msg);
        this.showBubble("ㅇㅋ");
      } else {
        this.hideBubble();
      }
    }
  }

  showBubble(text) {
    this.bubbleText.setText(text).setVisible(true);
    this.bubbleBg.setVisible(true);
    this.drawBubble();
  }

  hideBubble() {
    this.bubbleText.setVisible(false);
    this.bubbleBg.clear();
    this.bubbleBg.setVisible(false);
  }

  drawBubble() {
    if (!this.bubbleText.visible) return;
    const padX = 3;
    const padY = 2;
    const w = this.bubbleText.width + padX * 2;
    const h = this.bubbleText.height + padY * 2;
    const x = this.sprite.x - w / 2;
    const y = this.sprite.y - 38 - h;
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0xd8f4f0, 0.94);
    this.bubbleBg.fillRoundedRect(x, y, w, h, 2);
    this.bubbleBg.lineStyle(1, 0x2a4a56, 1);
    this.bubbleBg.strokeRoundedRect(x, y, w, h, 2);
    this.bubbleBg.fillTriangle(
      this.sprite.x - 2,
      y + h,
      this.sprite.x + 2,
      y + h,
      this.sprite.x,
      y + h + 3,
    );
    this.bubbleText.setPosition(this.sprite.x, y + h - padY);
  }

  syncUi() {
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y - 20);
    this.drawBubble();
  }

  /** Optional: push position to BE if socket open. */
  maybeSendPos(ws) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (this._lastSent && performance.now() - this._lastSent < 200) return;
    this._lastSent = performance.now();
    try {
      ws.send(
        JSON.stringify({
          type: "boss_pos",
          x: Math.round(this.sprite.x),
          y: Math.round(this.sprite.y),
          dir: this.lastDir,
        }),
      );
    } catch {
      /* ignore */
    }
  }
}
