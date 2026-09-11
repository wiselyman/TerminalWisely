"""Subagent package — depth-limited investigators sharing parent SSH session."""

from app.subagent.investigator import can_spawn_investigator, run_investigator

__all__ = ["can_spawn_investigator", "run_investigator"]
