/** Desk-brief weather JSON → window rain + cloudy multiply lighting. `?weatherfx=0` off. */

import { loadDeskBrief } from "../ui/deskBriefPanel.js";

const POLL_MS = 10 * 60 * 1000;

/** @returns {boolean} */
export function weatherFxEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("weatherfx");
    if (v === "0" || v === "off" || v === "false") return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** Current (or nearest past) period — mirrors attendance-pwa getWeatherPeriodNow. */
export function pickWeatherPeriod(weather) {
  const periods = weather?.periods;
  if (!Array.isArray(periods) || !periods.length) return null;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  let best = periods[0];
  for (const p of periods) {
    const [h, m = 0] = String(p.time || "0:0").split(":").map(Number);
    if (h * 60 + m <= nowMin) best = p;
    else break;
  }
  return best;
}

/**
 * Classify sky / precip / condition from PWA weather JSON (+ english aliases).
 * @param {object|null} weather
 * @returns {{ raining: boolean, cloudy: boolean, clear: boolean, sky: string, precip: string, label: string } | null}
 */
export function classifyWeather(weather) {
  if (!weather || typeof weather !== "object") return null;
  const period = pickWeatherPeriod(weather);
  if (!period && !weather.summary && !weather.condition && !weather.precip) {
    return null;
  }

  const sky = String(
    period?.sky || weather.sky || weather.condition || "",
  ).trim();
  const precip = String(
    period?.pty ||
      period?.precip ||
      weather.pty ||
      weather.precip ||
      weather.condition ||
      "",
  ).trim();
  const summary = String(weather.summary || "");
  const blob = `${sky} ${precip} ${summary}`.toLowerCase();

  const raining =
    (precip &&
      precip !== "없음" &&
      /비|소나기|눈|진눈|빗|rain|shower|drizzle|snow/i.test(precip)) ||
    /비|소나기|우산|강수|빗|rain|shower|drizzle/i.test(summary) ||
    (period &&
      Number(period.pop) >= 70 &&
      /비|소나기|rain|shower/i.test(`${sky} ${summary}`));

  const clear =
    !raining &&
    (/맑|clear|sunny/i.test(sky) || /맑|clear|sunny/i.test(blob));

  const cloudy =
    !raining &&
    !clear &&
    (/흐림|구름|안개|fog|mist|overcast|cloud/i.test(sky) ||
      /흐림|구름|overcast|cloud/i.test(blob));

  let label = "unknown";
  if (raining) label = "rain";
  else if (cloudy) label = "cloudy";
  else if (clear) label = "clear";

  return { raining, cloudy, clear, sky, precip, label };
}

/**
 * @param {Phaser.Scene} scene
 * @param {number} mapW
 * @param {number} mapH
 */
export function createWeatherCloudOverlay(scene, mapW, mapH) {
  const overlay = scene.add.rectangle(0, 0, mapW, mapH, 0x6a7a8a, 0);
  overlay.setOrigin(0, 0);
  overlay.setDepth(7);
  overlay.setScrollFactor(1);
  // multiply so night/evening TOD already-dimmed rooms don't get washed
  overlay.setBlendMode?.("MULTIPLY");
  return overlay;
}

/**
 * Controller: polls desk-brief weather, drives WindowRain + cloud overlay.
 */
export class WeatherFx {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ mapW: number, mapH: number }} dims
   */
  constructor(scene, dims) {
    this.scene = scene;
    this.enabled = weatherFxEnabledFromQuery();
    this.cloudOverlay = createWeatherCloudOverlay(scene, dims.mapW, dims.mapH);
    this.classification = null;
    this._pollTimer = null;
    this._lastToastKey = null;
    this._toastTimer = null;

    scene.events.once("shutdown", () => this.destroy());
    this.publish();
  }

  start() {
    if (!this.enabled) {
      this.clearFx();
      this.publish();
      return;
    }
    void this.refresh();
    if (this._pollTimer) this._pollTimer.remove(false);
    this._pollTimer = this.scene.time.addEvent({
      delay: POLL_MS,
      loop: true,
      callback: () => void this.refresh(),
    });
  }

  /** Hook from deskBriefPanel when user opens/refreshes the panel. */
  onDeskBriefPayload(payload) {
    if (!this.enabled) return;
    this.applyWeather(payload?.weather ?? null);
  }

  async refresh() {
    if (!this.enabled) return;
    try {
      const data = await loadDeskBrief();
      this.applyWeather(data?.weather ?? null);
    } catch {
      // missing / mock / offline → no-op (TOD + ?rain= keep owning FX)
      this.applyWeather(null);
    }
  }

  /**
   * @param {object|null} weather
   */
  applyWeather(weather) {
    if (!this.enabled) {
      this.clearFx();
      this.publish();
      return;
    }
    const cls = classifyWeather(weather);
    this.classification = cls;
    if (!cls) {
      this.clearFx();
      this.publish();
      return;
    }

    const rain = this.scene.windowRain;
    if (rain) {
      // raining → force on; clear/cloudy → release force (TOD / ?rain= resume)
      rain.setWeatherForceOn(!!cls.raining);
    }

    this._applyCloudOverlay(cls);
    this._maybeToast(cls);
    this.publish();
  }

  _applyCloudOverlay(cls) {
    const overlay = this.cloudOverlay;
    if (!overlay) return;
    if (!cls?.cloudy) {
      overlay.setFillStyle(0x6a7a8a, 0);
      return;
    }
    const tod = this.scene.lightingPreset?.name;
    // night/evening already tinted — lighter multiply alpha
    const alpha =
      tod === "night" ? 0.1 : tod === "evening" ? 0.12 : tod === "morning" ? 0.14 : 0.18;
    overlay.setFillStyle(0x5a6a7a, alpha);
  }

  /** Re-apply cloud alpha when L / TOD changes. */
  onLightingChanged() {
    if (this.classification) this._applyCloudOverlay(this.classification);
  }

  _maybeToast(cls) {
    if (!cls || cls.label === "unknown") return;
    const key = cls.label;
    if (key === this._lastToastKey) return;
    // only announce rain / cloudy transitions (not clear / unknown spam)
    if (key !== "rain" && key !== "cloudy") {
      this._lastToastKey = key;
      return;
    }
    this._lastToastKey = key;
    const text = key === "rain" ? "날씨: 비" : "날씨: 흐림";
    this._showToast(text);
  }

  _showToast(text) {
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
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.add("is-out");
      el.classList.remove("is-visible");
    }, 2600);
  }

  clearFx() {
    this.classification = null;
    this.scene.windowRain?.setWeatherForceOn(false);
    this.cloudOverlay?.setFillStyle(0x6a7a8a, 0);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      label: this.classification?.label ?? null,
      raining: !!this.classification?.raining,
      cloudy: !!this.classification?.cloudy,
      sky: this.classification?.sky ?? null,
      precip: this.classification?.precip ?? null,
    };
  }

  publish() {
    if (typeof window === "undefined") return;
    window.__HERMES_AREA__ = {
      ...(window.__HERMES_AREA__ || {}),
      weatherFx: this.snapshot(),
      rain: this.scene.windowRain?.snapshot?.() ?? null,
    };
  }

  destroy() {
    if (this._pollTimer) {
      this._pollTimer.remove(false);
      this._pollTimer = null;
    }
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    this.clearFx();
    try {
      this.cloudOverlay?.destroy();
    } catch {
      /* ignore */
    }
    this.cloudOverlay = null;
  }
}
