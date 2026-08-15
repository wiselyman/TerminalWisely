# Terminal padding, chat type size, ModelGateway provider presets

Date: 2026-08-15  
Status: approved  
Scope: CSS polish + model settings UX. Chat runtime stays OpenAI-compatible via ModelGateway only.

## Decisions

1. Terminal: add ~8–10px inset padding so text is not flush to the pane edge.
2. Chat typography: shrink timeline / markdown / composer toward Cursor density (~0.82–0.85rem).
3. Settings provider cards: **OpenAI compatible**, **Anthropic compatible**, **Gemini**, **Ollama** (all OpenAI-compatible HTTP through ModelGateway). Remove standalone DeepSeek / Custom cards; DeepSeek users use OpenAI compatible + their base URL.
4. Model field: **Refresh** loads ids from `{base}/models` (Ollama via existing `/v1` mapping); controlled select + optional manual entry fallback. No native Anthropic Messages / Gemini generateContent APIs.

## Non-goals

- Native Anthropic/Gemini protocol adapters
- Per-thread model selection
- Changing PolicyEngine / CommandBroker
