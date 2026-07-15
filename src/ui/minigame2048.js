/** Lightweight 2048 overlay for lounge coffee interaction. */

const SIZE = 4;
const KEY = "hermes-area-2048-best";

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function spawn(board) {
  const empty = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!board[r][c]) empty.push([r, c]);
    }
  }
  if (!empty.length) return false;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  board[r][c] = Math.random() < 0.9 ? 2 : 4;
  return true;
}

function slideRow(row) {
  const nums = row.filter((n) => n);
  let score = 0;
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] && nums[i] === nums[i + 1]) {
      const v = nums[i] * 2;
      out.push(v);
      score += v;
      i += 1;
    } else {
      out.push(nums[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { row: out, score };
}

function rotate(board) {
  const next = emptyBoard();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) next[c][SIZE - 1 - r] = board[r][c];
  }
  return next;
}

function move(board, dir) {
  // dir: 0L 1U 2R 3D — rotate so we always slide left
  let b = board.map((r) => r.slice());
  let rot = 0;
  if (dir === 1) rot = 1;
  else if (dir === 2) rot = 2;
  else if (dir === 3) rot = 3;
  for (let i = 0; i < rot; i++) b = rotate(b);

  let scoreGain = 0;
  let changed = false;
  for (let r = 0; r < SIZE; r++) {
    const before = b[r].join(",");
    const { row, score } = slideRow(b[r]);
    b[r] = row;
    scoreGain += score;
    if (row.join(",") !== before) changed = true;
  }

  for (let i = 0; i < (4 - rot) % 4; i++) b = rotate(b);
  return { board: b, scoreGain, changed };
}

function canMove(board) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!board[r][c]) return true;
      const v = board[r][c];
      if (c + 1 < SIZE && board[r][c + 1] === v) return true;
      if (r + 1 < SIZE && board[r + 1][c] === v) return true;
    }
  }
  return false;
}

function tileClass(n) {
  if (!n) return "mg2048__cell";
  const t = Math.min(n, 2048);
  return `mg2048__cell mg2048__cell--${t}`;
}

/**
 * @param {{ onClose?: (result: {score:number,best:number,won:boolean,lost:boolean}) => void }} opts
 */
export function mountMinigame2048(opts = {}) {
  let root = document.querySelector(".mg2048");
  if (!root) {
    root = document.createElement("div");
    root.className = "mg2048";
    root.innerHTML = `
      <div class="mg2048__card" role="dialog" aria-label="2048">
        <div class="mg2048__head">
          <strong>2048 · 커피브레이크</strong>
          <span class="mg2048__scores">
            <span data-role="score">0</span>
            <span data-role="best">best 0</span>
          </span>
          <button type="button" class="mg2048__x" data-role="close" aria-label="닫기">×</button>
        </div>
        <div class="mg2048__grid" data-role="grid"></div>
        <p class="mg2048__hint">←↑→↓ / WASD · Esc 종료</p>
        <p class="mg2048__status" data-role="status"></p>
      </div>`;
    document.body.appendChild(root);
  }

  const gridEl = root.querySelector('[data-role="grid"]');
  const scoreEl = root.querySelector('[data-role="score"]');
  const bestEl = root.querySelector('[data-role="best"]');
  const statusEl = root.querySelector('[data-role="status"]');
  const closeBtn = root.querySelector('[data-role="close"]');

  let board = emptyBoard();
  spawn(board);
  spawn(board);
  let score = 0;
  let best = 0;
  try {
    best = Number(localStorage.getItem(KEY) || 0) || 0;
  } catch {
    best = 0;
  }
  let won = false;
  let lost = false;
  let closed = false;

  function paint() {
    gridEl.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const n = board[r][c];
        const cell = document.createElement("div");
        cell.className = tileClass(n);
        cell.textContent = n ? String(n) : "";
        gridEl.appendChild(cell);
      }
    }
    scoreEl.textContent = String(score);
    bestEl.textContent = `best ${best}`;
  }

  function finish(force = false) {
    if (closed) return;
    if (!force && !won && !lost) return;
    closed = true;
    try {
      if (score > best) localStorage.setItem(KEY, String(score));
    } catch {
      /* ignore */
    }
    root.hidden = true;
    root.classList.remove("is-open");
    window.removeEventListener("keydown", onKey, true);
    opts.onClose?.({ score, best: Math.max(best, score), won, lost });
  }

  function applyDir(dir) {
    if (won || lost || closed) return;
    const { board: next, scoreGain, changed } = move(board, dir);
    if (!changed) return;
    board = next;
    score += scoreGain;
    if (score > best) best = score;
    spawn(board);
    paint();
    if (board.some((row) => row.includes(2048))) {
      won = true;
      statusEl.textContent = `클리어! 점수 ${score}`;
      window.setTimeout(() => finish(true), 900);
      return;
    }
    if (!canMove(board)) {
      lost = true;
      statusEl.textContent = `게임오버 · ${score}점`;
      window.setTimeout(() => finish(true), 1100);
    }
  }

  function onKey(e) {
    const map = {
      ArrowLeft: 0,
      KeyA: 0,
      ArrowUp: 1,
      KeyW: 1,
      ArrowRight: 2,
      KeyD: 2,
      ArrowDown: 3,
      KeyS: 3,
    };
    if (e.code === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      lost = false;
      finish(true);
      return;
    }
    if (map[e.code] != null) {
      e.preventDefault();
      e.stopPropagation();
      applyDir(map[e.code]);
    }
  }

  statusEl.textContent = "타일 합쳐서 2048!";
  paint();
  root.hidden = false;
  root.classList.add("is-open");
  window.addEventListener("keydown", onKey, true);
  closeBtn.onclick = () => finish(true);

  return {
    close: () => finish(true),
    getScore: () => score,
    isOpen: () => !closed && root.classList.contains("is-open"),
  };
}
