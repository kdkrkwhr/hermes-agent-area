/** DOM overlay: CEO desk 4-tab bookmark panel — weather/news, stock, kanban, files.
 *  WebSocket live updates from local BE; mock data fallback for GitHub Pages. */

import { buildKpiPane, buildMockKpi, renderKpi } from "./kpiDashboard.js";

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

function newsHeadlines(news, limit) {
  limit = limit || 8;
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
    if (local?.weather || local?.news || local?.stock || local?.kanban || local?.kpi || local?.files) {
      return { ...local, source: local.source || "be" };
    }
  } catch {
    /* Pages / offline */
  }
  // Pages fallback
  try {
    const [weather, news] = await Promise.all([
      fetchJson(PAGES_WEATHER).catch(() => null),
      fetchJson(PAGES_NEWS).catch(() => null),
    ]);
    return {
      weather,
      news,
      stock: null,
      kanban: null,
      files: null,
      source: "pages",
    };
  } catch {
    return { weather: null, news: null, stock: null, kanban: null, files: null, source: "empty" };
  }
}

export { pickNowPeriod, newsHeadlines };

// ── demo / mock data ──────────────────────────────────────────────

function buildMockPayload() {
  return {
    weather: {
      periods: [{ time: "14:00", temp: 26, sky: "맑음", skyCode: "1", reh: 60, pop: 10 }],
      highlights: { tempMax: 28, tempMin: 21 },
      summary: "오늘은 대체로 맑고 따뜻한 날씨가 예상됩니다. 미세먼지 보통.",
      generatedAt: "2026-07-16T09:00:00",
      source: "demo",
    },
    news: {
      items: [
        { title: "OpenAI, GPT-5 개발 로드맵 공개… 추론 능력 대폭 강화", link: "#" },
        { title: "삼성전자, 차세대 HBM4 메모리 양산 돌입", link: "#" },
        { title: "미 연준, 9월 금리 인하 시사… 시장 환호", link: "#" },
        { title: "애플 비전 프로 2세대, 내년 상반기 출시 전망", link: "#" },
        { title: "한국은행, GDP 성장률 전망치 상향 조정", link: "#" },
      ],
      generatedAt: "2026-07-16T09:00:00",
      source: "demo",
    },
    stock: {
      kospi: { index: "2,850.42", change: "+1.24%", status: "up" },
      kosdaq: { index: "842.18", change: "+0.67%", status: "up" },
      watchlist: [
        { name: "삼성전자", code: "005930", price: "78,500", change: "+2.3%", status: "up" },
        { name: "SK하이닉스", code: "000660", price: "192,000", change: "-0.8%", status: "down" },
        { name: "NAVER", code: "035420", price: "212,500", change: "+1.5%", status: "up" },
      ],
      generatedAt: "2026-07-16T09:00:00",
      source: "demo",
    },
    kanban: {
      by_assignee: [
        {
          assignee: "nous-work", display_name: "버섯쿵야",
          active: [{ id: "t_001", title: "가상사무실: 회장실 + 데스크탑 패널", status: "running" }],
          done: [
            { id: "t_002", title: "크론 아웃풋 모니터링 서비스", status: "done" },
            { id: "t_003", title: "CEO 사무실 검토", status: "done" },
          ],
        },
        {
          assignee: "default", display_name: "양파쿵야",
          active: [{ id: "t_004", title: "PWA 출퇴근 자동화 개선", status: "running" }],
          done: [
            { id: "t_005", title: "데스크 브리프 패널 2컬럼 레이아웃", status: "done" },
          ],
        },
      ],
      source: "demo",
    },
    files: {
      root: "D:\\develop\\e2e\\hermes",
      tree: {
        name: "hermes",
        type: "dir",
        children: [
          {
            name: "skills", type: "dir",
            children: [
              { name: "software-development", type: "dir", children: [
                { name: "hermes-agent-area", type: "dir", children: [
                  { name: "SKILL.md", type: "file", size: 3500, ext: ".md", preview: true },
                ]},
              ]},
            ],
          },
          {
            name: "profiles", type: "dir",
            children: [
              { name: "nous-work", type: "dir", children: [
                { name: "SOUL.md", type: "file", size: 1200, ext: ".md", preview: true },
                { name: "config.yaml", type: "file", size: 800, ext: ".yaml", preview: true },
              ]},
            ],
          },
          { name: "kanban.db", type: "file", size: 50000, ext: ".db", preview: false },
          { name: "config.yaml", type: "file", size: 1200, ext: ".yaml", preview: true },
        ],
      },
      source: "demo",
    },
    kpi: buildMockKpi(),
    source: "demo",
  };
}

// ── create panel ──────────────────────────────────────────────────

export function createDeskBriefPanel(opts) {
  opts = opts || {};
  const onPayload = typeof opts.onPayload === "function" ? opts.onPayload : null;

  const root = document.createElement("aside");
  root.className = "desk-brief-panel";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <header class="dbp__head">
      <span class="dbp__title">🏢 대장님 사무실</span>
      <span class="dbp__badge" data-role="badge" style="display:none">데모 모드</span>
      <button type="button" class="dbp__close" data-role="close" aria-label="닫기">×</button>
    </header>
    <div class="dbp__body">
      <nav class="dbp__tabs" data-role="tabbar">
        <button class="dbp__tab is-active" data-tab="weather">📰<br>뉴스·날씨</button>
        <button class="dbp__tab" data-tab="stock">📊<br>주식</button>
        <button class="dbp__tab" data-tab="kanban">📋<br>칸반</button>
        <button class="dbp__tab" data-tab="files">💻<br>내PC</button>
        <button class="dbp__tab" data-tab="kpi">📊<br>KPI</button>
      </nav>
      <div class="dbp__content" data-role="content">
        <!-- weather/news pane -->
        <div class="dbp__pane is-active" data-pane="weather">
          <div class="dbp__col dbp__col--weather">
            <div class="dbp__card dbp__card--weather">
              <div class="dbp__card-head">🌤 날씨 · 서울</div>
              <div class="dbp__card-body" data-pane-content="weather">
                <p class="dbp__muted">연결 대기 중…</p>
              </div>
            </div>
          </div>
          <div class="dbp__col dbp__col--news">
            <div class="dbp__card dbp__card--news">
              <div class="dbp__card-head">📰 뉴스</div>
              <div class="dbp__card-body" data-pane-content="news">
                <p class="dbp__muted">연결 대기 중…</p>
              </div>
            </div>
          </div>
        </div>
        <!-- stock pane -->
        <div class="dbp__pane" data-pane="stock">
          <div class="dbp__card dbp__card--stock">
            <div class="dbp__card-head">📊 주식 시황</div>
            <div class="dbp__card-body" data-pane-content="stock">
              <p class="dbp__muted">연결 대기 중…</p>
            </div>
          </div>
        </div>
        <!-- kanban pane -->
        <div class="dbp__pane" data-pane="kanban">
          <div class="dbp__card dbp__card--kanban">
            <div class="dbp__card-head">📋 칸반 보드</div>
            <div class="dbp__card-body" data-pane-content="kanban">
              <p class="dbp__muted">연결 대기 중…</p>
            </div>
          </div>
        </div>
        <!-- files pane -->
        <div class="dbp__pane" data-pane="files">
          <div class="dbp__files-layout">
            <div class="dbp__files-tree" data-role="files-tree">
              <p class="dbp__muted">폴더 로딩 중…</p>
            </div>
            <div class="dbp__files-preview" data-role="files-preview">
              <p class="dbp__muted">파일을 선택하세요</p>
            </div>
          </div>
        </div>
        <!-- kpi pane -->
        <div class="dbp__pane" data-pane="kpi">
          <div class="dbp__card dbp__card--kpi">
            <div data-pane-content="kpi">
              <p class="dbp__muted">연결 대기 중…</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    <footer class="dbp__foot" data-role="foot"></footer>
  `;
  document.body.appendChild(root);

  // ── element refs ──────────────────────────────────────────

  const elFoot = root.querySelector('[data-role="foot"]');
  const elClose = root.querySelector('[data-role="close"]');
  const elBadge = root.querySelector('[data-role="badge"]');
  const elTabs = root.querySelectorAll(".dbp__tab");
  const elPanes = root.querySelectorAll(".dbp__pane");
  const elWeatherBody = root.querySelector('[data-pane-content="weather"]');
  const elNewsBody = root.querySelector('[data-pane-content="news"]');
  const elStockBody = root.querySelector('[data-pane-content="stock"]');
  const elKanbanBody = root.querySelector('[data-pane-content="kanban"]');
  const elFilesTree = root.querySelector('[data-role="files-tree"]');
  const elFilesPreview = root.querySelector('[data-role="files-preview"]');
  const elKpiBody = root.querySelector('[data-pane-content="kpi"]');

  let open = false;
  let activeTab = "weather";
  let lastPayload = null;
  let isDemo = false;
  let ws = null;
  let wsReconnectTimer = null;
  let filesTreeData = null;

  // ── tab switching ─────────────────────────────────────────

  function switchTab(name) {
    activeTab = name;
    for (const t of elTabs) {
      t.classList.toggle("is-active", t.dataset.tab === name);
    }
    for (const p of elPanes) {
      p.classList.toggle("is-active", p.dataset.pane === name);
    }
  }

  elTabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      switchTab(btn.dataset.tab);
    });
  });

  // ── render functions ──────────────────────────────────────

  function renderWeather(w) {
    if (!w) {
      elWeatherBody.innerHTML = '<p class="dbp__muted">날씨 데이터 없음</p>';
      return;
    }
    const period = pickNowPeriod(w.periods);
    const temp = period?.temp ?? w?.highlights?.tempMax ?? "—";
    const sky = period?.sky ?? w?.sky ?? "—";
    const pty = period?.pty ?? w?.pty;
    const pop = period?.pop ?? w?.pop;
    const humidity = period?.reh ?? period?.humidity ?? w?.reh ?? w?.humidity;

    const icons = [weatherIcon(period?.skyCode ?? period?.SKY), rainIcon(pty)]
      .filter(Boolean)
      .join(" ");

    const parts = [];
    parts.push(
      '<div class="dbp__weather-main">' + icons + ' <span class="dbp__weather-temp">' + escapeHtml(temp) + '°C</span></div>'
    );
    parts.push('<div class="dbp__weather-detail">' + escapeHtml(sky) + '</div>');
    if (humidity != null) {
      parts.push('<div class="dbp__weather-detail">💧 습도 ' + escapeHtml(humidity) + '%</div>');
    }
    if (pop != null) {
      parts.push('<div class="dbp__weather-detail">🌂 강수확률 ' + escapeHtml(pop) + '%</div>');
    }
    if (w?.summary) {
      parts.push('<p class="dbp__weather-summary">' + escapeHtml(w.summary) + '</p>');
    }
    elWeatherBody.innerHTML = parts.join("");
  }

  function renderNews(n) {
    const headlines = newsHeadlines(n, 8);
    if (!headlines.length) {
      elNewsBody.innerHTML = '<p class="dbp__muted">뉴스 없음</p>';
      return;
    }
    elNewsBody.innerHTML =
      '<ul class="dbp__news-list">' +
      headlines
        .map(function (h) {
          var title = escapeHtml(h.title);
          if (h.link && h.link !== "#") {
            return '<li><a href="' + escapeHtml(h.link) + '" target="_blank" rel="noopener">' + title + '</a></li>';
          }
          return '<li>' + title + '</li>';
        })
        .join("") +
      '</ul>';
  }

  function renderStock(s) {
    if (!s) {
      elStockBody.innerHTML = '<p class="dbp__muted">주식 데이터 없음</p>';
      return;
    }
    const parts = [];
    // KOSPI / KOSDAQ
    const indices = [];
    if (s.kospi) {
      const up = s.kospi.status === "up";
      indices.push(
        '<div class="dbp__stock-idx">' +
        '<span class="dbp__stock-label">KOSPI</span> ' +
        '<span class="dbp__stock-price">' + escapeHtml(s.kospi.index) + '</span> ' +
        '<span class="dbp__stock-change ' + (up ? 'is-up' : 'is-down') + '">' +
        (up ? '▲' : '▼') + ' ' + escapeHtml(s.kospi.change) +
        '</span></div>'
      );
    }
    if (s.kosdaq) {
      const up = s.kosdaq.status === "up";
      indices.push(
        '<div class="dbp__stock-idx">' +
        '<span class="dbp__stock-label">KOSDAQ</span> ' +
        '<span class="dbp__stock-price">' + escapeHtml(s.kosdaq.index) + '</span> ' +
        '<span class="dbp__stock-change ' + (up ? 'is-up' : 'is-down') + '">' +
        (up ? '▲' : '▼') + ' ' + escapeHtml(s.kosdaq.change) +
        '</span></div>'
      );
    }
    if (indices.length) {
      parts.push('<div class="dbp__stock-indices">' + indices.join("") + '</div>');
    }
    // watchlist
    const wl = s.watchlist || s.items || [];
    if (wl.length) {
      let rows = '<table class="dbp__stock-table"><thead><tr><th>종목</th><th>현재가</th><th>등락</th></tr></thead><tbody>';
      for (const item of wl) {
        const up = item.status === "up" || String(item.change || "").startsWith("+");
        const down = item.status === "down" || String(item.change || "").startsWith("-");
        const cls = up ? "is-up" : down ? "is-down" : "";
        const arrow = up ? "▲" : down ? "▼" : "";
        rows += '<tr>' +
          '<td class="dbp__stock-name">' + escapeHtml(item.name || item.code || "") + '</td>' +
          '<td class="dbp__stock-price">' + escapeHtml(item.price || "—") + '</td>' +
          '<td class="dbp__stock-change ' + cls + '">' + arrow + ' ' + escapeHtml(item.change || "—") + '</td>' +
          '</tr>';
      }
      rows += '</tbody></table>';
      parts.push(rows);
    }
    // fallback: if s has a "text" or "summary" field from cron
    if (!parts.length && s.summary) {
      parts.push('<p class="dbp__muted" style="white-space:pre-wrap">' + escapeHtml(s.summary) + '</p>');
    }
    if (!parts.length) {
      parts.push('<p class="dbp__muted">주식 데이터 없음</p>');
    }
    elStockBody.innerHTML = parts.join("");
  }

  function renderKanban(k) {
    if (!k || !k.by_assignee || !k.by_assignee.length) {
      elKanbanBody.innerHTML = '<p class="dbp__muted">칸반 데이터 없음</p>';
      return;
    }
    const parts = [];
    for (const bot of k.by_assignee) {
      const name = escapeHtml(bot.display_name || bot.assignee);
      const active = bot.active || [];
      const done = bot.done || [];
      if (!active.length && !done.length) continue;
      parts.push('<div class="dbp__kanban-bot">');
      parts.push('<div class="dbp__kanban-bot-name">🤖 ' + name + '</div>');

      for (const t of active.slice(0, 3)) {
        const cls = t.status === "running" ? "running" : t.status === "blocked" ? "blocked" : "ready";
        const icon = t.status === "running" ? "⚡" : t.status === "blocked" ? "⏸" : "📌";
        parts.push(
          '<div class="dbp__kanban-task dbp__kanban-task--' + cls + '">' +
          '<span class="dbp__kanban-task-icon">' + icon + '</span> ' +
          '<span class="dbp__kanban-task-title">' + escapeHtml(t.title || t.id) + '</span>' +
          '</div>'
        );
      }
      if (done.length) {
        parts.push(
          '<div class="dbp__kanban-done">✅ 최근 완료: ' +
          done.slice(0, 2).map(function (d) { return escapeHtml(d.title || d.id); }).join(", ") +
          '</div>'
        );
      }
      parts.push('</div>');
    }
    elKanbanBody.innerHTML = parts.join("");
  }

  function renderFilesTree(treeData) {
    if (!treeData?.tree) {
      elFilesTree.innerHTML = '<p class="dbp__muted">폴더 정보 없음</p>';
      return;
    }
    filesTreeData = treeData;

    function buildTreeHtml(node, depth) {
      depth = depth || 0;
      if (!node) return "";
      const indent = depth * 14;
      if (node.type === "dir") {
        const children = node.children || [];
        let html =
          '<div class="dbp__ft-dir" style="padding-left:' + indent + 'px">' +
          '<span class="dbp__ft-toggle" data-path="' + escapeHtml(node.name) + '">📁 ' +
          escapeHtml(node.name) + '</span></div>';
        for (const child of children) {
          html += buildTreeHtml(child, depth + 1);
        }
        return html;
      }
      // file
      const previewable = node.preview !== false;
      const icon = previewable ? "📄" : "📎";
      return (
        '<div class="dbp__ft-file' + (previewable ? ' dbp__ft-file--preview' : '') + '" style="padding-left:' + indent + 'px"' +
        ' data-file-path="' + escapeHtml(node.name) + '"' +
        ' data-preview="' + (previewable ? "1" : "0") + '">' +
        icon + ' ' + escapeHtml(node.name) +
        '</div>'
      );
    }

    elFilesTree.innerHTML = buildTreeHtml(treeData.tree, 0);

    // click handlers
    elFilesTree.querySelectorAll(".dbp__ft-file--preview").forEach(function (el) {
      el.addEventListener("click", function () {
        loadFilePreview(el.dataset.filePath);
      });
    });
  }

  async function loadFilePreview(filePath) {
    if (!filePath) return;
    elFilesPreview.innerHTML = '<p class="dbp__muted">로딩 중…</p>';
    try {
      const res = await fetch("/api/file-preview?path=" + encodeURIComponent(filePath));
      const data = await res.json();
      if (data.error) {
        elFilesPreview.innerHTML = '<p class="dbp__muted">' + escapeHtml(data.error) + '</p>';
      } else {
        elFilesPreview.innerHTML =
          '<div class="dbp__ft-preview-head">📄 ' + escapeHtml(filePath) + '</div>' +
          '<pre class="dbp__ft-preview-body">' + escapeHtml(data.content || "") + '</pre>';
      }
    } catch (e) {
      elFilesPreview.innerHTML = '<p class="dbp__muted">미리보기 실패</p>';
    }
  }

  function render(payload) {
    lastPayload = payload;
    onPayload?.(payload);

    renderWeather(payload?.weather);
    renderNews(payload?.news);
    renderStock(payload?.stock);
    renderKanban(payload?.kanban);
    renderFilesTree(payload?.files);

    // KPI pane: always build structure on first render, update when tab is active
    if (payload?.kpi) {
      _renderKpiContent(payload.kpi);
    }

    var wAt = payload?.weather?.generatedAt || payload?.weather?.date || payload?.generated_at || "";
    var nAt = payload?.news?.generatedAt || payload?.news?.date || "";
    var src = payload?.source || (wAt || nAt ? "ws" : "—");
    elFoot.textContent =
      "source:" + src +
      (wAt ? " · weather " + (typeof wAt === "number" ? new Date(wAt * 1000).toLocaleString() : wAt) : "") +
      (nAt ? " · news " + (typeof nAt === "number" ? new Date(nAt * 1000).toLocaleString() : nAt) : "");

    // demo badge
    if (src === "demo") {
      isDemo = true;
      elBadge.style.display = "";
    } else {
      isDemo = false;
      elBadge.style.display = "none";
    }
  }

  function setLoading(msg) {
    var m = escapeHtml(msg || "불러오는 중…");
    elWeatherBody.innerHTML = '<p class="dbp__muted">' + m + '</p>';
    elNewsBody.innerHTML = '<p class="dbp__muted">' + m + '</p>';
    elStockBody.innerHTML = '<p class="dbp__muted">' + m + '</p>';
    elKanbanBody.innerHTML = '<p class="dbp__muted">' + m + '</p>';
    if (elKpiBody) elKpiBody.innerHTML = '<p class="dbp__muted">' + m + '</p>';
  }

  // ── KPI rendering ─────────────────────────────────────────
  var _kpiBuilt = false;
  function _renderKpiContent(kpiData) {
    if (!elKpiBody) return;
    if (!_kpiBuilt) {
      elKpiBody.innerHTML = buildKpiPane();
      _kpiBuilt = true;
    }
    renderKpi(elKpiBody, kpiData);
  }

  function applyDemo() {
    var demo = buildMockPayload();
    render(demo);
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

    // Pages HTTPS → ws://localhost blocked → demo mode
    if (location.protocol === "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      applyDemo();
      return;
    }

    try {
      ws = new WebSocket(resolveWsUrl());
    } catch (e) {
      applyDemo();
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
            stock: msg.stock,
            kanban: msg.kanban,
            generated_at: msg.generated_at,
            source: "ws",
          });
        } else if (msg.type === "ping") {
          /* ignore */
        }
      } catch (e) {
        /* ignore malformed */
      }
    };

    ws.onclose = function () {
      ws = null;
      if (open && !isDemo) applyDemo();
    };

    ws.onerror = function () {
      try { ws?.close(); } catch (e) {}
      ws = null;
      if (open && !isDemo) applyDemo();
    };
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
      // fallback: if no WS within 3s, go demo
      window.setTimeout(function () {
        if (open && !lastPayload) applyDemo();
      }, 3000);
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
    get activeTab() { return activeTab; },
    switchTab: switchTab,
    show: function () { setOpen(true); },
    hide: function () { setOpen(false); },
    toggle: function () { setOpen(!open); return open; },
    reconnectWs: function () { disconnectWs(); if (open) connectWs(); },
    root: root,
  };
}
