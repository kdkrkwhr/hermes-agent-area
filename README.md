# Hermes Agent Area

Hermes 멀티 에이전트를 ZEP 스타일 2D 가상 사무실에서 모니터링

## 사용법

```bash
# 1. 클론
git clone https://github.com/kdkrkwhr/hermes-agent-area.git
cd hermes-agent-area

# 2. BE 실행 (로컬)
export HERMES_HOME=~/.hermes  # Windows: set HERMES_HOME=C:\Users\...
pip install -r server/requirements.txt
python server/main.py

# 3. 접속
# 브라우저에서 https://kdkrkwhr.github.io/hermes-agent-area/ 열기
# (로컬 FE) npm install && npm run dev → http://localhost:5173/hermes-agent-area/
```

## WebSocket

- 기본: `ws://localhost:8765/ws` (로컬 BE)
- 쿼리: `?ws=ws://127.0.0.1:8765/ws`
- env: `.env`에 `VITE_WS_URL=...` (빌드 시 주입)

## 개발 / 빌드

```bash
npm install
npm run dev
npm run build
```

GitHub Pages는 `main` push 시 Actions로 `dist/` 배포.
