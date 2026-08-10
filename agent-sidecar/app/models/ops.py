"""OpsPlan envelope — one approval binds plan_hash + exact step commands."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.terminal import RiskLevel


class OpsStep(BaseModel):
    kind: str = "shell"
    risk: RiskLevel = RiskLevel.R2
    summary: str = ""
    command: str


class OpsPlan(BaseModel):
    plan_id: str
    intent: str
    steps: list[OpsStep] = Field(default_factory=list)
    plan_hash: str = ""
    session_id: str = ""
    run_id: str = ""

    def compute_hash(self) -> str:
        material = {
            "intent": self.intent,
            "steps": [
                {"kind": s.kind, "risk": s.risk.value, "command": s.command}
                for s in self.steps
            ],
        }
        raw = json.dumps(material, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def with_hash(self) -> OpsPlan:
        self.plan_hash = self.compute_hash()
        return self


class OpsPlanApprovalRequest(BaseModel):
    session_id: str
    run_id: str
    plan_id: str
    plan_hash: str
    approved: bool
    note: str | None = None


ConclusionKind = Literal[
    "success",
    "incomplete",
    "failed",
    "unknown_outcome",
    "cancelled",
    "blocked",
]


class Conclusion(BaseModel):
    kind: ConclusionKind
    summary: str
    evidence: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
