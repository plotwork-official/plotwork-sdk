"""A customer's first run of the installed ``plotwork`` package against a real Plotwork API.

    pip install plotwork
    PLOTWORK_BASE_URL=https://api-preview.plotwork.dev PLOTWORK_API_KEY=... python smoke.py

Each step prints ``ok <name>`` or stops with what went wrong; the run exits 1 on the first failure. It uses the standard library
and the installed package only, never the source tree beside it. It publishes one fixed diagram, which the API keeps as one.
"""

from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path
from typing import Any, Callable

import plotwork
from plotwork import Plotwork, PlotworkApiError

VALID = 'flow "SDK smoke (python)"\nnode web service "Web tier"\nnode api service "Orders API"\nweb -> api : "places order"\n'
INVALID = 'flow "x"\nnode a service "A"\na -> missing\n'


class Failed(Exception):
    pass


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise Failed(message)


def step(name: str, run: Callable[[], None]) -> None:
    try:
        run()
    except Failed as failure:
        print(f"FAIL {name}: {failure}")
        sys.exit(1)
    except PlotworkApiError as error:
        print(f"FAIL {name}: PlotworkApiError status={error.status} error_code={error.error_code} message={error.message} request_id={error.request_id}")
        sys.exit(1)
    print(f"ok {name}")


def main() -> None:
    base_url = os.environ.get("PLOTWORK_BASE_URL", "")
    api_key = os.environ.get("PLOTWORK_API_KEY", "")
    if base_url == "" or api_key == "":
        print("Set PLOTWORK_BASE_URL and PLOTWORK_API_KEY")
        sys.exit(1)
    source_tree = Path(__file__).resolve().parent / "src"
    if source_tree in Path(plotwork.__file__).resolve().parents:
        print(f"plotwork was imported from the source tree ({plotwork.__file__}); install the package and run again")
        sys.exit(1)
    print(f"plotwork {plotwork.__version__} from {Path(plotwork.__file__).parent}, against {base_url}")

    client = Plotwork(api_key=api_key, base_url=base_url)

    def no_key() -> None:
        try:
            Plotwork(base_url=base_url).vocabulary()
        except PlotworkApiError as error:
            expect(error.status == 401, f"status {error.status}, expected 401")
            expect(error.error_code.startswith("auth."), f"error_code {error.error_code}, expected auth.*")
            return
        raise Failed("a call with no key was answered")

    def vocabulary() -> None:
        answer: Any = client.vocabulary()
        expect(isinstance(answer, dict) and len(answer) > 0, "the vocabulary is empty")

    def validate() -> None:
        good = client.diagrams.validate(source=VALID)
        expect(good["valid"] is True, f"a valid flow was refused: {good.get('errors')}")
        bad = client.diagrams.validate(source=INVALID)
        expect(bad["valid"] is False, "an invalid flow was accepted")
        expect(len(bad["errors"]) > 0 and isinstance(bad["errors"][0].get("line"), int), f"no error with a line: {bad['errors']}")

    def render() -> None:
        answer = client.diagrams.render(source=VALID)
        expect("data-node" in answer["svg"], "the SVG has no data-node")

    def icons() -> None:
        answer = client.icons.search(q="aws lambda")
        expect(len(answer["items"]) > 0, "no icon found for aws lambda")

    def publish() -> None:
        answer: Any = client.diagrams.publish(source=VALID, name="SDK smoke (python)")
        url = answer.get("url")
        if not isinstance(url, str):
            print(f"  no public link (private: {answer.get('private')}); the picture is not fetched")
            return
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "plotwork-python-smoke"}), timeout=30) as response:
            expect(response.status == 200, f"{url} answered {response.status}")
            content_type = response.headers.get("content-type", "")
            expect(content_type.startswith("image/svg+xml"), f"{url} has content-type {content_type}")
            allow_origin = response.headers.get("access-control-allow-origin")
            expect(allow_origin == "*", f"{url} has access-control-allow-origin {allow_origin}")
        print(f"  {url}")

    step("no key is refused", no_key)
    step("vocabulary", vocabulary)
    step("diagrams.validate", validate)
    step("diagrams.render", render)
    step("icons.search", icons)
    step("diagrams.publish", publish)


if __name__ == "__main__":
    main()
