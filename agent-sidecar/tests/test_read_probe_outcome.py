from app.harness.read_probe_outcome import FILTER_NO_MATCH_NOTE, annotate_read_probe_result


def test_annotate_soft_ok_on_filter_no_match() -> None:
    raw = {
        "ok": False,
        "exit_code": 1,
        "stdout": "==============NVSMI LOG==============\nGraphics : 2790 MHz\n",
        "stderr": "",
        "error": "exit_code 1",
        "_untrusted": True,
    }
    out = annotate_read_probe_result(raw)
    assert out["ok"] is True
    assert out["filter_no_match"] is True
    assert out["exit_code"] == 1
    assert "error" not in out
    assert FILTER_NO_MATCH_NOTE in out["_note"]
    # Original untouched
    assert raw["ok"] is False


def test_annotate_leaves_empty_stdout_as_fail() -> None:
    raw = {"ok": False, "exit_code": 1, "stdout": "", "stderr": "", "error": "exit_code 1"}
    assert annotate_read_probe_result(raw)["ok"] is False


def test_annotate_leaves_stderr_fail() -> None:
    raw = {
        "ok": False,
        "exit_code": 1,
        "stdout": "x",
        "stderr": "boom",
        "error": "exit_code 1",
    }
    assert annotate_read_probe_result(raw)["ok"] is False


def test_annotate_soft_ok_when_client_already_ok() -> None:
    raw = {
        "ok": True,
        "exit_code": 1,
        "stdout": "clocks ok\n",
        "stderr": "",
        "_untrusted": True,
    }
    out = annotate_read_probe_result(raw)
    assert out["ok"] is True
    assert out["filter_no_match"] is True
    assert FILTER_NO_MATCH_NOTE in out["_note"]
