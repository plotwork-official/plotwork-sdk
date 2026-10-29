"""``plotwork.library``: the generated ``list``, and the pictures, written by hand.

``GET /v1/library/{id}.svg`` answers an SVG with a strong ETag, not JSON, so it is text and a tag rather than a typed value.
"""

from __future__ import annotations

import urllib.parse
from dataclasses import dataclass
from typing import Optional

from ._generated import LibraryOperations


@dataclass(frozen=True)
class LibraryPicture:
    """One picture of the library, as published."""

    #: The SVG text.
    svg: str
    #: The strong tag to send back as ``etag`` next time, or ``None`` when the API sent none.
    etag: Optional[str]


def _path_of(diagram_id: str) -> str:
    return f"/v1/library/{urllib.parse.quote(diagram_id, safe='')}.svg"


class Library(LibraryOperations):
    """The ``library`` operations: ``list``, ``picture`` and ``picture_url``."""

    def picture_url(self, diagram_id: str) -> str:
        """The address of a picture of the library. It needs a key or a token with ``library:read``."""
        return self._transport.url_of(_path_of(diagram_id))

    def picture(self, diagram_id: str, *, etag: Optional[str] = None) -> Optional[LibraryPicture]:
        """The picture's SVG and tag; ``None`` when ``etag`` is given and the picture has not changed. ``GET /v1/library/{id}.svg``"""
        answer = self._transport.request_text(_path_of(diagram_id), accept="image/svg+xml", etag=etag)
        return None if answer is None else LibraryPicture(svg=answer[0], etag=answer[1])
