/**
 * Visitor toast system — stacked, non-interactive DOM toasts at bottom-center.
 *
 * Each call to show() creates a separate element; concurrent toasts stack
 * vertically without overlap. Toast elements use pointer-events: none so they
 * never intercept clicks on the canvas.
 *
 * CSS: .visitor-toast reuses the existing .office-toast transition pattern.
 */

const VISITOR_TOAST_CLASS = "visitor-toast";
const STACK_GAP = 8;
const FADE_OUT_MS = 300;

/** @type {HTMLElement[]} */
let _activeToasts = [];

function toastEl() {
  let el = document.getElementById("visitor-toast-host");
  if (!el) {
    el = document.createElement("div");
    el.id = "visitor-toast-host";
    el.style.cssText =
      "position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:40;pointer-events:none;display:flex;flex-direction:column-reverse;align-items:center;gap:" +
      STACK_GAP +
      "px;";
    document.body.appendChild(el);
  }
  return el;
}

function createToast(text) {
  const el = document.createElement("div");
  el.className = VISITOR_TOAST_CLASS;
  el.textContent = text;
  // inherit styling from .visitor-toast CSS; add inline accessibility
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  return el;
}

/**
 * Show a visitor toast message.
 *
 * @param {string} message — toast text
 * @param {number} [holdMs=2800] — visible duration in ms before fade-out
 */
export function showVisitorToast(message, holdMs = 2800) {
  const host = toastEl();
  const el = createToast(message);

  host.appendChild(el);
  _activeToasts.push(el);

  // trigger CSS transition by adding class after a microtask
  requestAnimationFrame(() => {
    el.classList.add("is-visible");

    const dismissAt = Math.max(holdMs, 600);
    const timer = setTimeout(() => {
      el.classList.add("is-out");
      el.classList.remove("is-visible");

      setTimeout(() => {
        el.remove();
        _activeToasts = _activeToasts.filter((e) => e !== el);
      }, FADE_OUT_MS);
    }, dismissAt);

    // attach timer to element so it can be cleared if needed
    el._dismissTimer = timer;
  });
}

/**
 * @returns {number} currently active toast count
 */
export function activeToastCount() {
  return _activeToasts.filter((el) => document.body.contains(el)).length;
}
