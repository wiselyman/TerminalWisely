"""Scripted OpenAI/Ollama-compatible mock LLM for fast K8s Engineer regression."""

from mock_ollama.director import ScenarioDirector, load_scenarios
from mock_ollama.server import create_app

__all__ = ["ScenarioDirector", "create_app", "load_scenarios"]
