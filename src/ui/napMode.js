/** Nap Pod overlay — dim screen for N ms then auto restore. */

const DEFAULT_MS = 10000;

/**
 * @param {{ durationMs?: number, onDone?: () => void }} opts
 */
export function mountNapMode(opts = {}) {
  const ms = opts.durationMs ?? DEFAULT_MS;
  let root = document.querySelector(".nap-mode");
  if (!root) {
    root = document.createElement("div");
    root.className = "nap-mode";
    root.innerHTML = `
      <div class="nap-mode__veil"></div>
      <p class="nap-mode__msg">낮잠 모드… Zzz</p>
      <p class="nap-mode__sub" data-role="sub"></p>`;
    document.body.appendChild(root);
  }

  const sub = root.querySelector('[data-role="sub"]');
  let left = Math.ceil(ms / 1000);
  let closed = false;
  let timer = null;
  let tick = null;

  function paint() {
    if (sub) sub.textContent = `${left}초 후 기상`;
  }

  function close() {
    if (closed) return;
    closed = true;
    if (timer) window.clearTimeout(timer);
    if (tick) window.clearInterval(tick);
    root.classList.remove("is-on");
    root.hidden = true;
    opts.onDone?.();
  }

  paint();
  root.hidden = false;
  root.classList.add("is-on");
  tick = window.setInterval(() => {
    left -= 1;
    if (left <= 0) left = 0;
    paint();
  }, 1000);
  timer = window.setTimeout(close, ms);

  return { close, isOn: () => !closed };
}
