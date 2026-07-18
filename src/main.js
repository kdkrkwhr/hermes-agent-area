import "./style.css";
import Phaser from "phaser";
import { OfficeScene } from "./scenes/OfficeScene.js";
import { MAP_W, MAP_H } from "./constants.js";
import { mountConnectPanel } from "./connectPanel.js";
import { mountAppPages } from "./ui/appPages.js";
import {
  notifyEnabled,
  notifyToolbarLabel,
  requestNotifyPermission,
  sendNotify,
  setNotifyEnabled,
} from "./notify.js";

// PWA: Chrome「앱으로 설치」/ 독립 창
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}

document.body.dataset.page = "office";

const toolbar = document.createElement("div");
toolbar.className = "toolbar";
toolbar.innerHTML = `
  <div class="toolbar__brand">
    <strong>Hermes Agent Area</strong>
    <span class="toolbar__hint">WASD · F 팔로우 · E 상호작용 · M 뮤트 · 구역탭으로 방 확대</span>
  </div>
  <div class="toolbar__actions">
    <button type="button" class="toolbar__btn" data-role="toggle-connect">연결</button>
    <button type="button" class="toolbar__btn" data-role="toggle-notify">알림</button>
    <button type="button" class="toolbar__btn is-off" data-role="toggle-follow" aria-pressed="false">팔로우</button>
    <button type="button" class="toolbar__btn is-off" data-role="toggle-kanban" aria-pressed="false">칸반</button>
    <button type="button" class="toolbar__btn" data-role="toggle-timeline">타임라인</button>
  </div>
`;
document.body.appendChild(toolbar);

function refreshNotifyBtn() {
  const btn = toolbar.querySelector('[data-role="toggle-notify"]');
  if (!btn) return;
  btn.textContent = notifyToolbarLabel();
  const on = notifyEnabled();
  btn.classList.toggle("is-off", !on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
}
refreshNotifyBtn();

const connectPanel = mountConnectPanel({
  onReconnect: () => {
    const sc = game.scene.getScene("OfficeScene");
    sc?.reconnectWs?.();
  },
});

const parent = document.getElementById("app");

const preferCanvas =
  typeof navigator !== "undefined" && /HeadlessChrome|Headless|Playwright/i.test(navigator.userAgent);

const dpr =
  typeof window !== "undefined" ? Math.min(Math.max(window.devicePixelRatio || 1, 1), 2) : 1;

const game = new Phaser.Game({
  type: preferCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent,
  width: MAP_W,
  height: MAP_H,
  backgroundColor: "#0f1419",
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  resolution: dpr,
  scene: [OfficeScene],
  scale: {
    // RESIZE: canvas = viewport; overview zoom computed in OfficeScene (no FIT letterbox)
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
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

const appPages = mountAppPages({
  game,
  getScene: () => game.scene.getScene("OfficeScene"),
});
window.__HERMES_PAGES__ = appPages;

toolbar.querySelector('[data-role="toggle-connect"]')?.addEventListener("click", () => {
  connectPanel.open();
});

toolbar.querySelector('[data-role="toggle-notify"]')?.addEventListener("click", async () => {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "denied") {
    refreshNotifyBtn();
    return;
  }
  if (Notification.permission !== "granted") {
    const perm = await requestNotifyPermission();
    if (perm === "granted") {
      sendNotify("알림 켜짐", "에이전트 작업 완료 시 알려줄게", "notify-on");
    }
    refreshNotifyBtn();
    return;
  }
  // already granted — toggle on/off
  const next = !notifyEnabled();
  setNotifyEnabled(next);
  if (next) sendNotify("알림 켜짐", "에이전트 작업 완료 시 알려줄게", "notify-on");
  refreshNotifyBtn();
});

toolbar.querySelector('[data-role="toggle-follow"]')?.addEventListener("click", () => {
  const sc = game.scene.getScene("OfficeScene");
  sc?.toggleCameraFollow?.();
});

toolbar.querySelector('[data-role="toggle-kanban"]')?.addEventListener("click", (ev) => {
  if (appPages.getPage() === "board") {
    // already on board (full kanban) — go back to clean office
    appPages.setPage("office");
    return;
  }
  const btn = ev.currentTarget;
  const panel = document.querySelector(".kanban-panel");
  if (!panel) return;
  const collapsed = panel.classList.toggle("is-collapsed");
  btn.setAttribute("aria-pressed", collapsed ? "false" : "true");
  btn.classList.toggle("is-off", collapsed);
});

toolbar.querySelector('[data-role="toggle-timeline"]')?.addEventListener("click", () => {
  if (appPages.getPage() === "board") {
    appPages.setPage("office");
  }
  const sc = game.scene.getScene("OfficeScene");
  sc?.activityTimeline?.toggle();
});

// start: office clean (kanban tucked away)
queueMicrotask(() => {
  document.querySelector(".kanban-panel")?.classList.add("is-collapsed");
});
