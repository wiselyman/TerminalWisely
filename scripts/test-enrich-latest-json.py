#!/usr/bin/env python3
"""Unit-test platform key mapping used by enrich-latest-json.sh (no network)."""

from __future__ import annotations


def resolve_platforms(names: list[str]) -> dict[str, str]:
    """Map artifact names → platform keys (same rules as enrich script)."""
    names = [n for n in names if not n.endswith(".sig")]
    platforms: dict[str, str] = {}

    def find(*preds):
        for n in names:
            if all(p(n) for p in preds):
                return n
        return None

    def add(key: str, artifact: str | None) -> None:
        if artifact:
            platforms[key] = artifact

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

    add(
        "windows-x86_64",
        find(lambda n: n.endswith("-setup.exe"), lambda n: "arm64" not in n.lower()),
    )
    add(
        "windows-aarch64",
        find(lambda n: n.endswith("-setup.exe"), lambda n: "arm64" in n.lower()),
    )
    add(
        "linux-x86_64",
        find(
            lambda n: n.endswith(".AppImage"),
            lambda n: "amd64" in n.lower() or "x86_64" in n.lower(),
        ),
    )
    add(
        "linux-aarch64",
        find(
            lambda n: n.endswith(".AppImage"),
            lambda n: "aarch64" in n.lower() or "arm64" in n.lower(),
        ),
    )
    add("linux-x86_64-deb", find(lambda n: n.endswith(".deb"), lambda n: "amd64" in n.lower()))
    add("linux-x86_64-rpm", find(lambda n: n.endswith(".rpm"), lambda n: "x86_64" in n.lower()))
    add("linux-aarch64-deb", find(lambda n: n.endswith(".deb"), lambda n: "arm64" in n.lower()))
    add("linux-aarch64-rpm", find(lambda n: n.endswith(".rpm"), lambda n: "aarch64" in n.lower()))
    return platforms


def test_maps_all_formats() -> None:
    names = [
        "TerminalWisely_aarch64.app.tar.gz",
        "TerminalWisely_x64.app.tar.gz",
        "TerminalWisely_0.0.1_x64-setup.exe",
        "TerminalWisely_0.0.1_arm64-setup.exe",
        "TerminalWisely_0.0.1_amd64.AppImage",
        "TerminalWisely_0.0.1_amd64.deb",
        "TerminalWisely-0.0.1-1.x86_64.rpm",
        "TerminalWisely_0.0.1_arm64.deb",
        "TerminalWisely-0.0.1-1.aarch64.rpm",
    ]
    p = resolve_platforms(names)
    assert p["darwin-aarch64"].endswith("aarch64.app.tar.gz")
    assert p["darwin-x86_64"].endswith("x64.app.tar.gz")
    assert "x64-setup" in p["windows-x86_64"]
    assert "arm64-setup" in p["windows-aarch64"]
    assert p["linux-x86_64"].endswith(".AppImage")
    assert p["linux-x86_64-deb"].endswith(".deb")
    assert p["linux-x86_64-rpm"].endswith(".rpm")
    assert p["linux-aarch64-deb"].endswith("arm64.deb")
    assert p["linux-aarch64-rpm"].endswith("aarch64.rpm")


if __name__ == "__main__":
    test_maps_all_formats()
    print("ok")
