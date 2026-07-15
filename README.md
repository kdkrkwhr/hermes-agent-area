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

# 3. 접속 (실시간 상태 보려면 로컬 FE 필수)
npm install && npm run dev
# → http://localhost:5173/hermes-agent-area/
```

> **주의:** GitHub Pages(`https://…`)는 `ws://localhost` 연결이 브라우저에 막힘.
> Pages만 열면 mock/오프라인이라 실시간 프로필·상태가 안 보임.
> 실시간 = `npm run dev` 로컬 FE + `python server/main.py`.
> 터널 쓸 때만 Pages에 `?ws=wss://xxxx.trycloudflare.com/ws` 붙이면 됨.

## 에이전트 이름 (Hermes 프로필)

BE가 각 PC의 `HERMES_HOME` 프로필을 읽어 캐릭터를 만듦 (하드코딩 닉네임 X).

표시 이름 우선순위:
1. `$HERMES_HOME[/profiles/<name>]/area.json` → `displayName`
2. 해당 프로필 `gateway.log`의 마지막 `Connected as …`
3. `SOUL.md` 첫 헤딩
4. 프로필 폴더명 (`default`, `nous-work`, …)

```json
// 예: ~/.hermes/area.json  (default 프로필)
{ "displayName": "양파쿵야", "sheet": "char-onion" }
```

## WebSocket

- 로컬 FE(`npm run dev`): 같은 오리진 `ws://localhost:5173/ws` → Vite가 BE로 프록시
- 직접 BE: `ws://127.0.0.1:8765/ws`
- 툴바 **연결** 버튼 / `localStorage` / 쿼리 `?ws=` · `?api=`
- env: `.env`에 `VITE_WS_URL=...` (빌드 시 주입)
- Pages에서 실시간 보려면: 로컬 FE 쓰거나 cloudflared `wss://` 터널을 연결 패널에 저장

## 개발 / 빌드

```bash
npm install
npm run dev
npm run build
```

GitHub Pages는 `main` push 시 Actions로 `dist/` 배포.
