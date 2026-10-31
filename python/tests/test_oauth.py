"""Sign in with Plotwork: PKCE, the authorize address, the redirect, the token calls, and the refreshing token, against the fake API."""

from __future__ import annotations

import threading
import time
import urllib.parse
from typing import Dict, List

import pytest

from plotwork import Plotwork
from plotwork.oauth import (
    AuthorizationRequest,
    PlotworkOAuthError,
    TokenSet,
    authorize_url,
    challenge_of,
    create_pkce,
    exchange_code,
    parse_redirect,
    read_metadata,
    refresh_token,
    revoke_token,
    with_refresh,
)

from .conftest import Answer, FakeApi, Seen


def tokens(n: int) -> Answer:
    return Answer(body={"access_token": f"pwa_{n}", "refresh_token": f"pwr_{n}", "token_type": "Bearer", "expires_in": 3600, "scope": "library:read profile"})


def form(seen: Seen) -> Dict[str, str]:
    return dict(urllib.parse.parse_qsl((seen.body or b"").decode()))


def test_makes_a_64_character_verifier_and_its_s256_challenge() -> None:
    pkce = create_pkce()
    assert len(pkce.verifier) == 64
    assert set(pkce.verifier) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
    assert pkce.challenge == challenge_of(pkce.verifier)
    assert pkce.method == "S256"
    assert pkce.verifier not in repr(pkce)
    assert create_pkce().verifier != pkce.verifier


def test_computes_the_challenge_of_rfc_7636_appendix_b() -> None:
    assert challenge_of("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


def test_names_every_parameter_of_the_authorize_request() -> None:
    request = authorize_url(client_id="app_1", redirect_uri="https://example.com/cb", scopes=["library:read", "profile"], code_challenge="abc", base_url="https://api-preview.plotwork.dev")
    assert isinstance(request, AuthorizationRequest)
    parts = urllib.parse.urlsplit(request.url)
    assert f"{parts.scheme}://{parts.netloc}{parts.path}" == "https://api-preview.plotwork.dev/oauth/authorize"
    assert "scope=library%3Aread%20profile" in parts.query
    assert dict(urllib.parse.parse_qsl(parts.query)) == {
        "response_type": "code",
        "client_id": "app_1",
        "redirect_uri": "https://example.com/cb",
        "scope": "library:read profile",
        "state": request.state,
        "code_challenge": "abc",
        "code_challenge_method": "S256",
    }
    assert len(request.state) >= 32
    url, state = authorize_url(client_id="a", redirect_uri="http://localhost/cb", scopes=["profile"], code_challenge="c", state="mine")
    assert state == "mine"
    with pytest.raises(ValueError):
        authorize_url(client_id="a", redirect_uri="http://localhost/cb", scopes=[], code_challenge="c")


def test_reads_the_code_of_a_redirect_and_checks_the_state_first() -> None:
    assert parse_redirect("https://example.com/cb?code=c1&state=s1&iss=https%3A%2F%2Fapi.plotwork.dev", "s1") == "c1"
    assert parse_redirect("https://e.com/cb?code=c&state=s&iss=https%3A%2F%2Fapi-preview.plotwork.dev", "s", base_url="https://api-preview.plotwork.dev/") == "c"
    cases = [
        ("https://example.com/cb?error=access_denied&state=other", "s1", "invalid_state"),
        ("https://example.com/cb?code=c", "", "invalid_state"),
        ("https://example.com/cb?code=c&state=s&iss=https%3A%2F%2Fevil.example", "s", "invalid_issuer"),
        ("https://example.com/cb?error=access_denied&error_description=No&state=s", "s", "access_denied"),
        ("https://example.com/cb?state=s", "s", "invalid_request"),
    ]
    for url, state, error in cases:
        with pytest.raises(PlotworkOAuthError) as caught:
            parse_redirect(url, state)
        assert (caught.value.error, caught.value.status) == (error, 0)


def test_trades_a_code_with_a_form_body_and_the_secret(api: FakeApi) -> None:
    api.answer(tokens(1))
    got = exchange_code(client_id="app_1", client_secret="pws_secret", code="c1", redirect_uri="https://e.com/cb", code_verifier="v1", base_url=api.url)
    assert (got.access_token, got.refresh_token, got.scope, got.token_type) == ("pwa_1", "pwr_1", "library:read profile", "Bearer")
    assert 3500 < got.expires_at - time.time() <= 3600
    assert "pwa_1" not in repr(got) and "pwr_1" not in repr(got)
    seen = api.seen[0]
    assert (seen.method, seen.path) == ("POST", "/oauth/token")
    assert seen.headers["content-type"] == "application/x-www-form-urlencoded"
    assert "cookie" not in seen.headers
    assert form(seen) == {"grant_type": "authorization_code", "code": "c1", "redirect_uri": "https://e.com/cb", "code_verifier": "v1", "client_id": "app_1", "client_secret": "pws_secret"}


def test_refreshes_a_public_app_and_reads_oauth_errors(api: FakeApi) -> None:
    api.answer(tokens(2), Answer(400, {"error": "invalid_grant", "error_description": "The refresh token was used before"}))
    assert refresh_token(client_id="app_1", refresh_token="pwr_1", base_url=api.url).refresh_token == "pwr_2"
    assert form(api.seen[0]) == {"grant_type": "refresh_token", "refresh_token": "pwr_1", "client_id": "app_1"}
    with pytest.raises(PlotworkOAuthError) as caught:
        refresh_token(client_id="app_1", refresh_token="pwr_1", base_url=api.url)
    assert (caught.value.error, caught.value.description, caught.value.status) == ("invalid_grant", "The refresh token was used before", 400)


def test_names_the_api_envelope_a_page_that_is_not_json_and_an_answer_with_no_token(api: FakeApi) -> None:
    api.answer(
        Answer(503, {"error": True, "errorCode": "oauth.unavailable", "message": "Not on here"}),
        Answer(502, raw=b"<html>Bad gateway</html>", headers={"Content-Type": "text/html"}),
        Answer(body={"token_type": "Bearer"}),
    )
    expected = [("oauth.unavailable", 503), ("http_502", 502), ("invalid_response", 200)]
    for error, status in expected:
        with pytest.raises(PlotworkOAuthError) as caught:
            exchange_code(client_id="a", code="c", redirect_uri="https://e.com/cb", code_verifier="v", base_url=api.url)
        assert (caught.value.error, caught.value.status) == (error, status)


def test_says_when_the_server_could_not_be_reached() -> None:
    import socket

    with socket.socket() as closed:
        closed.bind(("127.0.0.1", 0))
        port = closed.getsockname()[1]
    with pytest.raises(PlotworkOAuthError) as caught:
        read_metadata(base_url=f"http://127.0.0.1:{port}")
    assert (caught.value.error, caught.value.status) == ("request_failed", 0)


def test_revokes_and_reads_the_metadata(api: FakeApi) -> None:
    api.answer(Answer(200), Answer(body={"issuer": api.url, "token_endpoint": f"{api.url}/oauth/token"}), Answer(body={}))
    revoke_token(client_id="app_1", token="pwr_1", token_type_hint="refresh_token", base_url=api.url)
    assert api.seen[0].path == "/oauth/revoke"
    assert form(api.seen[0]) == {"token": "pwr_1", "client_id": "app_1", "token_type_hint": "refresh_token"}
    assert read_metadata(base_url=api.url)["issuer"] == api.url
    assert api.seen[1].path == "/.well-known/oauth-authorization-server"
    with pytest.raises(PlotworkOAuthError):
        read_metadata(base_url=api.url)


def test_with_refresh_refreshes_once_a_minute_early_and_saves_the_rotated_set(api: FakeApi) -> None:
    now = [1000.0]
    saved: List[TokenSet] = []
    first = TokenSet(access_token="pwa_1", refresh_token="pwr_1", expires_at=1120.0, scope="profile")
    from plotwork.oauth import RefreshingToken

    token = RefreshingToken(first, client_id="app_1", on_refresh=saved.append, base_url=api.url, clock=lambda: now[0])
    assert token() == "pwa_1"
    assert api.seen == []
    now[0] = 1061.0
    api.answer(tokens(2))
    answers: List[str] = []
    threads = [threading.Thread(target=lambda: answers.append(token())) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert answers == ["pwa_2"] * 4
    assert len(api.seen) == 1
    assert form(api.seen[0])["refresh_token"] == "pwr_1"
    assert [tokens.refresh_token for tokens in saved] == ["pwr_2"]
    assert token.current.refresh_token == "pwr_2"
    assert with_refresh(first, client_id="a", on_refresh=saved.append).current is first


def test_the_client_sends_a_token_function_as_a_bearer_before_each_attempt(api: FakeApi) -> None:
    issued = [0]

    def token() -> str:
        issued[0] += 1
        return f"pwa_{issued[0]}"

    api.answer(Answer(503, {"errorCode": "service.busy", "message": "Busy"}, {"Retry-After": "0"}), Answer(body={"id": "u1", "name": "Ada", "organisation": None}))
    me = Plotwork(base_url=api.url, access_token=token, sleep=lambda _: None).me()
    assert me["name"] == "Ada"
    assert [seen.headers["authorization"] for seen in api.seen] == ["Bearer pwa_1", "Bearer pwa_2"]
    assert "x-api-key" not in api.seen[0].headers


def test_the_client_refuses_a_key_and_a_token_together() -> None:
    with pytest.raises(TypeError):
        Plotwork(api_key="pk_test", access_token="pwa_1")


def test_with_options_keeps_the_token(api: FakeApi) -> None:
    api.answer(Answer(body={"kinds": []}))
    Plotwork(base_url=api.url, access_token="pwa_1").with_options(timeout=5).vocabulary()
    assert api.seen[0].headers["authorization"] == "Bearer pwa_1"


def test_the_library_lists_and_reads_a_picture_with_its_tag(api: FakeApi) -> None:
    svg = '<svg xmlns="http://www.w3.org/2000/svg"/>'
    api.answer(
        Answer(body={"items": [], "nextCursor": None}),
        Answer(raw=svg.encode(), headers={"Content-Type": "image/svg+xml", "ETag": '"abc"'}),
        Answer(304, headers={"ETag": '"abc"'}),
    )
    plotwork = Plotwork(base_url=api.url, access_token="pwa_1")
    assert plotwork.library.list(folder="Payments", limit=10) == {"items": [], "nextCursor": None}
    assert api.seen[0].path == "/v1/library?limit=10&folder=Payments"
    picture_id = "6f1c2d3e-0000-4000-8000-000000000001"
    assert plotwork.library.picture_url(picture_id) == f"{api.url}/v1/library/{picture_id}.svg"
    picture = plotwork.library.picture(picture_id)
    assert picture is not None and (picture.svg, picture.etag) == (svg, '"abc"')
    assert api.seen[1].headers["accept"] == "image/svg+xml"
    assert api.seen[1].headers["authorization"] == "Bearer pwa_1"
    assert plotwork.library.picture(picture_id, etag='"abc"') is None
    assert api.seen[2].headers["if-none-match"] == '"abc"'


def test_the_library_reads_a_png_at_a_width_and_scheme_and_searches(api: FakeApi) -> None:
    png = bytes([0x89, 0x50, 0x4E, 0x47])
    api.answer(
        Answer(body={"items": [], "nextCursor": None}),
        Answer(raw=png, headers={"Content-Type": "image/png", "ETag": '"png"'}),
        Answer(304, headers={"ETag": '"png"'}),
    )
    plotwork = Plotwork(base_url=api.url, access_token="pwa_1")
    plotwork.library.list(q="checkout")
    assert api.seen[0].path == "/v1/library?q=checkout"
    picture_id = "6f1c2d3e-0000-4000-8000-000000000001"
    assert plotwork.library.png_url(picture_id, width=320) == f"{api.url}/v1/library/{picture_id}.png?width=320"
    painted = plotwork.library.png(picture_id, width=1600, scheme="dark")
    assert painted is not None and (painted.png, painted.etag) == (png, '"png"')
    assert api.seen[1].path == f"/v1/library/{picture_id}.png?width=1600&scheme=dark"
    assert api.seen[1].headers["accept"] == "image/png"
    assert plotwork.library.png(picture_id, etag='"png"') is None
