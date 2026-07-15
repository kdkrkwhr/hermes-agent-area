import "./style.css";
import Phaser from "phaser";
import { OfficeScene } from "./scenes/OfficeScene.js";

const hud = document.createElement("div");
hud.className = "hud";
hud.innerHTML =
  "<strong>Hermes Agent Area</strong><br />WASD로 대장님 이동 · 에이전트 근처 말풍선";
document.body.appendChild(hud);

const parent = document.getElementById("app");

const preferCanvas =
  typeof navigator !== "undefined" && /HeadlessChrome|Headless|Playwright/i.test(navigator.userAgent);

const game = new Phaser.Game({
  type: preferCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent,
  width: 24 * 16,
  height: 18 * 16,
  backgroundColor: "#1a1714",
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scene: [OfficeScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 24 * 16,
    height: 18 * 16,
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
