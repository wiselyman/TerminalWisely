# AI exec idle-after-output timeout

## Problem

Reactive one-off hang patches (password, sudo, …) do not scale. Background daemons (`cmd &`) and other “output then silent forever” cases keep the SSH exec channel open until the total timeout (hours).

## Rule (generic)

| Phase | Timeout |
|-------|---------|
| No bytes yet | first-output (~45s) — existing |
| After any stdout/stderr byte | **idle-after-output (~60s)** with no new bytes → close channel, `timed_out=true` |
| After remote `ExitStatus` | **post-exit drain (~5s)** then close (orphans from `cmd &` must not hold the tool) |
| Absolute cap | total (~7200s) — existing |
| Interactive password last line | abort immediately — existing |

Applies to **both** plain AI exec and **sudo `-S` password** stdin capture (previously password path had no idle → multi-minute hangs).

No binary/command special-cases.

## Success

`Xorg … &; sleep 4; xrandr` finishes or fails within ~60s after last `xrandr` line, not minutes later.
After ExitStatus, finish within ~5s even if a background child still holds stdout.
