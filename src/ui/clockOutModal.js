/** Clock-out confirm overlay — lobby exit gate for 대장님. */

export function mountClockOutModal({ onConfirm, onCancel } = {}) {
  const root = document.createElement("div");
  root.className = "clockout-modal";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "clockout-title");
  root.innerHTML = `
    <div class="clockout-modal__card">
      <strong id="clockout-title" class="clockout-modal__title">퇴근하시겠습니까?</strong>
      <p class="clockout-modal__msg">로비를 나가면 Area를 떠납니다.<br/>또 오세요!</p>
      <div class="clockout-modal__row">
        <button type="button" class="toolbar__btn clockout-modal__yes" data-role="yes">예</button>
        <button type="button" class="toolbar__btn is-off" data-role="no">아니오</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  function open() {
    root.hidden = false;
    root.querySelector('[data-role="yes"]')?.focus?.();
  }

  function close() {
    root.hidden = true;
  }

  root.querySelector('[data-role="yes"]').addEventListener("click", () => {
    close();
    onConfirm?.();
  });
  root.querySelector('[data-role="no"]').addEventListener("click", () => {
    close();
    onCancel?.();
  });

  // backdrop click = cancel
  root.addEventListener("click", (ev) => {
    if (ev.target === root) {
      close();
      onCancel?.();
    }
  });

  return { open, close, root };
}
