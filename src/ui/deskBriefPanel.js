/** DOM overlay: CEO desk weather / news / kanban tabs. */

const PAGES_WEATHER =
  "https://kdkrkwhr.github.io/attendance-pwa/data/weather/latest.json";
const PAGES_NEWS =
  "https://kdkrkwhr.github.io/attendance-pwa/data/news/latest.json";

const TABS = [
  { id: "weather", label: "🌤 날씨" },
  { id: "news", label: "📰 뉴스" },
  { id: "kanban", label: "📋 칸반" },
];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pickNowPeriod(periods) {
  if (!Array.isArray(periods) || !periods.length) return null;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  let best = periods[0];
  for (const p of periods) {
    const [h, m = 0] = String(p.time || "0:0").split(":").map(Number);
    if (h * 60 + m <= nowMin) best = p;
    else break;
  }
  return best;
}

export { pickNowPeriod };

function newsHeadlines(news, limit = 5) {
  const items = [];
  const markets = news?.markets || {};
  for (const key of ["kr", "us", "all"]) {
    const pack = markets[key];
    const list = pack?.items || pack?.stock || [];
    for (const it of list) {
      if (it?.title) items.push(it.title);
      if (items.length >= limit) return items;
    }
  }
  if (Array.isArray(news?.items)) {
    for (const it of news.items) {
      if (it?.title) items.push(it.title);
      if (items.length >= limit) break;
    }
  }
  return items;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Prefer local BE (cron → PWA + HERMES_HOME kanban); fall back to Pages JSON. */
export async function loadDeskBrief() {
  try {
    const local = await fetchJson("/api/desk-brief");
    if (local?.weather || local?.news || local?.kanban) {
      return { ...local, source: local.source || "be" };
    }
  } catch {
    /* Pages / offline */
  }
  const [weather, news] = await Promise.all([
    fetchJson(PAGES_WEATHER).catch(() => null),
    fetchJson(PAGES_NEWS).catch(() => null),
  ]);
  return {
    weather,
    news,
    kanban: null,
    source: "pages",
  };
}

function statusBadge(status) {
  const s = String(status || "");
  return `<span class="desk-brief__badge desk-brief__badge--${escapeHtml(s)}">${escapeHtml(s)}</span>`;
}

function renderTaskList(tasks, emptyLabel) {
  if (!Array.isArray(tasks) || !tasks.length) {
    return `<p class="desk-brief__muted">${escapeHtml(emptyLabel)}</p>`;
  }
  return `<ul class="desk-brief__klist">${tasks
    .map(
      (t) =>
        `<li><span class="desk-brief__kid">${escapeHtml(t.id)}</span>${statusBadge(t.status)}<span class="desk-brief__ktitle" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span></li>`,
    )
    .join("")}</ul>`;
}

function renderKanban(kanban) {
  if (!kanban) {
    return `<p class="desk-brief__muted">로컬 BE 연결 시 HERMES_HOME 칸반이 표시됨</p>`;
  }
  if (kanban.error) {
    return `<p class="desk-brief__muted">칸반 오류: ${escapeHtml(kanban.error)}</p>`;
  }
  const groups = kanban.by_assignee || [];
  if (!groups.length) {
    return `<p class="desk-brief__muted">태스크 없음</p>`;
  }
  return groups
    .map((g) => {
      const name = g.display_name || g.assignee || "?";
      return `
        <div class="desk-brief__bot">
          <div class="desk-brief__bot-name">${escapeHtml(name)} <span class="desk-brief__muted">@${escapeHtml(g.assignee)}</span></div>
          <div class="desk-brief__bot-sec">진행</div>
          ${renderTaskList(g.active, "진행 중 없음")}
          <div class="desk-brief__bot-sec">최근 완료</div>
          ${renderTaskList(g.done, "완료 없음")}
        </div>`;
    })
    .join("");
}

export function createDeskBriefPanel(opts = {}) {
  const onPayload = typeof opts.onPayload === "function" ? opts.onPayload : null;
  const root = document.createElement("aside");
  root.className = "desk-brief";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <header class="desk-brief__head">
      <span class="desk-brief__title">🏢 대장님 사무실</span>
      <button type="button" class="desk-brief__close" data-role="close" aria-label="닫기">×</button>
    </header>
    <nav class="desk-brief__tabs" data-role="tabs" role="tablist">
      ${TABS.map(
        (t, i) =>
          `<button type="button" role="tab" class="desk-brief__tab${i === 0 ? " is-active" : ""}" data-tab="${t.id}" aria-selected="${i === 0 ? "true" : "false"}">${t.label}</button>`,
      ).join("")}
    </nav>
    <div class="desk-brief__body">
      <section class="desk-brief__pane is-active" data-pane="weather" role="tabpanel">
        <p class="desk-brief__muted">불러오는 중…</p>
      </section>
      <section class="desk-brief__pane" data-pane="news" role="tabpanel" hidden>
        <p class="desk-brief__muted">불러오는 중…</p>
      </section>
      <section class="desk-brief__pane" data-pane="kanban" role="tabpanel" hidden>
        <p class="desk-brief__muted">불러오는 중…</p>
      </section>
    </div>
    <footer class="desk-brief__foot" data-role="foot"></footer>
  `;
  document.body.appendChild(root);

  const elWeather = root.querySelector('[data-pane="weather"]');
  const elNews = root.querySelector('[data-pane="news"]');
  const elKanban = root.querySelector('[data-pane="kanban"]');
  const elFoot = root.querySelector('[data-role="foot"]');
  const elClose = root.querySelector('[data-role="close"]');
  const elTabs = root.querySelectorAll("[data-tab]");

  let open = false;
  let loading = false;
  let lastPayload = null;
  let activeTab = "weather";

  function setTab(tabId) {
    activeTab = tabId;
    for (const btn of elTabs) {
      const on = btn.getAttribute("data-tab") === tabId;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    }
    for (const pane of root.querySelectorAll("[data-pane]")) {
      const on = pane.getAttribute("data-pane") === tabId;
      pane.classList.toggle("is-active", on);
      pane.hidden = !on;
    }
  }

  function render(payload) {
    lastPayload = payload;
    onPayload?.(payload);
    const w = payload?.weather;
    const period = pickNowPeriod(w?.periods);
    const temp = period?.temp ?? w?.highlights?.tempMax ?? "—";
    const sky = period?.sky || "—";
    const pop = period?.pop;
    const loc = w?.location || "DMC";
    const humidity =
      period?.reh ?? period?.humidity ?? w?.humidity ?? (pop != null ? null : "—");

    elWeather.innerHTML = `
      <div class="desk-brief__weather-main">${escapeHtml(loc)} ${escapeHtml(temp)}°C</div>
      <div>${escapeHtml(sky)}</div>
      ${
        humidity != null
          ? `<div>습도 ${escapeHtml(humidity)}%</div>`
          : pop != null
            ? `<div>강수확률 ${escapeHtml(pop)}%</div>`
            : ""
      }
      ${w?.summary ? `<p class="desk-brief__summary">${escapeHtml(w.summary)}</p>` : ""}
    `;

    const lines = newsHeadlines(payload?.news, 5);
    elNews.innerHTML = lines.length
      ? `<ul class="desk-brief__list">${lines
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join("")}</ul>`
      : `<p class="desk-brief__muted">뉴스 없음</p>`;

    elKanban.innerHTML = renderKanban(payload?.kanban);

    const src = payload?.source || "—";
    const wAt = w?.generatedAt || w?.date || "";
    const nAt = payload?.news?.generatedAt || payload?.news?.date || "";
    const bots = payload?.kanban?.by_assignee?.length ?? 0;
    elFoot.textContent = `source:${src}${wAt ? ` · weather ${wAt}` : ""}${nAt ? ` · news ${nAt}` : ""}${bots ? ` · kanban ${bots}bots` : ""}`;
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const data = await loadDeskBrief();
      render(data);
    } catch (e) {
      elWeather.innerHTML = `<p class="desk-brief__muted">로드 실패</p>`;
      elNews.innerHTML = `<p class="desk-brief__muted">${escapeHtml(e.message || e)}</p>`;
      elKanban.innerHTML = `<p class="desk-brief__muted">칸반 로드 실패</p>`;
    } finally {
      loading = false;
    }
  }

  /** Merge WS deskKanban into open panel without full weather reload. */
  function applyWsKanban(deskKanban) {
    if (!deskKanban || !open) return;
    if (!lastPayload) lastPayload = { source: "ws" };
    lastPayload = { ...lastPayload, kanban: deskKanban };
    elKanban.innerHTML = renderKanban(deskKanban);
    const bots = deskKanban?.by_assignee?.length ?? 0;
    if (elFoot && bots) {
      const base = elFoot.textContent.replace(/ · kanban \d+bots/, "");
      elFoot.textContent = `${base} · kanban ${bots}bots`;
    }
  }

  function setOpen(next) {
    open = !!next;
    root.hidden = !open;
    root.setAttribute("aria-hidden", open ? "false" : "true");
    root.classList.toggle("is-open", open);
    if (open) void refresh();
  }

  elClose.addEventListener("click", (ev) => {
    ev.stopPropagation();
    setOpen(false);
  });

  for (const btn of elTabs) {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setTab(btn.getAttribute("data-tab"));
    });
  }

  return {
    get open() {
      return open;
    },
    get activeTab() {
      return activeTab;
    },
    get lastPayload() {
      return lastPayload;
    },
    show: () => setOpen(true),
    hide: () => setOpen(false),
    toggle() {
      setOpen(!open);
      return open;
    },
    refresh,
    applyWsKanban,
    setTab,
    root,
  };
}
