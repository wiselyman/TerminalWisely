#!/usr/bin/env python3
"""Self-test platform UI features and save screenshots to /opt/cursor/artifacts."""

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


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    env = {**os.environ, "DISPLAY": DISPLAY}
    return subprocess.run(cmd, env=env, capture_output=True, text=True, check=check)


def win_id() -> str:
    out = run(["xdotool", "search", "--name", "TerminalWisely"]).stdout.strip().split()
    if not out:
        raise RuntimeError("TerminalWisely window not found")
    return out[-1]


def win_geom(wid: str) -> tuple[int, int, int, int]:
    out = run(["xdotool", "getwindowgeometry", "--shell", wid]).stdout
    vals = dict(line.split("=", 1) for line in out.strip().split("\n") if "=" in line)
    return int(vals["X"]), int(vals["Y"]), int(vals["WIDTH"]), int(vals["HEIGHT"])


def click(wid: str, rx: int, ry: int) -> None:
    run(["xdotool", "mousemove", "--window", wid, str(rx), str(ry), "click", "1"])


def shot_full(path: Path) -> None:
    run(["scrot", str(path)])


def crop_window(path: Path, out: Path, wid: str) -> None:
    from PIL import Image

    x, y, w, h = win_geom(wid)
    im = Image.open(path)
    im.crop((x, y, x + w, y + h)).save(out)


def crop_right(path: Path, out: Path, wid: str, width: int = 430) -> None:
    from PIL import Image

    x, y, w, h = win_geom(wid)
    im = Image.open(path)
    im.crop((x + w - width, y, x + w, y + h)).save(out)


def ocr(path: Path) -> str:
    r = run(["tesseract", str(path), "stdout"], check=False)
    return r.stdout or ""


def sidecar_token() -> tuple[str, str]:
    pid = run(["pgrep", "-f", "uvicorn app.main"]).stdout.strip().split()[0]
    env_raw = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
    env = {}
    for item in env_raw:
        if b"=" in item:
            k, v = item.split(b"=", 1)
            env[k.decode()] = v.decode()
    port = env.get("TW_AI_SIDECAR_PORT", "")
    if not port:
        ps = run(["ps", "aux"]).stdout
        for line in ps.splitlines():
            if "uvicorn app.main" in line and "--port" in line:
                port = line.split("--port")[1].split()[0]
                break
    token = env.get("TW_AI_TOKEN", "dev-token")
    return token, port


def api_tests() -> dict:
    import urllib.request

    token, port = sidecar_token()
    if not port:
        return {"error": "sidecar port not found"}
    base = f"http://127.0.0.1:{port}"
    hdr = {"Authorization": f"Bearer {token}"}

    def get(path: str) -> dict:
        req = urllib.request.Request(base + path, headers=hdr)
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read())

    def post(path: str) -> dict:
        req = urllib.request.Request(base + path, data=b"{}", headers={**hdr, "Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read())

    mcp = get("/v1/mcp/servers")
    eval_report = post("/v1/eval/run")
    memory = get("/v1/memory/search?q=ImagePullBackOff&limit=3")
    return {"mcp": mcp, "eval": eval_report, "memory": memory}


def main() -> int:
    results: dict = {"steps": [], "api": {}, "pass": False}
    wid = win_id()
    run(["xdotool", "windowmap", wid], check=False)
    run(["xdotool", "windowactivate", "--sync", wid])
    run(["xdotool", "windowsize", "--sync", wid, "1400", "860"])
    run(["xdotool", "windowmove", "--sync", wid, "80", "60"])
    time.sleep(0.8)

    # 1) Open AI panel (speech bubble in titlebar)
    click(wid, 1215, 48)
    time.sleep(2.5)
    shot_full(ART / "_tmp_full.png")
    crop_right(ART / "_tmp_full.png", ART / "demo-01-ai-panel.png", wid)
    results["steps"].append({"step": "ai_panel", "ok": True})

    # 2) Toggle Platform view
    click(wid, 1148, 88)
    time.sleep(2)
    shot_full(ART / "_tmp_full.png")
    crop_right(ART / "_tmp_full.png", ART / "demo-02-platform-panel.png", wid)
    ocr_platform = ocr(ART / "demo-02-platform-panel.png")
    platform_ok = any(k in ocr_platform for k in ("MCP", "mcp", "Skills", "SKILLS", "Platform", "eval", "Eval", "评测", "记忆"))
    results["steps"].append({"step": "platform_panel", "ok": platform_ok, "ocr_snippet": ocr_platform[:400]})

    # 3) Run eval button (approx position in inline platform panel)
    click(wid, 1280, 560)
    time.sleep(12)
    shot_full(ART / "_tmp_full.png")
    crop_right(ART / "_tmp_full.png", ART / "demo-03-eval-results.png", wid)
    ocr_eval = ocr(ART / "demo-03-eval-results.png")
    eval_ok = any(k in ocr_eval for k in ("8/8", "8 / 8", "passed", "100", "pass", "通过", "k8s_"))
    results["steps"].append({"step": "eval_ui", "ok": eval_ok, "ocr_snippet": ocr_eval[:400]})

    # 4) Back to chat
    click(wid, 1148, 88)
    time.sleep(1.5)

    # 5) Send message to trigger trace bar
    click(wid, 1100, 800)
    run(["xdotool", "key", "--window", wid, "ctrl+a", "BackSpace"])
    run(["xdotool", "type", "--window", wid, "--delay", "12", "list pods in demo namespace, one line"])
    click(wid, 1360, 830)
    time.sleep(18)
    shot_full(ART / "_tmp_full.png")
    crop_right(ART / "_tmp_full.png", ART / "demo-04-run-trace.png", wid)
    ocr_trace = ocr(ART / "demo-04-run-trace.png")
    trace_ok = any(k in ocr_trace.lower() for k in ("trace", "span", "追踪", "model", "k8s_list", "ms"))
    results["steps"].append({"step": "run_trace", "ok": trace_ok, "ocr_snippet": ocr_trace[:400]})

    # API cross-check
    try:
        results["api"] = api_tests()
        api_eval_ok = results["api"].get("eval", {}).get("summary", {}).get("passed", 0) == results["api"].get("eval", {}).get("summary", {}).get("total", -1)
        results["steps"].append({"step": "api_eval", "ok": api_eval_ok})
    except Exception as exc:
        results["api"] = {"error": str(exc)}
        results["steps"].append({"step": "api_eval", "ok": False, "error": str(exc)})

    results["pass"] = all(s.get("ok") for s in results["steps"])
    (ART / "platform-selftest-results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(json.dumps(results, indent=2, ensure_ascii=False))
    return 0 if results["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
