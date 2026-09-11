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


class ChatAttachment(BaseModel):
    kind: Literal[
        "console",
        "remote_file",
        "local_text",
        "local_image",
        "local_office",
    ]
    label: str | None = None
    path: str | None = None
    name: str | None = None
    text: str | None = None
    media_type: str | None = None
    data_base64: str | None = None


class ChatStartRequest(BaseModel):
    session_id: str
    message: str
    run_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    security_mode: str | None = None
    interaction_mode: str | None = None
    server_id: str | None = None
    host_fingerprint: str | None = None
    remote_user: str | None = None
    # Prior turns in this UI chat (so the model remembers CPU/OS facts already found).
    history: list[ChatHistoryMessage] = Field(default_factory=list)
    # Prefer seeding from a prior sidecar SessionLog (tool results preserved).
    resume_run_id: str | None = None
    attachments: list[ChatAttachment] = Field(default_factory=list)


class ChatStartResponse(BaseModel):
    session_id: str
    run_id: str
    status: StatusLiteral = "running"
    resumed_from: str | None = None


class ChatContinueRequest(BaseModel):
    """Hydrate a run from disk (if needed) and continue with a new user message."""

    session_id: str
    run_id: str
    message: str
    security_mode: str | None = None
    interaction_mode: str | None = None
    server_id: str | None = None
    host_fingerprint: str | None = None
    remote_user: str | None = None
    attachments: list[ChatAttachment] = Field(default_factory=list)

class RunTranscriptResponse(BaseModel):
    session_id: str
    run_id: str
    status: StatusLiteral
    messages: list[dict[str, Any]] = Field(default_factory=list)
    event_count: int = 0
    hydrated: bool = False
    on_disk: bool = False


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
    configured_model: str | None = None


class ModelListResponse(BaseModel):
    models: list[str] = Field(default_factory=list)
    error: str | None = None
    resolved_model: str | None = None
    auto_corrected: bool = False
