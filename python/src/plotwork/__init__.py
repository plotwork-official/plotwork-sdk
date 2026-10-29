"""``plotwork``: the hosted Plotwork API from Python, on the standard library alone.

Every ``/v1`` operation is a typed method generated from ``spec/openapi.json``::

    import os
    from plotwork import Plotwork

    plotwork = Plotwork(api_key=os.environ["PLOTWORK_API_KEY"])
    checked = plotwork.diagrams.validate(source=source)
    published = plotwork.diagrams.publish(source=source, alias="checkout-flow")
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from ._generated import OPERATION_PATHS, Operations
from ._request import Opener, PlotworkApiError, Transport, retry_delay
from ._version import __version__

__all__ = ["DEFAULT_BASE_URL", "OPERATION_PATHS", "Plotwork", "PlotworkApiError", "Transport", "__version__", "retry_delay"]

#: The production API.
DEFAULT_BASE_URL = "https://api.plotwork.dev"

_UNSET: Any = object()


class Plotwork(Operations):
    """The Plotwork API client.

    :param api_key: An account or organisation API key, sent as ``X-API-Key``. Keep it in an environment variable or a secret store.
    :param base_url: The API's address: production by default, ``https://api-preview.plotwork.dev`` for preview, or a self-hosted engine.
    :param timeout: Seconds before a call counts as failed: 60 by default.
    :param max_retries: How many times a safe call is tried again on 429 or 503: 2 by default, 0 to never retry.
    :param opener: Opens each request, called like ``urllib.request.urlopen``; a proxy or a test passes its own.
    :param sleep: Waits the given seconds before a retry; ``time.sleep`` by default.
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
        max_retries: int = 2,
        opener: Optional[Opener] = None,
        sleep: Optional[Callable[[float], Any]] = None,
    ) -> None:
        headers: Dict[str, str] = {}
        if api_key:
            headers["X-API-Key"] = api_key
        self._options: Dict[str, Any] = {
            "api_key": api_key,
            "base_url": base_url,
            "timeout": timeout,
            "max_retries": max_retries,
            "opener": opener,
            "sleep": sleep,
        }
        super().__init__(
            Transport(
                base_url=base_url or DEFAULT_BASE_URL,
                headers=headers,
                timeout=timeout,
                max_retries=max_retries,
                opener=opener,
                sleep=sleep,
            )
        )

    def with_options(self, *, timeout: float = _UNSET, max_retries: int = _UNSET) -> "Plotwork":
        """A copy of this client with another timeout or number of retries, for one call or a few:

        ``plotwork.with_options(timeout=120).import_source(format="terraform", text=text)``
        """
        options = dict(self._options)
        if timeout is not _UNSET:
            options["timeout"] = timeout
        if max_retries is not _UNSET:
            options["max_retries"] = max_retries
        return Plotwork(**options)

    def __repr__(self) -> str:
        return f"Plotwork(base_url={self._transport.base_url!r})"
