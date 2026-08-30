#!/usr/bin/env python3
"""Capture AI platform UI screenshots for demo artifacts."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

ART = Path("/opt/cursor/artifacts")
ART.mkdir(parents=True, exist_ok=True)
DISPLAY = os.environ.get("DISPLAY", ":1")
ENV = {**os.environ, "DISPLAY": DISPLAY}


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, env=ENV, capture_output=True, text=True)


def main_window() -> tuple[str, int, int, int, int]:
    best, best_w = None, 0
    for wid in run(["xdotool", "search", "--name", "TerminalWisely"]).stdout.split():
        out = run(["xdotool", "getwindowgeometry", "--shell", wid]).stdout
        vals = dict(line.split("=", 1) for line in out.strip().split("\n") if "=" in line)
        w = int(vals.get("WIDTH", "0"))
        if w > best_w:
            best, best_w = wid, w
    if not best or best_w < 200:
        raise RuntimeError("TerminalWisely window not found")
    out = run(["xdotool", "getwindowgeometry", "--shell", best]).stdout
    vals = dict(line.split("=", 1) for line in out.strip().split("\n") if "=" in line)
    return best, int(vals["X"]), int(vals["Y"]), int(vals["WIDTH"]), int(vals["HEIGHT"])


def prepare(wid: str) -> tuple[int, int, int, int]:
    run(["xdotool", "windowmap", wid], ).returncode
    run(["xdotool", "windowactivate", "--sync", wid])
    run(["xdotool", "windowsize", "--sync", wid, "1400", "860"])
    run(["xdotool", "windowmove", "--sync", wid, "20", "80"])
    time.sleep(0.8)
    _, x, y, w, h = main_window()
    return x, y, w, h


def screen_click(sx: int, sy: int) -> None:
    run(["xdotool", "mousemove", "--sync", str(sx), str(sy), "click", "1"])


def win_click(wid: str, rx: int, ry: int, x: int, y: int) -> None:
    # Try both window-relative and absolute screen coords
    run(["xdotool", "mousemove", "--window", wid, str(rx), str(ry), "click", "1"])
    time.sleep(0.15)
    screen_click(x + rx, y + ry)


def shot(path: Path) -> None:
    run(["scrot", str(path)])


def crop_panel(full: Path, out: Path, x: int, y: int, w: int, h: int, pw: int = 450) -> None:
    from PIL import Image

    im = Image.open(full)
    im.crop((x + w - pw, y, x + w, y + h)).save(out)


def crop_body(full: Path, out: Path, x: int, y: int, w: int, h: int, pw: int = 450) -> None:
    from PIL import Image

    im = Image.open(full)
    im.crop((x + w - pw, y + 130, x + w, y + h)).save(out)


def ocr(path: Path) -> str:
    return run(["tesseract", str(path), "stdout"]).stdout or ""


def is_platform(text: str) -> bool:
    return any(
        k in text
        for k in (
            "MCP",
            "Skills",
            "memory",
            "Memory",
            "eval",
            "Eval",
            "regression",
            "verified",
            "数据源",
            "评测",
            "tw-k8s",
            "Run eval",
            "运行评测",
        )
    )


def main() -> int:
    wid, wx, wy, ww, wh = main_window()
    prepare(wid)
    wid, wx, wy, ww, wh = main_window()
    tmp = ART / "_cap_full.png"

    # 1) AI panel
    win_click(wid, 1215, 48, wx, wy)
    time.sleep(3)
    shot(tmp)
    crop_panel(tmp, ART / "demo-01-ai-panel.png", wx, wy, ww, wh)
    print("demo-01 ok")

    # 2) Platform — try several click strategies
    plat_open = False
    attempts = [
        ("win1280_127", lambda: win_click(wid, 1280, 127, wx, wy)),
        ("screen1300_207", lambda: screen_click(wx + 1280, wy + 127)),
        ("win1270_127", lambda: win_click(wid, 1270, 127, wx, wy)),
        ("alt_shift_p", lambda: (
            win_click(wid, 1200, 400, wx, wy),
            time.sleep(0.3),
            run(["xdotool", "key", "--window", wid, "alt", "shift", "p"]),
        )),
        ("double_click", lambda: run([
            "xdotool", "mousemove", "--window", wid, "1280", "127",
            "click", "--repeat", "2", "--delay", "150", "1",
        ])),
    ]
    for name, fn in attempts:
        fn()
        time.sleep(2)
        shot(tmp)
        crop_panel(tmp, ART / "demo-02-platform-panel.png", wx, wy, ww, wh)
        text = ocr(ART / "demo-02-platform-panel.png")
        if is_platform(text):
            print(f"platform opened via {name}")
            plat_open = True
            break
        # if we toggled on then off, one more click
        crop_body(tmp, ART / "_body_check.png", wx, wy, ww, wh)
        if is_platform(ocr(ART / "_body_check.png")):
            print(f"platform body via {name}")
            plat_open = True
            shot(tmp)
            crop_panel(tmp, ART / "demo-02-platform-panel.png", wx, wy, ww, wh)
            break

    if not plat_open:
        print("platform panel not opened by automation", file=sys.stderr)

    if plat_open:
        # 3) Eval
        for wy_click in (710, 680, 740, 650):
            win_click(wid, 1260, wy_click, wx, wy)
            time.sleep(0.4)
        time.sleep(20)
        shot(tmp)
        crop_panel(tmp, ART / "demo-03-eval-results.png", wx, wy, ww, wh)
        print("demo-03 ok")

        # 4) Memory search
        win_click(wid, 1050, 480, wx, wy)
        run(["xdotool", "key", "--window", wid, "ctrl+a", "BackSpace"])
        run(["xdotool", "type", "--window", wid, "--delay", "8", "ImagePullBackOff"])
        win_click(wid, 1260, 480, wx, wy)
        time.sleep(2)
        shot(tmp)
        crop_panel(tmp, ART / "demo-04-memory-search.png", wx, wy, ww, wh)
        print("demo-04 ok")

        # 5) Chat + trace
        win_click(wid, 1280, 127, wx, wy)
        time.sleep(1.5)
        win_click(wid, 1100, 780, wx, wy)
        run(["xdotool", "key", "--window", wid, "ctrl+a", "BackSpace"])
        run(["xdotool", "type", "--window", wid, "--delay", "8", "list pods in demo namespace"])
        win_click(wid, 1340, 850, wx, wy)
        time.sleep(22)
        shot(tmp)
        crop_panel(tmp, ART / "demo-05-run-trace.png", wx, wy, ww, wh)
        print("demo-05 ok")

    # Full window
    shot(ART / "demo-full-window.png")
    results = {
        "platform_open": plat_open,
        "artifacts": [str(p.name) for p in sorted(ART.glob("demo-*.png"))],
    }
    (ART / "screenshot-capture-results.json").write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    return 0 if plat_open else 1


if __name__ == "__main__":
    sys.exit(main())
