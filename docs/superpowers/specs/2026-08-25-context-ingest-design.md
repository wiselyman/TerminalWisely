# Context ingest — console, remote files, local attachments

Date: 2026-08-25  
Status: approved (design; implementation not started)  
Primary iteration: confirmed — see [`2026-08-25-next-iteration-primary.md`](./2026-08-25-next-iteration-primary.md)  
Scope: AI Linux Engineer chat context. No second SSH. No PolicyEngine bypass.

## Goal

Let users attach **machine-relevant context** to a chat turn so the model reasons over console output, remote configs/logs, and small local files — all as **untrusted DATA**, never as authority.

## Non-goals (this design)

- Full Word layout fidelity  
- Arbitrary large Excel / unbounded base64  
- MCP / external ticket sources (later)  
- Changing SecurityMode or PrivilegeLease semantics  
- Hardcoded troubleshooting trees  

## Constraints (hard)

- Remote reads use existing session: `exec_command_capture` / `read_remote_file` path via Rust + PolicyEngine + CommandBroker  
- Sidecar HTTP from WebView still via `ai_sidecar_request`  
- Injected content prefixed / wrapped so models treat it as DATA (same spirit as tool `_UNTRUSTED_PREAMBLE`)  
- AskUser ≠ Approval; attaching a file never authorizes mutation  

## P0 surface (ship first)

### A. Console → chat

| Topic | Decision |
|-------|----------|
| Sources | (1) Current xterm **selection**; (2) optional “last N lines” of visible buffer if no selection |
| UX | Composer chip / “Add from terminal” action; also terminal context-menu item “Send to AI” when AI panel can bind the same session |
| Transport idle | Append to pending composer attachments; included on next `sendMessage` as structured context blocks |
| Transport mid-run | Prefer `POST /v1/user_context` ([`UserContextRequest`](../../agent-sidecar/app/models/approval.py) already exists) with labeled content; FE must wire it |
| Limits | Soft 32 KiB UTF-8 per block; hard 64 KiB; truncate with head/tail markers |
| Encoding | UTF-8; strip NULs; no binary console paste in P0 |

### B. Remote path → chat

| Topic | Decision |
|-------|----------|
| UX | Composer “Attach remote path…” → path string (absolute); chip shows `host:path` |
| Fetch | On send (or explicit “load”), host runs existing read-only probe: `build_read_remote_file_command` / tool `read_remote_file` via **same** session — not a second login |
| Policy | R0 only; traversal / unsafe paths rejected as today ([`linux_probe.py`](../../agent-sidecar/app/tools/linux_probe.py)) |
| Limits | Text files only in P0; max 64 KiB after decode; larger files → refuse with “path too large; ask AI to `tail`/`head` via tools” |
| Presentation | Chat line kind `attachment` (remote) + inject into model messages as fenced DATA block with path metadata |

### C. Local drop / pick (bounded)

| Topic | Decision |
|-------|----------|
| Allowed P0 | `.txt`, `.log`, `.md`, `.json`, `.yaml/.yml`, `.conf`, `.csv` (text); images `.png/.jpg/.jpeg/.webp` if active model advertises vision (else extract nothing — show chip “image needs vision model”) |
| Reject P0 | `.doc/.docx`, `.xls/.xlsx`, `.pdf` (show “coming in P1”) |
| Size | Text ≤ 256 KiB local read; images ≤ 2 MiB; oversize → refuse |
| Where processed | FE reads File → text or base64 image part; sidecar `ChatStartRequest` gains optional `attachments[]` (see API) |
| No silent upload to cloud storage | Content only in this chat turn / SessionLog |

## API / model shape

Extend chat start (and continue) with optional attachments (Pydantic v2):

```text
attachments: [
  { kind: "console", label?, text },
  { kind: "remote_file", path, text },
  { kind: "local_text", name, text },
  { kind: "local_image", name, media_type, data_base64 }  // only if vision
]
```

Sidecar:

1. Sanitize + truncate each block  
2. Append to SessionLog as user-adjacent DATA (system or user role with clear markers — prefer **user** message sections labeled `UNTRUSTED_CONTEXT`)  
3. Persist in JSONL so resume keeps attachments that were already accepted  
4. Emit pull event `context_attached` for FE transcript chips  

Reuse `/v1/user_context` for mid-run text-only flush; extend body later with `kind` if needed (P0 can pack kind into content header).

## FE store / UI

- `ChatLine` kind `attachment` (persist slim: kind, label, path/name, truncated preview — not full image bytes in localStorage)  
- Composer attachment tray above textarea  
- i18n en + zh-CN for actions and limit errors  
- Style: reuse plan/investigation chip language; no new dashboard chrome  

## Security checklist

- [ ] Remote fetch never skips PolicyEngine  
- [ ] Content never grants approve_for_session / permanent allow  
- [ ] Images not executed; no “open with shell”  
- [ ] Caps enforced server-side (FE limits are UX only)  

## P1 (follow-up design, not this doc’s implementation)

- PDF text extract (page/size caps)  
- Excel → first N rows as CSV text  
- Word → plain text extract only  

## Success criteria

1. User selects terminal text → appears as chip → send → model references that output without re-asking to paste  
2. User attaches `/etc/nginx/nginx.conf` on connected host → content in SessionLog + UI chip  
3. Local `.log` drop works; `.docx` clearly refused with P1 message  
4. Existing E2E gates still green; new unit tests for truncate + remote path reject  

## Implementation order (when coding)

1. FE console selection → composer attachment + start payload  
2. Sidecar accept `attachments` + SessionLog markers + tests  
3. Remote path attach (Rust exec capture / existing probe)  
4. Local text drop  
5. Local image + vision gate  
6. Wire mid-run `user_context` from FE  
