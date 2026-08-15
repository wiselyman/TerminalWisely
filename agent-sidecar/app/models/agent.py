"""Agent session / pull-protocol models."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


StatusLiteral = Literal[
    "running",
    "waiting_tool",
    "waiting_user",
    "waiting_approval",
    "completed",
    "failed",
    "cancelled",
    "idle",
]


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatStartRequest(BaseModel):
    session_id: str
    message: str
    run_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    security_mode: str | None = None
    server_id: str | None = None
    host_fingerprint: str | None = None
    remote_user: str | None = None
    # Prior turns in this UI chat (so the model remembers CPU/OS facts already found).
    history: list[ChatHistoryMessage] = Field(default_factory=list)


class ChatStartResponse(BaseModel):
    session_id: str
    run_id: str
    status: StatusLiteral = "running"


class ToolResultRequest(BaseModel):
    session_id: str
    run_id: str
    call_id: str
    ok: bool = True
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    error: str | None = None
    untrusted: Literal[True] = True


class UserAnswerRequest(BaseModel):
    session_id: str
    run_id: str
    request_id: str
    selected_option_ids: list[str] = Field(default_factory=list)
    free_text: str | None = None


class PullEvent(BaseModel):
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    seq: int = 0


class PullResponse(BaseModel):
    session_id: str
    run_id: str
    status: StatusLiteral
    events: list[PullEvent] = Field(default_factory=list)
    cursor: int = 0


class CancelRunRequest(BaseModel):
    session_id: str
    run_id: str


class ModelListRequest(BaseModel):
    """OpenAI-compatible catalog refresh for one settings profile draft."""

    provider: str = "openai"
    base_url: str = ""
    ollama_base_url: str = ""
    api_key: str | None = None


class ModelListResponse(BaseModel):
    models: list[str] = Field(default_factory=list)
    error: str | None = None
