import "./style.css";
import Phaser from "phaser";
import { OfficeScene } from "./scenes/OfficeScene.js";

/** Map is 40×30 tiles @ 16px — canvas must match or FIT crops the office. */
const MAP_W = 40 * 16;
const MAP_H = 30 * 16;

const toolbar = document.createElement("div");
toolbar.className = "toolbar";
toolbar.innerHTML = `
  <div class="toolbar__brand">
    <strong>Hermes Agent Area</strong>
    <span class="toolbar__hint">WASD 이동 · M 뮤트 · 클릭=칸반 상세</span>
  </div>
  <div class="toolbar__actions">
    <button type="button" class="toolbar__btn" data-role="toggle-kanban" aria-pressed="true">칸반</button>
  </div>
`;
document.body.appendChild(toolbar);

const parent = document.getElementById("app");

const preferCanvas =
  typeof navigator !== "undefined" && /HeadlessChrome|Headless|Playwright/i.test(navigator.userAgent);

const game = new Phaser.Game({
  type: preferCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent,
  width: MAP_W,
  height: MAP_H,
  backgroundColor: "#0f1419",
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scene: [OfficeScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: MAP_W,
    height: MAP_H,
  },
  callbacks: {
    postBoot: (g) => {
      window.__HERMES_AREA__ = {
        ready: true,
        live: false,
        game: g,
        scenes: g.scene.getScenes(true).map((s) => s.scene.key),
      };
    },
  },
});

window.__HERMES_GAME__ = game;

toolbar.querySelector('[data-role="toggle-kanban"]')?.addEventListener("click", (ev) => {
  const btn = ev.currentTarget;
  const panel = document.querySelector(".kanban-panel");
  if (!panel) return;
  const collapsed = panel.classList.toggle("is-collapsed");
  btn.setAttribute("aria-pressed", collapsed ? "false" : "true");
  btn.classList.toggle("is-off", collapsed);
});
