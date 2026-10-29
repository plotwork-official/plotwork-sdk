"""A fake Plotwork API on 127.0.0.1: it answers from a list and records what it was sent. No test reaches the real API."""

from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Iterator, List, Optional

import pytest


@dataclass
class Answer:
    status: int = 200
    body: Any = None
    headers: Dict[str, str] = field(default_factory=dict)
    raw: Optional[bytes] = None
    delay: float = 0.0


@dataclass
class Seen:
    method: str
    path: str
    headers: Dict[str, str]
    body: Optional[bytes]

    def json(self) -> Any:
        return None if self.body is None else json.loads(self.body)


class FakeApi:
    def __init__(self) -> None:
        self.answers: List[Answer] = []
        self.seen: List[Seen] = []
        self.lock = threading.Lock()
        api = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args: Any) -> None:
                pass

            def handle_any(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length > 0 else None
                with api.lock:
                    api.seen.append(Seen(self.command, self.path, {k.lower(): v for k, v in self.headers.items()}, body))
                    answer = api.answers.pop(0) if api.answers else Answer(500, {"errorCode": "test.no_answer", "message": "No answer left"})
                if answer.delay:
                    time.sleep(answer.delay)
                raw = answer.raw if answer.raw is not None else (b"" if answer.body is None else json.dumps(answer.body).encode())
                self.send_response(answer.status)
                headers = {"Content-Type": "application/json", **answer.headers}
                for name, value in headers.items():
                    self.send_header(name, value)
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                try:
                    self.wfile.write(raw)
                except OSError:
                    pass

            do_GET = handle_any
            do_POST = handle_any

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def answer(self, *answers: Answer) -> "FakeApi":
        self.answers.extend(answers)
        return self

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def api() -> Iterator[FakeApi]:
    fake = FakeApi()
    try:
        yield fake
    finally:
        fake.close()
