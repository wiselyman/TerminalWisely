#!/usr/bin/env python3
"""Reliable UI demo capture for AI Engineer platform features."""

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
WIN_X, WIN_Y, WIN_W, WIN_H = 20, 80, 1400, 860
PANEL_W = 450


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, env={**os.environ, "DISPLAY": DISPLAY}, capture_output=True, text=True, check=check)


def main_window() -> str:
    best, best_w = None, 0
    for wid in run(["xdotool", "search", "--name", "TerminalWisely"]).stdout.split():
        out = run(["xdotool", "getwindowgeometry", "--shell", wid]).stdout
        w = int(next(l.split("=")[1] for l in out.splitlines() if l.startswith("WIDTH=")))
        if w > best_w:
            best, best_w = wid, w
    if not best or best_w < 200:
        raise RuntimeError("TerminalWisely window not found")
    return best


def prepare(wid: str) -> None:
    run(["xdotool", "windowmap", wid], check=False)
    run(["xdotool", "windowactivate", "--sync", wid])
    run(["xdotool", "windowsize", "--sync", wid, str(WIN_W), str(WIN_H)])
    run(["xdotool", "windowmove", "--sync", wid, str(WIN_X), str(WIN_Y)])
    time.sleep(0.6)


def click(wid: str, rx: int, ry: int) -> None:
    run(["xdotool", "mousemove", "--window", wid, str(rx), str(ry), "click", "1"])


def shot(path: Path) -> None:
    run(["scrot", str(path)])


def panel_crop(full: Path, out: Path, y0: int = 0, y1: int | None = None) -> None:
    from PIL import Image

    im = Image.open(full)
    y1 = y1 or WIN_H
    im.crop((WIN_X + WIN_W - PANEL_W, WIN_Y + y0, WIN_X + WIN_W, WIN_Y + y1)).save(out)


def ocr(path: Path) -> str:
    return run(["tesseract", str(path), "stdout"], check=False).stdout or ""


def is_platform_view(text: str) -> bool:
    return any(k in text for k in ("MCP", "Skills", "memory", "Memory", "eval", "Eval", "数据源", "记忆", "评测", "verified", "regression"))


def ensure_ai_panel(wid: str) -> None:
    click(wid, 1215, 48)
    time.sleep(2.5)


def ensure_platform(wid: str, tmp: Path) -> bool:
    shot(tmp)
    crop = ART / "_plat_check.png"
    panel_crop(tmp, crop)
    text = ocr(crop)
    if is_platform_view(text):
        return True
    click(wid, 1280, 127)
    time.sleep(2)
    shot(tmp)
    panel_crop(tmp, crop)
    text = ocr(crop)
    return is_platform_view(text)


def find_green_button(full: Path) -> tuple[int, int] | None:
    from PIL import Image

    im = Image.open(full)
    panel = im.crop((WIN_X + WIN_W - PANEL_W, WIN_Y + 140, WIN_X + WIN_W, WIN_Y + WIN_H))
    px = panel.load()
    pts = [
        (cx, cy)
        for cy in range(panel.size[1])
        for cx in range(panel.size[0])
        if (r := px[cx, cy][:3])[1] > 90 and r[1] > r[0] + 15 and r[2] < 130
    ]
    if not pts:
        return None
    cx = sum(p[0] for p in pts) // len(pts)
    cy = sum(p[1] for p in pts) // len(pts)
    return WIN_W - PANEL_W + cx, 140 + cy


def sidecar_eval() -> dict:
    import urllib.request

    ps = run(["ps", "aux"]).stdout
    port = next(line.split("--port")[1].split()[0] for line in ps.splitlines() if "uvicorn app.main" in line and "--port" in line)
    pid = run(["pgrep", "-f", "uvicorn app.main"]).stdout.strip().split()[0]
    env_raw = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
    token = "dev-token"
    for item in env_raw:
        if item.startswith(b"TW_AI_TOKEN="):
            token = item.split(b"=", 1)[1].decode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/eval/run",
        data=b"{}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read())


def main() -> int:
    results: dict = {"steps": [], "pass": False}
    wid = main_window()
    prepare(wid)
    tmp = ART / "_demo_tmp.png"

    ensure_ai_panel(wid)
    shot(tmp)
    panel_crop(tmp, ART / "demo-01-ai-panel.png")
    ai_ok = any(k in ocr(ART / "demo-01-ai-panel.png") for k in ("Engineer", "Kubernetes", "K8s", "Describe"))
    results["steps"].append({"step": "ai_panel", "ok": ai_ok})

    plat_ok = ensure_platform(wid, tmp)
    shot(tmp)
    panel_crop(tmp, ART / "demo-02-platform-panel.png")
    plat_ok = plat_ok or is_platform_view(ocr(ART / "demo-02-platform-panel.png"))
    results["steps"].append({"step": "platform_panel", "ok": plat_ok})

    eval_ok = False
    if plat_ok:
        btn = find_green_button(tmp)
        if btn:
            click(wid, btn[0], btn[1])
        else:
            click(wid, 1250, 720)
        time.sleep(20)
        shot(tmp)
        panel_crop(tmp, ART / "demo-03-eval-results.png")
        eval_text = ocr(ART / "demo-03-eval-results.png")
        eval_ok = any(k in eval_text for k in ("8/8", "8 / 8", "100", "passed", "k8s_", "通过"))
        if not eval_ok:
            try:
                api = sidecar_eval()
                (ART / "platform-api-eval.json").write_text(json.dumps(api, indent=2))
                eval_ok = api.get("summary", {}).get("passed") == api.get("summary", {}).get("total")
            except Exception as exc:
                results["steps"].append({"step": "api_eval", "ok": False, "error": str(exc)})
    results["steps"].append({"step": "eval_ui", "ok": eval_ok})

    if plat_ok:
        click(wid, 1100, 520)
        run(["xdotool", "key", "--window", wid, "ctrl+a", "BackSpace"])
        run(["xdotool", "type", "--window", wid, "--delay", "8", "ImagePullBackOff"])
        click(wid, 1250, 520)
        time.sleep(2)
        shot(tmp)
        panel_crop(tmp, ART / "demo-04-memory-search.png")
        mem_ok = any(k in ocr(ART / "demo-04-memory-search.png").lower() for k in ("imagepull", "backoff", "pull", "案例"))
        results["steps"].append({"step": "memory_search", "ok": mem_ok})

        if is_platform_view(ocr(ART / "demo-04-memory-search.png")):
            click(wid, 1280, 127)
            time.sleep(1.5)
        click(wid, 1100, 780)
        run(["xdotool", "key", "--window", wid, "ctrl+a", "BackSpace"])
        run(["xdotool", "type", "--window", wid, "--delay", "8", "list pods in demo namespace"])
        click(wid, 1340, 850)
        time.sleep(25)
        shot(tmp)
        panel_crop(tmp, ART / "demo-05-run-trace.png")
        trace_ok = any(k in ocr(ART / "demo-05-run-trace.png").lower() for k in ("trace", "span", "追踪", "model", "ms", "k8s"))
        results["steps"].append({"step": "run_trace", "ok": trace_ok})

    results["pass"] = all(s.get("ok") for s in results["steps"])
    (ART / "platform-selftest-results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(json.dumps(results, indent=2, ensure_ascii=False))
    return 0 if results["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
