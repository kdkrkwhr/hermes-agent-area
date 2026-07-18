import Phaser from "phaser";
import { assetUrl } from "../assets.js";

const MUTE_KEY = "hermes-area-mute";
const BGM_VOL = 0.12;
/** Smooth TOD tone morph (lowpass + slight rate) — no BGM restart. */
const BGM_TOD_FADE_S = 0.85;
/**
 * Per TOD_PRESETS name: lowpass cutoff (Hz), Q, volume, playback rate.
 * Same ambient wav — filter/rate only.
 */
const BGM_TOD = {
  morning: { freq: 11000, q: 0.75, vol: 0.135, rate: 1.035 },
  day: { freq: 18000, q: 0.7, vol: BGM_VOL, rate: 1 },
  evening: { freq: 3800, q: 0.95, vol: 0.11, rate: 0.965 },
  night: { freq: 1600, q: 1.15, vol: 0.085, rate: 0.92 },
};
const FOOTSTEP_VOL = 0.045;
/** Boss walk footstep rate (~3Hz). */
const FOOTSTEP_MS = 320;
/** Keyboard typing click — quieter than footstep. */
const TYPING_VOL = 0.03;
/** Per-agent typing click spacing. */
const TYPING_AGENT_MS = 400;
/** Global floor so many running agents don't click-spam. */
const TYPING_GLOBAL_MS = 100;
/** Lobby door-chime throttle when visitors stack. */
const DOOR_CHIME_MS = 1500;
const BLOOP_MS = 450;
const MEOW_MS = 700;
const DRIP_MS = 500;
const VEND_MS = 400;
const FRIDGE_MS = 500;
const MICROWAVE_MS = 450;
const COOLER_MS = 450;
const HIGHFIVE_MS = 400;

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

/** Default on; `?sfx=0|false|off` disables status/footstep/typing/gate/door-chime SFX (BGM still ok). */
export function sfxQueryEnabled() {
  if (typeof location === "undefined") return true;
  const v = new URLSearchParams(location.search).get("sfx");
  if (v == null || v === "") return true;
  return !/^(0|false|off)$/i.test(v);
}

/** Ambient BGM + mute (M) + short status/footstep/typing SFX. Unlock on first gesture (autoplay). */
export class OfficeAudio {
  constructor(scene) {
    this.scene = scene;
    this.unlocked = false;
    this.bgm = null;
    this.muted = readMutePref();
    this.sfxEnabled = sfxQueryEnabled();
    this._lastSfxAt = 0;
    this._lastFootstepAt = 0;
    /** @type {Map<string, number>} */
    this._typingByAgent = new Map();
    this._lastTypingGlobalAt = 0;
    this._lastDoorChimeAt = 0;
    this._lastBloopAt = 0;
    this._lastMeowAt = 0;
    /** @type {BiquadFilterNode | null} */
    this._bgmFilter = null;
    /** @type {string | null} */
    this._todName = null;
    /** Pending TOD until BGM unlock/start. */
    this._pendingTod = null;
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
    const tod =
      this._pendingTod ||
      this.scene.lightingPreset?.name ||
      "day";
    const preset = BGM_TOD[tod] || BGM_TOD.day;
    this.bgm = this.scene.sound.add("office-ambient", {
      loop: true,
      volume: preset.vol,
      rate: preset.rate,
    });
    this.bgm.play();
    this.ensureBgmFilter();
    this.applyTodTone(tod, { immediate: true });
    this.applyMute();
  }

  /**
   * Insert lowpass between Phaser volumeNode → master (once).
   * Same loop keeps playing; TOD only morphs filter/rate/vol.
   */
  ensureBgmFilter() {
    if (this._bgmFilter || !this.bgm?.volumeNode) return;
    const sound = this.scene.sound;
    const ctx = sound.context;
    if (!ctx || !sound.destination) return;
    try {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = BGM_TOD.day.freq;
      filter.Q.value = BGM_TOD.day.q;
      const vol = this.bgm.volumeNode;
      vol.disconnect();
      vol.connect(filter);
      filter.connect(sound.destination);
      this._bgmFilter = filter;
    } catch {
      /* HTML5 audio / headless — rate/vol still apply */
    }
  }

  /**
   * Sync ambient tone to morning|day|evening|night.
   * Call from applyTimeOfDayLighting (L / ?tod= / clock).
   * @param {string | { name?: string } | null | undefined} tod
   * @param {{ immediate?: boolean }} [opts]
   */
  syncTimeOfDay(tod, opts = {}) {
    const name = typeof tod === "string" ? tod : tod?.name;
    if (!name || !BGM_TOD[name]) return;
    this._pendingTod = name;
    if (!this.bgm?.isPlaying) return;
    this.applyTodTone(name, opts);
  }

  /**
   * @param {string} name
   * @param {{ immediate?: boolean }} [opts]
   */
  applyTodTone(name, opts = {}) {
    const preset = BGM_TOD[name];
    if (!preset) return;
    const immediate = !!opts.immediate || this._todName == null;
    if (!immediate && name === this._todName) return;
    this._todName = name;
    this._pendingTod = name;
    this.ensureBgmFilter();

    const ctx = this.scene.sound?.context;
    const t0 = ctx?.currentTime ?? 0;
    const fade = immediate ? 0.02 : BGM_TOD_FADE_S;

    if (this._bgmFilter && ctx) {
      try {
        const f = this._bgmFilter.frequency;
        const q = this._bgmFilter.Q;
        f.cancelScheduledValues(t0);
        q.cancelScheduledValues(t0);
        f.setValueAtTime(Math.max(f.value, 40), t0);
        q.setValueAtTime(Math.max(q.value, 0.1), t0);
        f.linearRampToValueAtTime(preset.freq, t0 + fade);
        q.linearRampToValueAtTime(preset.q, t0 + fade);
      } catch {
        this._bgmFilter.frequency.value = preset.freq;
        this._bgmFilter.Q.value = preset.q;
      }
    }

    if (this.bgm) {
      try {
        if (typeof this.bgm.setRate === "function") this.bgm.setRate(preset.rate);
        else this.bgm.rate = preset.rate;
      } catch {
        /* ignore */
      }
      const from = typeof this.bgm.volume === "number" ? this.bgm.volume : preset.vol;
      if (immediate || Math.abs(from - preset.vol) < 0.001) {
        if (typeof this.bgm.setVolume === "function") this.bgm.setVolume(preset.vol);
        else this.bgm.volume = preset.vol;
      } else {
        this.scene.tweens.killTweensOf(this.bgm);
        this.scene.tweens.add({
          targets: this.bgm,
          volume: preset.vol,
          duration: fade * 1000,
          ease: "Sine.easeInOut",
        });
      }
    }
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
   * Desk typing click burst while effectKind===running.
   * Per-agent ~400ms + global floor; no-ops when muted / locked / ?sfx=0.
   */
  playTypingSfx(agentId) {
    if (!this.sfxOk()) return;
    const id = String(agentId ?? "");
    if (!id) return;
    const now = this.scene.time.now;
    const lastAgent = this._typingByAgent.get(id) || 0;
    if (now - lastAgent < TYPING_AGENT_MS) return;
    if (this._lastTypingGlobalAt && now - this._lastTypingGlobalAt < TYPING_GLOBAL_MS) {
      return;
    }
    this._typingByAgent.set(id, now);
    this._lastTypingGlobalAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      // 2 tiny high clicks ≈ key burst
      for (let i = 0; i < 2; i++) {
        const t = t0 + i * 0.028;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        const f = 2100 + Math.random() * 900;
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.025);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(TYPING_VOL, t + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.032);
      }
    } catch {
      /* autoplay / headless */
    }
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
  /** Short turnstile beep — respects mute / ?sfx=0. */
  playGateBeep(kind = "in") {
    if (!this.sfxOk()) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      const f = kind === "in" ? 880 : 660;
      osc.frequency.setValueAtTime(f, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Lobby door chime (ding-dong) on visitor-spawned.
   * Throttled 1.5s; no-ops when muted / locked / ?sfx=0.
   */
  playDoorChime() {
    if (!this.sfxOk()) return;
    const now = this.scene.time.now;
    if (this._lastDoorChimeAt && now - this._lastDoorChimeAt < DOOR_CHIME_MS) {
      return;
    }
    this._lastDoorChimeAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      // classic two-tone door bell: E5 → C5
      const tones = [
        { f: 659.25, at: 0, dur: 0.28 },
        { f: 523.25, at: 0.22, dur: 0.38 },
      ];
      for (const { f, at, dur } of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        const t = t0 + at;
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.1, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    } catch {
      /* autoplay / headless */
    }
  }

  /** Tiny aquarium bloop — respects mute / ?sfx=0. */
  playAquariumBloop() {
    if (!this.sfxOk()) return;
    const now = this.scene.time.now;
    if (this._lastBloopAt && now - this._lastBloopAt < BLOOP_MS) return;
    this._lastBloopAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, t0);
      osc.frequency.exponentialRampToValueAtTime(760, t0 + 0.09);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Short mascot meow / chirp on pet — procedural WebAudio.
   * Respects mute / ?sfx=0.
   */
  playMascotMeow() {
    if (!this.sfxOk()) return;
    const now = this.scene.time.now;
    if (this._lastMeowAt && now - this._lastMeowAt < MEOW_MS) return;
    this._lastMeowAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      // rising chirp + soft trailing mew
      const tones = [
        { type: "triangle", f0: 480, f1: 820, at: 0, dur: 0.11, vol: 0.09 },
        { type: "sine", f0: 640, f1: 420, at: 0.08, dur: 0.16, vol: 0.07 },
      ];
      for (const { type, f0, f1, at, dur, vol } of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        const t = t0 + at;
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(80, f1), t + dur);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    } catch {
      /* autoplay / headless */
    }
  }

  /** Tiny plant drip — respects mute / ?sfx=0. */
  playPlantDrip() {
    if (!this.sfxOk()) return;
    const now = this.scene.time.now;
    if (this._lastDripAt && now - this._lastDripAt < DRIP_MS) return;
    this._lastDripAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      // soft plink + short splash
      const tones = [
        { type: "sine", f0: 880, f1: 420, at: 0, dur: 0.08, vol: 0.06 },
        { type: "triangle", f0: 520, f1: 260, at: 0.05, dur: 0.12, vol: 0.045 },
      ];
      for (const { type, f0, f1, at, dur, vol } of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        const t = t0 + at;
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    } catch {
      /* autoplay / headless */
    }
  }

  /** Mechanical vending click + soft dispense thunk — respects mute / ?sfx=0. */
  playVendingClick() {
    if (!this.sfxOk()) return;
    const now = this.scene.time.now;
    if (this._lastVendAt && now - this._lastVendAt < VEND_MS) return;
    this._lastVendAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const tones = [
        { type: "square", f0: 420, f1: 280, at: 0, dur: 0.04, vol: 0.05 },
        { type: "triangle", f0: 180, f1: 90, at: 0.05, dur: 0.1, vol: 0.06 },
      ];
      for (const { type, f0, f1, at, dur, vol } of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        const t = t0 + at;
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    } catch {
      /* autoplay / headless */
    }
  }

  /** Short fridge cool-hiss (filtered noise) — respects mute / ?sfx=0. */
  playFridgeHiss() {
    if (!this.sfxOk()) return;
    const now = this.scene.time.now;
    if (this._lastFridgeAt && now - this._lastFridgeAt < FRIDGE_MS) return;
    this._lastFridgeAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const n = Math.floor(ctx.sampleRate * 0.22);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      }
      const noise = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = "highpass";
      filter.frequency.setValueAtTime(2400, t0);
      filter.Q.setValueAtTime(0.6, t0);
      noise.buffer = buf;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.045, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(t0);
      noise.stop(t0 + 0.22);
    } catch {
      /* autoplay / headless */
    }
  }

  /** Classic microwave ding (A6) — same tone as officeEvents microwave_ding. */
  playMicrowaveDing() {
    if (!this.sfxOk()) return;
    const now = this.scene.time.now;
    if (this._lastMicrowaveAt && now - this._lastMicrowaveAt < MICROWAVE_MS) {
      return;
    }
    this._lastMicrowaveAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1760, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.055, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    } catch {
      /* autoplay / headless */
    }
  }

  /** Short cooler sip/drip — respects mute / ?sfx=0. */
  playCoolerSip() {
    if (!this.sfxOk()) return;
    const now = this.scene.time.now;
    if (this._lastCoolerAt && now - this._lastCoolerAt < COOLER_MS) return;
    this._lastCoolerAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const tones = [
        { type: "sine", f0: 720, f1: 380, at: 0, dur: 0.07, vol: 0.05 },
        { type: "triangle", f0: 440, f1: 220, at: 0.04, dur: 0.1, vol: 0.04 },
      ];
      for (const { type, f0, f1, at, dur, vol } of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        const t = t0 + at;
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    } catch {
      /* autoplay / headless */
    }
  }

  /**
   * Soft high-five slap — procedural WebAudio.
   * Respects mute / ?sfx=0. Ambient pair pass only.
   */
  playHighFiveSfx() {
    if (!this.sfxOk()) return;
    const now = this.scene.time.now;
    if (this._lastHighFiveAt && now - this._lastHighFiveAt < HIGHFIVE_MS) {
      return;
    }
    this._lastHighFiveAt = now;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      // soft palm slap: noise burst + brief mid thump
      const n = Math.floor(ctx.sampleRate * 0.045);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      }
      const noise = ctx.createBufferSource();
      const noiseGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(900, t0);
      filter.Q.setValueAtTime(0.8, t0);
      noise.buffer = buf;
      noiseGain.gain.setValueAtTime(0.0001, t0);
      noiseGain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.004);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t0);
      noise.stop(t0 + 0.055);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.07);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    } catch {
      /* autoplay / headless */
    }
  }

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

  /**
   * Distant thunder rumble for rain lightning — WebAudio only.
   * No-ops when muted / locked / ?sfx=0.
   */
  playThunderSfx() {
    if (!this.sfxOk()) return;
    try {
      const ctx = this.scene.sound?.context;
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const dur = 0.55 + Math.random() * 0.35;

      // low boom
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const f0 = 55 + Math.random() * 25;
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.45, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);

      // soft noise crackle (buffer)
      const n = Math.floor(ctx.sampleRate * Math.min(0.22, dur * 0.4));
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      }
      const noise = ctx.createBufferSource();
      const nGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(400, t0);
      noise.buffer = buf;
      nGain.gain.setValueAtTime(0.0001, t0);
      nGain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.01);
      nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.min(0.25, dur * 0.5));
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(t0);
      noise.stop(t0 + 0.28);
    } catch {
      /* autoplay / headless */
    }
  }

  snapshot() {
    let filterFreq = null;
    try {
      filterFreq = this._bgmFilter ? Math.round(this._bgmFilter.frequency.value) : null;
    } catch {
      filterFreq = null;
    }
    return {
      unlocked: this.unlocked,
      muted: this.muted,
      sfxEnabled: this.sfxEnabled,
      bgmPlaying: !!this.bgm?.isPlaying,
      tod: this._todName ?? this._pendingTod,
      filterFreq,
      bgmRate: this.bgm?.rate ?? null,
      bgmVol: this.bgm?.volume ?? null,
    };
  }
}
