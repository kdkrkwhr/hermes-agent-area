/** DOM overlay: CEO desk weather + news, two-column card layout with WebSocket live updates. */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── weather helpers ──────────────────────────────────────────────

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

function weatherIcon(skyCode) {
  const c = String(skyCode ?? "");
  if (c === "1") return "☀️";
  if (c === "2") return "⛅";
  if (c === "3") return "☁️";
  if (c === "4") return "☁️";
  return "🌤️";
}

function rainIcon(pty) {
  const c = String(pty ?? "");
  if (c === "1") return "🌧️";
  if (c === "2") return "🌧️";
  if (c === "3") return "❄️";
  if (c === "4") return "🌦️";
  if (c === "5") return "🌧️";
  if (c === "6") return "🌨️";
  if (c === "7") return "❄️";
  return "";
}

// ── news helpers ──────────────────────────────────────────────────

function newsHeadlines(news, limit = 8) {
  const items = [];
  const markets = news?.markets || {};
  for (const key of ["kr", "us", "all"]) {
    const pack = markets[key];
    const list = pack?.items || pack?.stock || [];
    for (const it of list) {
      if (it?.title) items.push({ title: it.title, link: it.link || "" });
      if (items.length >= limit) return items;
    }
  }
  if (Array.isArray(news?.items)) {
    for (const it of news.items) {
      if (it?.title) items.push({ title: it.title, link: it.link || "" });
      if (items.length >= limit) break;
    }
  }
  return items;
}

// ── HTTP fallback (backward compat for weatherFx.js) ──────────────

const PAGES_WEATHER =
  "https://kdkrkwhr.github.io/attendance-pwa/data/weather/latest.json";
const PAGES_NEWS =
  "https://kdkrkwhr.github.io/attendance-pwa/data/news/latest.json";

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

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

export { pickNowPeriod, newsHeadlines };

// ── create panel ──────────────────────────────────────────────────

export function createDeskBriefPanel(opts = {}) {
  const onPayload = typeof opts.onPayload === "function" ? opts.onPayload : null;

  const root = document.createElement("aside");
  root.className = "desk-brief-panel";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <header class="dbp__head">
      <span class="dbp__title">🏢 대장님 사무실</span>
      <button type="button" class="dbp__close" data-role="close" aria-label="닫기">×</button>
    </header>
    <div class="dbp__body">
      <div class="dbp__col dbp__col--weather">
        <div class="dbp__card dbp__card--weather">
          <div class="dbp__card-head">🌤 날씨 · 서울</div>
          <div class="dbp__card-body" data-pane="weather">
            <p class="dbp__muted">연결 대기 중…</p>
          </div>
        </div>
      </div>
      <div class="dbp__col dbp__col--news">
        <div class="dbp__card dbp__card--news">
          <div class="dbp__card-head">📰 뉴스</div>
          <div class="dbp__card-body" data-pane="news">
            <p class="dbp__muted">연결 대기 중…</p>
          </div>
        </div>
      </div>
    </div>
    <footer class="dbp__foot" data-role="foot"></footer>
  `;
  document.body.appendChild(root);

  const elWeather = root.querySelector('[data-pane="weather"]');
  const elNews = root.querySelector('[data-pane="news"]');
  const elFoot = root.querySelector('[data-role="foot"]');
  const elClose = root.querySelector('[data-role="close"]');

  let open = false;
  let lastPayload = null;
  let ws = null;
  let wsReconnectTimer = null;

  // ── render ────────────────────────────────────────────────

  function renderWeather(w) {
    if (!w) {
      elWeather.innerHTML = '<p class="dbp__muted">날씨 데이터 없음</p>';
      return;
    }
    const period = pickNowPeriod(w.periods);
    const temp = period?.temp ?? w?.highlights?.tempMax ?? "—";
    const sky = period?.sky ?? w?.sky ?? "—";
    const pty = period?.pty ?? w?.pty;
    const pop = period?.pop ?? w?.pop;
    const humidity = period?.reh ?? period?.humidity ?? w?.reh ?? w?.humidity;

    const icons = [
      weatherIcon(period?.skyCode ?? period?.SKY),
      rainIcon(pty),
    ]
      .filter(Boolean)
      .join(" ");

    const parts = [];
    parts.push(
      '<div class="dbp__weather-main">' + icons + ' <span class="dbp__weather-temp">' + escapeHtml(temp) + '°C</span></div>'
    );
    parts.push('<div class="dbp__weather-detail">' + escapeHtml(sky) + '</div>');
    if (humidity != null) {
      parts.push(
        '<div class="dbp__weather-detail">💧 습도 ' + escapeHtml(humidity) + '%</div>'
      );
    }
    if (pop != null) {
      parts.push(
        '<div class="dbp__weather-detail">🌂 강수확률 ' + escapeHtml(pop) + '%</div>'
      );
    }
    if (w?.summary) {
      parts.push(
        '<p class="dbp__weather-summary">' + escapeHtml(w.summary) + '</p>'
      );
    }
    elWeather.innerHTML = parts.join("");
  }

  function renderNews(n) {
    const headlines = newsHeadlines(n, 8);
    if (!headlines.length) {
      elNews.innerHTML = '<p class="dbp__muted">뉴스 없음</p>';
      return;
    }
    elNews.innerHTML =
      '<ul class="dbp__news-list">' +
      headlines
        .map(function (h) {
          var title = escapeHtml(h.title);
          if (h.link) {
            return '<li><a href="' + escapeHtml(h.link) + '" target="_blank" rel="noopener">' + title + '</a></li>';
          }
          return '<li>' + title + '</li>';
        })
        .join("") +
      '</ul>';
  }

  function render(payload) {
    lastPayload = payload;
    onPayload?.(payload);

    renderWeather(payload?.weather);
    renderNews(payload?.news);

    var wAt = payload?.weather?.generatedAt || payload?.weather?.date || payload?.generated_at || "";
    var nAt = payload?.news?.generatedAt || payload?.news?.date || "";
    var src = payload?.source || (wAt || nAt ? "ws" : "—");
    elFoot.textContent =
      "source:" + src +
      (wAt ? " · weather " + (typeof wAt === "number" ? new Date(wAt * 1000).toLocaleString() : wAt) : "") +
      (nAt ? " · news " + (typeof nAt === "number" ? new Date(nAt * 1000).toLocaleString() : nAt) : "");
  }

  function setLoading(msg) {
    elWeather.innerHTML = '<p class="dbp__muted">' + escapeHtml(msg || "불러오는 중…") + '</p>';
    elNews.innerHTML = '<p class="dbp__muted">' + escapeHtml(msg || "불러오는 중…") + '</p>';
  }

  // ── WebSocket ─────────────────────────────────────────────

  function resolveWsUrl() {
    var h = location.hostname || "localhost";
    var port = new URLSearchParams(location.search).get("port") || "8765";
    return "ws://" + h + ":" + port + "/ws/desk-brief";
  }

  function connectWs() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      ws = new WebSocket(resolveWsUrl());
    } catch (e) {
      setLoading("WebSocket 연결 실패");
      scheduleWsReconnect();
      return;
    }

    ws.onopen = function () {
      if (open) setLoading("데이터 수신 중…");
    };

    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === "desk-brief") {
          render({
            weather: msg.weather,
            news: msg.news,
            generated_at: msg.generated_at,
            source: "ws",
          });
        }
      } catch (e) {
        /* ignore malformed */
      }
    };

    ws.onclose = function () {
      ws = null;
      if (open) scheduleWsReconnect();
    };

    ws.onerror = function () {
      try { ws?.close(); } catch (e) {}
      ws = null;
      if (open) scheduleWsReconnect();
    };
  }

  function scheduleWsReconnect() {
    if (wsReconnectTimer) return;
    wsReconnectTimer = window.setTimeout(function () {
      wsReconnectTimer = null;
      if (open) connectWs();
    }, 5000);
  }

  function disconnectWs() {
    if (wsReconnectTimer) {
      window.clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    try { ws?.close(); } catch (e) {}
    ws = null;
  }

  // ── open / close ──────────────────────────────────────────

  function setOpen(next) {
    var prev = open;
    open = !!next;
    root.hidden = !open;
    root.setAttribute("aria-hidden", open ? "false" : "true");
    root.classList.toggle("is-open", open);

    if (open && !prev) {
      setLoading("연결 중…");
      connectWs();
    }
    if (!open) {
      disconnectWs();
    }
  }

  elClose.addEventListener("click", function (ev) {
    ev.stopPropagation();
    setOpen(false);
  });

  // ── public API ────────────────────────────────────────────

  return {
    get open() { return open; },
    get lastPayload() { return lastPayload; },
    show: function () { setOpen(true); },
    hide: function () { setOpen(false); },
    toggle: function () { setOpen(!open); return open; },
    reconnectWs: function () { disconnectWs(); if (open) connectWs(); },
    root: root,
  };
}
