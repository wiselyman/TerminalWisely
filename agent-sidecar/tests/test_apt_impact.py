"""apt dry-run impact preview helpers."""

from app.harness.apt_impact import (
    build_apt_simulate_command,
    needs_package_impact_preview,
    summarize_apt_simulate,
)


def test_needs_preview_for_autoremove():
    assert needs_package_impact_preview("sudo apt autoremove --purge -y")
    assert needs_package_impact_preview("apt-get remove -y 'libreoffice*'")
    assert not needs_package_impact_preview("apt-get -s autoremove")
    assert not needs_package_impact_preview("apt-get remove -y curl")


def test_build_simulate_strips_yes_and_sudo():
    assert (
        build_apt_simulate_command("sudo apt autoremove --purge -y")
        == "apt-get -s autoremove --purge"
    )


def test_summarize_remv_lines_flags_desktop():
    out = summarize_apt_simulate(
        "Remv curl [1]\nRemv ubuntu-desktop [2]\nRemv gnome-shell [3]\n"
    )
    assert "预计删除 3" in out
    assert "ubuntu-desktop" in out
    assert "⚠️" in out
