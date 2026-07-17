/** DOM overlay: Activity Timeline — chronological feed of agent events.
 *  Receives activityTimeline from BE WS snapshot and renders an auto-scrolling feed.
 *  Also tracks client-side status transitions for immediate feedback.
 */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EVENT_ICONS = {
  completed: "✅",
  responded: "💬",
  inbound: "📨",
  running: "⚡",
  started: "🔧",
  blocked: "⏸",
  idle: "☕",
  offline: "💤",
};

function formatTimeAgo(ts) {
  if (!ts) return "";
  const now = Date.now() / 1000;
  const delta = now - ts;
  if (delta < 60) return "방금";
  if (delta < 3600) return `${Math.floor(delta / 60)}분 전`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}시간 전`;
  return `${Math.floor(delta / 86400)}일 전`;
}

function formatElapsed(sec) {
  if (sec == null || sec < 0) return "";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h${m}m`;
}

export function createActivityTimeline() {
  const root = document.createElement("aside");
  root.className = "activity-timeline";
  root.innerHTML = `
    <header class="atl__head">
      <span class="atl__title">📜 활동 타임라인</span>
      <div class="atl__filters">
        <button type="button" class="atl__filter is-active" data-filter="all">전체</button>
        <button type="button" class="atl__filter" data-filter="completed">✅ 완료</button>
        <button type="button" class="atl__filter" data-filter="running">⚡ 작업</button>
        <button type="button" class="atl__filter" data-filter="responded">💬 응답</button>
      </div>
    </header>
    <div class="atl__body" data-role="body">
      <p class="atl__empty">연결 대기 중…</p>
    </div>
    <footer class="atl__foot" data-role="foot">
      <span class="atl__count" data-role="count">0 이벤트</span>
      <span class="atl__mode" data-role="mode"></span>
    </footer>
  `;
  document.body.appendChild(root);

  const elBody = root.querySelector('[data-role="body"]');
  const elCount = root.querySelector('[data-role="count"]');
  const elMode = root.querySelector('[data-role="mode"]');
  const filters = root.querySelectorAll(".atl__filter");

  let events = [];
  let activeFilter = "all";
  let lastSnapshotKey = "";
  let isOpen = false;
  let mode = "offline";
  let autoScroll = true;

  // ── Filter handling ──────────────────────────────────────

  function setFilter(name) {
    activeFilter = name;
    for (const f of filters) {
      f.classList.toggle("is-active", f.dataset.filter === name);
    }
    render();
  }

  filters.forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });

  // ── Merge server timeline with client-side transitions ───

  function mergeEvents(serverEvents, clientTransitions) {
    const merged = [...serverEvents];

    for (const t of clientTransitions) {
      // Don't duplicate if server already has a similar event at similar time
      const dup = merged.some(
        (e) =>
          e.profile === t.profile &&
          e.type === t.type &&
          Math.abs((e.ts || 0) - (t.ts || 0)) < 10
      );
      if (!dup) merged.push(t);
    }

    merged.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    // Dedup by type+profile+60s window
    const seen = new Set();
    const deduped = [];
    for (const e of merged) {
      const key = `${e.type}|${e.profile || ""}|${Math.floor((e.ts || 0) / 60)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(e);
    }
    return deduped.slice(0, 40);
  }

  // ── Client-side transition tracking ─────────────────────

  let prevAgentStatuses = {};
  let clientTransitions = [];

  function trackTransitions(agents, now) {
    if (!agents) return;
    for (const a of agents) {
      const id = a.id || a.profile;
      const prev = prevAgentStatuses[id];
      const curr = a.status;

      if (prev && prev !== curr) {
        const transition = {
          type: curr === "idle" ? "idle" : curr === "offline" ? "offline" : curr,
          ts: now,
          profile: id,
          display_name: a.displayName || id,
          text: buildTransitionText(a, prev, curr),
          task_title: a.task_title,
          task_id: a.task_id,
        };
        clientTransitions.unshift(transition);
        // Keep last 30 client transitions
        if (clientTransitions.length > 30) clientTransitions.length = 30;
      }
      prevAgentStatuses[id] = curr;
    }
  }

  function buildTransitionText(agent, prev, curr) {
    const name = agent.displayName || agent.id;
    if (curr === "running") return `${name} 작업 시작: ${agent.task_title || "—"}`;
    if (curr === "idle") return `${name} 휴식 중 ☕`;
    if (curr === "blocked") return `${name} 검토 대기`;
    if (curr === "review") return `${name} 리뷰 중`;
    if (curr === "ready") return `${name} 큐 대기`;
    if (curr === "chatting") return `${name} 응답 중…`;
    if (curr === "offline") return `${name} 오프라인`;
    return `${name} → ${curr}`;
  }

  // ── Render ───────────────────────────────────────────────

  function render() {
    const filtered =
      activeFilter === "all"
        ? events
        : events.filter((e) => e.type === activeFilter);

    if (!filtered.length) {
      elBody.innerHTML = '<p class="atl__empty">이벤트 없음</p>';
    } else {
      elBody.innerHTML = filtered
        .map((e) => {
          const icon = EVENT_ICONS[e.type] || "📌";
          const time = formatTimeAgo(e.ts);
          const elapsed = e.elapsed_sec ? ` · ${formatElapsed(e.elapsed_sec)}` : "";
          const name = escapeHtml(e.display_name || e.profile || "?");
          const text = escapeHtml(e.text || e.task_title || e.type);
          const taskTitle = e.task_title
            ? `<span class="atl__task">${escapeHtml(e.task_title)}</span>`
            : "";

          return `
            <div class="atl__event atl__event--${e.type}">
              <span class="atl__event-icon">${icon}</span>
              <div class="atl__event-body">
                <div class="atl__event-header">
                  <span class="atl__event-name">${name}</span>
                  <span class="atl__event-time">${time}${elapsed}</span>
                </div>
                <div class="atl__event-text">${text}</div>
                ${taskTitle}
              </div>
            </div>
          `;
        })
        .join("");
    }

    elCount.textContent = `${filtered.length} 이벤트`;

    // Auto-scroll to top (newest)
    if (autoScroll && elBody.scrollTop > 0) {
      elBody.scrollTop = 0;
    }
  }

  // ── Scroll tracking ──────────────────────────────────────

  elBody.addEventListener("scroll", () => {
    autoScroll = elBody.scrollTop <= 10;
  });

  // ── Public API ───────────────────────────────────────────

  function update(snapshot, opts = {}) {
    const serverEvents = snapshot?.activityTimeline || [];
    const agents = snapshot?.agents || [];
    const now = snapshot?.ts || Date.now() / 1000;

    // Track client-side transitions
    trackTransitions(agents, now);

    // Merge
    events = mergeEvents(serverEvents, clientTransitions);

    // Detect mode
    mode = opts.live ? "live" : opts.mock ? "mock" : "offline";
    elMode.textContent = mode === "live" ? "● LIVE" : mode === "mock" ? "◉ MOCK" : "○ OFFLINE";
    elMode.className = `atl__mode atl__mode--${mode}`;

    render();
  }

  function toggle() {
    isOpen = !isOpen;
    root.classList.toggle("is-open", isOpen);
    if (isOpen && autoScroll) {
      elBody.scrollTop = 0;
    }
    return isOpen;
  }

  function isPanelOpen() {
    return isOpen;
  }

  function destroy() {
    root.remove();
  }

  return {
    update,
    toggle,
    destroy,
    isOpen: isPanelOpen,
    getEvents: () => events,
  };
}
