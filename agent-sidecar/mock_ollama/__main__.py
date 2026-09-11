"""Run scripted mock Ollama for manual / CI regression."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import uvicorn

from mock_ollama.server import DEFAULT_MODEL, create_app


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scripted OpenAI/Ollama-compatible mock LLM for K8s Engineer tests",
    )
    parser.add_argument("--host", default=os.environ.get("MOCK_OLLAMA_HOST", "127.0.0.1"))
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("MOCK_OLLAMA_PORT", "11435")),
    )
    parser.add_argument(
        "--scenarios",
        type=Path,
        default=None,
        help="YAML scenario file (default: mock_ollama/scenarios/k8s_engineer.yaml)",
    )
    parser.add_argument("--model", default=os.environ.get("MOCK_OLLAMA_MODEL", DEFAULT_MODEL))
    args = parser.parse_args()

    scenarios_path = args.scenarios
    app = create_app(scenarios_path=scenarios_path, model_id=args.model)

    print(
        f"Mock Ollama listening on http://{args.host}:{args.port} "
        f"(model={args.model})",
        flush=True,
    )
    print(
        "Point TerminalWisely Ollama base URL to this host/port and select the mock model.",
        flush=True,
    )
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
