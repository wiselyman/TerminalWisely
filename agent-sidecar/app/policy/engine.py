"""PolicyEngine façade backed by capability YAML."""

from __future__ import annotations

from app.models.terminal import PolicyAction, RiskLevel, SecurityMode, TerminalPolicyDecision
from app.paths import security_mode as env_security_mode
from app.policy.loader import load_policy
from app.policy.resolve import classify_command, command_has_caps


def _parse_mode(raw: str | SecurityMode | None) -> SecurityMode:
    if isinstance(raw, SecurityMode):
        return raw
    text = (raw or env_security_mode() or "safe").strip().lower()
    try:
        return SecurityMode(text)
    except ValueError:
        return SecurityMode.SAFE


class CapabilityPolicyEngine:
    def classify(self, command: str) -> RiskLevel:
        risk, _ = classify_command(command, load_policy())
        return risk

    def decide(
        self,
        command: str,
        security_mode: str | SecurityMode | None = None,
    ) -> TerminalPolicyDecision:
        mode = _parse_mode(security_mode)
        risk, caps = classify_command(command, load_policy())
        network = bool(caps & {"net_mutate", "sshd_mutate"})
        meta: dict = {
            "security_mode": mode.value,
            "capabilities": sorted(caps),
        }
        if network:
            meta["network_guard"] = True

        if risk == RiskLevel.R4:
            return TerminalPolicyDecision(
                action=PolicyAction.DENY,
                risk=risk,
                reason="R4 catastrophic command blocked",
                command=command,
                metadata=meta,
            )

        if mode == SecurityMode.OBSERVE:
            if risk == RiskLevel.R0:
                return TerminalPolicyDecision(
                    action=PolicyAction.ALLOW,
                    risk=risk,
                    reason="OBSERVE: read-only allowed",
                    command=command,
                    metadata=meta,
                )
            return TerminalPolicyDecision(
                action=PolicyAction.DENY,
                risk=risk,
                reason="OBSERVE: mutations denied",
                command=command,
                metadata=meta,
            )

        if risk == RiskLevel.R0:
            return TerminalPolicyDecision(
                action=PolicyAction.ALLOW,
                risk=risk,
                reason="R0 read-only",
                command=command,
                metadata=meta,
            )

        if risk == RiskLevel.R1:
            if mode == SecurityMode.AUTONOMOUS:
                action = PolicyAction.ALLOW
                reason = "AUTONOMOUS: R1 auto-allowed"
            else:
                action = PolicyAction.REQUIRE_APPROVAL
                reason = f"{mode.value}: R1 requires approval"
            return TerminalPolicyDecision(
                action=action, risk=risk, reason=reason, command=command, metadata=meta
            )

        if mode == SecurityMode.AUTONOMOUS and risk == RiskLevel.R2:
            return TerminalPolicyDecision(
                action=PolicyAction.ALLOW,
                risk=risk,
                reason="AUTONOMOUS: R2 auto-allowed",
                command=command,
                metadata=meta,
            )
        return TerminalPolicyDecision(
            action=PolicyAction.REQUIRE_APPROVAL,
            risk=risk,
            reason=f"{mode.value}: {risk.value} requires exact-action approval",
            command=command,
            metadata=meta,
        )
