#!/usr/bin/env bash
# Enrich GitHub Release latest.json with linux-*-deb / linux-*-rpm custom targets.
# Usage: scripts/enrich-latest-json.sh <tag> [owner/repo]
set -euo pipefail

TAG="${1:?tag required, e.g. v0.0.1}"
REPO="${2:-${GITHUB_REPOSITORY:-wiselyman/TerminalWisely}}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export GITHUB_REPOSITORY="$REPO"
echo "Fetching release assets for ${REPO}@${TAG}…"
gh api "repos/${REPO}/releases/tags/${TAG}" >"$TMP/release.json"

# Download all .sig files for reading signature bodies
mkdir -p "$TMP/sigs"
gh release download "$TAG" --repo "$REPO" -p "*.sig" -D "$TMP/sigs" || true

python3 - "$TMP/release.json" "$TMP/sigs" "$TMP/latest.json" <<'PY'
import json
import sys
from pathlib import Path

release = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
sig_dir = Path(sys.argv[2])
out_path = Path(sys.argv[3])

assets = {
    a["name"]: a["browser_download_url"]
    for a in release.get("assets", [])
    if a.get("name") and a.get("browser_download_url")
}
names = [n for n in assets if not n.endswith(".sig")]

def read_sig(artifact: str) -> str | None:
    path = sig_dir / f"{artifact}.sig"
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8").strip()

def find(*preds) -> str | None:
    for n in names:
        if all(p(n) for p in preds):
            return n
    return None

platforms: dict[str, dict[str, str]] = {}

def add(platform_key: str, artifact: str | None) -> None:
    if not artifact:
        return
    url = assets.get(artifact)
    sig = read_sig(artifact)
    if not url or not sig:
        print(f"warn: skip {platform_key} artifact={artifact!r} url={bool(url)} sig={bool(sig)}", file=sys.stderr)
        return
    platforms[platform_key] = {"url": url, "signature": sig}

tag = release.get("tag_name") or ""
version = tag.lstrip("v")
notes = (release.get("body") or "").strip()
pub_date = release.get("published_at") or ""

# macOS .app.tar.gz (may be one or two)
app_tars = [n for n in names if n.endswith(".app.tar.gz")]
arm_tar = next((n for n in app_tars if any(x in n.lower() for x in ("aarch64", "arm64"))), None)
x64_tar = next((n for n in app_tars if any(x in n.lower() for x in ("x64", "x86_64"))), None)
if arm_tar:
    add("darwin-aarch64", arm_tar)
if x64_tar:
    add("darwin-x86_64", x64_tar)
if len(app_tars) == 1:
    add("darwin-aarch64", app_tars[0])
    add("darwin-x86_64", app_tars[0])
elif len(app_tars) >= 2 and not arm_tar and not x64_tar:
    add("darwin-aarch64", app_tars[0])
    add("darwin-x86_64", app_tars[1])

# Windows NSIS
add(
    "windows-x86_64",
    find(lambda n: n.endswith("-setup.exe"), lambda n: "arm64" not in n.lower()),
)
add(
    "windows-aarch64",
    find(lambda n: n.endswith("-setup.exe"), lambda n: "arm64" in n.lower()),
)

# Linux AppImage → default linux-{arch}
add(
    "linux-x86_64",
    find(lambda n: n.endswith(".AppImage"), lambda n: "amd64" in n.lower() or "x86_64" in n.lower()),
)
add(
    "linux-aarch64",
    find(lambda n: n.endswith(".AppImage"), lambda n: "aarch64" in n.lower() or "arm64" in n.lower()),
)

# Linux deb/rpm custom targets
add("linux-x86_64-deb", find(lambda n: n.endswith(".deb"), lambda n: "amd64" in n.lower()))
add("linux-x86_64-rpm", find(lambda n: n.endswith(".rpm"), lambda n: "x86_64" in n.lower()))
add("linux-aarch64-deb", find(lambda n: n.endswith(".deb"), lambda n: "arm64" in n.lower()))
add("linux-aarch64-rpm", find(lambda n: n.endswith(".rpm"), lambda n: "aarch64" in n.lower()))

out = {
    "version": version,
    "notes": notes[:4000],
    "pub_date": pub_date,
    "platforms": platforms,
}
out_path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print(f"wrote {out_path} with platforms: {', '.join(sorted(platforms))}")
if not platforms:
    raise SystemExit("no platforms resolved — check release assets and .sig files")
PY

gh release upload "$TAG" "$TMP/latest.json" --repo "$REPO" --clobber
echo "Uploaded latest.json to ${REPO}@${TAG}"
