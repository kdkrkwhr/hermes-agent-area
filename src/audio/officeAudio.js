import Phaser from "phaser";
import { assetUrl } from "../assets.js";

const MUTE_KEY = "hermes-area-mute";
const BGM_VOL = 0.12;

function readMutePref() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMutePref(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore private-mode / headless */
  }
}

/** Ambient BGM + mute (M) + short status SFX. Unlock on first gesture (autoplay). */
export class OfficeAudio {
  constructor(scene) {
    this.scene = scene;
    this.unlocked = false;
    this.bgm = null;
    this.muted = readMutePref();
    this._lastSfxAt = 0;
  }

  preload() {
    const load = this.scene.load;
    load.audio("office-ambient", assetUrl("assets/office-ambient.wav"));
    load.audio("sfx-running", assetUrl("assets/sfx-running.wav"));
    load.audio("sfx-blocked", assetUrl("assets/sfx-blocked.wav"));
  }

  create(onMuteChange) {
    this.onMuteChange = onMuteChange;
    this.applyMute();
    this.bindUnlock();
    this.scene.input.keyboard?.on("keydown-M", () => this.toggleMute());
  }

  bindUnlock() {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      const sound = this.scene.sound;
      if (sound.locked) {
        sound.once(Phaser.Sound.Events.UNLOCKED, () => this.startBgm());
        sound.context?.resume?.();
      } else {
        this.startBgm();
      }
    };
    this.scene.input.once("pointerdown", unlock);
    this.scene.input.keyboard?.once("keydown", unlock);
  }

  startBgm() {
    if (this.bgm?.isPlaying) return;
    if (!this.scene.cache.audio.exists("office-ambient")) return;
    this.bgm = this.scene.sound.add("office-ambient", {
      loop: true,
      volume: BGM_VOL,
    });
    this.bgm.play();
    this.applyMute();
  }

  toggleMute() {
    this.muted = !this.muted;
    writeMutePref(this.muted);
    this.applyMute();
    if (!this.unlocked) {
      this.unlocked = true;
      this.startBgm();
    }
    this.onMuteChange?.(this.muted);
  }

  applyMute() {
    this.scene.sound.mute = this.muted;
  }

  /** One-char HUD marker: ♪ unmuted, × muted. */
  muteGlyph() {
    return this.muted ? "×" : "♪";
  }

  /**
   * Optional short SFX on running/blocked transitions.
   * Cooldown avoids particle-sync spam across agents.
   */
  playStatusSfx(kind, prevKind) {
    if (!this.unlocked || this.muted) return;
    if (kind !== "running" && kind !== "blocked") return;
    if (prevKind == null || prevKind === kind) return;
    const now = this.scene.time.now;
    if (now - this._lastSfxAt < 180) return;
    this._lastSfxAt = now;
    const key = kind === "running" ? "sfx-running" : "sfx-blocked";
    if (!this.scene.cache.audio.exists(key)) return;
    this.scene.sound.play(key, { volume: 0.22 });
  }

  snapshot() {
    return {
      unlocked: this.unlocked,
      muted: this.muted,
      bgmPlaying: !!this.bgm?.isPlaying,
    };
  }
}
