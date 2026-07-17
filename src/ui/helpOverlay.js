/** Controls help overlay. `?` / `/` toggle. `?help=0` disables. */

const SEEN_KEY = "hermes-area-help-seen";
const HINT_MS = 3000;

const ROWS = [
  ["WASD", "이동"],
  ["E / Space", "커피·먹이·물주기·낮잠·쓰다듬기"],
  ["F", "팔로우"],
  ["M", "뮤트"],
  ["L", "시간대(BGM 톤)"],
  ["미니맵 클릭", "카메라 pan"],
  ["? / /", "이 도움말"],
];

function parseHelpEnabled() {
  if (typeof location === "undefined") return true;
  const q = new URLSearchParams(location.search).get("help");
  return q !== "0" && q !== "false";
}

function hasSeenHelp() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markHelpSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {Phaser.Scene} scene
 */
export function createHelpOverlay(scene) {
  const enabled = parseHelpEnabled();
  let open = false;
  let root = null;
  let hintTimer = null;

  if (!enabled) {
    return {
      enabled: false,
      open: false,
      toggle() {},
      setOpen() {},
      maybeShowFirstVisitHint() {},
      snapshot: () => ({ enabled: false, open: false, seen: hasSeenHelp() }),
      destroy() {},
    };
  }

  root = document.createElement("div");
  root.className = "help-overlay";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "조작 도움말");
  root.innerHTML = `
    <div class="help-overlay__card">
      <strong class="help-overlay__title">조작</strong>
      <dl class="help-overlay__list">
        ${ROWS.map(
          ([k, v]) =>
            `<div class="help-overlay__row"><dt>${k}</dt><dd>${v}</dd></div>`,
        ).join("")}
      </dl>
      <p class="help-overlay__foot">? 또는 / 로 닫기</p>
    </div>
  `;
  document.body.appendChild(root);

  function setOpen(next) {
    open = !!next;
    root.hidden = !open;
    root.classList.toggle("is-on", open);
    scene.publishDebug?.(scene.ws?.url ?? "local", scene.lastSnapshot);
  }

  function toggle() {
    setOpen(!open);
  }

  function showHintToast() {
    let el = document.getElementById("office-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "office-toast";
      el.className = "office-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = "? 키로 조작 도움말";
    el.classList.add("is-visible");
    el.classList.remove("is-out");
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      el.classList.add("is-out");
      el.classList.remove("is-visible");
      hintTimer = null;
    }, HINT_MS);
  }

  function maybeShowFirstVisitHint() {
    if (hasSeenHelp()) return;
    markHelpSeen();
    showHintToast();
  }

  // Phaser + DOM: catch `?` and `/` (Shift+/ → ?)
  scene.input.keyboard?.on("keydown", (event) => {
    if (event.key !== "?" && event.key !== "/") return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) {
      return;
    }
    event.preventDefault?.();
    toggle();
  });

  // delayed first-visit hint — don't block gameplay
  scene.time.delayedCall(500, () => maybeShowFirstVisitHint());

  return {
    enabled: true,
    get open() {
      return open;
    },
    toggle,
    setOpen,
    maybeShowFirstVisitHint,
    snapshot: () => ({
      enabled: true,
      open,
      seen: hasSeenHelp(),
    }),
    destroy() {
      if (hintTimer) clearTimeout(hintTimer);
      root?.remove();
      root = null;
    },
  };
}

export { parseHelpEnabled, SEEN_KEY, HINT_MS };
