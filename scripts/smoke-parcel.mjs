/** Smoke: parcel_delivery — lobby box + toast; near boss → E hint. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base =
  process.env.SMOKE_BASE || "http://localhost:5173/hermes-agent-area/";
const url = `${base.replace(/\/?$/, "/")}?events=1`;
const shotDir = process.env.SMOKE_OUT_DIR || "smoke-parcel";
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, {
  waitUntil: "networkidle",
  timeout: 30000,
});

// postBoot sets ready before OfficeScene.create finishes — wait for both
await page.waitForFunction(
  () => {
    const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
    return !!(
      window.__HERMES_AREA__?.ready &&
      sc?.officeEvents &&
      sc?.boss?.sprite &&
      sc?.map
    );
  },
  null,
  { timeout: 45000 },
);

const armed = await page.evaluate(() => {
  const sc = window.__HERMES_GAME__?.scene?.getScene?.("OfficeScene");
  const oe = sc.officeEvents;
  oe.enabled = true;
  if (oe._schedule) {
    oe._schedule.remove(false);
    oe._schedule = null;
  }

  // park 대장님 on lobby center so near-hint fires
  const lob = sc.waypoints?.lobby;
  const ent = sc.waypoints?.entrance || { x: 20, y: 27 };
  const tx =
    lob && Number.isFinite(lob.xMin)
      ? (lob.xMin + lob.xMax) / 2
      : ent.x;
  const ty =
    lob && Number.isFinite(lob.yMin)
      ? (lob.yMin + lob.yMax) / 2
      : ent.y;
  const tw = sc.map.tileWidth;
  const th = sc.map.tileHeight;
  sc.boss.sprite.setPosition(tx * tw + tw / 2, ty * th + th / 2);

  oe.fire("parcel_delivery");

  const box = sc.children?.list?.find?.(
    (c) => c?.texture?.key === "fx-parcel",
  );
  return {
    lastEvent: oe.lastEvent,
    parcelActive: oe.parcelActive,
    parcelNearBoss: oe.parcelNearBoss,
    toast: document.getElementById("office-toast")?.textContent || "",
    hasBox: !!box,
    boxAlpha: box?.alpha ?? 0,
    events: window.__HERMES_AREA__?.events,
  };
});

await page.screenshot({
  path: `${shotDir}/parcel.png`,
  fullPage: false,
}).catch(() => {});

console.log(JSON.stringify({ armed, errors }, null, 2));

let code = 0;
if (errors.length) {
  console.error("page errors", errors);
  code = 1;
} else if (armed.lastEvent !== "parcel_delivery") {
  console.error("expected lastEvent=parcel_delivery", armed);
  code = 1;
} else if (!armed.hasBox || !armed.parcelActive) {
  console.error("expected lobby box", armed);
  code = 1;
} else if (!String(armed.toast).includes("택배")) {
  console.error("expected toast with 택배", armed);
  code = 1;
} else if (!armed.parcelNearBoss || !String(armed.toast).includes("E")) {
  console.error("expected near-boss E hint", armed);
  code = 1;
} else {
  console.log("PASS smoke-parcel");
}

await Promise.race([
  browser.close(),
  new Promise((r) => setTimeout(r, 3000)),
]);
process.exit(code);
