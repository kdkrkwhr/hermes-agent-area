/** Per-room boss interactions: lounge mini-game, desk expand, meeting, nap, lobby. */

import { mountMinigame2048 } from "./ui/minigame2048.js";
import { mountNapMode } from "./ui/napMode.js";

const COFFEE_GID = 16;
const AQUARIUM_GID = 37;
const LINGER_MS = 4500;
const AQUAFEED_MS = 7000;
const AQUAFEED_COOLDOWN_MS = 15000;
const VISIT_KEY = "hermes-area-visit-count";
const TYPING_FRAMES = ["·", "··", "···"];

function tileCenter(scene, tx, ty) {
  const tw = scene.map.tileWidth;
  const th = scene.map.tileHeight;
  return { x: tx * tw + tw / 2, y: ty * th + th / 2, tx, ty };
}

function findCoffeeTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === COFFEE_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
  }
  if (!hits.length) {
    const br = scene.waypoints?.break || { x: 18, y: 16 };
    hits.push(tileCenter(scene, br.x + 3, br.y - 1));
  }
  return hits;
}

function findAquariumTiles(scene) {
  const hits = [];
  const layer = scene.furniture;
  if (layer?.getTileAt && scene.map) {
    for (let ty = 0; ty < scene.map.height; ty++) {
      for (let tx = 0; tx < scene.map.width; tx++) {
        const tile = layer.getTileAt(tx, ty);
        if (tile?.index === AQUARIUM_GID) hits.push(tileCenter(scene, tx, ty));
      }
    }
  }
  if (!hits.length) {
    const br = scene.waypoints?.break || { x: 18, y: 16 };
    hits.push(tileCenter(scene, br.x + 4, br.y - 2));
  }
  return hits;
}

function bossTile(scene) {
  return scene.bossTile?.() ?? null;
}

function agentWorkText(agent) {
  const d = agent?.serverData;
  return (
    d?.task_title ||
    d?.bubble ||
    agent?.statusText ||
    "작업 중..."
  );
}

function truncate(text, n = 48) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (raw.length <= n) return raw;
  return `${raw.slice(0, Math.max(0, n - 1))}…`;
}

function isWorking(agent) {
  const s = agent?.serverStatus;
  if (s === "running" || s === "chatting") return true;
  if (agent?.live) return false;
  return agent?.getEffectKind?.() === "running";
}

function inMeetingZone(scene, tile, pad = 2) {
  if (!tile) return false;
  const m = scene.waypoints?.meeting || { x: 18, y: 9 };
  return Math.abs(tile.x - m.x) <= pad && Math.abs(tile.y - m.y) <= pad;
}

function agentTile(agent) {
  return agent?.tilePos?.() ?? null;
}

function nearSleep(scene) {
  const sleep = scene.waypoints?.sleep || { x: 31, y: 21 };
  const b = scene.boss?.sprite;
  if (!b) return false;
  const tw = scene.map.tileWidth;
  const bx = b.x / tw;
  const by = b.y / tw;
  return Math.hypot(bx - sleep.x, by - sleep.y) <= 2.4;
}

function nearCoffee(scene, coffeeTiles) {
  const b = scene.boss?.sprite;
  if (!b) return false;
  for (const c of coffeeTiles) {
    if (Math.hypot(b.x - c.x, b.y - c.y) <= 56) return true;
  }
  return false;
}

function nearAquarium(scene, aquariumTiles) {
  const b = scene.boss?.sprite;
  if (!b) return false;
  for (const c of aquariumTiles) {
    if (Math.hypot(b.x - c.x, b.y - c.y) <= 62) return true;
  }
  return false;
}

function aquariumFeedEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("aquafeed");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

function loungeAgents(scene) {
  return (scene.agents || []).filter((a) => {
    if (a.serverStatus === "idle" || a.currentKind === "break") return true;
    const t = agentTile(a);
    const br = scene.waypoints?.break || { x: 18, y: 16 };
    if (!t) return false;
    return Math.hypot(t.x - br.x, t.y - br.y) <= 4;
  });
}

function bumpVisitCount() {
  let n = 1;
  try {
    n = (Number(localStorage.getItem(VISIT_KEY) || 0) || 0) + 1;
    localStorage.setItem(VISIT_KEY, String(n));
  } catch {
    n = 1;
  }
  return n;
}

function readVisitCount() {
  try {
    return Number(localStorage.getItem(VISIT_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

export class RoomInteract {
  constructor(scene) {
    this.scene = scene;
    this.coffeeTiles = findCoffeeTiles(scene);
    this.aquariumTiles = findAquariumTiles(scene);
    this.minigame = null;
    this.nap = null;
    this.lastScore = null;
    this.meetingActive = false;
    this._lingerAgentId = null;
    this._lingerSince = 0;
    this._coffeeSaid = new Set();
    this._typedAt = 0;
    this._typeIdx = 0;
    this._lobbyWelcomed = false;
    this.visitCount = readVisitCount();
    this.lastHint = null;
    this.lastAction = null;
    this.aquariumFeedEnabled = aquariumFeedEnabledFromQuery();
    this.aquaFeedActiveUntil = 0;
    this.aquaFeedCooldownUntil = 0;
    this.lastFeedAt = 0;
  }

  /** Call once after map ready — entry welcome. */
  greetOnStart() {
    const n = bumpVisitCount();
    this.visitCount = n;
    this.showToast(`환영합니다, 대장님! · 방문 #${n}`);
    this.lastAction = { kind: "lobby_welcome", visitCount: n };
    this.publish();
  }

  showToast(text, ms = 2600) {
    let el = document.querySelector(".room-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "room-toast";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("is-on");
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      el.classList.remove("is-on");
    }, ms);
  }

  hintKind() {
    if (nearCoffee(this.scene, this.coffeeTiles)) return "coffee";
    if (
      this.aquariumFeedEnabled &&
      nearAquarium(this.scene, this.aquariumTiles) &&
      !this.aquaFeedActive()
    ) {
      return "aquarium";
    }
    if (nearSleep(this.scene)) return "nap";
    const near = this.scene.boss?._nearAgent;
    if (near && isWorking(near)) return "work";
    return null;
  }

  hintLabel() {
    const k = this.hintKind();
    if (k === "coffee") return "E 미니게임";
    if (k === "aquarium") {
      if (this.aquaFeedCoolingDown()) {
        return `먹이 쿨다운 ${this.aquaFeedCooldownLeftSec()}s`;
      }
      return "E 먹이주기";
    }
    if (k === "nap") return "E 낮잠";
    if (k === "work") return "E 작업내용";
    return null;
  }

  /** E/Space when not handled by desk-brief. Returns true if consumed. */
  tryInteract() {
    if (this.minigame?.isOpen?.() || this.nap?.isOn?.()) return true;

    if (nearCoffee(this.scene, this.coffeeTiles)) {
      this.openMinigame();
      return true;
    }
    if (this.aquariumFeedEnabled && nearAquarium(this.scene, this.aquariumTiles)) {
      return this.startAquariumFeed();
    }
    if (nearSleep(this.scene)) {
      this.openNap();
      return true;
    }

    const near = this.scene.boss?._nearAgent;
    if (near && isWorking(near)) {
      this.expandWorkBubble(near);
      return true;
    }
    return false;
  }

  openMinigame() {
    if (this.minigame?.isOpen?.()) return;
    this.lastAction = { kind: "minigame_open" };
    // spectator chatter
    for (const a of loungeAgents(this.scene).slice(0, 3)) {
      if (!a._specBackup) a._specBackup = a.statusText;
      a.setStatus("관전 중 👀");
    }
    this.minigame = mountMinigame2048({
      onClose: (result) => {
        this.minigame = null;
        this.lastScore = result;
        this.lastAction = { kind: "minigame_score", ...result };
        this.showToast(
          result.won
            ? `2048 클리어! ${result.score}점`
            : `커피브레이크 끝 · ${result.score}점`,
        );
        for (const a of this.scene.agents || []) {
          if (a._specBackup != null) {
            a.setStatus(a._specBackup);
            a._specBackup = null;
          }
        }
        this.publish();
      },
    });
    this.publish();
  }

  aquaFeedActive() {
    return this.scene.time.now < this.aquaFeedActiveUntil;
  }

  aquaFeedCoolingDown() {
    return this.scene.time.now < this.aquaFeedCooldownUntil;
  }

  aquaFeedCooldownLeftSec() {
    return Math.max(
      1,
      Math.ceil((this.aquaFeedCooldownUntil - this.scene.time.now) / 1000),
    );
  }

  startAquariumFeed() {
    if (!this.aquariumFeedEnabled) return false;
    if (this.aquaFeedActive()) return true;
    if (this.aquaFeedCoolingDown()) {
      this.showToast(`먹이 쿨다운 ${this.aquaFeedCooldownLeftSec()}초`);
      this.lastAction = {
        kind: "aquarium_feed_cooldown",
        cooldownSec: this.aquaFeedCooldownLeftSec(),
      };
      this.publish();
      return true;
    }
    const now = this.scene.time.now;
    this.lastFeedAt = now;
    this.aquaFeedActiveUntil = now + AQUAFEED_MS;
    this.aquaFeedCooldownUntil = now + AQUAFEED_COOLDOWN_MS;
    this.scene.aquariumFish?.triggerFeed?.(AQUAFEED_MS);
    this.scene.aquariumBubbles?.triggerFeed?.(AQUAFEED_MS);
    this.scene.officeAudio?.playAquariumBloop?.();
    this.showToast("먹이 투하! 물고기 집합");
    this.lastAction = { kind: "aquarium_feed_start", startedAt: now };
    this.publish();
    return true;
  }

  openNap() {
    if (this.nap?.isOn?.()) return;
    this.lastAction = { kind: "nap_start" };
    this.showToast("낮잠 모드");
    this.nap = mountNapMode({
      durationMs: 10000,
      onDone: () => {
        this.nap = null;
        this.lastAction = { kind: "nap_end" };
        this.showToast("기상!");
        this.publish();
      },
    });
    this.publish();
  }

  expandWorkBubble(agent) {
    const shown = truncate(agentWorkText(agent), 64);
    if (!agent._workBackup) agent._workBackup = agent.statusText;
    agent.bubbleText.setWordWrapWidth(160);
    agent.bubbleText.setText(shown);
    agent.drawBubble();
    this.lastAction = {
      kind: "work_expand",
      agentId: agent.def?.id,
      text: shown,
    };
    if (agent._expandTimer) agent._expandTimer.remove(false);
    agent._expandTimer = this.scene.time.delayedCall(4000, () => {
      agent.bubbleText.setWordWrapWidth(96);
      if (agent._workBackup != null) {
        agent.setStatus(agent._workBackup);
        agent._workBackup = null;
      }
      agent._expandTimer = null;
    });
    this.publish();
  }

  update(time) {
    this.updateTyping(time);
    this.updateLinger(time);
    this.updateMeeting(time);
    this.updateLobbyWelcome();
    if (this.aquaFeedActiveUntil && time >= this.aquaFeedActiveUntil) {
      this.aquaFeedActiveUntil = 0;
      this.lastAction = {
        kind: "aquarium_feed_end",
        lastFeedAt: this.lastFeedAt,
      };
      this.publish();
    }
  }

  updateTyping(time) {
    if (time - this._typedAt < 420) return;
    this._typedAt = time;
    this._typeIdx = (this._typeIdx + 1) % TYPING_FRAMES.length;
    const dots = TYPING_FRAMES[this._typeIdx];
    for (const a of this.scene.agents || []) {
      if (!isWorking(a)) continue;
      if (a._expandTimer) continue; // expanded view owns the bubble
      if (a._bossGreetBackup != null) continue;
      const base = truncate(agentWorkText(a), 22);
      a.setStatus(`${base}${dots}`);
    }
  }

  updateLinger(time) {
    const near = this.scene.boss?._nearAgent;
    if (!near || !isWorking(near)) {
      this._lingerAgentId = null;
      this._lingerSince = 0;
      return;
    }
    const id = near.def?.id;
    if (id !== this._lingerAgentId) {
      this._lingerAgentId = id;
      this._lingerSince = time;
      return;
    }
    if (time - this._lingerSince < LINGER_MS) return;
    if (this._coffeeSaid.has(id)) return;
    this._coffeeSaid.add(id);
    if (!near._coffeeBackup) near._coffeeBackup = near.statusText;
    near.setStatus("커피 한잔?");
    this.lastAction = { kind: "coffee_ask", agentId: id };
    this.scene.time.delayedCall(2800, () => {
      if (near._coffeeBackup != null && !near._expandTimer) {
        near.setStatus(near._coffeeBackup);
        near._coffeeBackup = null;
      }
    });
    this.publish();
  }

  updateMeeting() {
    const tile = bossTile(this.scene);
    const bossIn = inMeetingZone(this.scene, tile, 2);
    const agentsThere = (this.scene.agents || []).filter((a) => {
      if (a.currentKind === "meeting" || a.serverStatus === "blocked") return true;
      return inMeetingZone(this.scene, agentTile(a), 2);
    });

    if (bossIn && agentsThere.length && !this.meetingActive) {
      this.meetingActive = true;
      this.lastAction = {
        kind: "meeting_start",
        agents: agentsThere.map((a) => a.def?.id),
      };
      this.showToast("회의 시작");
      this.scene.whiteboardTicker?.updateFromSnapshot?.(
        this.scene.lastSnapshot,
      );
      // flash ticker style
      const label = this.scene.whiteboardTicker?.label;
      if (label) {
        label.setColor("#ffe08a");
        this.scene.time.delayedCall(1800, () => {
          try {
            label.setColor("#d8e8f8");
          } catch {
            /* ignore */
          }
        });
      }
      for (const a of agentsThere) {
        // face toward boss
        const bx = this.scene.boss.sprite.x;
        const by = this.scene.boss.sprite.y;
        const dx = bx - a.sprite.x;
        const dy = by - a.sprite.y;
        const dir =
          Math.abs(dx) > Math.abs(dy)
            ? dx < 0
              ? "left"
              : "right"
            : dy < 0
              ? "up"
              : "down";
        a.lastDir = dir;
        const idleKey = `${a.def.id}-idle-${dir}`;
        try {
          a.sprite.anims.play(idleKey, true);
        } catch {
          /* ignore */
        }
        const report = truncate(
          a.serverData?.task_title ||
            a.statusText ||
            "칸반 진행 보고드립니다",
          28,
        );
        a.setStatus(report);
      }
      this.publish();
    } else if (!bossIn || !agentsThere.length) {
      this.meetingActive = false;
    }
  }

  updateLobbyWelcome() {
    const inLobby = this.scene.isInLobbyZone?.(bossTile(this.scene));
    if (inLobby && !this._lobbyWelcomed) {
      this._lobbyWelcomed = true;
      this.showToast(`로비 · 방문 #${this.visitCount || readVisitCount()}`, 2200);
      this.lastAction = {
        kind: "lobby_enter",
        visitCount: this.visitCount || readVisitCount(),
      };
      this.publish();
    } else if (!inLobby) {
      this._lobbyWelcomed = false;
    }
  }

  snapshot() {
    return {
      visitCount: this.visitCount || readVisitCount(),
      lastScore: this.lastScore,
      meetingActive: this.meetingActive,
      minigameOpen: !!this.minigame?.isOpen?.(),
      napOn: !!this.nap?.isOn?.(),
      hint: this.hintKind(),
      lastAction: this.lastAction,
      coffeeTiles: this.coffeeTiles.map((c) => ({ tx: c.tx, ty: c.ty })),
      aquariumTiles: this.aquariumTiles.map((c) => ({ tx: c.tx, ty: c.ty })),
      aquafeedEnabled: this.aquariumFeedEnabled,
      aquafeedActive: this.aquaFeedActive(),
      aquafeedCooldown: this.aquaFeedCoolingDown(),
      aquafeedCooldownMsLeft: Math.max(
        0,
        Math.round(this.aquaFeedCooldownUntil - this.scene.time.now),
      ),
      lastFeedAt: this.lastFeedAt || null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      roomInteract: this.snapshot(),
    };
  }
}

export {
  findCoffeeTiles,
  findAquariumTiles,
  COFFEE_GID,
  AQUARIUM_GID,
  nearCoffee,
  nearAquarium,
  nearSleep,
};
