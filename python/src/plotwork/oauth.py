"""Sign in with Plotwork: OAuth 2.1 authorization code with PKCE, on the standard library alone.

An app whose people have Plotwork accounts sends each person to Plotwork, gets a code back, and trades it for tokens that act as
that person on ``/v1``::

    from plotwork import Plotwork
    from plotwork.oauth import authorize_url, create_pkce, exchange_code, parse_redirect, with_refresh

    pkce = create_pkce()
    request = authorize_url(client_id=CLIENT_ID, redirect_uri=REDIRECT_URI, scopes=["library:read"], code_challenge=pkce.challenge)
    # ... keep request.state and pkce.verifier in the session, send the browser to request.url, and on the way back:
    code = parse_redirect(callback_url, request.state)
    tokens = exchange_code(client_id=CLIENT_ID, client_secret=CLIENT_SECRET, code=code, redirect_uri=REDIRECT_URI, code_verifier=pkce.verifier)
    plotwork = Plotwork(access_token=with_refresh(tokens, client_id=CLIENT_ID, client_secret=CLIENT_SECRET, on_refresh=save))
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, NamedTuple, Optional, Sequence

from ._request import Opener, _is_timeout
from ._version import __version__

__all__ = [
    "DEFAULT_BASE_URL",
    "SCOPES",
    "AuthorizationRequest",
    "Pkce",
    "PlotworkOAuthError",
    "RefreshingToken",
    "TokenSet",
    "authorize_url",
    "challenge_of",
    "create_pkce",
    "exchange_code",
    "parse_redirect",
    "read_metadata",
    "refresh_token",
    "revoke_token",
    "with_refresh",
]

#: The production API, which is also the authorization server.
DEFAULT_BASE_URL = "https://api.plotwork.dev"

#: What an app may ask for. A token holds only the scopes the person approved.
SCOPES = ("diagrams:use", "diagrams:publish", "library:read", "profile", "email")

_TIMEOUT = 30.0


class PlotworkOAuthError(Exception):
    """A refusal from the authorization server (OAuth's ``error`` and ``error_description``), or what the helper knew without one.

    ``error`` is OAuth's own code (``invalid_grant``, ``invalid_client``, ``access_denied``) or one of the helper's:
    ``invalid_state``, ``invalid_issuer``, ``invalid_response``, ``request_failed`` and ``request_timeout``.
    """

    error: str
    description: str
    #: The HTTP status, or 0 when no answer came or the mistake was found in a redirect.
    status: int

    def __init__(self, error: str, description: str, status: int) -> None:
        super().__init__(f"{error}: {description}" if description else error)
        self.error = error
        self.description = description
        self.status = status

    def __repr__(self) -> str:
        return f"PlotworkOAuthError(error={self.error!r}, description={self.description!r}, status={self.status!r})"


@dataclass(frozen=True)
class Pkce:
    """A PKCE verifier and its S256 challenge. Keep ``verifier`` until the code comes back; send ``challenge`` to ``authorize_url``."""

    verifier: str = field(repr=False)
    challenge: str
    method: str = "S256"


@dataclass(frozen=True)
class TokenSet:
    """The tokens of one grant. Keep ``refresh_token`` where only the app reads it: each refresh returns a new one, and the old one dies."""

    #: ``pwa_...``, sent as ``Authorization: Bearer``; it lasts an hour. Left out of ``repr``, so a log never shows it.
    access_token: str = field(repr=False)
    #: ``pwr_...``, for ``refresh_token()``; it lasts 30 days from its last use. Left out of ``repr``.
    refresh_token: str = field(repr=False)
    #: When the access token ends, in seconds since the epoch, as ``time.time()`` counts.
    expires_at: float
    #: The scopes the person approved, space-separated, as the server wrote them.
    scope: str
    token_type: str = "Bearer"


class AuthorizationRequest(NamedTuple):
    """Where to send the browser, and the state to find again in the redirect."""

    url: str
    state: str


def _base64_url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def challenge_of(verifier: str) -> str:
    """The S256 challenge of a verifier: base64url(SHA-256(verifier))."""
    return _base64_url(hashlib.sha256(verifier.encode("ascii")).digest())


def create_pkce() -> Pkce:
    """A new verifier of 64 characters (48 random bytes) and its S256 challenge."""
    verifier = secrets.token_urlsafe(48)
    return Pkce(verifier=verifier, challenge=challenge_of(verifier))


def _endpoint(base_url: Optional[str], path: str) -> str:
    base = base_url or DEFAULT_BASE_URL
    return urllib.parse.urljoin(base if base.endswith("/") else f"{base}/", path.lstrip("/"))


def authorize_url(
    *,
    client_id: str,
    redirect_uri: str,
    scopes: Sequence[str],
    code_challenge: str,
    state: Optional[str] = None,
    base_url: Optional[str] = None,
) -> AuthorizationRequest:
    """The address of ``GET /oauth/authorize`` for this app, and its state (a random one when ``state`` is left out)."""
    if not scopes:
        raise ValueError("authorize_url needs at least one scope")
    chosen = state if state is not None else secrets.token_urlsafe(24)
    query = urllib.parse.urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": " ".join(scopes),
            "state": chosen,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        },
        quote_via=urllib.parse.quote,
    )
    return AuthorizationRequest(url=f"{_endpoint(base_url, '/oauth/authorize')}?{query}", state=chosen)


def parse_redirect(url: str, expected_state: str, *, base_url: Optional[str] = None) -> str:
    """The code from the address Plotwork sent the browser back to.

    Raises ``PlotworkOAuthError`` when the state is not the one the app sent (``invalid_state``, checked first, so a forged answer is
    never read), when ``iss`` names another server (``invalid_issuer``), when the person said no or the request was refused (from
    ``error=``), and when there is no code.
    """
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)

    def first(name: str) -> Optional[str]:
        values = query.get(name)
        return values[0] if values else None

    if not expected_state or first("state") != expected_state:
        raise PlotworkOAuthError("invalid_state", "The redirect does not carry the state this app sent", 0)
    issuer = first("iss")
    expected = (base_url or DEFAULT_BASE_URL).rstrip("/")
    if issuer is not None and issuer.rstrip("/") != expected:
        raise PlotworkOAuthError("invalid_issuer", f"The redirect came from {issuer}, not {expected}", 0)
    error = first("error")
    if error is not None:
        raise PlotworkOAuthError(error, first("error_description") or "", 0)
    code = first("code")
    if not code:
        raise PlotworkOAuthError("invalid_request", "The redirect carries no code", 0)
    return code


def _default_opener() -> Opener:
    return urllib.request.build_opener().open


def _refusal(status: int, body: Any) -> PlotworkOAuthError:
    record: Dict[str, Any] = body if isinstance(body, dict) else {}
    description = record.get("error_description") if isinstance(record.get("error_description"), str) else record.get("message")
    text = description if isinstance(description, str) else ""
    if isinstance(record.get("error"), str):
        return PlotworkOAuthError(record["error"], text, status)
    if isinstance(record.get("errorCode"), str):
        return PlotworkOAuthError(record["errorCode"], text, status)
    return PlotworkOAuthError(f"http_{status}", f"The Plotwork API answered HTTP {status}", status)


def _call(path: str, *, base_url: Optional[str], form: Optional[Dict[str, str]], timeout: float, opener: Optional[Opener]) -> Any:
    """Sends one request to the authorization server and returns its JSON answer, or raises ``PlotworkOAuthError``."""
    headers = {"Accept": "application/json", "User-Agent": f"plotwork-python/{__version__}"}
    data = None
    if form is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(form).encode("ascii")
    request = urllib.request.Request(_endpoint(base_url, path), data=data, headers=headers, method="GET" if form is None else "POST")
    try:
        response = (opener or _default_opener())(request, timeout=timeout)
    except urllib.error.HTTPError as answer:
        response = answer
    except (urllib.error.URLError, OSError) as error:
        if _is_timeout(error):
            raise PlotworkOAuthError("request_timeout", "The Plotwork API did not answer in time", 0) from None
        raise PlotworkOAuthError("request_failed", "The Plotwork API could not be reached", 0) from None
    try:
        status = int(getattr(response, "status", None) or response.getcode())
        try:
            raw = response.read()
        except OSError:
            raw = b""
    finally:
        close = getattr(response, "close", None)
        if close is not None:
            close()
    try:
        body = json.loads(raw.decode("utf-8")) if raw else None
    except ValueError:
        body = None  # Not JSON (a proxy's page): the status says enough.
    if not 200 <= status < 300:
        raise _refusal(status, body)
    return body


def _client_form(client_id: str, client_secret: Optional[str]) -> Dict[str, str]:
    return {"client_id": client_id, "client_secret": client_secret} if client_secret else {"client_id": client_id}


def _token_set(body: Any, previous_refresh: Optional[str] = None) -> TokenSet:
    record: Dict[str, Any] = body if isinstance(body, dict) else {}
    access = record.get("access_token")
    refresh = record.get("refresh_token") if isinstance(record.get("refresh_token"), str) else previous_refresh
    lifetime = record.get("expires_in")
    if not isinstance(access, str) or refresh is None or not isinstance(lifetime, (int, float)) or isinstance(lifetime, bool):
        raise PlotworkOAuthError("invalid_response", "The token answer has no access token, refresh token or lifetime", 200)
    scope = record.get("scope")
    token_type = record.get("token_type")
    return TokenSet(
        access_token=access,
        refresh_token=refresh,
        expires_at=time.time() + float(lifetime),
        scope=scope if isinstance(scope, str) else "",
        token_type=token_type if isinstance(token_type, str) else "Bearer",
    )


def exchange_code(
    *,
    client_id: str,
    code: str,
    redirect_uri: str,
    code_verifier: str,
    client_secret: Optional[str] = None,
    base_url: Optional[str] = None,
    timeout: float = _TIMEOUT,
    opener: Optional[Opener] = None,
) -> TokenSet:
    """Trades the code from the redirect for tokens: ``POST /oauth/token`` with ``grant_type=authorization_code``."""
    form = {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri, "code_verifier": code_verifier, **_client_form(client_id, client_secret)}
    return _token_set(_call("/oauth/token", base_url=base_url, form=form, timeout=timeout, opener=opener))


def refresh_token(
    *,
    client_id: str,
    refresh_token: str,
    client_secret: Optional[str] = None,
    base_url: Optional[str] = None,
    timeout: float = _TIMEOUT,
    opener: Optional[Opener] = None,
) -> TokenSet:
    """New tokens for a refresh token: ``POST /oauth/token`` with ``grant_type=refresh_token``.

    Save the answer's ``refresh_token`` at once: the one sent stops working, and sending it again ends the whole grant.
    """
    form = {"grant_type": "refresh_token", "refresh_token": refresh_token, **_client_form(client_id, client_secret)}
    return _token_set(_call("/oauth/token", base_url=base_url, form=form, timeout=timeout, opener=opener), refresh_token)


def revoke_token(
    *,
    client_id: str,
    token: str,
    token_type_hint: Optional[str] = None,
    client_secret: Optional[str] = None,
    base_url: Optional[str] = None,
    timeout: float = _TIMEOUT,
    opener: Optional[Opener] = None,
) -> None:
    """Ends a token (RFC 7009): an access token alone, or with a refresh token the whole grant. An unknown token is not an error."""
    form = {"token": token, **_client_form(client_id, client_secret)}
    if token_type_hint is not None:
        form["token_type_hint"] = token_type_hint
    _call("/oauth/revoke", base_url=base_url, form=form, timeout=timeout, opener=opener)


def read_metadata(*, base_url: Optional[str] = None, timeout: float = _TIMEOUT, opener: Optional[Opener] = None) -> Dict[str, Any]:
    """The server's RFC 8414 metadata, ``GET /.well-known/oauth-authorization-server``."""
    body = _call("/.well-known/oauth-authorization-server", base_url=base_url, form=None, timeout=timeout, opener=opener)
    if not isinstance(body, dict) or not isinstance(body.get("issuer"), str) or not isinstance(body.get("token_endpoint"), str):
        raise PlotworkOAuthError("invalid_response", "The metadata names no issuer or token endpoint", 200)
    return body


class RefreshingToken:
    """An ``access_token`` function for the client that keeps one grant's tokens fresh. Made by ``with_refresh``.

    It refreshes ``leeway`` seconds before the access token ends, sends one refresh however many threads ask at once, and hands each
    new set to ``on_refresh`` so the app saves the rotated refresh token. Use one per grant: two refreshers of the same refresh
    token end the grant, as a stolen copy would.
    """

    def __init__(
        self,
        tokens: TokenSet,
        *,
        client_id: str,
        on_refresh: Callable[[TokenSet], Any],
        client_secret: Optional[str] = None,
        base_url: Optional[str] = None,
        leeway: float = 60.0,
        timeout: float = _TIMEOUT,
        opener: Optional[Opener] = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._tokens = tokens
        self._client_id = client_id
        self._client_secret = client_secret
        self._base_url = base_url
        self._on_refresh = on_refresh
        self._leeway = leeway
        self._timeout = timeout
        self._opener = opener
        self._clock = clock
        self._lock = threading.Lock()

    @property
    def current(self) -> TokenSet:
        """The tokens held now, after any refresh."""
        return self._tokens

    def __call__(self) -> str:
        with self._lock:
            if self._clock() < self._tokens.expires_at - self._leeway:
                return self._tokens.access_token
            fresh = refresh_token(
                client_id=self._client_id,
                client_secret=self._client_secret,
                refresh_token=self._tokens.refresh_token,
                base_url=self._base_url,
                timeout=self._timeout,
                opener=self._opener,
            )
            self._tokens = fresh
            self._on_refresh(fresh)
            return fresh.access_token

    def __repr__(self) -> str:
        return f"RefreshingToken(expires_at={self._tokens.expires_at!r})"


def with_refresh(
    tokens: TokenSet,
    *,
    client_id: str,
    on_refresh: Callable[[TokenSet], Any],
    client_secret: Optional[str] = None,
    base_url: Optional[str] = None,
    leeway: float = 60.0,
    timeout: float = _TIMEOUT,
    opener: Optional[Opener] = None,
) -> RefreshingToken:
    """An ``access_token`` function for ``Plotwork`` that refreshes the grant a minute before it ends and saves each new set."""
    return RefreshingToken(
        tokens,
        client_id=client_id,
        on_refresh=on_refresh,
        client_secret=client_secret,
        base_url=base_url,
        leeway=leeway,
        timeout=timeout,
        opener=opener,
    )
