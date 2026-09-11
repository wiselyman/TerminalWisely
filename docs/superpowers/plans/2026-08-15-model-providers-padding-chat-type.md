# Plan: padding, chat type, ModelGateway provider UX

**Goal:** Terminal inset padding; smaller AI chat type; four OpenAI-compatible provider presets with refreshable model list.

## Tasks

1. CSS: terminal host padding; shrink `.ai-engineer-line` / `.ai-engineer-md` / composer
2. ModelGateway.`list_models` + sidecar `POST /v1/models/list`
3. Tauri `ai_list_models` (inject stored API key) + frontend API helper
4. AiEngineerSettings: provider cards + model select/refresh; i18n en/zh-CN
5. Verify: npm build, cargo test --lib, smoke checklist
