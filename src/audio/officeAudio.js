import Phaser from "phaser";
import { assetUrl } from "../assets.js";

const MUTE_KEY = "hermes-area-mute";
const BGM_VOL = 0.12;
const FOOTSTEP_VOL = 0.045;
/** Boss walk footstep rate (~3Hz). */
const FOOTSTEP_MS = 320;

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

/** Default on; `?sfx=0|false|off` disables status + footstep SFX (BGM still ok). */
export function sfxQueryEnabled() {
  if (typeof location === "undefined") return true;
  const v = new URLSearchParams(location.search).get("sfx");
  if (v == null || v === "") return true;
  return !/^(0|false|off)$/i.test(v);
}

/** Ambient BGM + mute (M) + short status/footstep SFX. Unlock on first gesture (autoplay). */
export class OfficeAudio {
  constructor(scene) {
    this.scene = scene;
    this.unlocked = false;
    this.bgm = null;
    this.muted = readMutePref();
    this.sfxEnabled = sfxQueryEnabled();
    this._lastSfxAt = 0;
    this._lastFootstepAt = 0;
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

  sfxOk() {
    return this.unlocked && !this.muted && this.sfxEnabled;
  }

  /**
   * Optional short SFX on running/blocked transitions.
   * Cooldown avoids particle-sync spam across agents.
   */
  playStatusSfx(kind, prevKind) {
    if (!this.sfxOk()) return;
    if (kind !== "running" && kind !== "blocked") return;
    if (prevKind == null || prevKind === kind) return;
    const now = this.scene.time.now;
    if (now - this._lastSfxAt < 180) return;
    this._lastSfxAt = now;
    const key = kind === "running" ? "sfx-running" : "sfx-blocked";
    if (!this.scene.cache.audio.exists(key)) return;
    this.scene.sound.play(key, { volume: 0.22 });
  }

  /**
   * Boss walk footstep — short WebAudio click (~3Hz while walking).
   * Call each frame while moving; no-ops when muted / locked / ?sfx=0.
   */
  playFootstep(moving) {
    if (!moving) {
      this._lastFootstepAt = 0;
      return;
    }
    if (!this.sfxOk()) return;
    const now = this.scene.time.now;
    if (this._lastFootstepAt && now - this._lastFootstepAt < FOOTSTEP_MS) return;
    this._lastFootstepAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      const f = 140 + Math.random() * 40;
      osc.frequency.setValueAtTime(f, t0);
      osc.frequency.exponentialRampToValueAtTime(f * 0.55, t0 + 0.05);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(FOOTSTEP_VOL, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.06);
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Clock-out SFX — soft door-close thud + short bell.
   * WebAudio only (no asset); no-ops when muted / locked.
   */
  playClockOutSfx() {
    if (!this.sfxOk()) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(90, t0);
      osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.18);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.24);

      const bell = ctx.createOscillator();
      const bellGain = ctx.createGain();
      bell.type = "triangle";
      bell.frequency.setValueAtTime(660, t0 + 0.12);
      bell.frequency.exponentialRampToValueAtTime(440, t0 + 0.55);
      bellGain.gain.setValueAtTime(0.0001, t0 + 0.12);
      bellGain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.14);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
      bell.connect(bellGain);
      bellGain.connect(ctx.destination);
      bell.start(t0 + 0.12);
      bell.stop(t0 + 0.75);
    } catch {
      /* autoplay / headless */
    }
  }

  snapshot() {
    return {
      unlocked: this.unlocked,
      muted: this.muted,
      sfxEnabled: this.sfxEnabled,
      bgmPlaying: !!this.bgm?.isPlaying,
    };
  }
}
