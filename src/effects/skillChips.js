/** World skill chips under agent nameplate. `?skills=0` off, `?skills=force` idle always-on. */

const DEPTH = 20;
const MAX_CHIPS = 2;
const MAX_NAME = 10;
/** Below nameplate(-40) / progress(-36); clears elapsed. */
const CHIP_OY = -26;
const GAP = 4;
const PAD_X = 4;
const PAD_Y = 2;
const FONT = "9px";
const BG = 0x1a3038;
const BORDER = 0x3a6a78;
const TEXT = "#a8dce8";

/** `?skills=0` / false / off → disabled. Default on. */
export function skillsEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("skills");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

/** `?skills=force` → idle also always-on (smoke / overcrowd override). */
export function skillsForceFromQuery() {
  if (typeof location === "undefined") return false;
  try {
    return new URLSearchParams(location.search).get("skills") === "force";
  } catch {
    return false;
  }
}

export function truncateSkillName(name, max = MAX_NAME) {
  const raw = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(0, max - 1))}…`;
}

/** Prefer live `serverData.skills`, else def.skills. Strings or {name}. */
export function resolveSkillNames(agent, max = MAX_CHIPS) {
  const raw = agent?.serverData?.skills ?? agent?.def?.skills ?? [];
  if (!Array.isArray(raw) || !raw.length) return [];
  const out = [];
  for (const s of raw) {
    const name = typeof s === "string" ? s : s?.name;
    const t = truncateSkillName(name);
    if (t) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Visibility mode for this frame.
 * @returns {"hide"|"always"|"idle"} 
 */
export function resolveSkillChipMode(agent, force = false) {
  if (!agent) return "hide";
  const status = agent.serverStatus;
  if (status === "offline" || agent.currentKind === "sleep") return "hide";
  if (status === "sleep") return "hide";

  const names = resolveSkillNames(agent);
  if (!names.length) return "hide";

  if (force) return "always";

  if (status === "running" || status === "chatting") return "always";

  // mock wander before first snapshot — desk/focus implies coding
  if (!agent.live && !status && (agent.currentKind === "desk" || agent.currentKind === "focus")) {
    return "always";
  }

  if (status === "idle" || (!agent.live && agent.currentKind === "break")) {
    return "idle";
  }

  return "hide";
}

/** Per-agent 3–5s idle blink: alpha 0..1. */
export function idleChipAlpha(timeMs, agentId) {
  const seed = hashId(agentId);
  const cycle = 3000 + (seed % 2001); // 3000–5000
  const visible = 1100;
  const fade = 280;
  const t = ((timeMs + seed * 17) % cycle + cycle) % cycle;
  if (t >= visible) return 0;
  if (t < fade) return t / fade;
  if (t > visible - fade) return (visible - t) / fade;
  return 1;
}

function hashId(id) {
  const s = String(id ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/**
 * @returns {{ gfx: Phaser.GameObjects.Graphics, labels: Phaser.GameObjects.Text[], enabled: boolean, force: boolean }}
 */
export function createSkillChips(scene) {
  const gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
  const labels = [0, 1].map(() =>
    scene.add
      .text(0, 0, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: FONT,
        color: TEXT,
        align: "center",
        stroke: "#0b1016",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH)
      .setVisible(false),
  );
  return {
    gfx,
    labels,
    enabled: skillsEnabledFromQuery(),
    force: skillsForceFromQuery(),
  };
}

export function destroySkillChips(chips) {
  if (!chips) return;
  chips.gfx?.destroy();
  for (const lab of chips.labels || []) lab?.destroy();
}

/**
 * Draw 1–2 chips under nameplate. Hide when off / no skills / sleep.
 */
export function updateSkillChips(chips, agent) {
  if (!chips?.gfx || !chips.labels) return;

  if (!chips.enabled) {
    hideChips(chips);
    return;
  }

  const mode = resolveSkillChipMode(agent, chips.force);
  if (mode === "hide" || !agent?.sprite) {
    hideChips(chips);
    return;
  }

  const names = resolveSkillNames(agent);
  if (!names.length) {
    hideChips(chips);
    return;
  }

  let alpha = 1;
  if (mode === "idle") {
    alpha = idleChipAlpha(agent.scene?.time?.now ?? 0, agent.def?.id);
    if (alpha <= 0.02) {
      hideChips(chips);
      return;
    }
  }

  const spriteAlpha = agent.sprite.alpha ?? 1;
  alpha *= spriteAlpha;

  const cx = agent.sprite.x;
  const cy = agent.sprite.y + CHIP_OY;

  // measure + layout
  const metrics = names.map((n, i) => {
    const lab = chips.labels[i];
    lab.setText(n);
    const w = Math.ceil(lab.width) + PAD_X * 2;
    const h = Math.max(12, Math.ceil(lab.height) + PAD_Y * 2);
    return { lab, w, h, n };
  });
  const totalW =
    metrics.reduce((s, m) => s + m.w, 0) + GAP * Math.max(0, metrics.length - 1);
  let x = cx - totalW / 2;

  chips.gfx.clear();
  chips.gfx.setVisible(true);
  chips.gfx.setAlpha(alpha);

  for (let i = 0; i < chips.labels.length; i++) {
    const lab = chips.labels[i];
    if (i >= metrics.length) {
      lab.setVisible(false);
      continue;
    }
    const m = metrics[i];
    const bx = x;
    const by = cy - m.h / 2;
    chips.gfx.fillStyle(BG, 0.92);
    chips.gfx.fillRoundedRect(bx, by, m.w, m.h, 3);
    chips.gfx.lineStyle(1, BORDER, 0.95);
    chips.gfx.strokeRoundedRect(bx, by, m.w, m.h, 3);
    lab.setPosition(bx + m.w / 2, cy);
    lab.setAlpha(alpha);
    lab.setVisible(true);
    x += m.w + GAP;
  }
}

function hideChips(chips) {
  chips.gfx.clear();
  chips.gfx.setVisible(false);
  for (const lab of chips.labels) lab.setVisible(false);
}
