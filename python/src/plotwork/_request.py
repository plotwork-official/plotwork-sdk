"""The one transport every operation calls.

It sends a request to the Plotwork API with ``urllib.request`` and reads the answer. A 2xx answer is the result; a mistake in a
diagram is part of that result (``valid: False``, ``errors`` with line, column and hint), never an exception. Anything else is a
``PlotworkApiError`` with the API's stable ``error_code``. A call the API may answer again safely is retried on 429 and 503,
after the ``Retry-After`` it gives; publishing is never retried.
"""

from __future__ import annotations

import json
import math
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Mapping, Optional, Tuple, Union

from ._version import __version__

#: The longest the client waits before one retry, whatever ``Retry-After`` says, in seconds.
MAX_RETRY_WAIT = 30.0

#: Opens a ``urllib.request.Request`` and returns the response, called like ``urllib.request.urlopen(request, timeout=...)``.
#: It may raise ``urllib.error.HTTPError`` for a status that is not 2xx, as ``urlopen`` does, or return that response.
Opener = Callable[..., Any]

#: A token from Sign in with Plotwork, or a function that returns the current one; it is called before each attempt, so it can
#: refresh the token first.
AccessToken = Union[str, Callable[[], str]]


class PlotworkApiError(Exception):
    """The API's error envelope (``ErrorResponse``), or what the client knew when there was none."""

    #: The HTTP status, or 0 when no answer came (offline, refused, timed out).
    status: int
    #: A stable key such as ``auth.invalid_key``, ``rate_limit.exceeded`` or ``request.timeout``.
    error_code: str
    message: str
    details: Any
    #: The API's trace id, to quote to support.
    request_id: Optional[str]

    def __init__(self, status: int, error_code: str, message: str, details: Any = None, request_id: Optional[str] = None) -> None:
        super().__init__(message)
        self.status = status
        self.error_code = error_code
        self.message = message
        self.details = details
        self.request_id = request_id

    def __repr__(self) -> str:
        return f"PlotworkApiError(status={self.status!r}, error_code={self.error_code!r}, message={self.message!r}, request_id={self.request_id!r})"


def retry_delay(retry_after: Optional[str], attempt: int) -> float:
    """How many seconds to wait before retry number ``attempt`` (from 1): the API's ``Retry-After``, else a doubling half second."""
    seconds = math.nan
    if retry_after is not None:
        try:
            seconds = float(retry_after)
        except ValueError:
            seconds = math.nan
    wait = seconds if math.isfinite(seconds) and seconds >= 0 else 0.5 * 2 ** (attempt - 1)
    return min(wait, MAX_RETRY_WAIT)


def _query_value(value: Any) -> str:
    if value is True:
        return "true"
    if value is False:
        return "false"
    return str(value)


def _status_of(response: Any) -> int:
    status = getattr(response, "status", None)
    return int(status if status is not None else response.getcode())


def _header(response: Any, name: str) -> Optional[str]:
    headers = getattr(response, "headers", None)
    if headers is None:
        return None
    value = headers.get(name)
    return None if value is None else str(value)


def _is_timeout(error: BaseException) -> bool:
    reason = getattr(error, "reason", None)
    return isinstance(error, (TimeoutError, socket.timeout)) or isinstance(reason, (TimeoutError, socket.timeout))


def _no_answer(error: BaseException) -> PlotworkApiError:
    if _is_timeout(error):
        return PlotworkApiError(0, "request.timeout", "The Plotwork API did not answer in time")
    return PlotworkApiError(0, "request.failed", "The Plotwork API could not be reached")


def _error_of(status: int, raw: bytes, request_id: Optional[str]) -> PlotworkApiError:
    try:
        body = json.loads(raw.decode("utf-8"))
    except ValueError:
        body = None  # Not JSON (a proxy's page): the status says enough.
    if isinstance(body, dict) and isinstance(body.get("errorCode"), str):
        message = body.get("message")
        envelope_id = body.get("requestId")
        return PlotworkApiError(
            status,
            body["errorCode"],
            message if isinstance(message, str) else f"HTTP {status}",
            body.get("details"),
            envelope_id if isinstance(envelope_id, str) else request_id,
        )
    return PlotworkApiError(status, f"http.{status}", f"The Plotwork API answered HTTP {status}", None, request_id)


def _default_opener() -> Opener:
    director = urllib.request.build_opener()
    return director.open


class Transport:
    """How the client sends requests: the address, the headers, the timeout, the retries, and the opener."""

    def __init__(
        self,
        *,
        base_url: str,
        headers: Mapping[str, str],
        timeout: float,
        max_retries: int,
        opener: Optional[Opener] = None,
        sleep: Optional[Callable[[float], Any]] = None,
        access_token: Optional[AccessToken] = None,
    ) -> None:
        self.base_url = base_url
        self.headers = dict(headers)
        self.access_token = access_token
        self.timeout = timeout
        self.max_retries = max(0, max_retries)
        self.opener: Opener = opener if opener is not None else _default_opener()
        self.sleep: Callable[[float], Any] = sleep if sleep is not None else time.sleep

    def url_of(self, path: str, query: Optional[Mapping[str, Any]] = None) -> str:
        """The address of ``path`` on the base address, with every query value that is not ``None``."""
        base = self.base_url if self.base_url.endswith("/") else f"{self.base_url}/"
        # Relative to the base, so a base with a path (a proxy at /plotwork, an engine under a prefix) keeps it.
        url = urllib.parse.urljoin(base, path.lstrip("/"))
        pairs = [(name, _query_value(value)) for name, value in (query or {}).items() if value is not None]
        return f"{url}?{urllib.parse.urlencode(pairs)}" if pairs else url

    def _bearer(self) -> Mapping[str, str]:
        token = self.access_token
        value = token() if callable(token) else token
        return {"Authorization": f"Bearer {value}"} if value else {}

    def _send(self, method: str, url: str, *, idempotent: bool, headers: Mapping[str, str], data: Optional[bytes]) -> Tuple[int, bytes, Any]:
        """Sends one request, retrying a safe one on 429 and 503, and returns the status, body and headers of a 2xx or 304 answer."""
        retries = self.max_retries if idempotent else 0
        attempt = 0
        while True:
            # Asked again before every attempt, so a function can hand over a refreshed token.
            prepared = urllib.request.Request(url, data=data, headers={**headers, **self.headers, **self._bearer()}, method=method)
            try:
                response = self.opener(prepared, timeout=self.timeout)
            except urllib.error.HTTPError as answer:
                response = answer
            except (urllib.error.URLError, OSError) as error:
                raise _no_answer(error) from None
            try:
                status = _status_of(response)
                if 200 <= status < 300 or status == 304:
                    try:
                        raw = b"" if status == 304 else response.read()
                    except OSError as error:
                        raise _no_answer(error) from None
                    return status, raw, getattr(response, "headers", None)
                if status in (429, 503) and attempt < retries:
                    attempt += 1
                    self.sleep(retry_delay(_header(response, "retry-after"), attempt))
                    continue
                try:
                    raw = response.read()
                except OSError:
                    raw = b""
                raise _error_of(status, raw, _header(response, "x-request-id"))
            finally:
                close = getattr(response, "close", None)
                if close is not None:
                    close()

    def request(self, method: str, path: str, *, idempotent: bool, body: Any = None, query: Optional[Mapping[str, Any]] = None) -> Any:
        """Sends one request and returns the decoded JSON answer, or raises ``PlotworkApiError``."""
        headers = {"Accept": "application/json", "User-Agent": f"plotwork-python/{__version__}"}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        status, raw, _ = self._send(method, self.url_of(path, query), idempotent=idempotent, headers=headers, data=data)
        if status == 304:
            raise PlotworkApiError(304, "http.304", "The Plotwork API answered 304 to a call that sent no tag")
        return None if status == 204 or raw == b"" else json.loads(raw.decode("utf-8"))

    def request_text(self, path: str, *, accept: str, etag: Optional[str] = None) -> Optional[Tuple[str, Optional[str]]]:
        """Sends a GET for text and returns it with its ``ETag``; ``None`` when ``etag`` is given and the server answers 304."""
        answer = self.request_bytes(path, accept=accept, etag=etag)
        return None if answer is None else (answer[0].decode("utf-8"), answer[1])

    def request_bytes(
        self, path: str, *, accept: str, etag: Optional[str] = None, query: Optional[Mapping[str, Any]] = None
    ) -> Optional[Tuple[bytes, Optional[str]]]:
        """Sends a GET and returns the body with its ``ETag``; ``None`` when ``etag`` is given and the server answers 304."""
        headers = {"Accept": accept, "User-Agent": f"plotwork-python/{__version__}"}
        if etag is not None:
            headers["If-None-Match"] = etag
        status, raw, answer_headers = self._send("GET", self.url_of(path, query), idempotent=True, headers=headers, data=None)
        if status == 304:
            if etag is None:
                raise PlotworkApiError(304, "http.304", "The Plotwork API answered 304 to a call that sent no tag")
            return None
        tag = None if answer_headers is None else answer_headers.get("etag")
        return raw, None if tag is None else str(tag)
