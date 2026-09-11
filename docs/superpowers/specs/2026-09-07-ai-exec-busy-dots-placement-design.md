# AI exec card busy dots placement

## Goal

Make in-tool execution feedback quieter and keep post-tool wait visible with the existing thinking affordance.

## Changes

1. Remove the top blue live banner (`ai-engineer-exec-live-banner`: dots + “正在执行此命令 · Xs”).
2. While a tool card is running, show `AiBusyDots` in the head row: Terminal glyph → dots → title text.
3. After host tool finishes and before assistant tokens stream, keep showing the existing chat busy line (`ai-engineer-busy-phase` +「思考中…」). Fix any gap where `modelPhase` / busy phase hides that line between tool end and first token.

## Out of scope

New thinking visuals, morph redesign, hang/timeout logic.
