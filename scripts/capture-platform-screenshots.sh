#!/usr/bin/env bash
# Capture platform UI screenshots (demo-01 .. demo-05) into /opt/cursor/artifacts/
set -euo pipefail
export DISPLAY="${DISPLAY:-:1}"
ART=/opt/cursor/artifacts
mkdir -p "$ART"

restart_app() {
  pkill -9 -f 'target/debug/TerminalWisely' 2>/dev/null || true
  sleep 2
  DISPLAY="$DISPLAY" KUBECONFIG="${KUBECONFIG:-/home/ubuntu/.kube/config}" \
    /workspace/src-tauri/target/debug/TerminalWisely >>/tmp/tw-app.log 2>&1 &
  for _ in $(seq 1 15); do
    WID=$(xdotool search --name TerminalWisely 2>/dev/null | while read -r id; do
      w=$(xdotool getwindowgeometry --shell "$id" 2>/dev/null | awk -F= '/^WIDTH=/{print $2}')
      [ "${w:-0}" -gt 100 ] && echo "$id"
    done | tail -1)
    [ -n "${WID:-}" ] && break
    sleep 1
  done
  [ -n "${WID:-}" ] || { echo "TerminalWisely window not found" >&2; exit 1; }
  xdotool windowactivate --sync "$WID"
  xdotool windowmove --sync "$WID" 20 80
  xdotool windowsize --sync "$WID" 1400 860
  sleep 1
  echo "$WID"
}

build_frontend() {
  local mode=$1
  (cd /workspace && VITE_UI_DEMO_SCREENSHOTS="$mode" npm run build >/tmp/ui-demo-build.log 2>&1)
  tail -2 /tmp/ui-demo-build.log
  pkill -f 'vite preview' 2>/dev/null || true
  sleep 1
  (cd /workspace && npx vite preview --host 127.0.0.1 --port 1420 >>/tmp/vite-preview.log 2>&1 &)
  sleep 4
}

crop_panel() {
  python3 - "$1" "$2" <<'PY'
from PIL import Image
import sys
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src)
x, y, w, h = 20, 80, 1400, 860
im.crop((x + w - 450, y, x + w, y + h)).save(dst)
PY
}

click_ai() {
  local WID=$1
  xdotool mousemove --window "$WID" 1215 48 click 1
  sleep 4
}

shot() {
  scrot "$1"
}

echo "=== Build (platform mode) ==="
build_frontend platform
WID=$(restart_app)
click_ai "$WID"
shot "$ART/_full.png"
crop_panel "$ART/_full.png" "$ART/demo-01-ai-panel.png"
cp "$ART/demo-01-ai-panel.png" "$ART/demo-01-ai-panel-with-platform-button.png"
sleep 2
shot "$ART/_full.png"
crop_panel "$ART/_full.png" "$ART/demo-02-platform-panel.png"

echo "=== Eval + memory ==="
xdotool mousemove --window "$WID" 1260 710 click 1
sleep 22
shot "$ART/_full.png"
crop_panel "$ART/_full.png" "$ART/demo-03-eval-results.png"

xdotool mousemove --window "$WID" 1050 480 click 1
xdotool key --window "$WID" ctrl+a BackSpace
xdotool type --window "$WID" --delay 8 "ImagePullBackOff"
xdotool mousemove --window "$WID" 1260 480 click 1
sleep 2
shot "$ART/_full.png"
crop_panel "$ART/_full.png" "$ART/demo-04-memory-search.png"

echo "=== Build (chat mode) + trace ==="
build_frontend chat
WID=$(restart_app)
click_ai "$WID"
sleep 2
xdotool mousemove --window "$WID" 1100 780 click 1
xdotool key --window "$WID" ctrl+a BackSpace
xdotool type --window "$WID" --delay 8 "list pods in demo namespace"
xdotool mousemove --window "$WID" 1340 850 click 1
sleep 22
shot "$ART/_full.png"
crop_panel "$ART/_full.png" "$ART/demo-05-run-trace.png"
cp "$ART/_full.png" "$ART/demo-full-window.png"

echo "=== Restore normal build ==="
build_frontend ""

python3 - <<'PY'
import json, subprocess
from pathlib import Path
art = Path('/opt/cursor/artifacts')
checks = {}
for name in ['demo-01-ai-panel.png','demo-02-platform-panel.png','demo-03-eval-results.png','demo-04-memory-search.png','demo-05-run-trace.png']:
    p = art / name
    if not p.exists():
        checks[name] = False
        continue
    ocr = subprocess.run(['tesseract', str(p), 'stdout'], capture_output=True, text=True).stdout
    checks[name] = ocr[:120]
(art / 'screenshot-capture-results.json').write_text(json.dumps(checks, indent=2, ensure_ascii=False))
print(json.dumps(checks, indent=2, ensure_ascii=False))
PY

echo "Done. Artifacts in $ART"
