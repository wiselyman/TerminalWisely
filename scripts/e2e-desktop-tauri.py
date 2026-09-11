#!/usr/bin/env python3
"""Native Tauri desktop E2E (xdotool + OCR). Skips gracefully without DISPLAY/window."""

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


def run(cmd: list[str], check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, env=ENV, capture_output=True, text=True, check=check)


def main() -> int:
    if not DISPLAY or not run(["which", "xdotool"], check=False).returncode == 0:
        print(json.dumps({"skipped": True, "reason": "no DISPLAY or xdotool"}))
        return 0

    results: dict = {"steps": [], "pass": False}

    # Ensure preview for Tauri webview
    if run(["curl", "-sf", "http://127.0.0.1:1420/"], check=False).returncode != 0:
        run(["bash", "-c", "cd /workspace && npx vite preview --host 127.0.0.1 --port 1420 &"], check=False)
        time.sleep(4)

    app = "/workspace/src-tauri/target/debug/TerminalWisely"
    if not Path(app).exists():
        results["steps"].append({"step": "binary", "ok": False})
        print(json.dumps(results, indent=2))
        return 1

    run(["pkill", "-f", "target/debug/TerminalWisely"], check=False)
    time.sleep(1)
    run(
        [
            "env",
            f"DISPLAY={DISPLAY}",
            "KUBECONFIG=/home/ubuntu/.kube/config",
            app,
        ],
        check=False,
    )
    time.sleep(10)

    wid = None
    for _ in range(20):
        ids = run(["xdotool", "search", "--name", "TerminalWisely"]).stdout.split()
        best_w = 0
        for i in ids:
            out = run(["xdotool", "getwindowgeometry", "--shell", i]).stdout
            w = int(next(l.split("=")[1] for l in out.splitlines() if l.startswith("WIDTH=")))
            if w > best_w:
                best_w, wid = w, i
        if wid and best_w > 200:
            break
        time.sleep(1)

    if not wid:
        results["steps"].append({"step": "window", "ok": False, "note": "TerminalWisely not found"})
        print(json.dumps(results, indent=2))
        return 1

    run(["xdotool", "windowactivate", "--sync", wid])
    run(["xdotool", "windowmove", "--sync", wid, "20", "80"])
    run(["xdotool", "windowsize", "--sync", wid, "1400", "860"])
    time.sleep(1)
    results["steps"].append({"step": "window", "ok": True})

    run(["xdotool", "mousemove", "--window", wid, "1215", "48", "click", "1"])
    time.sleep(4)
    results["steps"].append({"step": "ai_panel", "ok": True})

    run(["xdotool", "key", "--window", wid, "alt", "shift", "p"])
    time.sleep(2)
    shot = ART / "_desktop_e2e.png"
    run(["scrot", str(shot)])
    crop = ART / "e2e-desktop-platform.png"
    from PIL import Image

    im = Image.open(shot)
    im.crop((20 + 1400 - 450, 80, 20 + 1400, 80 + 860)).save(crop)
    ocr = run(["tesseract", str(crop), "stdout"], check=False).stdout or ""
    plat_ok = any(k in ocr for k in ("MCP", "eval", "Eval", "评测", "Platform", "memory", "Memory"))
    results["steps"].append({"step": "platform_panel", "ok": plat_ok, "ocr": ocr[:200]})

    run(["xdotool", "mousemove", "--window", wid, "1260", "710", "click", "1"])
    time.sleep(30)
    run(["scrot", str(shot)])
    im = Image.open(shot)
    im.crop((20 + 1400 - 450, 80, 20 + 1400, 80 + 860)).save(ART / "e2e-desktop-eval.png")
    ocr2 = run(["tesseract", str(ART / "e2e-desktop-eval.png"), "stdout"], check=False).stdout or ""
    eval_ok = any(k in ocr2 for k in ("8/8", "8 / 8", "100", "passed", "k8s_", "通过"))
    results["steps"].append({"step": "eval_ui", "ok": eval_ok, "ocr": ocr2[:200]})

    results["pass"] = plat_ok and eval_ok
    out = ART / "e2e-desktop-results.json"
    out.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(json.dumps(results, indent=2, ensure_ascii=False))
    return 0 if results["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
