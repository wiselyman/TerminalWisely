"""Terminal / policy related models."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    R0 = "R0"  # read-only / inspect
    R1 = "R1"  # low-impact reversible
    R2 = "R2"  # service / package / config change
    R3 = "R3"  # destructive / privileged / network
    R4 = "R4"  # catastrophic / irreversible


class PolicyAction(str, Enum):
    ALLOW = "allow"
    REQUIRE_APPROVAL = "require_approval"
    DENY = "deny"


class SecurityMode(str, Enum):
    OBSERVE = "observe"
    SAFE = "safe"
    AUTONOMOUS = "autonomous"
    PRODUCTION = "production"


class TerminalExecRequest(BaseModel):
    command: str
    timeout_seconds: float = 30.0
    cwd: str | None = None
    env: dict[str, str] = Field(default_factory=dict)


class TerminalPolicyDecision(BaseModel):
    action: PolicyAction
    risk: RiskLevel
    reason: str
    command: str
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def allowed(self) -> bool:
        """Backward-compatible: not hard-denied (may still need approval)."""
        return self.action != PolicyAction.DENY

    @property
    def needs_approval(self) -> bool:
        return self.action == PolicyAction.REQUIRE_APPROVAL
