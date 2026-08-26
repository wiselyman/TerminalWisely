# TerminalWisely Agent Sidecar

Python FastAPI sidecar: LangGraph macro + AgentLoop + ModelGateway + harness.

## Protocol (streamable HTTP + pull fallback)

Primary: `GET /v1/sessions/{id}/stream` (`text/event-stream`) via Rust `ai_sidecar_stream`.
Fallback: `GET /v1/sessions/{id}/pull` for non-Tauri or stream errors.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/chat/start` | Start a run |
| GET | `/v1/sessions/{id}/stream` | Streamable HTTP (SSE) events |
| GET | `/v1/sessions/{id}/pull` | Drain events (fallback) |
| POST | `/v1/tool_result` | Host returns `terminal_exec` result |
| POST | `/v1/user_answer` | Resume after `ask_user` |
| POST | `/v1/approval_decision` | Mutation / OpsPlan envelope approval |
| POST | `/v1/runs/{id}/cancel` | STOP AI |
| POST | `/v1/user_context` | Mid-run user flush (same task) |
| GET | `/v1/audit/verify` | Hash-chain verify |

Auth: `Authorization: Bearer $TW_AI_TOKEN` on all `/v1/*`.

## Env

| Variable | Meaning |
|----------|---------|
| `TW_AI_BASE_URL` | OpenAI-compatible base URL |
| `TW_AI_API_KEY` | Provider API key |
| `TW_AI_MODEL` | Model id |
| `TW_AI_TOKEN` | Sidecar bearer token |
| `TW_AI_SECURITY_MODE` | observe / safe / autonomous / production |
| `TW_AI_DATA_DIR` | Audit SQLite dir (default `~/.terminalwisely/ai-engineer`) |
| `TW_AI_MAX_TOOL_CALLS` | Budget (default 24) |
| `TW_AI_MAX_RUN_SECONDS` | Active agent budget per turn, excluding host command waits and approval/ask_user pauses (default 900) |
| `TW_AI_LEASE_TTL_SECONDS` | PrivilegeLease TTL (default 120) |

## Run (dev)

```bash
pip install -r requirements-runtime.txt   # or requirements.txt (+ pytest)
TW_AI_TOKEN=dev-token uvicorn app.main:app --host 127.0.0.1 --port 8765
```

Packaged apps auto-create a venv under the app data `ai-engineer/venv` on first AI launch if system Python lacks uvicorn.

## Tests

```bash
PYTHONPATH=. python3.12 -m pytest tests/ -q
```

Live optional: `TW_AI_LIVE_E2E=1` + model env (see `tests/test_live_e2e_optional.py`).
