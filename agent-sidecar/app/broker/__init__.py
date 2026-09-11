"""CommandBroker + PolicyEngine — capability YAML backed (R0–R4)."""

from __future__ import annotations

from app.models.terminal import SecurityMode, TerminalPolicyDecision
from app.policy.engine import CapabilityPolicyEngine

# Back-compat alias used throughout the codebase and tests.
PolicyEngine = CapabilityPolicyEngine


class CommandBroker:
    def __init__(self, policy: CapabilityPolicyEngine | None = None) -> None:
        self.policy = policy or CapabilityPolicyEngine()

    def authorize(
        self,
        command: str,
        security_mode: str | SecurityMode | None = None,
    ) -> TerminalPolicyDecision:
        return self.policy.decide(command, security_mode=security_mode)
