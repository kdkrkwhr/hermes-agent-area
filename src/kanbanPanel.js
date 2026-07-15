/** DOM overlay: kanban stats + agent task list + click detail strip. */

function parseKanbanStats(raw) {
  const text = String(raw ?? "");
  const pick = (name) => {
    const m = text.match(new RegExp(`^\\s*${name}\\s+(\\d+)`, "m"));
    return m ? Number(m[1]) : 0;
  };
  return {
    running: pick("running"),
    blocked: pick("blocked"),
    ready: pick("ready"),
    done: pick("done"),
    raw: text.trim(),
  };
}

function statusLabel(status) {
  switch (status) {
    case "running":
      return "작업중";
    case "blocked":
      return "대기";
    case "offline":
      return "오프라인";
    case "idle":
      return "유휴";
    default:
      return status || "—";
  }
}

function statusClass(status) {
  if (status === "running") return "kb-running";
  if (status === "blocked") return "kb-blocked";
  if (status === "offline") return "kb-offline";
  return "kb-idle";
}

export function createKanbanPanel() {
  const root = document.createElement("aside");
  root.className = "kanban-panel";
  root.innerHTML = `
    <header class="kanban-panel__head">
      <span class="kanban-panel__title">칸반</span>
      <span class="kanban-panel__stats" data-role="stats">연결 대기…</span>
    </header>
    <ul class="kanban-panel__list" data-role="list"></ul>
    <footer class="kanban-panel__detail" data-role="detail" hidden>
      <button type="button" class="kanban-panel__close" data-role="close" aria-label="닫기">×</button>
      <div data-role="detail-body"></div>
    </footer>
  `;
  document.body.appendChild(root);

  const elStats = root.querySelector('[data-role="stats"]');
  const elList = root.querySelector('[data-role="list"]');
  const elDetail = root.querySelector('[data-role="detail"]');
  const elDetailBody = root.querySelector('[data-role="detail-body"]');
  const elClose = root.querySelector('[data-role="close"]');

  let selectedId = null;
  let lastAgents = [];

  function renderDetail(agent) {
    if (!agent) {
      elDetail.hidden = true;
      elDetailBody.innerHTML = "";
      return;
    }
    elDetail.hidden = false;
    elDetailBody.innerHTML = `
      <div class="kanban-detail__name">${escapeHtml(agent.displayName || agent.id)}</div>
      <dl class="kanban-detail__grid">
        <dt>상태</dt><dd><span class="kb-badge ${statusClass(agent.status)}">${escapeHtml(statusLabel(agent.status))}</span></dd>
        <dt>태스크</dt><dd>${escapeHtml(agent.task_title || "—")}</dd>
        <dt>ID</dt><dd><code>${escapeHtml(agent.task_id || "—")}</code></dd>
        <dt>구역</dt><dd>${escapeHtml(agent.zone || "—")}</dd>
        <dt>말풍선</dt><dd>${escapeHtml(agent.bubble || "—")}</dd>
        <dt>게이트웨이</dt><dd>${escapeHtml(agent.gateway || "—")}</dd>
        <dt>프로필</dt><dd><code>${escapeHtml(agent.profile || "—")}</code></dd>
      </dl>
    `;
  }

  function renderList(agents) {
    elList.innerHTML = "";
    for (const a of agents) {
      const li = document.createElement("li");
      li.className = `kanban-panel__row ${selectedId === a.id ? "is-selected" : ""}`;
      li.dataset.agentId = a.id;
      const title = a.task_title || a.bubble || statusLabel(a.status);
      li.innerHTML = `
        <span class="kb-badge ${statusClass(a.status)}">${escapeHtml(statusLabel(a.status))}</span>
        <span class="kanban-panel__agent">${escapeHtml(a.displayName || a.id)}</span>
        <span class="kanban-panel__task" title="${escapeAttr(title)}">${escapeHtml(title)}</span>
      `;
      li.addEventListener("click", () => toggleAgent(a.id));
      elList.appendChild(li);
    }
  }

  function toggleAgent(id) {
    if (selectedId === id) {
      selectedId = null;
      renderDetail(null);
    } else {
      selectedId = id;
      const agent = lastAgents.find((a) => a.id === id);
      renderDetail(agent || null);
    }
    renderList(lastAgents);
    lastPanelState = { ...lastPanelState, selectedId };
    return selectedId;
  }

  elClose.addEventListener("click", () => {
    selectedId = null;
    renderDetail(null);
    renderList(lastAgents);
    lastPanelState = { ...lastPanelState, selectedId: null };
  });

  let lastPanelState = { stats: { running: 0, blocked: 0 }, selectedId: null, agentCount: 0, mode: "offline" };

  function update(snapshot, { live = false, mock = false } = {}) {
    const agents = snapshot?.agents ?? [];
    lastAgents = agents.map((a) => ({ ...a }));
    const stats = parseKanbanStats(snapshot?.stats?.raw);
    const mode = live ? "live" : mock ? "mock" : "offline";
    elStats.textContent = `${mode} · running ${stats.running} · blocked ${stats.blocked}`;
    elStats.className = `kanban-panel__stats kanban-panel__stats--${mode}`;
    renderList(lastAgents);
    if (selectedId) {
      const agent = lastAgents.find((a) => a.id === selectedId);
      if (agent) renderDetail(agent);
      else {
        selectedId = null;
        renderDetail(null);
      }
    }
    lastPanelState = { stats, selectedId, agentCount: lastAgents.length, mode };
    return lastPanelState;
  }

  function destroy() {
    root.remove();
  }

  return {
    update,
    toggleAgent,
    destroy,
    getSelectedId: () => selectedId,
    getState: () => ({ ...lastPanelState, selectedId }),
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export { parseKanbanStats, statusLabel };
