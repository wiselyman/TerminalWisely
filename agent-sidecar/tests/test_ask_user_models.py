"""AskUserRequest / AskUserResponse models."""

from app.models.approval import AskUserOption, AskUserRequest, AskUserResponse


def test_ask_user_request_roundtrip():
    req = AskUserRequest(
        request_id="ask_1",
        question="Which service owns port 8888?",
        options=[
            AskUserOption(id="a", label="nginx"),
            AskUserOption(id="b", label="unknown"),
        ],
        allow_free_text=True,
        context={"hint": "from ss"},
    )
    data = req.model_dump()
    again = AskUserRequest.model_validate(data)
    assert again.request_id == "ask_1"
    assert len(again.options) == 2
    assert again.allow_free_text is True


def test_ask_user_response():
    resp = AskUserResponse(
        request_id="ask_1",
        selected_option_ids=["b"],
        free_text="maybe python",
    )
    assert resp.free_text == "maybe python"
    assert resp.selected_option_ids == ["b"]


def test_ask_user_is_not_approval():
    """Clarification payload must not imply mutation authorization."""
    req = AskUserRequest(request_id="x", question="Confirm hostname?")
    assert "approve" not in req.model_dump_json().lower()
    assert req.context == {}
