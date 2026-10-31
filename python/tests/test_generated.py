"""The generated operations: every path of the spec has a method, placed like the TypeScript client's, and the version agrees."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pytest

import plotwork
from plotwork import OPERATION_PATHS, Plotwork

PYTHON = Path(__file__).resolve().parents[1]
SPEC = PYTHON.parent / "spec" / "openapi.json"


class Recorder:
    """A transport that records what each method would send."""

    def __init__(self) -> None:
        self.calls: List[Tuple[str, str, bool]] = []

    def request(self, method: str, path: str, *, idempotent: bool, body: Any = None, query: Any = None) -> Dict[str, Any]:
        self.calls.append((method, path, idempotent))
        return {}


def method_for(client: Any, place: List[str]) -> Any:
    node = client
    for part in place:
        node = getattr(node, part)
    return node


EXPECTED = {
    "POST /v1/diagrams/validate": ["diagrams", "validate"],
    "POST /v1/diagrams/draw": ["diagrams", "draw"],
    "POST /v1/diagrams/render": ["diagrams", "render"],
    "POST /v1/diagrams/outline": ["diagrams", "outline"],
    "POST /v1/diagrams/read": ["diagrams", "read"],
    "POST /v1/diagrams/edit": ["diagrams", "edit"],
    "POST /v1/diagrams/compare": ["diagrams", "compare"],
    "POST /v1/diagrams/suggest": ["diagrams", "suggest"],
    "POST /v1/diagrams/convert-mermaid": ["diagrams", "convert_mermaid"],
    "POST /v1/diagrams/publish": ["diagrams", "publish"],
    "POST /v1/diagrams/embed": ["diagrams", "embed"],
    "GET /v1/me": ["me"],
    "GET /v1/library": ["library", "list"],
    "POST /v1/import": ["import_source"],
    "POST /v1/markdown/sync": ["markdown", "sync"],
    "POST /v1/markdown/plan": ["markdown", "plan"],
    "POST /v1/patterns/find": ["patterns", "find"],
    "POST /v1/patterns/get": ["patterns", "get"],
    "POST /v1/patterns/draw": ["patterns", "draw"],
    "POST /v1/patterns/check": ["patterns", "check"],
    "GET /v1/icons": ["icons", "search"],
    "POST /v1/icons/map": ["icons", "map"],
    "GET /v1/vocabulary": ["vocabulary"],
}


@pytest.mark.parametrize("operation", sorted(EXPECTED))
def test_each_operation_sits_where_the_typescript_client_puts_it(operation: str) -> None:
    recorder = Recorder()
    client = Plotwork()
    client._transport = recorder  # type: ignore[assignment]
    for group in ("diagrams", "icons", "library", "markdown", "patterns"):
        getattr(client, group)._transport = recorder
    call = method_for(client, EXPECTED[operation])
    if operation == "GET /v1/icons":
        call(q="lambda")
    else:
        call()
    method, path, idempotent = recorder.calls[0]
    assert f"{method} {path}" == operation
    assert idempotent is (not path.endswith("/publish"))


def test_lists_exactly_the_operations_placed_above() -> None:
    assert sorted(OPERATION_PATHS) == sorted(EXPECTED)


@pytest.mark.skipif(not SPEC.exists(), reason="spec/openapi.json is not beside this package (an unpacked sdist)")
def test_every_path_in_the_spec_has_a_method() -> None:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    # The picture routes answer SVG text and PNG bytes, not JSON: they are written by hand as ``library.picture`` and ``library.png``.
    pictures = (".svg", ".png")
    operations = sorted(f"{method.upper()} {path}" for path, item in spec["paths"].items() for method in item if not path.endswith(pictures))
    assert operations == sorted(OPERATION_PATHS)
    assert "/v1/library/{id}.svg" in spec["paths"]
    assert "/v1/library/{id}.png" in spec["paths"]
    client = Plotwork()
    for operation in operations:
        assert callable(method_for(client, EXPECTED[operation])), operation


def test_has_no_boards_operation() -> None:
    assert not any("/boards" in operation for operation in OPERATION_PATHS)


def test_the_package_and_pyproject_name_the_same_version() -> None:
    declared = re.search(r'^version = "([^"]+)"$', (PYTHON / "pyproject.toml").read_text(encoding="utf-8"), re.MULTILINE)
    assert declared is not None
    assert plotwork.__version__ == declared.group(1)


def test_pyproject_declares_no_runtime_dependencies() -> None:
    text = (PYTHON / "pyproject.toml").read_text(encoding="utf-8")
    assert re.search(r"^dependencies = \[\]$", text, re.MULTILINE)
    assert "[project.optional-dependencies]" not in text


def test_the_schemas_are_typed_dicts() -> None:
    from plotwork import _generated

    for name in ("ValidateResponse", "Diagnostic", "PublishedDiagram", "RoutedPublish", "ReadDiagramResponse", "DiagramSourceInput"):
        assert isinstance(getattr(_generated, name), type), name
    assert _generated.PublishedDiagram.__mro__  # a class built on HostedDiagram
    assert "source" in _generated.DiagramSourceInput.__annotations__
