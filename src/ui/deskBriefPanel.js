/** DOM overlay: CEO desk weather + news (PWA cron JSON). */

const PAGES_WEATHER =
  "https://kdkrkwhr.github.io/attendance-pwa/data/weather/latest.json";
const PAGES_NEWS =
  "https://kdkrkwhr.github.io/attendance-pwa/data/news/latest.json";

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

/** Prefer local BE (cron → PWA files); fall back to Pages JSON. */
export async function loadDeskBrief() {
  try {
    const local = await fetchJson("/api/desk-brief");
    if (local?.weather || local?.news) return { ...local, source: local.source || "be" };
  } catch {
    /* Pages / offline */
  }
  const [weather, news] = await Promise.all([
    fetchJson(PAGES_WEATHER).catch(() => null),
    fetchJson(PAGES_NEWS).catch(() => null),
  ]);
  return { weather, news, source: "pages" };
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
    <div class="desk-brief__body">
      <section class="desk-brief__col desk-brief__col--weather" data-role="weather">
        <h3>🌤 날씨</h3>
        <p class="desk-brief__muted">불러오는 중…</p>
      </section>
      <section class="desk-brief__col desk-brief__col--news" data-role="news">
        <h3>📰 뉴스</h3>
        <p class="desk-brief__muted">불러오는 중…</p>
      </section>
    </div>
    <footer class="desk-brief__foot" data-role="foot"></footer>
  `;
  document.body.appendChild(root);

  const elWeather = root.querySelector('[data-role="weather"]');
  const elNews = root.querySelector('[data-role="news"]');
  const elFoot = root.querySelector('[data-role="foot"]');
  const elClose = root.querySelector('[data-role="close"]');

  let open = false;
  let loading = false;
  let lastPayload = null;

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
      <h3>🌤 날씨</h3>
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
    elNews.innerHTML = `
      <h3>📰 뉴스</h3>
      ${
        lines.length
          ? `<ul class="desk-brief__list">${lines
              .map((t) => `<li>${escapeHtml(t)}</li>`)
              .join("")}</ul>`
          : `<p class="desk-brief__muted">뉴스 없음</p>`
      }
    `;

    const src = payload?.source || "—";
    const wAt = w?.generatedAt || w?.date || "";
    const nAt = payload?.news?.generatedAt || payload?.news?.date || "";
    elFoot.textContent = `source:${src}${wAt ? ` · weather ${wAt}` : ""}${nAt ? ` · news ${nAt}` : ""}`;
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const data = await loadDeskBrief();
      render(data);
    } catch (e) {
      elWeather.innerHTML = `<h3>🌤 날씨</h3><p class="desk-brief__muted">로드 실패</p>`;
      elNews.innerHTML = `<h3>📰 뉴스</h3><p class="desk-brief__muted">${escapeHtml(e.message || e)}</p>`;
    } finally {
      loading = false;
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

  return {
    get open() {
      return open;
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
    root,
  };
}
