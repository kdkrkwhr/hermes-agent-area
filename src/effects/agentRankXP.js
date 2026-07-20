/** Agent Rank/XP engine: computes levels from Kanban completion data
 *  and renders in-world rank badge icons on agent sprites.
 *
 *  Query params:
 *    ?rank=0     → disable rank badges
 *    ?rank=force → always visible (smoke test)
 */

// ── Rank tier definitions ──────────────────────────────────────────

export const RANK_TIERS = [
  { tier: 0, name: "Intern", emoji: "🌱", color: "#8bc48a", xpMin: 0 },
  { tier: 1, name: "Junior", emoji: "🔰", color: "#7ec8e8", xpMin: 200 },
  { tier: 2, name: "Senior", emoji: "⚡", color: "#6ecfba", xpMin: 500 },
  { tier: 3, name: "Staff", emoji: "💎", color: "#c8a8f0", xpMin: 1000 },
  { tier: 4, name: "Principal", emoji: "🔥", color: "#f0a060", xpMin: 2000 },
  { tier: 5, name: "Architect", emoji: "👑", color: "#f0d060", xpMin: 4000 },
];

const XP_PER_TASK = 100;
const MAX_SPEED_BONUS = 200; // at 0s avg speed
const SPEED_BONUS_EXP = 40; // exponential decay reference seconds

// ── XP computation ─────────────────────────────────────────────────

/**
 * Compute XP from agent completion stats.
 * @param {{ completed: number, avg_speed_sec: number }} stats
 * @returns {{ xp: number, tier: number, name: string, emoji: string, color: string, level: number }}
 */
export function computeRank(stats) {
  const completed = stats?.completed ?? 0;
  const avgSpeed = stats?.avg_speed_sec ?? 120;

  // Base XP from tasks completed
  let xp = completed * XP_PER_TASK;

  // Speed bonus: faster agents earn more XP per task
  if (completed > 0 && avgSpeed < 120) {
    const speedFactor = Math.exp(-avgSpeed / SPEED_BONUS_EXP);
    xp += Math.round(completed * MAX_SPEED_BONUS * speedFactor);
  }

  // Determine tier
  let tier = RANK_TIERS[0];
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (xp >= RANK_TIERS[i].xpMin) {
      tier = RANK_TIERS[i];
      break;
    }
  }

  // Level within tier (1-based, up to 5 per tier)
  const nextTierIdx = RANK_TIERS.indexOf(tier) + 1;
  const nextTierXpMin =
    nextTierIdx < RANK_TIERS.length ? RANK_TIERS[nextTierIdx].xpMin : tier.xpMin * 2;
  const tierProgress = Math.max(0, Math.min(1, (xp - tier.xpMin) / Math.max(1, nextTierXpMin - tier.xpMin)));
  const level = Math.min(5, Math.max(1, Math.ceil(tierProgress * 5)));

  return {
    xp,
    tier: tier.tier,
    tierName: tier.name,
    tierEmoji: tier.emoji,
    tierColor: tier.color,
    level,
    completed,
    avg_speed_sec: avgSpeed,
  };
}

/**
 * Compute ranking for all agents, sorted by XP descending.
 * Returns a sorted list with rank positions.
 */
export function computeAgentRanking(agents, deskKanban) {
  const statsByAgent = new Map();

  // Build stats from deskKanban
  for (const agent of agents) {
    const profile = agent.profile || agent.id;
    statsByAgent.set(profile, {
      display_name: agent.displayName || profile,
      profile,
      completed: 0,
      total_time_sec: 0,
      recent_tasks: [],
    });
  }

  // Accumulate from deskKanban.by_assignee
  const byAssignee = deskKanban?.by_assignee ?? [];
  for (const bot of byAssignee) {
    const assignee = bot.assignee;
    const entry = statsByAgent.get(assignee);
    if (!entry) continue;
    const done = bot.done ?? [];
    entry.completed = done.length;
    const recent = [];
    let totalTime = 0;
    for (const task of done) {
      if (task.title) recent.push({ title: task.title });
      if (task.completed_at && task.created_at) {
        totalTime += Math.max(0, task.completed_at - task.created_at);
      }
    }
    entry.total_time_sec = totalTime;
    entry.avg_speed_sec = entry.completed > 0 ? Math.round(totalTime / entry.completed) : 0;
    entry.recent_tasks = recent.slice(-3).reverse();
  }

  // Compute ranks and sort
  const ranking = [];
  for (const [, entry] of statsByAgent) {
    if (entry.completed === 0) {
      entry.avg_speed_sec = 0;
    }
    const rank = computeRank({ completed: entry.completed, avg_speed_sec: entry.avg_speed_sec });
    ranking.push({ ...entry, ...rank });
  }

  ranking.sort((a, b) => b.xp - a.xp);

  return ranking;
}

// ── Query param flags ──────────────────────────────────────────────

export function rankEnabledFromQuery() {
  if (typeof location === "undefined") return true;
  try {
    const v = new URLSearchParams(location.search).get("rank");
    if (v == null || v === "") return true;
    return !(v === "0" || v === "false" || v === "off");
  } catch {
    return true;
  }
}

export function rankForceFromQuery() {
  if (typeof location === "undefined") return false;
  try {
    return new URLSearchParams(location.search).get("rank") === "force";
  } catch {
    return false;
  }
}

// ── In-world badge rendering (Phaser Graphics + Text) ──────────────

const BADGE_DEPTH = 23;
const BADGE_RADIUS = 7;
const BADGE_OY = -24; // offset from sprite center

/**
 * Create rank badge graphics for an agent.
 * Returns { gfx: Phaser.GameObjects.Graphics, txt: Phaser.GameObjects.Text, enabled: boolean, force: boolean }
 */
export function createRankBadge(scene) {
  const gfx = scene.add.graphics().setDepth(BADGE_DEPTH).setVisible(false);
  const txt = scene.add
    .text(0, 0, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "10px",
      color: "#fff",
      align: "center",
      stroke: "#0b1016",
      strokeThickness: 3,
    })
    .setOrigin(0.5, 0.5)
    .setDepth(BADGE_DEPTH)
    .setVisible(false);
  return {
    gfx,
    txt,
    enabled: rankEnabledFromQuery(),
    force: rankForceFromQuery(),
    _lastRank: null,
  };
}

export function destroyRankBadge(badge) {
  if (!badge) return;
  badge.gfx?.destroy();
  badge.txt?.destroy();
}

/**
 * Update rank badge position + visibility.
 * Shows the tier emoji + level number in an orbit above the nameplate.
 */
export function updateRankBadge(badge, agent) {
  if (!badge?.gfx || !badge.txt) return;

  if (!badge.enabled) {
    badge.gfx.clear();
    badge.gfx.setVisible(false);
    badge.txt.setVisible(false);
    badge._lastRank = null;
    return;
  }

  // Get rank data from agent
  const rankData = agent._rankData;
  if (!rankData || !agent?.sprite) {
    badge.gfx.clear();
    badge.gfx.setVisible(false);
    badge.txt.setVisible(false);
    badge._lastRank = null;
    return;
  }

  // Visibility: always show when force, or when running/chatting
  const status = agent.serverStatus;
  let visible = badge.force;
  if (!visible && (status === "running" || status === "chatting")) visible = true;
  if (!visible && !agent.live && (agent.currentKind === "desk" || agent.currentKind === "focus")) visible = true;

  if (status === "offline" || agent.currentKind === "sleep") visible = false;

  if (!visible) {
    badge.gfx.clear();
    badge.gfx.setVisible(false);
    badge.txt.setVisible(false);
    return;
  }

  const sx = agent.sprite.x;
  const sy = agent.sprite.y;
  const cx = sx;
  const cy = sy + BADGE_OY;
  const r = BADGE_RADIUS;

  const alpha = agent.sprite.alpha ?? 1;

  // Only redraw if rank changed
  const rankKey = `${rankData.tier}:${rankData.level}`;
  if (rankKey === badge._lastRank && badge.gfx.visible) {
    badge.gfx.setPosition(cx - r, cy - r);
    badge.gfx.setAlpha(alpha);
    badge.txt.setPosition(cx, cy);
    badge.txt.setAlpha(alpha);
    return;
  }
  badge._lastRank = rankKey;

  badge.gfx.clear();
  badge.gfx.setPosition(cx - r, cy - r);
  badge.gfx.setAlpha(alpha);
  badge.gfx.setVisible(true);

  // Draw circular badge
  badge.gfx.fillStyle(parseInt(rankData.tierColor.replace("#", ""), 16), 0.88);
  badge.gfx.fillCircle(r, r, r);
  badge.gfx.lineStyle(1.5, 0xffffff, 0.6);
  badge.gfx.strokeCircle(r, r, r);

  // Emoji as label
  badge.txt.setText(`${rankData.tierEmoji}${rankData.level}`);
  badge.txt.setPosition(cx, cy);
  badge.txt.setAlpha(alpha);
  badge.txt.setVisible(true);
}

export function hideRankBadge(badge) {
  if (!badge) return;
  badge.gfx.clear();
  badge.gfx.setVisible(false);
  badge.txt.setVisible(false);
  badge._lastRank = null;
}
