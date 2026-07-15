import Phaser from "phaser";
import { AGENTS, resolveWsUrl, buildMockAgents, buildMockSnapshot } from "../mock.js";
import { Agent } from "../agents/Agent.js";
import { Boss } from "../agents/Boss.js";
import { createPathfinder, gridFromCollisionLayer } from "../pathfinding.js";
import { assetUrl } from "../assets.js";
import { createKanbanPanel } from "../kanbanPanel.js";
import {
  applyLightingOverlay,
  createLightingOverlay,
  createStatusEmitter,
  registerEffectTextures,
  resolveTimeOfDay,
  TOD_PRESETS,
} from "../effects/officeEffects.js";

export class OfficeScene extends Phaser.Scene {
  constructor() {
    super("OfficeScene");
  }

  preload() {
    this.load.tilemapTiledJSON("office-map", assetUrl("assets/office-map.json"));
    this.load.image("office-tiles", assetUrl("assets/office-tiles.png"));
    this.load.spritesheet("char-mushroom", assetUrl("assets/char-mushroom.png"), {
      frameWidth: 16,
      frameHeight: 24,
    });
    this.load.spritesheet("char-onion", assetUrl("assets/char-onion.png"), {
      frameWidth: 16,
      frameHeight: 24,
    });
    this.load.spritesheet("char-claude", assetUrl("assets/char-claude.png"), {
      frameWidth: 16,
      frameHeight: 24,
    });
    this.load.spritesheet("char-boss", assetUrl("assets/char-boss.png"), {
      frameWidth: 16,
      frameHeight: 24,
    });
  }

  create() {
    this.map = this.make.tilemap({ key: "office-map" });
    const tiles = this.map.addTilesetImage("office", "office-tiles");
    this.ground = this.map.createLayer("ground", tiles, 0, 0);
    this.furniture = this.map.createLayer("furniture", tiles, 0, 0);
    this.collision = this.map.createLayer("collision", tiles, 0, 0);
    this.collision.setVisible(false);
    this.collision.setCollisionBetween(1, 100);

    const grid = gridFromCollisionLayer(this.collision);
    this.pathfinder = createPathfinder(grid);

    const prop = this.map.properties?.find?.((p) => p.name === "waypoints");
    this.waypoints = prop
      ? JSON.parse(prop.value)
      : {
          desks: [
            { x: 4, y: 14 },
            { x: 11, y: 14 },
            { x: 18, y: 14 },
          ],
          meeting: { x: 4, y: 6 },
          break: { x: 19, y: 5 },
        };

    this.agents = AGENTS.map((def, i) => {
      const start = this.waypoints.desks[def.homeDesk] || this.waypoints.desks[i];
      return new Agent(this, def, start, this.waypoints);
    });
    this.agentsById = Object.fromEntries(this.agents.map((a) => [a.def.id, a]));
    this.agentsByProfile = Object.fromEntries(this.agents.map((a) => [a.def.profile, a]));

    // spawn 대장님 near corridor center (walkable)
    this.boss = new Boss(this, { x: 19, y: 13 }); // corridor near meeting

    // zone labels — room readability without cluttering gameplay
    this.addZoneLabels();

    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.roundPixels = true;
    // fit whole office on screen (integer zoom — non-integer cracks pixel-art)
    this.fitOfficeCamera();
    this.scale.on("resize", () => this.fitOfficeCamera());

    this.hudLabel = this.add
      .text(8, 8, "Hermes Agent Area · connecting…", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "10px",
        color: "#f0c56d",
        stroke: "#1a120c",
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(50);

    this.hintLabel = this.add
      .text(8, 22, "WASD 대장님 이동", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "9px",
        color: "#c8b89a",
        stroke: "#1a120c",
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(50);

    this.live = false;
    this.lastSnapshot = null;
    this.kanbanPanel = createKanbanPanel();
    this.refreshMockKanban();
    this.agents.forEach((agent, i) => {
      agent.idleUntil = this.time.now + 400 + i * 700;
    });

    this.initVisualEffects();

    this.publishDebug(resolveWsUrl(), null);
    this.connectWs();
  }

  initVisualEffects() {
    registerEffectTextures(this);
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    this.lightingOverlay = createLightingOverlay(this, mapW, mapH);
    this.agentEmitters = new Map();
    this._emitterKinds = new Map();
    this.devTimeIndex = this.parseDevTimeOverride();
    this.applyTimeOfDayLighting();

    this.input.keyboard?.on("keydown-L", () => {
      this.devTimeIndex =
        this.devTimeIndex == null ? 0 : (this.devTimeIndex + 1) % TOD_PRESETS.length;
      this.applyTimeOfDayLighting();
    });
  }

  parseDevTimeOverride() {
    const tod = new URLSearchParams(location.search).get("tod");
    if (!tod) return null;
    const idx = TOD_PRESETS.findIndex((p) => p.name === tod);
    return idx >= 0 ? idx : null;
  }

  applyTimeOfDayLighting() {
    const preset = resolveTimeOfDay(new Date().getHours(), this.devTimeIndex);
    applyLightingOverlay(this.lightingOverlay, preset);
    this.lightingPreset = preset;
  }

  syncAgentEmitter(agent) {
    const kind = agent.getEffectKind();
    const prev = this._emitterKinds.get(agent.def.id);
    if (prev === kind) return;

    const old = this.agentEmitters.get(agent.def.id);
    if (old) {
      old.stop();
      old.destroy();
      this.agentEmitters.delete(agent.def.id);
    }
    this._emitterKinds.set(agent.def.id, kind);

    const emitter = createStatusEmitter(this, kind, agent.sprite);
    if (emitter) {
      emitter.setDepth(9);
      this.agentEmitters.set(agent.def.id, emitter);
    }
  }

  updateVisualEffects() {
    for (const agent of this.agents) {
      this.syncAgentEmitter(agent);
    }
    if (this.devTimeIndex == null) {
      const minute = Math.floor(this.time.now / 60000);
      if (this._lightMinute !== minute) {
        this._lightMinute = minute;
        this.applyTimeOfDayLighting();
      }
    }
  }

  refreshMockKanban() {
    const mockSnap = buildMockSnapshot(buildMockAgents());
    this.lastSnapshot = mockSnap;
    this.kanbanPanel.update(mockSnap, { live: false, mock: true });
    this.publishDebug(resolveWsUrl(), mockSnap);
  }

  onAgentSpriteClick(agent) {
    const id = agent?.def?.id;
    if (!id) return;
    this.kanbanPanel.toggleAgent(id);
    this.publishDebug(this.ws?.url ?? resolveWsUrl(), this.lastSnapshot);
  }

  updateKanbanPanel(snapshot, opts = {}) {
    if (!this.kanbanPanel || !snapshot) return;
    const panelState = this.kanbanPanel.update(snapshot, opts);
    if (typeof window !== "undefined") {
      window.__HERMES_AREA__ = {
        ...(window.__HERMES_AREA__ || {}),
        kanbanPanel: panelState,
      };
    }
    return panelState;
  }

  /** Zoom/center so the full office fits the viewport. Integer zoom only (pixel-art). */
  fitOfficeCamera() {
    const cam = this.cameras.main;
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    const viewW = cam.width || this.scale.width;
    const viewH = cam.height || this.scale.height;
    const z = Math.max(1, Math.floor(Math.min(viewW / mapW, viewH / mapH)));
    cam.stopFollow();
    cam.setZoom(z);
    cam.centerOn(mapW / 2, mapH / 2);
    cam.setBounds(0, 0, mapW, mapH);
  }

  addZoneLabels() {
    const tw = this.map.tileWidth;
    const zones = [
      { name: "작업실1", tx: 5, ty: 3 },
      { name: "휴게실", tx: 32, ty: 3 },
      { name: "회의실", tx: 19, ty: 7 },
      { name: "작업실2", tx: 6, ty: 17 },
      { name: "수면실", tx: 32, ty: 17 },
      { name: "입구", tx: 20, ty: 27 },
    ];
    for (const z of zones) {
      this.add
        .text(z.tx * tw + tw / 2, z.ty * tw + 2, z.name, {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "8px",
          color: "#ffe8c8",
          stroke: "#2a1c12",
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(0.5, 0)
        .setDepth(5)
        .setAlpha(0.85);
    }
  }

  connectWs() {
    const url = resolveWsUrl();
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      this.hudLabel.setText("Hermes Agent Area · WS fail → mock");
      this.refreshMockKanban();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.hudLabel.setText("Hermes Agent Area · live");
      this.setLive(true);
    };
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "ping") return;
      if (msg.type === "snapshot" || msg.agents) {
        this.lastSnapshot = msg;
        this.applySnapshot(msg);
        this.updateKanbanPanel(msg, { live: this.live, mock: !!msg.mock });
        this.publishDebug(url, msg);
      }
    };
    ws.onerror = () => {
      this.hudLabel.setText("Hermes Agent Area · WS error → mock");
      this.refreshMockKanban();
    };
    ws.onclose = () => {
      this.setLive(false);
      this.hudLabel.setText("Hermes Agent Area · offline mock");
      this.refreshMockKanban();
      this.time.delayedCall(3000, () => this.connectWs());
    };
  }

  setLive(on) {
    this.live = !!on;
    for (const a of this.agents) a.setLive(this.live);
  }

  applySnapshot(msg) {
    if (!msg?.agents) return;
    for (const raw of msg.agents) {
      const agent =
        this.agentsById[raw.id] || this.agentsByProfile[raw.profile];
      if (!agent) continue;
      agent.applyServer(raw);
    }
  }

  publishDebug(url, msg) {
    if (typeof window === "undefined") return;
    const boss = this.boss;
    const snap = msg ?? this.lastSnapshot;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      ready: true,
      live: this.live,
      snapshot: snap,
      wsUrl: url,
      cameraZoom: this.cameras.main.zoom,
      kanbanPanel: this.kanbanPanel?.getState?.() ?? null,
      boss: boss
        ? {
            x: Math.round(boss.sprite.x),
            y: Math.round(boss.sprite.y),
            dir: boss.lastDir,
            label: "대장님",
          }
        : null,
      lighting: this.lightingPreset?.name ?? null,
      effectKinds: Object.fromEntries(
        this.agents.map((a) => [a.def.id, a.getEffectKind()]),
      ),
    };
  }

  update(time, delta) {
    for (const agent of this.agents) {
      agent.update(time, delta);
    }
    this.updateVisualEffects();
    if (this.boss) {
      this.boss.update(time, delta);
      this.boss.maybeSendPos(this.ws);
      this.publishDebug(this.ws?.url);
    }
  }
}
