# AI Harness — Model-in-loop recovery (stop enumerating)

Date: 2026-07-31  
Status: approved for implementation  
Supersedes (in part): fail-stop-ends-run in `2026-07-31-ops-lacs-harness-design.md`

## Problem

Recovery catalogues and “one stderr → one harness branch” do not scale. Unknown
failures are infinite. Ending the agent run with “请手动继续” after a surprise
error is product failure — Codex / Cursor / Claude Code do not work that way.

## Goal

**Model owns the next command after any tool failure** (within budget).  
**Harness owns** SAFE/CONFIRM/BLOCK, sudo Confirm, audit, request/tool budgets,
and honest verify/conclusion — not a decision tree of recoveries.

## Design

```
User goal → Model chooses tool → Run tool → Observe stdout/stderr
         ↑_________________________________________|
                         until Done | Budget | Hard block
```

1. **Primary loop** — pydantic-ai `agent.run` with tools. Every non-zero /
   denied / unexpected result returns to the model for another tool turn.
2. **Harness seed (install)** — may auto-run low-risk clone/probe to start
   progress. Must not exclusively close the install; deps stay model-driven
   (with Confirm on high-risk batches).
3. **Fail-stop revised** — first hard failure stops *remaining steps of the
   current approved OpsPlan snapshot*. It does **not** end the agent run.
   Evidence returns to the model to replan; new mutate commands re-enter policy.
4. **Recovery catalogue** — optional accelerator (e.g. resume after apt install
   python3-venv). Empty proposals never alone conclude the run.
5. **Conclusion** — never “手动安装/手动继续” while tool budget remains.
   Incomplete only after budget / user reject / BLOCK / explicit hard blocker.

## Invariants

- Product names never appear in recovery / install logic.
- Mutate commands still pass policy + approval; harness does not silently
  rewrite an *already-approved* command line, but the model may propose a
  *new* plan after failure.
- Clone ≠ install complete; false success overwritten by harness summary only
  when evidence contradicts success, or the run has truly stopped.

## Non-goals

- Expanding `recover.py` for more distro error strings as product work.
- Embedding SysKnife / OpenHands.
