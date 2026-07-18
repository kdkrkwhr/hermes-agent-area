/** App-level pages: office (map) vs board (kanban/timeline/KPI).
 *  Zone chips on office zoom into one wing so the map isn't one crowded overview.
 */

const PAGES = ["office", "board"];

const ZONES = {
  all: null,
  open: { x0: 1, y0: 1, x1: 12, y1: 25, label: "오픈데스크" },
  meeting: { x0: 14, y0: 2, x1: 35, y1: 13, label: "미팅·CEO" },
  lounge: { x0: 14, y0: 14, x1: 35, y1: 24, label: "라운지·낮잠" },
  lobby: { x0: 12, y0: 25, x1: 27, y1: 29, label: "로비" },
};

export function mountAppPages({ game, getScene } = {}) {
  const root = document.createElement("nav");
  root.className = "app-pages";
  root.setAttribute("aria-label", "화면");
  root.innerHTML = `
    <div class="app-pages__tabs" role="tablist">
      <button type="button" class="app-pages__tab is-active" data-page="office" role="tab" aria-selected="true">오피스</button>
      <button type="button" class="app-pages__tab" data-page="board" role="tab" aria-selected="false">보드</button>
    </div>
    <div class="app-pages__zones" data-role="zones" hidden>
      <button type="button" class="app-pages__zone is-active" data-zone="all">전체</button>
      <button type="button" class="app-pages__zone" data-zone="open">오픈데스크</button>
      <button type="button" class="app-pages__zone" data-zone="meeting">미팅·CEO</button>
      <button type="button" class="app-pages__zone" data-zone="lounge">라운지</button>
      <button type="button" class="app-pages__zone" data-zone="lobby">로비</button>
    </div>
  `;
  document.body.appendChild(root);

  const boardShell = document.createElement("section");
  boardShell.className = "board-page";
  boardShell.hidden = true;
  boardShell.innerHTML = `
    <header class="board-page__head">
      <h1 class="board-page__title">작업 보드</h1>
      <p class="board-page__hint">칸반 · 타임라인 · KPI — 오피스랑 화면 분리</p>
    </header>
    <div class="board-page__kpi" data-role="board-kpi">
      <p class="board-page__kpi-empty">KPI는 CEO 책상(E) 브리프 탭에서도 볼 수 있음. 보드에선 칸반·타임라인 위주.</p>
    </div>
    <div class="board-page__grid" data-role="board-grid"></div>
  `;
  document.body.appendChild(boardShell);

  let page = "office";
  let zone = "all";

  const zoneBar = root.querySelector('[data-role="zones"]');
  const tabBtns = root.querySelectorAll(".app-pages__tab");
  const zoneBtns = root.querySelectorAll(".app-pages__zone");

  function syncChrome() {
    document.body.dataset.page = page;
    document.body.dataset.zone = zone;
    for (const btn of tabBtns) {
      const on = btn.dataset.page === page;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    }
    zoneBar.hidden = page !== "office";
    for (const btn of zoneBtns) {
      btn.classList.toggle("is-active", btn.dataset.zone === zone);
    }
    boardShell.hidden = page !== "board";

    const kanban = document.querySelector(".kanban-panel");
    const timeline = document.querySelector(".activity-timeline");
    if (page === "board") {
      kanban?.classList.remove("is-collapsed");
      timeline?.classList.add("is-open");
      document.querySelector('[data-role="toggle-kanban"]')?.classList.add("is-off");
      document.querySelector('[data-role="toggle-kanban"]')?.setAttribute("aria-pressed", "false");
    } else {
      // office: keep panels out of the way by default
      kanban?.classList.add("is-collapsed");
      timeline?.classList.remove("is-open");
      const kbBtn = document.querySelector('[data-role="toggle-kanban"]');
      if (kbBtn) {
        kbBtn.classList.add("is-off");
        kbBtn.setAttribute("aria-pressed", "false");
      }
    }
  }

  function setPage(next) {
    if (!PAGES.includes(next) || next === page) {
      syncChrome();
      return page;
    }
    page = next;
    syncChrome();
    if (page === "office") {
      const sc = typeof getScene === "function" ? getScene() : game?.scene?.getScene?.("OfficeScene");
      sc?.focusZone?.(zone);
    }
    return page;
  }

  function setZone(next) {
    if (!(next in ZONES)) return zone;
    zone = next;
    syncChrome();
    const sc = typeof getScene === "function" ? getScene() : game?.scene?.getScene?.("OfficeScene");
    sc?.focusZone?.(zone);
    return zone;
  }

  for (const btn of tabBtns) {
    btn.addEventListener("click", () => setPage(btn.dataset.page));
  }
  for (const btn of zoneBtns) {
    btn.addEventListener("click", () => setZone(btn.dataset.zone));
  }

  // start clean: office + collapsed HUD
  syncChrome();

  return {
    setPage,
    getPage: () => page,
    setZone,
    getZone: () => zone,
    zones: ZONES,
    root,
    boardShell,
  };
}

export { ZONES, PAGES };
