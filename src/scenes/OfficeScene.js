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
import { Mascot, mascotEnabledFromQuery } from "../agents/Mascot.js";
import { VisitorDirector } from "../agents/Visitor.js";
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
import { deskFxEnabledFromQuery, focusFxEnabledFromQuery, resolveDeskGlowKind } from "../effects/deskGlow.js";
import { shadowSnapshot } from "../effects/spriteShadow.js";
import { statusFootRingSnapshot } from "../effects/statusFootRing.js";
import { OfficeAudio } from "../audio/officeAudio.js";
import { OfficeEvents } from "../effects/officeEvents.js";
import { IdleChatter } from "../effects/idleChatter.js";
import { WindowRain } from "../effects/windowRain.js";
import { SnowFlakes } from "../effects/snowFlakes.js";
import { ThunderFx } from "../effects/thunderFx.js";
import { FogMist } from "../effects/fogMist.js";
import { WindowBirds } from "../effects/windowBirds.js";
import { ShootingStars } from "../effects/shootingStars.js";
import { DustMotes } from "../effects/dustMotes.js";
import { PlantSway } from "../effects/plantSway.js";
import { PlantPollinators } from "../effects/plantPollinators.js";
import { WallPosterAmbient } from "../effects/wallPosterAmbient.js";
import { SunBeams } from "../effects/sunBeams.js";
import { WindowCondensation } from "../effects/windowCondensation.js";
import { AchievementShelf } from "../effects/achievementShelf.js";
import { WeatherFx } from "../effects/weatherFx.js";
import { NightFlashlight } from "../effects/nightFlashlight.js";
import { WindowBlinds } from "../effects/windowBlinds.js";
import { LobbyPoster } from "../effects/lobbyPoster.js";
import { AgentHighFive } from "../effects/agentHighFive.js";
import { CoffeeSteam } from "../effects/coffeeSteam.js";
import { PrinterScan } from "../effects/printerScan.js";
import { AquariumBubbles } from "../effects/aquariumBubbles.js";
import { AquariumFish } from "../effects/aquariumFish.js";
import { MeetingProjector } from "../effects/meetingProjector.js";
import { MeetingDoorSign } from "../effects/meetingDoorSign.js";
import { BookshelfPages } from "../effects/bookshelfPages.js";
import { VendingIdle } from "../effects/vendingIdle.js";
import { KitchenIdle } from "../effects/kitchenIdle.js";
import { WaterCoolerIdle } from "../effects/waterCoolerIdle.js";
import { CoatRackIdle } from "../effects/coatRackIdle.js";
import { RecycleBinIdle } from "../effects/recycleBinIdle.js";
import { ServerRackLeds } from "../effects/serverRackLeds.js";
import { DeskFanSpin } from "../effects/deskFanSpin.js";
import { DualDeskIdle } from "../effects/dualDeskIdle.js";
import { OpenDeskIdle } from "../effects/openDeskIdle.js";
import { GlassDoorSwing } from "../effects/glassDoorSwing.js";
import { GlassPartitionShimmer } from "../effects/glassPartitionShimmer.js";
import { NapPodBreathe } from "../effects/napPodBreathe.js";
import { WallClock } from "../effects/wallClock.js";
import { WallCalendar } from "../effects/wallCalendar.js";
import { FocusHeadphones } from "../effects/focusHeadphones.js";
import { FocusDndSign } from "../effects/focusDndSign.js";
import { FocusAcVent } from "../effects/focusAcVent.js";
import { MonitorCode } from "../effects/monitorCode.js";
import { MonitorScreensaver } from "../effects/monitorScreensaver.js";
import { AfkDeskSign } from "../effects/afkDeskSign.js";
import { DeskSticky } from "../effects/deskSticky.js";
import { RubberDuck } from "../effects/rubberDuck.js";
import { WhiteboardScribble } from "../effects/whiteboardScribble.js";
import { RobotVacuum } from "../effects/robotVacuum.js";
import { ExitNeon } from "../effects/exitNeon.js";
import { SofaCushion } from "../effects/sofaCushion.js";
import { BeanbagBounce } from "../effects/beanbagBounce.js";
import { ChairSwivel } from "../effects/chairSwivel.js";
import { ExecChairSwivel } from "../effects/execChairSwivel.js";
import { RugSheen } from "../effects/rugSheen.js";
import { SleepRugSheen } from "../effects/sleepRugSheen.js";
import { MascotNap } from "../effects/mascotNap.js";
import { RoundTableIdle } from "../effects/roundTableIdle.js";
import { MeetingTableIdle } from "../effects/meetingTableIdle.js";
import { MahoDeskGleam } from "../effects/mahoDeskGleam.js";
import { CeoCityWindow } from "../effects/ceoCityWindow.js";
import { CityLights } from "../effects/cityLights.js";
import { SeasonalDrift } from "../effects/seasonalDrift.js";
import { LobbyUmbrellaStand } from "../effects/lobbyUmbrellaStand.js";
import { LampGlow } from "../effects/lampGlow.js";
import { LampMoths } from "../effects/lampMoths.js";
import { OvertimeDesk } from "../effects/overtimeDesk.js";
import {
  burstTaskCelebrate,
  celebrateEnabledFromQuery,
  isTaskCompleteTransition,
  maybeForceCelebrate,
} from "../effects/taskCelebrate.js";
import {
  burstChatPing,
  chatPingSnapshot,
  flushForceChatPing,
  isChatPingTransition,
  maybeForceChatPing,
  pingEnabledFromQuery,
} from "../effects/chatPing.js";
import { Minimap } from "../ui/minimap.js";
import { WhiteboardTicker } from "../ui/whiteboardTicker.js";
import { LobbySignage } from "../ui/lobbySignage.js";
import { EntranceGate } from "../ui/entranceGate.js";
import { mountClockOutModal } from "../ui/clockOutModal.js";
import { createDeskBriefPanel } from "../ui/deskBriefPanel.js";
import { createHelpOverlay } from "../ui/helpOverlay.js";
import { createActivityTimeline } from "../ui/activityTimeline.js";
import { showVisitorToast } from "../ui/toastSystem.js";
import { randomVisitorToast } from "../config/toastMessages.js";
import { RoomInteract } from "../roomInteract.js";
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
    this.load.spritesheet("char-mascot", assetUrl("assets/char-mascot.png"), {
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
          focusDesks: [
            { x: 3, y: 19 },
            { x: 8, y: 19 },
          ],
          meeting: { x: 18, y: 9 },
          // match office-map.json Lounge (not CEO office)
          break: { x: 18, y: 16 },
          lounge: [
            { x: 18, y: 16 },
            { x: 20, y: 17 },
            { x: 16, y: 16 },
            { x: 21, y: 16 },
            { x: 17, y: 18 },
            { x: 19, y: 18 },
            { x: 22, y: 16 },
            { x: 15, y: 17 },
            { x: 23, y: 17 },
            { x: 18, y: 18 },
          ],
          sleep: { x: 31, y: 21 },
          entrance: { x: 20, y: 27 },
          lobby: { xMin: 14, yMin: 26, xMax: 25, yMax: 28 },
          queue: [
            { x: 18, y: 27 },
            { x: 20, y: 27 },
            { x: 22, y: 27 },
            { x: 24, y: 27 },
          ],
          reviewWait: [
            { x: 15, y: 11 },
            { x: 19, y: 12 },
            { x: 18, y: 12 },
            { x: 19, y: 10 },
            { x: 20, y: 10 },
          ],
          ceoDesk: { x: 30, y: 7 },
          ceoOffice: { xMin: 26, yMin: 2, xMax: 34, yMax: 11 },
        };

    // start empty; first WS/mock snapshot fills from local Hermes profiles (or mock)
    this.agents = [];
    this.agentsById = {};
    this.agentsByProfile = {};
    this.rebuildAgentIndex();

    // spawn 대장님 near corridor center (walkable)
    this.boss = new Boss(this, { x: 12, y: 26 }); // corridor near lobby entrance

    // per-room E interactions (coffee 2048, nap, meeting, lobby welcome)
    this.roomInteract = new RoomInteract(this);
    this.time.delayedCall(400, () => this.roomInteract?.greetOnStart?.());

    // ambient lounge cat — ambience only; ?mascot=0 off
    this.mascot = null;
    if (mascotEnabledFromQuery()) {
      const lou = this.waypoints.lounge?.[0] || this.waypoints.break || { x: 31, y: 4 };
      this.mascot = new Mascot(this, lou, this.waypoints);
    }

    // lobby visitor walk-by — ambient only; ?visitor=0 off, ?visitor=1 fast
    this.visitorDirector = new VisitorDirector(this);

    // toast + door chime on visitor spawn — random Korean one-liner
    this.events.on("visitor-spawned", () => {
      showVisitorToast(randomVisitorToast(), 2800);
      this.officeAudio?.playDoorChime?.();
    });

    // zone labels — room readability without cluttering gameplay
    this.addZoneLabels();
    this.addWalkPathHints();

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

    // shown only when boss is near agent or CEO desk
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
    this.locateEnabled = this.parseLocateEnabled();
    this.activeZone = "all";
    this.kanbanPanel = createKanbanPanel({
      onLocate: (agentId) => {
        // locating an agent → jump back to office wing view
        if (typeof document !== "undefined" && document.body?.dataset?.page === "board") {
          window.__HERMES_PAGES__?.setPage?.("office");
        }
        this.locateAgent(agentId);
      },
    });
    // office default: tuck kanban — board page owns the full panels
    document.querySelector(".kanban-panel")?.classList.add("is-collapsed");
    this.deskBriefPanel = createDeskBriefPanel({
      onPayload: (payload) => this.weatherFx?.onDeskBriefPayload(payload),
    });
    this.activityTimeline = createActivityTimeline();
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
    this.idleChatter = new IdleChatter(this);
    this.idleChatter.start();

    this.minimap = new Minimap(this);
    this.whiteboardTicker = new WhiteboardTicker(this);
    if (this.lastSnapshot) {
      this.whiteboardTicker.updateFromSnapshot(this.lastSnapshot);
    }
    // lobby wall TV — kanban counts; ?signage=0 off
    this.lobbySignage = new LobbySignage(this);
    // entrance turnstile + LED counter; ?gate=0 off
    this.entranceGate = new EntranceGate(this);

    this.helpOverlay = createHelpOverlay(this);

    this.initClockOut();

    // click mahogany desk / exec chair → desk brief (when boss nearby)
    this.input.on("pointerdown", (pointer) => {
      if (pointer.rightButtonDown?.()) return;
      // minimap click is camera pan — don't treat as desk
      if (this.minimap?.hitContains?.(pointer.x, pointer.y)) return;
      const tw = this.map.tileWidth;
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tx = Math.floor(wp.x / tw);
      const ty = Math.floor(wp.y / tw);
      const furn = this.furniture?.getTileAt(tx, ty);
      const idx = furn?.index ?? 0;
      if (idx === 31 || idx === 32) {
        if (this.nearCeoDesk()) {
          this.deskBriefPanel?.toggle();
          this.publishDebug(this.ws?.url ?? resolveWsUrl(), this.lastSnapshot);
        }
      }
    });

    this.publishDebug(resolveWsUrl(), null);
    this.connectWs();
  }

  /** Lobby exit gate: enter lobby tiles → confirm → fade / disconnect. */
  initClockOut() {
    this.clockOutLocked = false;
    this._inLobby = false;
    this._clockOutPending = false;
    this._clockOutDone = false;
    this.clockOutModal = mountClockOutModal({
      onConfirm: () => this.confirmClockOut(),
      onCancel: () => this.cancelClockOut(),
    });
  }

  bossTile() {
    if (!this.boss?.sprite) return null;
    const tw = this.map.tileWidth;
    return {
      x: Math.floor(this.boss.sprite.x / tw),
      y: Math.floor(this.boss.sprite.y / tw),
    };
  }

  isInLobbyZone(tile) {
    if (!tile) return false;
    const lob = this.waypoints?.lobby;
    if (
      lob &&
      typeof lob.xMin === "number" &&
      typeof lob.yMin === "number" &&
      typeof lob.xMax === "number" &&
      typeof lob.yMax === "number"
    ) {
      return (
        tile.x >= lob.xMin &&
        tile.x <= lob.xMax &&
        tile.y >= lob.yMin &&
        tile.y <= lob.yMax
      );
    }
    const ent = this.waypoints?.entrance || { x: 20, y: 27 };
    return Math.abs(tile.x - ent.x) <= 4 && Math.abs(tile.y - ent.y) <= 2;
  }

  checkLobbyClockOut() {
    if (this._clockOutDone || this._clockOutPending) return;
    const tile = this.bossTile();
    const inLobby = this.isInLobbyZone(tile);
    if (inLobby && !this._inLobby) {
      this._inLobby = true;
      this.openClockOutModal();
    } else if (!inLobby) {
      this._inLobby = false;
    }
  }

  openClockOutModal() {
    this._clockOutPending = true;
    this.clockOutLocked = true;
    this.clockOutModal?.open();
    this.events.emit("clock-out-open");
    if (typeof window !== "undefined") {
      window.__HERMES_AREA__ = {
        ...(window.__HERMES_AREA__ || {}),
        clockOut: { pending: true, done: false },
      };
    }
  }

  cancelClockOut() {
    this._clockOutPending = false;
    this.clockOutLocked = false;
    // stay _inLobby so modal won't re-fire until boss leaves lobby
    if (typeof window !== "undefined") {
      window.__HERMES_AREA__ = {
        ...(window.__HERMES_AREA__ || {}),
        clockOut: { pending: false, done: false, cancelled: true },
      };
    }
  }

  confirmClockOut() {
    if (this._clockOutDone) return;
    this._clockOutDone = true;
    this._clockOutPending = false;
    this.clockOutLocked = true;
    this.events.emit("clock-out-confirm");
    this.officeAudio?.playClockOutSfx?.();

    // BE disconnect: close WS intentionally (skip auto mock reconnect)
    this._wsManualClose = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setLive(false);

    if (typeof window !== "undefined") {
      window.__HERMES_AREA__ = {
        ...(window.__HERMES_AREA__ || {}),
        clockOut: { pending: false, done: true },
      };
    }

    this.runClockOutFade();
  }

  runClockOutFade() {
    let fade = document.querySelector(".clockout-fade");
    if (!fade) {
      fade = document.createElement("div");
      fade.className = "clockout-fade";
      fade.innerHTML = `<span class="clockout-fade__text">또 오세요!</span>`;
      document.body.appendChild(fade);
    }
    requestAnimationFrame(() => {
      fade.classList.add("is-on");
    });

    window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
      try {
        this.game?.loop?.sleep?.();
        this.scene?.pause?.();
      } catch {
        /* ignore */
      }
    }, 2000);
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
    this._agentStatuses = new Map();
    this._chatPingBurstCount = 0;
    this._chatPingLastAt = null;
    this.deskFxEnabled = deskFxEnabledFromQuery();
    this.focusFxEnabled = focusFxEnabledFromQuery();
    this.devTimeIndex = this.parseDevTimeOverride();
    this.windowRain = new WindowRain(this);
    this.snowFlakes = new SnowFlakes(this);
    // thunder after rain/snow — canStrike gates on windowRain.active + not snowing
    this.thunderFx = new ThunderFx(this, { mapW, mapH });
    this.lobbyPoster = new LobbyPoster(this);
    this.nightFlashlight = new NightFlashlight(this);
    this.windowBlinds = new WindowBlinds(this);
    this.agentHighFive = new AgentHighFive(this);
    this.coffeeSteam = new CoffeeSteam(this);
    this.printerScan = new PrinterScan(this);
    this.aquariumBubbles = new AquariumBubbles(this);
    this.aquariumFish = new AquariumFish(this);
    this.meetingProjector = new MeetingProjector(this);
    this.meetingDoorSign = new MeetingDoorSign(this);
    this.wallClock = new WallClock(this);
    this.focusHeadphones = new FocusHeadphones(this);
    this.focusDndSign = new FocusDndSign(this);
    this.focusAcVent = new FocusAcVent(this);
    this.monitorCode = new MonitorCode(this);
    this.monitorScreensaver = new MonitorScreensaver(this);
    this.afkDeskSign = new AfkDeskSign(this);
    this.deskSticky = new DeskSticky(this);
    this.overtimeDesk = new OvertimeDesk(this);
    this.rubberDuck = new RubberDuck(this);
    this.whiteboardScribble = new WhiteboardScribble(this);
    this.bookshelfPages = new BookshelfPages(this);
    this.vendingIdle = new VendingIdle(this);
    this.kitchenIdle = new KitchenIdle(this);
    this.waterCoolerIdle = new WaterCoolerIdle(this);
    this.coatRackIdle = new CoatRackIdle(this);
    this.recycleBinIdle = new RecycleBinIdle(this);
    this.serverRackLeds = new ServerRackLeds(this);
    this.deskFanSpin = new DeskFanSpin(this);
    this.dualDeskIdle = new DualDeskIdle(this);
    this.openDeskIdle = new OpenDeskIdle(this);
    this.glassDoorSwing = new GlassDoorSwing(this);
    this.glassPartitionShimmer = new GlassPartitionShimmer(this);
    this.napPodBreathe = new NapPodBreathe(this);
    // weatherFx contracts: fogMist / windowBirds / shootingStars / dustMotes before WeatherFx
    this.fogMist = new FogMist(this, { mapW, mapH });
    this.windowBirds = new WindowBirds(this);
    this.shootingStars = new ShootingStars(this);
    this.dustMotes = new DustMotes(this, { mapW, mapH });
    this.plantSway = new PlantSway(this);
    this.plantPollinators = new PlantPollinators(this);
    this.wallPosterAmbient = new WallPosterAmbient(this);
    this.sunBeams = new SunBeams(this);
    this.windowCondensation = new WindowCondensation(this);
    this.trophyShelf = new AchievementShelf(this);
    this.robotVacuum = new RobotVacuum(this);
    this.exitNeon = new ExitNeon(this);
    this.wallCalendar = new WallCalendar(this);
    this.sofaCushion = new SofaCushion(this);
    this.beanbagBounce = new BeanbagBounce(this);
    this.chairSwivel = new ChairSwivel(this);
    this.execChairSwivel = new ExecChairSwivel(this);
    this.rugSheen = new RugSheen(this);
    this.sleepRugSheen = new SleepRugSheen(this);
    this.mascotNap = new MascotNap(this);
    this.roundTableIdle = new RoundTableIdle(this);
    this.meetingTableIdle = new MeetingTableIdle(this);
    this.mahoDeskGleam = new MahoDeskGleam(this);
    this.ceoCityWindow = new CeoCityWindow(this);
    this.cityLights = new CityLights(this);
    this.seasonalDrift = new SeasonalDrift(this);
    this.lobbyUmbrellaStand = new LobbyUmbrellaStand(this);
    this.lampGlow = new LampGlow(this);
    this.lampMoths = new LampMoths(this);
    this.weatherFx = new WeatherFx(this, { mapW, mapH });
    this.celebrateEnabled = celebrateEnabledFromQuery();
    this.pingEnabled = pingEnabledFromQuery();
    this.applyTimeOfDayLighting();
    this.weatherFx.start();
    this.trophyShelf?.start?.();
    maybeForceCelebrate(this, this.agents);
    maybeForceChatPing(this, this.agents);
    this._visualEffectsReady = true;

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
    this.officeAudio?.syncTimeOfDay?.(preset);
    this.windowRain?.sync();
    this.snowFlakes?.sync();
    this.lobbyPoster?.sync();
    this.nightFlashlight?.sync();
    this.windowBlinds?.sync();
    this.coffeeSteam?.sync();
    this.aquariumBubbles?.sync();
    this.aquariumFish?.sync();
    this.focusDndSign?.sync();
    this.afkDeskSign?.sync?.(this.time.now);
    this.focusAcVent?.sync();
    this.meetingDoorSign?.sync();
    this.dualDeskIdle?.sync();
    this.openDeskIdle?.sync();
    this.glassDoorSwing?.sync();
    this.glassPartitionShimmer?.sync();
    this.napPodBreathe?.sync();
    this.fogMist?.sync();
    this.windowBirds?.sync();
    this.shootingStars?.sync();
    this.dustMotes?.sync();
    this.plantSway?.sync();
    this.plantPollinators?.sync();
    this.wallPosterAmbient?.sync();
    this.sunBeams?.sync();
    this.windowCondensation?.sync();
    this.robotVacuum?.sync();
    this.exitNeon?.sync();
    this.wallCalendar?.sync();
    this.sofaCushion?.sync();
    this.beanbagBounce?.sync();
    this.chairSwivel?.sync();
    this.execChairSwivel?.sync();
    this.rugSheen?.sync();
    this.sleepRugSheen?.sync();
    this.roundTableIdle?.sync();
    this.meetingTableIdle?.sync();
    this.mahoDeskGleam?.sync();
    this.ceoCityWindow?.sync();
    this.cityLights?.sync();
    this.seasonalDrift?.sync();
    this.lobbyUmbrellaStand?.sync();
    this.lampGlow?.sync();
    this.lampMoths?.sync();
    this.overtimeDesk?.sync();
    this.weatherFx?.onLightingChanged();
  }

  syncAgentEmitter(agent) {
    // chatting collapses to running in getEffectKind — track raw status for ping
    const status = agent.serverStatus ?? null;
    const prevStatus = this._agentStatuses.get(agent.def.id);
    if (status !== prevStatus) {
      this._agentStatuses.set(agent.def.id, status);
      if (this.pingEnabled && isChatPingTransition(prevStatus, status)) {
        burstChatPing(this, agent);
      }
    }

    const kind = agent.getEffectKind();
    const prev = this._emitterKinds.get(agent.def.id);
    if (prev === kind) return;

    this.officeAudio?.playStatusSfx(kind, prev);
    this.officeEvents?.onStatusTransition(prev, kind, agent);

    // running|chatting → idle (effect kind collapses chatting→running)
    if (this.celebrateEnabled && isTaskCompleteTransition(prev, kind)) {
      burstTaskCelebrate(this, agent);
    }

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

  updateVisualEffects(delta = 16) {
    for (const agent of this.agents) {
      this.syncAgentEmitter(agent);
      // running desk/focus typing clicks — only while sprite is shown
      if (
        agent.getEffectKind() === "running" &&
        agent.sprite?.visible
      ) {
        this.officeAudio?.playTypingSfx?.(agent.def.id);
      }
    }
    this.nightFlashlight?.update(this.time.now);
    this.aquariumBubbles?.update(this.time.now);
    this.aquariumFish?.update(this.time.now);
    this.meetingProjector?.update(this.time.now, delta);
    this.meetingDoorSign?.update(this.time.now, delta);
    this.focusHeadphones?.sync();
    this.focusDndSign?.update(this.time.now, delta);
    this.monitorCode?.sync(delta);
    this.monitorScreensaver?.sync(this.time.now);
    this.afkDeskSign?.update(this.time.now, delta);
    this.deskSticky?.sync();
    this.overtimeDesk?.update(this.time.now);
    this.rubberDuck?.sync(this.time.now);
    this.whiteboardScribble?.update(this.time.now, delta);
    this.printerScan?.update(this.time.now, delta);
    this.bookshelfPages?.update(this.time.now, delta);
    this.vendingIdle?.update(this.time.now);
    this.kitchenIdle?.update(this.time.now);
    this.waterCoolerIdle?.update(this.time.now);
    this.coatRackIdle?.update(this.time.now);
    this.recycleBinIdle?.update(this.time.now);
    this.serverRackLeds?.update(this.time.now);
    this.deskFanSpin?.update(this.time.now);
    this.dualDeskIdle?.update(this.time.now, delta);
    this.openDeskIdle?.update(this.time.now, delta);
    this.glassDoorSwing?.update(this.time.now, delta);
    this.glassPartitionShimmer?.update(this.time.now, delta);
    this.napPodBreathe?.update(this.time.now);
    this.plantSway?.update(this.time.now);
    this.plantPollinators?.update(this.time.now);
    this.wallPosterAmbient?.update(this.time.now, delta);
    this.windowCondensation?.update(this.time.now, delta);
    this.robotVacuum?.update(this.time.now, delta);
    this.exitNeon?.update(this.time.now);
    this.wallCalendar?.update(this.time.now, delta);
    this.sofaCushion?.update(this.time.now, delta);
    this.beanbagBounce?.update(this.time.now, delta);
    this.chairSwivel?.update(this.time.now, delta);
    this.execChairSwivel?.update(this.time.now, delta);
    this.rugSheen?.update(this.time.now, delta);
    this.sleepRugSheen?.update(this.time.now, delta);
    this.mascotNap?.update(this.time.now, delta);
    this.roundTableIdle?.update(this.time.now, delta);
    this.meetingTableIdle?.update(this.time.now, delta);
    this.mahoDeskGleam?.update(this.time.now, delta);
    this.ceoCityWindow?.update(this.time.now);
    this.cityLights?.update(this.time.now);
    this.lobbyUmbrellaStand?.update();
    this.lampGlow?.update(this.time.now);
    this.lampMoths?.update(this.time.now);
    this.lobbyPoster?.update(this.time.now, delta);
    this.agentHighFive?.update(this.time.now, delta);
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
    this.updateKanbanPanel(mockSnap, { live: false, mock: true });
    this.activityTimeline?.update(mockSnap, { live: false, mock: true });
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
    this.whiteboardTicker?.updateFromSnapshot(snapshot);
    this.lobbySignage?.updateFromSnapshot(snapshot);
    this.trophyShelf?.updateFromSnapshot?.(snapshot);
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

  /** `?locate=0` disables kanban → camera fly-to. */
  parseLocateEnabled() {
    const q = new URLSearchParams(location.search).get("locate");
    return !(q === "0" || q === "false");
  }

  /**
   * Kanban locate: unfollow if needed, free-look zoom 2, pan to agent sprite (Power2).
   * Missing agent → toast. `?locate=0` → no-op.
   */
  locateAgent(agentId) {
    if (!this.locateEnabled) return { ok: false, reason: "locate-off" };
    const id = String(agentId || "");
    const agent = this.agentsById[id] || this.agentsByProfile[id];
    if (!agent?.sprite) {
      this.showOfficeToast("오프라인 / 미접속");
      return { ok: false, reason: "missing" };
    }

    if (this.cameraFollow) {
      this.cameraFollow = false;
      this.refreshFollowHud();
    }

    const cam = this.cameras.main;
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    cam.stopFollow();
    cam.setBounds(0, 0, mapW, mapH);
    cam.roundPixels = true;
    cam.setZoom(2, 2);

    const wx = agent.sprite.x;
    const wy = agent.sprite.y;
    const halfW = cam.width / (2 * cam.zoomX);
    const halfH = cam.height / (2 * cam.zoomY);
    const cx = Math.min(Math.max(wx, halfW), Math.max(halfW, mapW - halfW));
    const cy = Math.min(Math.max(wy, halfH), Math.max(halfH, mapH - halfH));

    this.cameraFreePan = true;
    cam.pan(cx, cy, 400, "Power2");
    this.publishDebug(this.ws?.url ?? resolveWsUrl(), this.lastSnapshot);
    return { ok: true, x: cx, y: cy, agentId: agent.def?.id || id };
  }

  showOfficeToast(text) {
    let el = document.getElementById("office-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "office-toast";
      el.className = "office-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("is-visible");
    el.classList.remove("is-out");
    if (this._locateToastTimer) clearTimeout(this._locateToastTimer);
    this._locateToastTimer = setTimeout(() => {
      el.classList.add("is-out");
      el.classList.remove("is-visible");
    }, 2600);
  }

  toggleCameraFollow() {
    this.cameraFollow = !this.cameraFollow;
    this.applyCameraMode();
    this.refreshFollowHud();
  }

  applyCameraMode() {
    this.cameraFreePan = false;
    if (this.cameraFollow && this.boss?.sprite) {
      this.enableFollowCamera();
    } else if (this.activeZone && this.activeZone !== "all") {
      this.focusZone(this.activeZone);
    } else {
      this.fitOfficeCamera();
    }
  }

  /**
   * Zoom camera into one office wing (page-like zones).
   * `all` = full overview stretch. Used by appPages floor chips.
   */
  focusZone(zoneId) {
    const tw = this.map?.tileWidth || 48;
    const zones = {
      open: { x0: 1, y0: 1, x1: 12, y1: 25 },
      meeting: { x0: 14, y0: 2, x1: 35, y1: 13 },
      lounge: { x0: 14, y0: 14, x1: 35, y1: 24 },
      lobby: { x0: 12, y0: 25, x1: 27, y1: 29 },
    };
    this.activeZone = zoneId || "all";
    if (this.cameraFollow) {
      this.cameraFollow = false;
      this.refreshFollowHud();
    }
    if (!zoneId || zoneId === "all" || !zones[zoneId]) {
      this.fitOfficeCamera();
      this.publishDebug(this.ws?.url ?? resolveWsUrl(), this.lastSnapshot);
      return { ok: true, zone: "all" };
    }
    const z = zones[zoneId];
    const cam = this.cameras.main;
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    const wx0 = z.x0 * tw;
    const wy0 = z.y0 * tw;
    const wx1 = (z.x1 + 1) * tw;
    const wy1 = (z.y1 + 1) * tw;
    const zw = wx1 - wx0;
    const zh = wy1 - wy0;
    cam.stopFollow();
    cam.setBounds(0, 0, mapW, mapH);
    cam.roundPixels = true;
    const pad = 1.08;
    const zx = cam.width / (zw * pad) || 1;
    const zy = cam.height / (zh * pad) || 1;
    // uniform zoom so paths aren't stretched weird in a wing view
    const zUniform = Math.min(zx, zy, 2.4);
    cam.setZoom(zUniform, zUniform);
    const cx = (wx0 + wx1) / 2;
    const cy = (wy0 + wy1) / 2;
    const halfW = cam.width / (2 * cam.zoomX);
    const halfH = cam.height / (2 * cam.zoomY);
    const clampedX = Math.min(Math.max(cx, halfW), Math.max(halfW, mapW - halfW));
    const clampedY = Math.min(Math.max(cy, halfH), Math.max(halfH, mapH - halfH));
    cam.centerOn(clampedX, clampedY);
    if (typeof cam.preRender === "function") cam.preRender(1);
    this.cameraFreePan = true;
    this.publishDebug(this.ws?.url ?? resolveWsUrl(), this.lastSnapshot);
    return { ok: true, zone: zoneId, x: clampedX, y: clampedY };
  }

  /**
   * Minimap click: drop follow (no auto-resume), free-look zoom 2, centerOn world.
   * Overview stretch fills the whole map so centerOn alone can't reveal a corner.
   */
  panCameraTo(wx, wy) {
    if (this.cameraFollow) {
      this.cameraFollow = false;
      this.refreshFollowHud();
    }
    const cam = this.cameras.main;
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    cam.stopFollow();
    cam.setBounds(0, 0, mapW, mapH);
    cam.roundPixels = true;
    cam.setZoom(2, 2);
    // clamp before centerOn so midPoint/worldView match even pre-render
    const halfW = cam.width / (2 * cam.zoomX);
    const halfH = cam.height / (2 * cam.zoomY);
    const cx = Math.min(Math.max(wx, halfW), Math.max(halfW, mapW - halfW));
    const cy = Math.min(Math.max(wy, halfH), Math.max(halfH, mapH - halfH));
    cam.centerOn(cx, cy);
    // refresh matrix so publishDebug/smoke see the panned view immediately
    if (typeof cam.preRender === "function") cam.preRender(1);
    this.cameraFreePan = true;
    this.publishDebug(this.ws?.url ?? resolveWsUrl(), this.lastSnapshot);
  }

  /** Boss-centered follow; uniform zoom 2; clamps to map bounds. */
  enableFollowCamera() {
    const cam = this.cameras.main;
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    cam.setBounds(0, 0, mapW, mapH);
    cam.roundPixels = true;
    cam.setZoom(2, 2); // reset stretch from overview
    cam.startFollow(this.boss.sprite, true, 0.12, 0.12);
  }

  /** Stretch office to fill viewport (no letterbox, no crop). Slight squash on bad aspect OK. */
  fitOfficeCamera() {
    const cam = this.cameras.main;
    const mapW = this.map.widthInPixels;
    const mapH = this.map.heightInPixels;
    cam.stopFollow();
    cam.setBounds(0, 0, mapW, mapH);
    // Independent zoomX/Y = exact stretch. Uniform FIT/COVER left empty sides or cut the bottom.
    const zx = cam.width / mapW || 1;
    const zy = cam.height / mapH || 1;
    cam.setZoom(zx, zy);
    cam.centerOn(mapW / 2, mapH / 2);
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

  /** Hint next to follow glyph — desk / coffee / nap / work / agent. */
  refreshInteractHud() {
    if (!this.hintLabel) return;
    const nearId = this.boss?.nearAgentId ?? null;
    const nearDesk = this.nearCeoDesk();
    const roomHint = this.roomInteract?.hintLabel?.();
    if (roomHint) {
      this.hintLabel.setVisible(true);
      this.hintLabel.setText(roomHint);
      return;
    }
    this.hintLabel.setVisible(!!nearId || nearDesk);
    this.hintLabel.setText(nearDesk && !nearId ? "E 데스크" : "E 상세");
  }

  nearCeoDesk() {
    const desk = this.waypoints?.ceoDesk;
    if (!desk || !this.boss?.sprite) return false;
    const tw = this.map.tileWidth;
    const bx = this.boss.sprite.x / tw;
    const by = this.boss.sprite.y / tw;
    return Math.hypot(bx - desk.x, by - desk.y) <= 2.25;
  }

  /** E near CEO desk → toggle weather/news panel. Returns true if handled. */
  tryToggleDeskBrief() {
    if (!this.nearCeoDesk()) {
      if (this.deskBriefPanel?.open) this.deskBriefPanel.hide();
      return false;
    }
    this.deskBriefPanel?.toggle();
    this.publishDebug(this.ws?.url ?? resolveWsUrl(), this.lastSnapshot);
    return true;
  }

  addZoneLabels() {
    const tw = this.map.tileWidth;
    const zones = [
      { name: "Open Desk", tx: 6, ty: 2 },
      { name: "사장실", tx: 30, ty: 2 },
      { name: "War Room", tx: 19, ty: 5 },
      { name: "Focus", tx: 6, ty: 16 },
      { name: "Lounge", tx: 18, ty: 15 },
      { name: "Nap Pod", tx: 31, ty: 17 },
      { name: "Lobby", tx: 20, ty: 26 },
      { name: "↕ 복도", tx: 12, ty: 9 },
      { name: "↔ 복도", tx: 22, ty: 13 },
    ];
    for (const z of zones) {
      const isHall = z.name.includes("복도");
      this.add
        .text(z.tx * tw + tw / 2, z.ty * tw + 2, z.name, {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: isHall ? "20px" : "18px",
          color: isHall ? "#2a9a88" : "#4a6a5a",
          stroke: "#f8f6f0",
          strokeThickness: isHall ? 6 : 5,
        })
        .setOrigin(0.5, 0)
        .setDepth(5)
        .setAlpha(isHall ? 0.95 : 0.8);
    }
  }

  /** Soft teal wash on walkable corridor / door tiles so open paths pop. */
  addWalkPathHints() {
    if (!this.ground || !this.collision) return;
    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const g = this.add.graphics().setDepth(1.5);
    // GID 22 = corridor path, 11 = glass door opening
    const PATH_GIDS = new Set([11, 22]);
    for (let ty = 0; ty < this.map.height; ty++) {
      for (let tx = 0; tx < this.map.width; tx++) {
        const blocked = this.collision.getTileAt(tx, ty);
        if (blocked && blocked.index > 0) continue;
        const gt = this.ground.getTileAt(tx, ty);
        if (!gt || !PATH_GIDS.has(gt.index)) continue;
        const isDoor = gt.index === 11;
        g.fillStyle(isDoor ? 0x40c8b0 : 0x5ec8b0, isDoor ? 0.22 : 0.12);
        g.fillRect(tx * tw + 2, ty * th + 2, tw - 4, th - 4);
        if (isDoor) {
          g.lineStyle(2, 0x2a9a88, 0.55);
          g.strokeRect(tx * tw + 3, ty * th + 3, tw - 6, th - 6);
        }
      }
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
    this.deskBriefPanel?.reconnectWs?.();
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
        this.activityTimeline?.update(msg, { live: this.live, mock: !!msg.mock });
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
    flushForceChatPing(this);
  }

  publishDebug(url, msg) {
    if (typeof window === "undefined") return;
    const boss = this.boss;
    const snap = msg ?? this.lastSnapshot;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      ready: !!this._visualEffectsReady,
      live: this.live,
      snapshot: snap,
      wsUrl: url,
      cameraZoom: this.cameras.main.zoom,
      cameraFollow: !!this.cameraFollow,
      cameraFreePan: !!this.cameraFreePan,
      locateEnabled: this.locateEnabled !== false,
      cameraScroll: {
        x: Math.round(this.cameras.main.scrollX),
        y: Math.round(this.cameras.main.scrollY),
      },
      cameraCenter: {
        // midPoint tracks centerOn; worldView can lag a frame
        x: Math.round(this.cameras.main.midPoint?.x ?? this.cameras.main.worldView.centerX),
        y: Math.round(this.cameras.main.midPoint?.y ?? this.cameras.main.worldView.centerY),
      },
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
      nearCeoDesk: this.nearCeoDesk(),
      deskBriefOpen: !!this.deskBriefPanel?.open,
      deskBrief: this.deskBriefPanel?.lastPayload
              ? {
                  source: this.deskBriefPanel.lastPayload.source,
                  weatherDate: this.deskBriefPanel.lastPayload.weather?.date,
                  newsDate: this.deskBriefPanel.lastPayload.news?.date,
                }
              : null,
      lighting: this.lightingPreset?.name ?? null,
      effectKinds: Object.fromEntries(
        (this.agents || []).map((a) => [a.def.id, a.getEffectKind()]),
      ),
      deskFxEnabled: this.deskFxEnabled !== false,
      deskGlow: Object.fromEntries(
        (this.agents || []).map((a) => {
          const on = a.deskGlowGfx?.visible;
          return [a.def.id, on ? resolveDeskGlowKind(a) : null];
        }),
      ),
      audio: this.officeAudio?.snapshot?.() ?? null,
      events: this.officeEvents?.snapshot?.() ?? null,
      chatter: this.idleChatter?.snapshot?.() ?? null,
      rain: this.windowRain?.snapshot?.() ?? null,
      snow: this.snowFlakes?.snapshot?.() ?? null,
      thunder: this.thunderFx?.snapshot?.() ?? null,
      fog: this.fogMist?.snapshot?.() ?? null,
      birds: this.windowBirds?.snapshot?.() ?? null,
      stars: this.shootingStars?.snapshot?.() ?? null,
      dust: this.dustMotes?.snapshot?.() ?? null,
      plantSway: this.plantSway?.snapshot?.() ?? null,
      pollinator: this.plantPollinators?.snapshot?.() ?? null,
      wallPoster: this.wallPosterAmbient?.snapshot?.() ?? null,
      sunbeam: this.sunBeams?.snapshot?.() ?? null,
      condensation: this.windowCondensation?.snapshot?.() ?? null,
      trophyShelf: this.trophyShelf?.snapshot?.() ?? null,
      vacuum: this.robotVacuum?.snapshot?.() ?? null,
      exitNeon: this.exitNeon?.snapshot?.() ?? null,
      wallCalendar: this.wallCalendar?.snapshot?.() ?? null,
      sofa: this.sofaCushion?.snapshot?.() ?? null,
      beanbag: this.beanbagBounce?.snapshot?.() ?? null,
      chair: this.chairSwivel?.snapshot?.() ?? null,
      execChair: this.execChairSwivel?.snapshot?.() ?? null,
      rug: this.rugSheen?.snapshot?.() ?? null,
      sleeprug: this.sleepRugSheen?.snapshot?.() ?? null,
      mascotNap: this.mascotNap?.snapshot?.() ?? null,
      roundTable: this.roundTableIdle?.snapshot?.() ?? null,
      meetingTable: this.meetingTableIdle?.snapshot?.() ?? null,
      maho: this.mahoDeskGleam?.snapshot?.() ?? null,
      ceoWindow: this.ceoCityWindow?.snapshot?.() ?? null,
      cityLights: this.cityLights?.snapshot?.() ?? null,
      season: this.seasonalDrift?.snapshot?.() ?? null,
      umbrella: this.lobbyUmbrellaStand?.snapshot?.() ?? null,
      lampGlow: this.lampGlow?.snapshot?.() ?? null,
      moths: this.lampMoths?.snapshot?.() ?? null,
      weatherFx: this.weatherFx?.snapshot?.() ?? null,
      chatPing: chatPingSnapshot(this),
      spriteShadow: shadowSnapshot([
        ...(this.agents || []),
        this.boss,
        this.mascot,
      ].filter(Boolean)),
      statusFootRing: statusFootRingSnapshot(this.agents || []),
      poster: this.lobbyPoster?.snapshot?.() ?? null,
      flashlight: this.nightFlashlight?.snapshot?.() ?? null,
      blinds: this.windowBlinds?.snapshot?.() ?? null,
      highFive: this.agentHighFive?.snapshot?.() ?? null,
      steam: this.coffeeSteam?.snapshot?.() ?? null,
      aquarium: this.aquariumBubbles?.snapshot?.() ?? null,
      aquariumFish: this.aquariumFish?.snapshot?.() ?? null,
      meetingProjector: this.meetingProjector?.snapshot?.() ?? null,
      meetingDoorSign: this.meetingDoorSign?.snapshot?.() ?? null,
      wallClock: this.wallClock?.snapshot?.() ?? null,
      focusHeadphones: this.focusHeadphones?.snapshot?.() ?? null,
      focusDnd: this.focusDndSign?.snapshot?.() ?? null,
      acvent: this.focusAcVent?.snapshot?.() ?? null,
      monitorCode: this.monitorCode?.snapshot?.() ?? null,
      monitorScreensaver: this.monitorScreensaver?.snapshot?.() ?? null,
      afkDeskSign: this.afkDeskSign?.snapshot?.() ?? null,
      deskSticky: this.deskSticky?.snapshot?.() ?? null,
      overtime: this.overtimeDesk?.snapshot?.() ?? null,
      rubberDuck: this.rubberDuck?.snapshot?.() ?? null,
      whiteboardScribble: this.whiteboardScribble?.snapshot?.() ?? null,
      printerScan: this.printerScan?.snapshot?.() ?? null,
      vendingIdle: this.vendingIdle?.snapshot?.() ?? null,
      kitchenIdle: this.kitchenIdle?.snapshot?.() ?? null,
      waterCoolerIdle: this.waterCoolerIdle?.snapshot?.() ?? null,
      coatRackIdle: this.coatRackIdle?.snapshot?.() ?? null,
      recycleBinIdle: this.recycleBinIdle?.snapshot?.() ?? null,
      serverRack: this.serverRackLeds?.snapshot?.() ?? null,
      deskFan: this.deskFanSpin?.snapshot?.() ?? null,
      dualDesk: this.dualDeskIdle?.snapshot?.() ?? null,
      openDeskIdle: this.openDeskIdle?.snapshot?.() ?? null,
      doorswing: this.glassDoorSwing?.snapshot?.() ?? null,
      glassfx: this.glassPartitionShimmer?.snapshot?.() ?? null,
      nappod: this.napPodBreathe?.snapshot?.() ?? null,
      bookshelf: this.bookshelfPages?.snapshot?.() ?? null,
      minimap: this.minimap?.snapshot?.() ?? null,
      help: this.helpOverlay?.snapshot?.() ?? null,
      whiteboardTicker: this.whiteboardTicker?.snapshot?.() ?? null,
      signage: this.lobbySignage?.snapshot?.() ?? null,
      gate: this.entranceGate?.snapshot?.() ?? null,
      roomInteract: this.roomInteract?.snapshot?.() ?? null,
      mascotPet: this.roomInteract?.mascotPetSnapshot?.() ?? null,
      plantWater: this.roomInteract?.plantWaterSnapshot?.() ?? null,
      vending: this.roomInteract?.vendingSnapshot?.() ?? null,
      fridge: this.roomInteract?.fridgeSnapshot?.() ?? null,
      microwave: this.roomInteract?.microwaveSnapshot?.() ?? null,
      coatRack: this.roomInteract?.coatRackSnapshot?.() ?? null,
      recycle: this.roomInteract?.recycleSnapshot?.() ?? null,
      rack: this.roomInteract?.rackSnapshot?.() ?? null,
      posterQuote: this.roomInteract?.posterSnapshot?.() ?? null,
      printer: this.roomInteract?.printerSnapshot?.() ?? null,
      visitor: this.visitorDirector?.snapshot?.() ?? null,
      clockOut: {
        pending: !!this._clockOutPending,
        done: !!this._clockOutDone,
        inLobby: !!this._inLobby,
        locked: !!this.clockOutLocked,
      },
    };
  }

  update(time, delta) {
    for (const agent of this.agents) {
      agent.update(time, delta);
    }
    this.updateVisualEffects(delta);
    if (this.boss) {
      this.boss.update(time, delta);
      this.boss.maybeSendPos(this.ws);
      this.checkLobbyClockOut();
      this.roomInteract?.update?.(time);
      this.publishDebug(this.ws?.url);
    }
    this.mascot?.update(time, delta);
    this.visitorDirector?.update(time, delta);
    this.minimap?.update();
  }
}
