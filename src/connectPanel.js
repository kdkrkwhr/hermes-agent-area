/** BE/WS connection settings — localStorage + query. Pages→localhost WS is blocked. */

import { isPagesLocalWsBlocked, resolveApiBase, resolveWsUrl, setConnectionUrls } from "./mock.js";

const LOCAL_FE = "http://localhost:5173/hermes-agent-area/";

export function mountConnectPanel({ onReconnect } = {}) {
  const root = document.createElement("div");
  root.className = "connect-panel";
  root.hidden = true;
  root.innerHTML = `
    <div class="connect-panel__card">
      <div class="connect-panel__head">
        <strong>서버 연결</strong>
        <button type="button" class="connect-panel__x" data-role="close" aria-label="닫기">×</button>
      </div>
      <p class="connect-panel__hint" data-role="hint"></p>
      <label class="connect-panel__label">WebSocket
        <input data-role="ws" type="text" spellcheck="false" placeholder="ws://127.0.0.1:8765/ws" />
      </label>
      <label class="connect-panel__label">API (선택)
        <input data-role="api" type="text" spellcheck="false" placeholder="http://127.0.0.1:8765" />
      </label>
      <div class="connect-panel__row">
        <button type="button" class="toolbar__btn" data-role="save">저장·재연결</button>
        <button type="button" class="toolbar__btn" data-role="local-fe">로컬 FE 열기</button>
        <button type="button" class="toolbar__btn is-off" data-role="clear">초기화</button>
      </div>
      <p class="connect-panel__status" data-role="status"></p>
    </div>
  `;
  document.body.appendChild(root);

  const wsInput = root.querySelector('[data-role="ws"]');
  const apiInput = root.querySelector('[data-role="api"]');
  const hint = root.querySelector('[data-role="hint"]');
  const status = root.querySelector('[data-role="status"]');

  function fill() {
    wsInput.value = resolveWsUrl();
    apiInput.value = resolveApiBase();
    if (isPagesLocalWsBlocked()) {
      hint.textContent =
        "Pages(HTTPS)는 localhost WS를 브라우저가 막음. 로컬 FE(npm run dev)로 열거나, cloudflared 등 wss:// 터널 URL을 넣으면 됨.";
    } else {
      hint.textContent =
        "로컬 BE 기본값: ws://127.0.0.1:8765/ws · Vite dev는 같은 오리진 /ws 프록시 사용.";
    }
  }

  function open() {
    fill();
    root.hidden = false;
    status.textContent = "";
  }

  function close() {
    root.hidden = true;
  }

  root.querySelector('[data-role="close"]').addEventListener("click", close);
  root.addEventListener("click", (ev) => {
    if (ev.target === root) close();
  });

  root.querySelector('[data-role="local-fe"]').addEventListener("click", () => {
    window.open(LOCAL_FE, "_blank", "noopener");
  });

  root.querySelector('[data-role="clear"]').addEventListener("click", () => {
    setConnectionUrls({ ws: "", api: "" });
    fill();
    status.textContent = "저장값 지움 · 기본 URL 사용";
    onReconnect?.();
  });

  root.querySelector('[data-role="save"]').addEventListener("click", async () => {
    const ws = wsInput.value.trim();
    const api = apiInput.value.trim();
    setConnectionUrls({ ws, api });
    status.textContent = "저장됨 · 연결 시도 중…";
    const base = resolveApiBase();
    try {
      const r = await fetch(`${base}/api/status`, { mode: "cors" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const n = Object.keys(j.profiles || {}).length;
      status.textContent = `API OK · 프로필 ${n}개 · clients ${j.clients ?? "?"}`;
    } catch (e) {
      status.textContent = `API 실패: ${e.message || e} (BE 켜져있는지 확인)`;
    }
    onReconnect?.();
  });

  // auto-open when Pages blocks localhost
  if (isPagesLocalWsBlocked()) open();

  return { open, close, root };
}
