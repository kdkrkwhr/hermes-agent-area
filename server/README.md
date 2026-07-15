# Hermes Agent Area — Server (Phase 2)

```bash
# from repo root
python server/main.py
# → http://127.0.0.1:8765

# FE (separate terminal)
npm run dev
# → http://127.0.0.1:5173  (WS → ws://127.0.0.1:8765/ws)
```

## Endpoints

| Path | Role |
|------|------|
| `GET /api/agents` | agent list + x/y/bubble |
| `GET /api/status` | profiles, kanban stats, gateway log tail |
| `GET /api/snapshot` | full WS payload |
| `WS /ws` | 20Hz snapshot broadcast (Hermes poll every 5s) |

Kanban DB (RO): `%HERMES_KANBAN_DB%` or `$HERMES_HOME/kanban.db`

Agents: `hermes profile list` (+ filesystem fallback)로 로스터 구성.
표시 이름: `area.json` → Discord `Connected as` → `SOUL.md` → 프로필명.
Optional override 파일: `$HERMES_HOME/area.json` 또는 `$HERMES_HOME/profiles/<name>/area.json`
