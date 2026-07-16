/** Soft ADD cyan ring when an agent enters chatting (Discord reply start). */

/** Near desk glow / confetti depth. */
const DEPTH = 11;
const RING_COLOR = 0x88aaff;
const DURATION_MIN = 500;
const DURATION_MAX = 800;

/**
 * Query: omit = on (edge only). `0`/`off`/`false` = never.
 * `1`/`true`/`force` = also fire a smoke ring on scene start.
 * @returns {"off"|"on"|"force"}
 */
export function pingModeFromQuery() {
  if (typeof location === "undefined") return "on";
  try {
    const v = new URLSearchParams(location.search).get("pingfx");
    if (v == null || v === "") return "on";
    if (v === "0" || v === "false" || v === "off") return "off";
    if (v === "1" || v === "true" || v === "force" || v === "on") return "force";
    return "on";
  } catch {
    return "on";
  }
}

export function pingEnabledFromQuery() {
  return pingModeFromQuery() !== "off";
}

export function pingForceFromQuery() {
  return pingModeFromQuery() === "force";
}

/** Raw status edge — chatting is NOT collapsed to running. */
export function isChatPingTransition(prevStatus, nextStatus) {
  return nextStatus === "chatting" && prevStatus !== "chatting";
}

/**
 * One soft ADD stroke ring at agent feet/mid. Expand + fade 0.5–0.8s.
 * @param {Phaser.Scene} scene
 * @param {{ sprite?: Phaser.GameObjects.Sprite } | Phaser.GameObjects.Sprite} agentOrSprite
 */
export function burstChatPing(scene, agentOrSprite) {
  if (!scene?.add) return null;

  const spr = agentOrSprite?.sprite ?? agentOrSprite;
  if (!spr || typeof spr.x !== "number") return null;

  const x = spr.x;
  const y = spr.y - 6;
  const duration =
    DURATION_MIN + Math.floor(Math.random() * (DURATION_MAX - DURATION_MIN + 1));

  const gfx = scene.add.graphics().setDepth(DEPTH);
  gfx.setBlendMode("ADD");

  const state = { r: 6, alpha: 0.9 };
  const draw = () => {
    gfx.clear();
    if (state.alpha <= 0.01) return;
    gfx.lineStyle(2.5, RING_COLOR, state.alpha);
    gfx.strokeCircle(x, y, state.r);
  };
  draw();

  scene.tweens.add({
    targets: state,
    r: 38,
    alpha: 0,
    duration,
    ease: "Cubic.easeOut",
    onUpdate: draw,
    onComplete: () => {
      try {
        gfx.destroy();
      } catch {
        /* ignore */
      }
    },
  });

  if (typeof scene._chatPingBurstCount === "number") {
    scene._chatPingBurstCount += 1;
  } else {
    scene._chatPingBurstCount = 1;
  }
  scene._chatPingLastAt = scene.time?.now ?? Date.now();

  return gfx;
}

/**
 * Smoke helper: `?pingfx=1` fires once when an agent exists.
 * Agents often arrive after WS/mock snapshot — keep pending until then.
 * @param {Phaser.Scene} scene
 * @param {Array<{ sprite?: Phaser.GameObjects.Sprite }>} [_agents]
 */
export function maybeForceChatPing(scene, _agents) {
  if (!pingForceFromQuery()) return;
  scene._chatPingForcePending = true;
  flushForceChatPing(scene);
  let tries = 0;
  const tick = () => {
    if (!scene._chatPingForcePending) return;
    flushForceChatPing(scene);
    tries += 1;
    if (scene._chatPingForcePending && tries < 40) {
      scene.time.delayedCall(100, tick);
    }
  };
  scene.time.delayedCall(200, tick);
}

/** Call after roster sync so `?pingfx=1` still works when agents arrive late. */
export function flushForceChatPing(scene) {
  if (!scene?._chatPingForcePending) return;
  if (!pingForceFromQuery()) {
    scene._chatPingForcePending = false;
    return;
  }
  if ((scene._chatPingBurstCount ?? 0) > 0) {
    scene._chatPingForcePending = false;
    return;
  }
  const a = scene.agents?.[0];
  if (!a) return;
  scene._chatPingForcePending = false;
  burstChatPing(scene, a);
}

/** Compact smoke/debug snapshot for window.__HERMES_AREA__. */
export function chatPingSnapshot(scene) {
  return {
    enabled: scene?.pingEnabled !== false,
    mode: pingModeFromQuery(),
    burstCount: scene?._chatPingBurstCount ?? 0,
    lastAt: scene?._chatPingLastAt ?? null,
  };
}
