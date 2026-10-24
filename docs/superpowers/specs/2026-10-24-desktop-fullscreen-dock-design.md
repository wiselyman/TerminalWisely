# Desktop Fullscreen Dock Design

## Intent

When a Desktop app window is maximized, let it cover the area currently occupied by the bottom Dock. Keep the Dock discoverable: moving the pointer to the bottom edge reveals it above the maximized app, like the macOS auto-hidden Dock.

## Goals and non-goals

- Goal: maximized Desktop app windows extend to the bottom of the Desktop panel, behind the hidden Dock area.
- Goal: a narrow bottom-edge reveal target shows the Dock as a floating overlay without resizing the maximized app.
- Goal: keep Dock app actions, labels, open/minimized indicators, and keyboard focus access working.
- Non-goal: change window maximize/restore semantics, Dock app ordering, or normal non-maximized layout.
- Non-goal: use native macOS Dock integration; this is an in-app desktop simulation and must work on supported platforms.

## Approaches

1. **Auto-hide Dock overlay (recommended):** Keep the Dock in the desktop shell but remove it from layout flow while a Desktop app is maximized; reveal it on bottom-edge hover/focus as an overlay. This gives the maximized app the Dock's full area and avoids resizing it when the Dock appears.
2. **Keep Dock space reserved:** Hide or fade the Dock while maximized but continue reserving its layout space. This is simpler but does not let the app cover the Dock area, so it does not meet the requested result.

The requested macOS-like behavior points to approach 1. Use a bottom-edge target that remains reachable while the maximized window covers the surface; revealing the Dock must not change the maximized window's bounds.

## Constraints

- Preserve current behavior outside Desktop maximized state.
- Preserve pointer interaction and keyboard access to the Dock.
- Avoid browser/platform-specific native APIs; implement the behavior in the shared React/CSS Desktop shell.
- Add Playwright regression coverage for maximized bounds, Dock hidden by default, bottom-edge reveal, and Dock click behavior.
