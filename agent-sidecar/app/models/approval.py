"""AskUser (clarification) vs ActionApproval (mutation) — never conflate."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.models.terminal import RiskLevel


class AskUserOption(BaseModel):
    id: str
    label: str


class AskUserRequest(BaseModel):
    request_id: str
    question: str
    options: list[AskUserOption] = Field(default_factory=list)
    allow_free_text: bool = True
    context: dict[str, Any] = Field(default_factory=dict)


class AskUserResponse(BaseModel):
    request_id: str
    selected_option_ids: list[str] = Field(default_factory=list)
    free_text: str | None = None


class TargetSessionIdentity(BaseModel):
    session_id: str
    server_id: str | None = None
    host_fingerprint: str | None = None
    remote_user: str | None = None


class PrivilegeLease(BaseModel):
    lease_id: str
    session_id: str
    command: str
    identity: TargetSessionIdentity
    risk: RiskLevel
    expires_at_epoch_s: float
    max_executions: int = 1
    executions: int = 0


class ActionApproval(BaseModel):
    approval_id: str
    lease_id: str
    call_id: str
    session_id: str
    run_id: str
    command: str
    risk: RiskLevel
    reason: str
    identity: TargetSessionIdentity
    network_guard: bool = False
    summary: str = ""
    intent: str = ""


class ApprovalDecisionRequest(BaseModel):
    session_id: str
    run_id: str
    approval_id: str
    approved: bool
    note: str | None = None
    confirm_text: str | None = None
    remember_read_binaries: list[str] = Field(default_factory=list)
    approve_for_session: bool = False
    approve_permanently: bool = False


class UserContextRequest(BaseModel):
    session_id: str
    run_id: str
    content: str
