# Design: Tool result budget (hierarchical compression L1)

**Date:** 2026-09-08  
**Source:** AI Agents in Depth §2.7.4  
**Status:** implementing

## Goal

Large tool outputs must not fill the model context. Store full text on disk under
`{data_dir}/tool_artifacts/<call_id>.txt`; keep a frozen preview + path in the
tool message.

## Rules

1. Threshold: `TW_AI_TOOL_ARTIFACT_CHARS` (default 6000) on tool result content length.
2. Preview: first ~1200 chars + notice with absolute path.
3. Preview is frozen once written (no rewrite that would break prefix cache mid-run).
4. Noise drop: after compaction, prefer deleting superseded large tool bodies that
   are already covered by a summary node — do not re-summarize pure noise.

## Non-goals

Semantic embeddings; rewriting historical tool previews after the fact.
