"""Verify harness: do not nudge on sudo password / failed ok."""

from app.harness.verify import should_nudge_verify


def test_nudge_on_clean_mutation_exit_0():
    assert should_nudge_verify(risk="R2", exit_code=0, already_nudged=False) is True


def test_no_nudge_on_sudo_password_stdout():
    assert (
        should_nudge_verify(
            risk="R2",
            exit_code=0,
            already_nudged=False,
            stdout="sudo: 需要密码",
        )
        is False
    )


def test_no_nudge_when_ok_false():
    assert (
        should_nudge_verify(
            risk="R2",
            exit_code=0,
            already_nudged=False,
            ok=False,
        )
        is False
    )


def test_no_nudge_non_zero_exit():
    assert should_nudge_verify(risk="R2", exit_code=1, already_nudged=False) is False
