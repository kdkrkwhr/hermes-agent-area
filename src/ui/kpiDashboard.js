/** KPI Dashboard: real-time agent productivity metrics panel.
 *  Renders inside the CEO desk brief panel as a tab. */

import { computeRank, computeAgentRanking } from "../effects/agentRankXP.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── animated counter ──────────────────────────────────────────────

const _animations = new Map(); // key → { raf, startVal, targetVal, startTs, el }

function animateCounter(key, el, targetVal, durationMs = 800) {
  const existing = _animations.get(key);
  if (existing) {
    existing.targetVal = targetVal;
    existing.startVal = parseFloat(el.textContent.replace(/[^0-9.]/g, "")) || 0;
    existing.startTs = performance.now();
    return;
  }

  const startVal = parseFloat(el.textContent.replace(/[^0-9.]/g, "")) || 0;

  function tick(now) {
    const state = _animations.get(key);
    if (!state) return;
    const elapsed = now - state.startTs;
    const progress = Math.min(1, elapsed / durationMs);
    // ease-out quad
    const eased = 1 - (1 - progress) * (1 - progress);
    const current = state.startVal + (state.targetVal - state.startVal) * eased;
    el.textContent = state.formatter ? state.formatter(current) : Math.round(current).toLocaleString();
    if (progress < 1) {
      state.raf = requestAnimationFrame(tick);
    } else {
      el.textContent = state.formatter ? state.formatter(state.targetVal) : Math.round(state.targetVal).toLocaleString();
      _animations.delete(key);
    }
  }

  const raf = requestAnimationFrame(tick);
  _animations.set(key, { raf, startVal, targetVal, startTs: performance.now(), el, formatter: null });
}

function setCounterFormatter(key, fn) {
  const a = _animations.get(key);
  if (a) a.formatter = fn;
}

// ── render functions ──────────────────────────────────────────────

/** Expected kpi payload shape:
 *  {
 *    total_completed: number,
 *    completion_rate: number (0-100),
 *    avg_response_sec: number,
 *    active_agents: number,
 *    total_agents: number,
 *    agent_ranking: [{ profile, display_name, completed, avg_speed_sec, recent_tasks: [...] }],
 *    weekly: { completed: number, avg_speed_sec: number },
 *    generated_at: string / unix ts,
 *  }
 */

function renderKpiCards(container, kpi, prevKpi) {
  const totalCompleted = kpi?.total_completed ?? 0;
  const completionRate = kpi?.completion_rate ?? 0;
  const avgResponse = kpi?.avg_response_sec ?? 0;
  const activeAgents = kpi?.active_agents ?? 0;
  const totalAgents = kpi?.total_agents ?? 0;

  const avgResponseDisplay = avgResponse < 60
    ? `${Math.round(avgResponse)}s`
    : avgResponse < 3600
      ? `${Math.round(avgResponse / 60)}m`
      : `${(avgResponse / 3600).toFixed(1)}h`;

  const weeklyCompleted = kpi?.weekly?.completed ?? 0;

  let html = '<div class="kpi-cards">';

  // Card 1: Total Completed
  html += `<div class="kpi-card">
    <div class="kpi-card__icon">✅</div>
    <div class="kpi-card__value" data-kpi="total-completed">${totalCompleted.toLocaleString()}</div>
    <div class="kpi-card__label">총 완료 태스크</div>
    <div class="kpi-card__sub">이번 주 +${weeklyCompleted}</div>
  </div>`;

  // Card 2: Completion Rate
  html += `<div class="kpi-card">
    <div class="kpi-card__icon">📊</div>
    <div class="kpi-card__value" data-kpi="completion-rate">${completionRate.toFixed(1)}%</div>
    <div class="kpi-card__label">완료율</div>
    <div class="kpi-card__bar-bg"><div class="kpi-card__bar-fill" style="width:${Math.min(100, completionRate)}%"></div></div>
  </div>`;

  // Card 3: Avg Response Time
  const speedClass = avgResponse < 30 ? 'is-fast' : avgResponse < 120 ? 'is-mid' : 'is-slow';
  html += `<div class="kpi-card">
    <div class="kpi-card__icon">⚡</div>
    <div class="kpi-card__value ${speedClass}" data-kpi="avg-response">${avgResponseDisplay}</div>
    <div class="kpi-card__label">평균 응답 시간</div>
  </div>`;

  // Card 4: Active / Total Agents
  html += `<div class="kpi-card">
    <div class="kpi-card__icon">🤖</div>
    <div class="kpi-card__value" data-kpi="active-agents">${activeAgents}<span class="kpi-card__value-dim">/${totalAgents}</span></div>
    <div class="kpi-card__label">활성 에이전트</div>
    <div class="kpi-card__bar-bg"><div class="kpi-card__bar-fill kpi-card__bar-fill--blue" style="width:${totalAgents ? Math.round((activeAgents / totalAgents) * 100) : 0}%"></div></div>
  </div>`;

  html += '</div>';

  container.innerHTML = html;
}

function renderAgentRanking(container, kpi) {
  const ranking = kpi?.agent_ranking ?? [];
  if (!ranking.length) {
    container.innerHTML = '<p class="dbp__muted">랭킹 데이터 없음</p>';
    return;
  }

  const sorted = [...ranking].sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));

  let html = '<div class="kpi-ranking">';
  html += '<div class="dbp__card-head">🏆 에이전트 생산성 랭킹</div>';

  for (let i = 0; i < Math.min(sorted.length, 8); i++) {
    const agent = sorted[i];
    const rank = i + 1;
    let medal = '';
    if (rank === 1) medal = '';
    else if (rank === 2) medal = '';
    else if (rank === 3) medal = '';
    else medal = `#${rank}`;

    const completed = agent.completed ?? 0;
    const avgSpeed = agent.avg_speed_sec ?? 0;
    const speedDisplay = avgSpeed < 60
      ? `${Math.round(avgSpeed)}s`
      : avgSpeed < 3600
        ? `${Math.round(avgSpeed / 60)}m`
        : `${(avgSpeed / 3600).toFixed(1)}h`;
    const recentTitles = (agent.recent_tasks ?? []).slice(0, 2).map(t => t.title || t.id || '').filter(Boolean).join(', ');

    // XP/rank badge
    const tierEmoji = agent.tierEmoji || '';
    const tierName = agent.tierName || '';
    const level = agent.level ?? 1;
    const xp = agent.xp ?? 0;

    html += `<div class="kpi-rank-row">
      <span class="kpi-rank__pos">${medal}${rank}</span>
      <span class="kpi-rank__name">
        <span class="kpi-rank__tier" style="color:${escapeHtml(agent.tierColor || '#888')}" title="${escapeHtml(tierName)} Lv${level} · ${xp}XP">${tierEmoji}${tierName} Lv${level}</span>
        ${escapeHtml(agent.display_name || agent.profile || '—')}
      </span>
      <span class="kpi-rank__stat">✅ ${completed}</span>
      <span class="kpi-rank__speed">⚡ ${speedDisplay}</span>
      ${recentTitles ? `<span class="kpi-rank__recent" title="${escapeHtml(recentTitles)}">${escapeHtml(recentTitles)}</span>` : ''}
    </div>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

function renderSpeedGauge(container, kpi) {
  const avgSec = kpi?.avg_response_sec ?? 0;
  const maxSec = 300; // 5-minute cap for gauge
  const pct = Math.min(100, Math.max(0, ((maxSec - avgSec) / maxSec) * 100));
  const avgDisplay = avgSec < 60
    ? `${Math.round(avgSec)}s`
    : avgSec < 3600
      ? `${Math.round(avgSec / 60)}m`
      : `${(avgSec / 3600).toFixed(1)}h`;

  let speedLabel = '보통';
  if (avgSec < 15) speedLabel = '매우 빠름';
  else if (avgSec < 30) speedLabel = '빠름';
  else if (avgSec < 120) speedLabel = '보통';
  else speedLabel = '느림';

  let html = '<div class="kpi-gauge-section">';
  html += '<div class="dbp__card-head">⏱ 응답 속도 게이지</div>';
  html += `<div class="kpi-gauge">
    <div class="kpi-gauge__ring">
      <svg viewBox="0 0 120 120" class="kpi-gauge__svg">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#2a3a4a" stroke-width="10"/>
        <circle cx="60" cy="60" r="50" fill="none" stroke="#6ecfba" stroke-width="10"
          stroke-dasharray="${(pct * 314) / 100} 314"
          stroke-dashoffset="0"
          stroke-linecap="round"
          transform="rotate(-90 60 60)"
          class="kpi-gauge__arc"/>
      </svg>
      <div class="kpi-gauge__center">
        <div class="kpi-gauge__value">${avgDisplay}</div>
        <div class="kpi-gauge__label">${speedLabel}</div>
      </div>
    </div>
  </div>`;

  // Weekly vs overall comparison
  const weeklySec = kpi?.weekly?.avg_speed_sec;
  if (weeklySec != null) {
    const weeklyDisplay = weeklySec < 60 ? `${Math.round(weeklySec)}s` : `${Math.round(weeklySec / 60)}m`;
    const trend = weeklySec <= avgSec ? '📈 개선' : '📉 둔화';
    html += `<div class="kpi-gauge__trend">주간 평균: ${weeklyDisplay} (${trend})</div>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

/** Build complete KPI pane HTML structure (called once on init). */
export function buildKpiPane() {
  return `
    <div class="kpi-dashboard">
      <div class="kpi-section" data-kpi-section="cards"></div>
      <div class="kpi-grid">
        <div class="kpi-grid__left" data-kpi-section="ranking"></div>
        <div class="kpi-grid__right" data-kpi-section="gauge"></div>
      </div>
    </div>
  `;
}

/** Render all KPI sections into their containers. */
export function renderKpi(container, kpi, prevKpi) {
  const cardsEl = container.querySelector('[data-kpi-section="cards"]');
  const rankingEl = container.querySelector('[data-kpi-section="ranking"]');
  const gaugeEl = container.querySelector('[data-kpi-section="gauge"]');

  if (cardsEl) renderKpiCards(cardsEl, kpi, prevKpi);
  if (rankingEl) renderAgentRanking(rankingEl, kpi);
  if (gaugeEl) renderSpeedGauge(gaugeEl, kpi);
}

/** Build mock KPI data for GitHub Pages demo — uses ranking engine. */
export function buildMockKpi() {
  const now = Date.now() / 1000;

  // 3 mock agents with completion data
  const mockAgents = [
    { profile: "default", displayName: "양파쿵야" },
    { profile: "profile-2", displayName: "버섯쿵야" },
    { profile: "profile-3", displayName: "클로드" },
  ];

  const mockKanban = {
    by_assignee: [
      {
        assignee: "default",
        display_name: "양파쿵야",
        active: [],
        done: [
          { title: "가상사무실: 대장님 사무실 KPI 대시보드", completed_at: now - 45, created_at: now - 2400 },
          { title: "TOD ambient BGM filter/rate morph", completed_at: now - 3400, created_at: now - 7200 },
          { title: "데스크 브리프 패널 2컬럼 레이아웃", completed_at: now - 9400, created_at: now - 18000 },
        ],
      },
      {
        assignee: "profile-2",
        display_name: "버섯쿵야",
        active: [],
        done: [
          { title: "가상사무실: 실적 진열장 & 칸반 패널", completed_at: now - 5400, created_at: now - 9900 },
          { title: "PWA 출퇴근 자동화 개선", completed_at: now - 12000, created_at: now - 22000 },
        ],
      },
      {
        assignee: "profile-3",
        display_name: "클로드",
        active: [],
        done: [
          { title: "리뷰 코멘트 triage", completed_at: now - 12400, created_at: now - 18800 },
        ],
      },
    ],
  };

  const ranking = computeAgentRanking(mockAgents, mockKanban);

  const totalCompleted = ranking.reduce((sum, a) => sum + (a.completed ?? 0), 0);
  const avgSpeed = ranking.filter(a => a.avg_speed_sec > 0).reduce((sum, a, _, arr) => sum + (a.avg_speed_sec / arr.length), 0);
  const weeklyCompleted = 3; // demo: pretend this week

  return {
    total_completed: totalCompleted,
    completion_rate: totalCompleted > 0 ? 78.4 : 0,
    avg_response_sec: Math.round(avgSpeed || 42),
    active_agents: ranking.filter(a => a.completed > 0).length,
    total_agents: ranking.length,
    agent_ranking: ranking,
    weekly: {
      completed: weeklyCompleted,
      avg_speed_sec: Math.round(avgSpeed || 38),
    },
    generated_at: now,
    source: "demo",
  };
}
