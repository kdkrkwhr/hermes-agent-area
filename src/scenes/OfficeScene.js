import Phaser from "phaser";
import {
  defFromServerAgent,
  resolveWsUrl,
  buildMockAgents,
  buildMockSnapshot,
  buildDisconnectedAgents,
  isPagesLocalWsBlocked,
} from "../mock.js";
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
import { deskFxEnabledFromQuery } from "../effects/deskGlow.js";
import { OfficeAudio } from "../audio/officeAudio.js";
import { OfficeEvents } from "../effects/officeEvents.js";
import { Minimap } from "../ui/minimap.js";
import { notifyAgentDone } from "../notify.js";
import { CHAR_FRAME_H, CHAR_FRAME_W } from "../constants.js";

export class OfficeScene extends Phaser.Scene {
  constructor() {
    super("OfficeScene");
  }

  preload() {
    this.load.tilemapTiledJSON("office-map", assetUrl("assets/office-map.json"));
    this.load.image("office-tiles", assetUrl("assets/office-tiles.png"));
    this.load.spritesheet("char-mushroom", assetUrl("assets/char-mushroom.png"), {
      frameWidth: CHAR_FRAME_W,
      frameHeight: CHAR_FRAME_H,
    });
    this.load.spritesheet("char-onion", assetUrl("assets/char-onion.png"), {
      frameWidth: CHAR_FRAME_W,
      frameHeight: CHAR_FRAME_H,
    });
    this.load.spritesheet("char-claude", assetUrl("assets/char-claude.png"), {
      frameWidth: CHAR_FRAME_W,
      frameHeight: CHAR_FRAME_H,
    });
    this.load.spritesheet("char-boss", assetUrl("assets/char-boss.png"), {
      frameWidth: CHAR_FRAME_W,
      frameHeight: CHAR_FRAME_H,
    });
    this.officeAudio = new OfficeAudio(this);
    this.officeAudio.preload();
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
          // fallback = office-map.json properties.waypoints
          desks: [
            { x: 3, y: 5 },
            { x: 7, y: 5 },
            { x: 3, y: 19 },
          ],
          meeting: { x: 18, y: 9 },
          break: { x: 31, y: 4 },
          lounge: [
            { x: 31, y: 4 },
            { x: 32, y: 5 },
            { x: 28, y: 3 },
            { x: 30, y: 7 },
            { x: 33, y: 5 },
            { x: 29, y: 4 },
            { x: 32, y: 7 },
            { x: 28, y: 7 },
            { x: 31, y: 7 },
            { x: 33, y: 4 },
          ],
          sleep: { x: 31, y: 21 },
          entrance: { x: 20, y: 27 },
        };

    // start empty; first WS/mock snapshot fills from local Hermes profiles (or mock)
    this.agents = [];
    this.agentsById = {};
    this.agentsByProfile = {};
    this.rebuildAgentIndex();

    // spawn 대장님 near corridor center (walkable)
    this.boss = new Boss(this, { x: 12, y: 26 }); // corridor near lobby entrance

    // zone labels — room readability without cluttering gameplay
    this.addZoneLabels();

    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.roundPixels = true;
    this.cameraFollow = this.parseFollowDefault();
    // overview = fit whole office; follow = boss-centered zoom 2
    this.applyCameraMode();
    this.scale.on("resize", () => this.applyCameraMode());

    // connection status — DOM toolbar handles branding/hints
    this.hudLabel = this.add
      .text(8, 8, "connecting…", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "18px",
        color: "#5ee0c8",
        stroke: "#0b1016",
        strokeThickness: 6,
      })
      .setScrollFactor(0)
      .setDepth(50);

    this.muteLabel = this.add
      .text(8, 36, "♪", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "20px",
        color: "#8aa0b8",
        stroke: "#0b1016",
        strokeThickness: 6,
      })
      .setScrollFactor(0)
      .setDepth(50);

    this.followLabel = this.add
      .text(8, 64, "⛶", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "20px",
        color: "#8aa0b8",
        stroke: "#0b1016",
        strokeThickness: 6,
      })
      .setScrollFactor(0)
      .setDepth(50);

    // shown only when boss is within proximity of an agent
    this.hintLabel = this.add
      .text(40, 64, "E 상세", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#5ee0c8",
        stroke: "#0b1016",
        strokeThickness: 5,
      })
      .setScrollFactor(0)
      .setDepth(50)
      .setVisible(false);

    this.input.keyboard?.on("keydown-F", () => this.toggleCameraFollow());
    this.refreshFollowHud();
    this.refreshInteractHud();

    this.live = false;
    this.lastSnapshot = null;
    this.kanbanPanel = createKanbanPanel();
    this.refreshMockKanban();
    this.agents.forEach((agent, i) => {
      agent.idleUntil = this.time.now + 400 + i * 700;
    });

    this.initVisualEffects();
    if (!this.officeAudio) this.officeAudio = new OfficeAudio(this);
    this.officeAudio.create(() => this.refreshMuteHud());
    this.refreshMuteHud();

    this.officeEvents = new OfficeEvents(this);
    this.officeEvents.start();

    this.minimap = new Minimap(this);

    this.publishDebug(resolveWsUrl(), null);
    this.connectWs();
  }

  refreshMuteHud() {
    if (!this.muteLabel || !this.officeAudio) return;
    this.muteLabel.setText(this.officeAudio.muteGlyph());
    this.muteLabel.setColor(this.officeAudio.muted ? "#5a6a7c" : "#5ee0c8");
  }

  initVisualEffects() {
    registerEffectTextures(this);
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    this.lightingOverlay = createLightingOverlay(this, mapW, mapH);
    this.agentEmitters = new Map();
    this._emitterKinds = new Map();
    this.deskFxEnabled = deskFxEnabledFromQuery();
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

    this.officeAudio?.playStatusSfx(kind, prev);
    this.officeEvents?.onStatusTransition(prev, kind, agent);

    // live only: running → idle = 칸반 작업 끝 → PWA/Chrome 알림
    if (this.live && prev === "running" && kind === "idle") {
      notifyAgentDone(agent);
    }

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

  refreshMockKanban({ disconnected = false } = {}) {
    const agents = disconnected ? buildDisconnectedAgents() : buildMockAgents();
    const reason = disconnected
      ? "Pages HTTPS → localhost WS blocked"
      : "mock mode";
    const mockSnap = buildMockSnapshot(agents, reason);
    this.lastSnapshot = mockSnap;
    this.setLive(false);
    this.applySnapshot(mockSnap);
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

  parseFollowDefault() {
    const q = new URLSearchParams(location.search).get("follow");
    return q === "1" || q === "true";
  }

  toggleCameraFollow() {
    this.cameraFollow = !this.cameraFollow;
    this.applyCameraMode();
    this.refreshFollowHud();
  }

  applyCameraMode() {
    if (this.cameraFollow && this.boss?.sprite) {
      this.enableFollowCamera();
    } else {
      this.fitOfficeCamera();
    }
  }

  /** Boss-centered follow; integer zoom 2; clamps to map bounds. */
  enableFollowCamera() {
    const cam = this.cameras.main;
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    cam.setBounds(0, 0, mapW, mapH);
    cam.roundPixels = true;
    cam.setZoom(2);
    cam.startFollow(this.boss.sprite, true, 0.12, 0.12);
  }

  /** Canvas size == map size; keep zoom 1 so FIT shows the whole office. */
  fitOfficeCamera() {
    const cam = this.cameras.main;
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    cam.stopFollow();
    cam.setZoom(1);
    cam.centerOn(mapW / 2, mapH / 2);
    cam.setBounds(0, 0, mapW, mapH);
  }

  refreshFollowHud() {
    if (!this.followLabel) return;
    this.followLabel.setText(this.cameraFollow ? "👁" : "⛶");
    this.followLabel.setColor(this.cameraFollow ? "#5ee0c8" : "#8aa0b8");
    const btn =
      typeof document !== "undefined"
        ? document.querySelector('[data-role="toggle-follow"]')
        : null;
    if (btn) {
      btn.setAttribute("aria-pressed", this.cameraFollow ? "true" : "false");
      btn.classList.toggle("is-off", !this.cameraFollow);
      btn.textContent = this.cameraFollow ? "팔로우 on" : "팔로우";
    }
  }

  /** Hint next to follow glyph — only while boss is near an agent. */
  refreshInteractHud() {
    if (!this.hintLabel) return;
    const nearId = this.boss?.nearAgentId ?? null;
    this.hintLabel.setVisible(!!nearId);
  }

  addZoneLabels() {
    const tw = this.map.tileWidth;
    const zones = [
      { name: "Open Desk", tx: 8, ty: 2 },
      { name: "Lounge", tx: 31, ty: 2 },
      { name: "War Room", tx: 25, ty: 7 },
      { name: "Focus", tx: 8, ty: 16 },
      { name: "Nap Pod", tx: 31, ty: 16 },
      { name: "Lobby", tx: 20, ty: 26 },
    ];
    for (const z of zones) {
      this.add
        .text(z.tx * tw + tw / 2, z.ty * tw + 2, z.name, {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "18px",
          color: "#5a7a6a",
          stroke: "#f4f0ea",
          strokeThickness: 5,
        })
        .setOrigin(0.5, 0)
        .setDepth(5)
        .setAlpha(0.85);
    }
  }

  reconnectWs() {
    this._wsManualClose = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this._wsManualClose = false;
    this.connectWs();
  }

  connectWs() {
    const url = resolveWsUrl();
    // Pages(HTTPS) + ws://localhost = 브라우저가 차단 → 가짜 휴식만 보임
    if (isPagesLocalWsBlocked()) {
      this.hudLabel.setText("⚠ Pages→localhost 막힘 · 연결 버튼 / npm run dev");
      this.refreshMockKanban({ disconnected: true });
      return;
    }
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      this.hudLabel.setText("WS fail → mock");
      this.refreshMockKanban();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.hudLabel.setText(`live · ${url.replace(/^wss?:\/\//, "")}`);
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
      this.hudLabel.setText("WS error → mock");
      if (!this.lastSnapshot?.mock) this.refreshMockKanban();
    };
    ws.onclose = () => {
      this.setLive(false);
      if (this._wsManualClose) return;
      this.hudLabel.setText("offline mock");
      if (!this.lastSnapshot?.mock) this.refreshMockKanban();
      this.time.delayedCall(3000, () => this.connectWs());
    };
  }

  setLive(on) {
    this.live = !!on;
    for (const a of this.agents) a.setLive(this.live);
  }

  rebuildAgentIndex() {
    this.agentsById = Object.fromEntries(this.agents.map((a) => [a.def.id, a]));
    this.agentsByProfile = Object.fromEntries(
      this.agents.map((a) => [a.def.profile, a]),
    );
  }

  /** Sync Phaser agents to BE roster (ids = Hermes profile names). */
  syncAgentsFromSnapshot(rawAgents) {
    if (!Array.isArray(rawAgents)) return;
    const wanted = new Set(
      rawAgents.map((r) => r.id || r.profile).filter(Boolean),
    );

    const kept = [];
    for (const agent of this.agents) {
      const key = agent.def.id;
      const profile = agent.def.profile;
      if (wanted.has(key) || wanted.has(profile)) {
        kept.push(agent);
      } else {
        this.agentEmitters?.get(agent.def.id)?.destroy();
        this.agentEmitters?.delete(agent.def.id);
        this._emitterKinds?.delete(agent.def.id);
        agent.destroy();
      }
    }
    this.agents = kept;
    this.rebuildAgentIndex();

    for (let i = 0; i < rawAgents.length; i++) {
      const raw = rawAgents[i];
      const id = raw.id || raw.profile;
      if (!id) continue;
      if (this.agentsById[id] || this.agentsByProfile[raw.profile]) continue;
      const deskIdx = i % (this.waypoints.desks?.length || 1);
      const start =
        this.waypoints.desks[deskIdx] ||
        this.waypoints.desks[0] ||
        { x: 4, y: 6 };
      const def = defFromServerAgent(raw, deskIdx);
      def.homeDesk = deskIdx;
      const agent = new Agent(this, def, start, this.waypoints);
      agent.setLive(this.live);
      this.agents.push(agent);
    }
    this.rebuildAgentIndex();
  }

  applySnapshot(msg) {
    if (!msg?.agents) return;
    this.syncAgentsFromSnapshot(msg.agents);
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
      cameraFollow: !!this.cameraFollow,
      kanbanPanel: this.kanbanPanel?.getState?.() ?? null,
      boss: boss
        ? {
            x: Math.round(boss.sprite.x),
            y: Math.round(boss.sprite.y),
            dir: boss.lastDir,
            label: "대장님",
          }
        : null,
      bossNearAgentId: boss?.nearAgentId ?? null,
      lighting: this.lightingPreset?.name ?? null,
      effectKinds: Object.fromEntries(
        this.agents.map((a) => [a.def.id, a.getEffectKind()]),
      ),
      deskFxEnabled: this.deskFxEnabled !== false,
      deskGlow: Object.fromEntries(
        this.agents.map((a) => {
          const on = a.deskGlowGfx?.visible;
          return [a.def.id, on ? a.serverStatus : null];
        }),
      ),
      audio: this.officeAudio?.snapshot?.() ?? null,
      events: this.officeEvents?.snapshot?.() ?? null,
      minimap: this.minimap?.snapshot?.() ?? null,
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
    this.minimap?.update();
  }
}
