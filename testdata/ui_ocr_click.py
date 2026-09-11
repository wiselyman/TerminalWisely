#!/usr/bin/env python3
"""OCR-assisted UI click helper for TerminalWisely on DISPLAY=:1."""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytesseract
from PIL import Image, ImageEnhance, ImageOps

os.environ.setdefault("DISPLAY", ":1")


def run(cmd: list[str] | str, check: bool = True) -> str:
    if isinstance(cmd, str):
        proc = subprocess.run(cmd, shell=True, text=True, capture_output=True)
    else:
        proc = subprocess.run(cmd, text=True, capture_output=True)
    if check and proc.returncode != 0:
        raise RuntimeError(f"cmd failed: {cmd}\n{proc.stderr}")
    return (proc.stdout or "") + (proc.stderr or "")


def largest_tw_window() -> tuple[str, dict[str, int]]:
    ids = run("xdotool search --name TerminalWisely").split()
    best = None
    for wid in ids:
        g = run(f"xdotool getwindowgeometry --shell {wid}")
        d = {k: int(v) for k, v in (line.split("=", 1) for line in g.strip().splitlines())}
        area = d["WIDTH"] * d["HEIGHT"]
        if best is None or area > best[0]:
            best = (area, wid, d)
    if not best:
        raise RuntimeError("TerminalWisely window not found")
    return best[1], best[2]


def screenshot(path: Path) -> Path:
    wid, geo = largest_tw_window()
    run(f"xdotool windowactivate --sync {wid}")
    # Import-grab via gnome-screenshot or scrot or import
    if subprocess.call(["which", "gnome-screenshot"], stdout=subprocess.DEVNULL) == 0:
        run(["gnome-screenshot", "-w", "-f", str(path)])
    elif subprocess.call(["which", "scrot"], stdout=subprocess.DEVNULL) == 0:
        run(["scrot", "-u", str(path)])
    else:
        # xwd fallback
        xwd = path.with_suffix(".xwd")
        run(f"xwd -id {wid} -out {xwd}")
        # convert via pillow raw is hard; use ffmpeg x11grab of window region
        run(
            f"ffmpeg -y -f x11grab -video_size {geo['WIDTH']}x{geo['HEIGHT']} "
            f"-i :1.0+{geo['X']},{geo['Y']} -frames:v 1 {path}",
            check=False,
        )
        if not path.exists():
            raise RuntimeError("screenshot failed")
    return path


def find_texts(img: Image.Image, needle: str, scale: float = 2.0):
    # Upscale for OCR
    big = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(big)
    gray = ImageEnhance.Contrast(gray).enhance(1.8)
    data = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)
    needle_l = needle.lower()
    hits = []
    for i, text in enumerate(data["text"]):
        if not text or needle_l not in text.lower():
            continue
        conf = float(data["conf"][i])
        if conf < 30:
            continue
        x = int(data["left"][i] / scale)
        y = int(data["top"][i] / scale)
        w = int(data["width"][i] / scale)
        h = int(data["height"][i] / scale)
        hits.append({"text": text, "conf": conf, "x": x, "y": y, "w": w, "h": h})
    return hits


def click_rel(geo: dict[str, int], x: int, y: int, double: bool = False):
    abs_x = geo["X"] + x
    abs_y = geo["Y"] + y
    run(f"xdotool mousemove --sync {abs_x} {abs_y} click {'--repeat 2 --delay 80 ' if double else ''}1")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["shot", "find", "click", "click-all", "type", "key"])
    ap.add_argument("arg", nargs="?", default="")
    ap.add_argument("--out", default="/tmp/tw-shot.png")
    ap.add_argument("--index", type=int, default=0)
    ap.add_argument("--ox", type=int, default=0, help="x offset from text center")
    ap.add_argument("--oy", type=int, default=0)
    ap.add_argument("--double", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.action == "shot":
        p = screenshot(Path(args.out))
        print(p)
        return

    if args.action == "type":
        run(["xdotool", "type", "--delay", "30", "--", args.arg])
        return

    if args.action == "key":
        run(f"xdotool key --clearmodifiers {args.arg}")
        return

    wid, geo = largest_tw_window()
    run(f"xdotool windowactivate --sync {wid}")
    with tempfile.TemporaryDirectory() as td:
        shot = Path(td) / "w.png"
        # Capture window region with ffmpeg
        run(
            f"ffmpeg -y -hide_banner -loglevel error -f x11grab "
            f"-video_size {geo['WIDTH']}x{geo['HEIGHT']} "
            f"-i :1.0+{geo['X']},{geo['Y']} -frames:v 1 {shot}"
        )
        img = Image.open(shot)
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        img.save(args.out)

        if args.action == "find":
            hits = find_texts(img, args.arg)
            for i, h in enumerate(hits):
                print(f"{i}: {h}")
            if not hits:
                sys.exit(2)
            return

        if args.action in ("click", "click-all"):
            hits = find_texts(img, args.arg)
            if args.list or not hits:
                for i, h in enumerate(hits):
                    print(f"{i}: {h}")
            if not hits:
                sys.exit(2)
            targets = hits if args.action == "click-all" else [hits[args.index]]
            for h in targets:
                cx = h["x"] + h["w"] // 2 + args.ox
                cy = h["y"] + h["h"] // 2 + args.oy
                print(f"click {h['text']!r} at window ({cx},{cy}) screen ({geo['X']+cx},{geo['Y']+cy})")
                click_rel(geo, cx, cy, double=args.double)
            return


if __name__ == "__main__":
    main()
