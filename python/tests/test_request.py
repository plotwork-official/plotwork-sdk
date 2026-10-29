"""The transport: headers, query, body, retries, the error envelope, and a call with no answer."""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from typing import Any, Dict, List

import pytest

from plotwork import DEFAULT_BASE_URL, Plotwork, PlotworkApiError, __version__, retry_delay

from .conftest import Answer, FakeApi

SOURCE = 'flow "A"\nnode a service "A"\n'


def client(api: FakeApi, waits: List[float], **options: Any) -> Plotwork:
    return Plotwork(base_url=api.url, sleep=waits.append, **options)


def test_sends_the_key_the_json_body_and_the_path(api: FakeApi) -> None:
    api.answer(Answer(body={"valid": True, "errors": [], "warnings": []}))
    answer = client(api, [], api_key="pk_test").diagrams.validate(source=SOURCE)
    assert answer["valid"] is True
    seen = api.seen[0]
    assert (seen.method, seen.path) == ("POST", "/v1/diagrams/validate")
    assert seen.headers["x-api-key"] == "pk_test"
    assert seen.headers["content-type"] == "application/json"
    assert seen.headers["accept"] == "application/json"
    assert seen.headers["user-agent"] == f"plotwork-python/{__version__}"
    assert "authorization" not in seen.headers
    assert seen.json() == {"source": SOURCE}


def test_sends_camel_case_keys_as_the_api_names_them(api: FakeApi) -> None:
    api.answer(Answer(body={"svg": "<svg/>"}))
    client(api, []).diagrams.render(source=SOURCE, embedSource=True, idPrefix="a")
    assert api.seen[0].json() == {"source": SOURCE, "embedSource": True, "idPrefix": "a"}


def test_puts_a_get_input_in_the_query_and_sends_no_key_when_there_is_none(api: FakeApi) -> None:
    api.answer(Answer(body={"results": []}))
    client(api, []).icons.search(q="token exchange", limit=5)
    seen = api.seen[0]
    assert (seen.method, seen.path) == ("GET", "/v1/icons?q=token+exchange&limit=5")
    assert "authorization" not in seen.headers
    assert "x-api-key" not in seen.headers
    assert "content-type" not in seen.headers
    assert seen.body is None


def test_leaves_out_query_values_that_are_none(api: FakeApi) -> None:
    api.answer(Answer(body={"kinds": []}))
    client(api, []).vocabulary(kind="flow")
    assert api.seen[0].path == "/v1/vocabulary?kind=flow"


def test_defaults_to_production() -> None:
    assert DEFAULT_BASE_URL == "https://api.plotwork.dev"
    plotwork = Plotwork(api_key="pk_secret")
    assert plotwork._transport.url_of("/v1/icons", {"q": "a"}) == "https://api.plotwork.dev/v1/icons?q=a"
    assert plotwork._transport.timeout == 60.0
    assert plotwork._transport.max_retries == 2
    assert "pk_secret" not in repr(plotwork)


def test_turns_the_error_envelope_into_a_plotwork_api_error(api: FakeApi) -> None:
    api.answer(Answer(401, {"error": True, "errorCode": "auth.invalid_key", "message": "The API key is not valid", "details": {"a": 1}, "requestId": "req_1"}))
    with pytest.raises(PlotworkApiError) as caught:
        client(api, []).vocabulary()
    error = caught.value
    assert (error.status, error.error_code, error.message, error.details, error.request_id) == (401, "auth.invalid_key", "The API key is not valid", {"a": 1}, "req_1")
    assert str(error) == "The API key is not valid"


def test_names_a_non_json_error_by_its_status(api: FakeApi) -> None:
    api.answer(Answer(502, raw=b"<html>Bad gateway</html>", headers={"Content-Type": "text/html", "X-Request-Id": "req_2"}))
    with pytest.raises(PlotworkApiError) as caught:
        client(api, []).vocabulary()
    assert (caught.value.status, caught.value.error_code, caught.value.request_id) == (502, "http.502", "req_2")


def test_retries_a_safe_call_on_429_after_retry_after(api: FakeApi) -> None:
    waits: List[float] = []
    busy = Answer(429, {"errorCode": "rate_limit.exceeded", "message": "Slow down"}, {"Retry-After": "2"})
    api.answer(busy, Answer(503, {"errorCode": "service.unavailable", "message": "Busy"}), Answer(body={"valid": True}))
    assert dict(client(api, waits).diagrams.validate(source=SOURCE)) == {"valid": True}
    assert waits == [2.0, 1.0]
    assert len(api.seen) == 3


def test_stops_retrying_after_max_retries(api: FakeApi) -> None:
    waits: List[float] = []
    busy = Answer(429, {"errorCode": "rate_limit.exceeded", "message": "Slow down"})
    api.answer(busy, busy, busy, busy)
    with pytest.raises(PlotworkApiError) as caught:
        client(api, waits, max_retries=1).diagrams.validate(source=SOURCE)
    assert caught.value.error_code == "rate_limit.exceeded"
    assert len(api.seen) == 2
    assert waits == [0.5]


def test_never_retries_publishing(api: FakeApi) -> None:
    waits: List[float] = []
    api.answer(Answer(429, {"errorCode": "rate_limit.exceeded", "message": "Slow down"}, {"Retry-After": "1"}), Answer(body={"url": "x"}))
    with pytest.raises(PlotworkApiError) as caught:
        client(api, waits).diagrams.publish(source=SOURCE)
    assert caught.value.status == 429
    assert len(api.seen) == 1
    assert waits == []


def test_does_not_retry_other_errors(api: FakeApi) -> None:
    api.answer(Answer(500, {"errorCode": "internal", "message": "Broken"}), Answer(body={}))
    with pytest.raises(PlotworkApiError):
        client(api, []).diagrams.validate(source=SOURCE)
    assert len(api.seen) == 1


def test_waits_a_doubling_half_second_and_never_more_than_30_seconds() -> None:
    assert [retry_delay(None, attempt) for attempt in (1, 2, 3)] == [0.5, 1.0, 2.0]
    assert retry_delay("3600", 1) == 30.0
    assert retry_delay("0", 1) == 0.0
    assert retry_delay("soon", 2) == 1.0
    assert retry_delay("-1", 1) == 0.5


def test_says_when_the_api_did_not_answer_in_time(api: FakeApi) -> None:
    api.answer(Answer(body={}, delay=1.5))
    with pytest.raises(PlotworkApiError) as caught:
        client(api, [], timeout=0.2).vocabulary()
    assert (caught.value.status, caught.value.error_code) == (0, "request.timeout")


def test_says_when_the_api_could_not_be_reached() -> None:
    with socket.socket() as closed:
        closed.bind(("127.0.0.1", 0))
        port = closed.getsockname()[1]
    waits: List[float] = []
    with pytest.raises(PlotworkApiError) as caught:
        Plotwork(base_url=f"http://127.0.0.1:{port}", sleep=waits.append).vocabulary()
    assert (caught.value.status, caught.value.error_code) == (0, "request.failed")
    assert waits == []


def test_with_options_keeps_the_key_and_changes_the_timeout(api: FakeApi) -> None:
    api.answer(Answer(body={}))
    base = client(api, [], api_key="pk_test")
    other = base.with_options(timeout=5, max_retries=0)
    assert (other._transport.timeout, other._transport.max_retries) == (5, 0)
    assert base._transport.timeout == 60.0
    other.vocabulary()
    assert api.seen[0].headers["x-api-key"] == "pk_test"


def test_takes_an_injected_opener() -> None:
    sent: List[urllib.request.Request] = []

    class Response:
        status = 200
        headers: Dict[str, str] = {}

        def read(self) -> bytes:
            return json.dumps({"results": [{"name": "aws-lambda"}]}).encode()

        def close(self) -> None:
            pass

    def opener(request: urllib.request.Request, timeout: float) -> Response:
        sent.append(request)
        return Response()

    answer = Plotwork(api_key="k", opener=opener).icons.search(q="lambda")
    assert dict(answer) == {"results": [{"name": "aws-lambda"}]}
    assert sent[0].full_url == "https://api.plotwork.dev/v1/icons?q=lambda"
    assert sent[0].get_method() == "GET"


def test_reads_an_http_error_an_opener_raises() -> None:
    import io
    from email.message import Message

    def opener(request: urllib.request.Request, timeout: float) -> Any:
        headers = Message()
        headers["Retry-After"] = "0"
        raise urllib.error.HTTPError(request.full_url, 503, "Busy", headers, io.BytesIO(b'{"errorCode":"service.unavailable","message":"Busy"}'))

    waits: List[float] = []
    with pytest.raises(PlotworkApiError) as caught:
        Plotwork(opener=opener, sleep=waits.append).vocabulary()
    assert caught.value.error_code == "service.unavailable"
    assert waits == [0.0, 0.0]
