# AI Chat Streaming Scroll Stability Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every AI chat transcript following the active response at the bottom instead of jumping into the middle during streaming.

**Architecture:** All chat surfaces share `AiEngineerPanel` and `chatScroll` policies. Add a Playwright regression that begins a new response from a mid-history position, streams multiple chunks, and asserts the active transcript follows the end. Only change the shared scroll policy if the test demonstrates the failure at the wrong layer.

**Tech Stack:** React, TypeScript, Playwright, Vitest.

**Spec:** User report and screenshot in the 2026-10-28 conversation.

## Global Constraints

- All AI chat surfaces continue using the shared transcript scroll behavior.
- A newly started response follows to the latest output; intentional user wheel/touch navigation during an existing response remains respected.
- Do not change chat history, streaming, or message rendering behavior beyond scroll position.

## Review Focus

- New response starts while the previous transcript is long and the viewport had been moved away from the bottom.
- Repeated streamed content growth does not leave the viewport in the middle.
- Wheel navigation during an active response still prevents forced follow.

---

## 要保住的旧行为

- A new AI response follows its latest output to the bottom across Home Local, AI Local, and SSH AI chat surfaces because they share `AiEngineerPanel`.
- When a user deliberately wheels away during a response, later output does not forcibly move the transcript back to the bottom.
- Opening, restoring, and resizing a chat preserves existing near-bottom and mid-history behavior.

## 架构

- `src/components/aiEngineer/AiEngineerPanel.tsx` coordinates stream, busy, and scroll intent using `chatScroll` helpers.
- `src/lib/aiEngineer/chatScroll.ts` owns pure follow/pin decisions; add a helper only if a regression test proves a missing policy.
- `e2e/ai-chat-scroll-maximize.spec.ts` exercises streaming across the shared AI panel, including a new run from mid-history.
- No backend or chat data changes are planned.

## 设计

- The user sends a prompt while the transcript is long. When the assistant begins responding, the transcript follows the newest streamed output at the bottom.
- If the user intentionally wheels upward during that response, the scroll position stays where they chose while more output arrives.
- This has no separate status message; the scroll position itself is the feedback. Existing error and approval cards retain their current behavior.

### Task 1: Reproduce and Correct Mid-Transcript Streaming Jump

**Files:**
- Modify: `src/components/aiEngineer/AiEngineerPanel.tsx` only if root cause points to lifecycle wiring.
- Modify: `src/lib/aiEngineer/chatScroll.ts` only if root cause is a missing pure scroll policy.
- Test: `e2e/ai-chat-scroll-maximize.spec.ts`
- Test: `src/lib/aiEngineer/chatScroll.test.ts` if a pure policy changes.

**Interfaces:**
- Consumes: existing `simulateAiBusy`, `simulateStreamingAssistantGrow`, and shared transcript scrolling.
- Produces: newly started stream stays at the transcript end unless the user deliberately wheels/touches away after streaming begins.

- [x] **Step 1: Add a Playwright regression** starting a new response after a long transcript was intentionally scrolled to mid-history.
- [x] **Step 2: Run it and gather scroll telemetry.** The new-run case and existing streamed-growth / wheel-release cases all pass; the reported jump did not reproduce.
- [ ] **Step 3: Trace a reproduced failing layer and make a minimal correction.** No production scroll change is justified until a regression reproduces the reported jump.
- [x] **Step 4: Run the new case and existing stream-follow / wheel-release cases.**
- [x] **Step 5: Run the complete repository test suite.**
- [x] **Step 6: Commit** the regression baseline after required checks pass.
