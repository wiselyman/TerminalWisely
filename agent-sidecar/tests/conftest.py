import sys
from pathlib import Path

import pytest

# Allow `from cli_stub_helpers import …` in test modules (PYTHONPATH is app root).
_TESTS_DIR = Path(__file__).resolve().parent
if str(_TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(_TESTS_DIR))

pytest_plugins: list[str] = []


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"
