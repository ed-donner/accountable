"""Calling the app's own routes in process, as the person who asked (security.md, The Copilot).

Each call goes through httpx's ASGI transport into the whole app, with the Authorization
header, host and client address of the request that asked, so it meets the trusted host
check, the token check, the body checks and the write lock exactly as the person's own
request would, and can do only what they can. Nothing here touches the database.
"""

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from datetime import date
from typing import Any, Literal, NamedTuple

import httpx
from fastapi import Request
from starlette.types import ASGIApp

from accountable.api import MAX_ID

Method = Literal["GET", "POST", "PATCH"]

# A path the app has under /api, with no query, fragment or dots that could lead elsewhere.
API_PATH = re.compile(r"/api(/[A-Za-z0-9_-]+)+")
# A part of a route's template that varies, such as {deal_id}, or {} in a path being built.
VARYING = re.compile(r"\{[a-z_]*\}")
# Where a request with no client address seems to come from: not an address, so never this computer.
NO_ADDRESS = ("unknown", 0)


class Route(NamedTuple):
    """A route a tool names, as the app lists it, such as ("GET", "/api/deals/{deal_id}")."""

    method: Method
    path: str


class OutOfReach(Exception):
    """A request the caller may not make: outside /api, or to a route its tool doesn't name.
    It's refused before anything is sent, and means the tool itself is wrong."""


class NotAnId(ValueError):
    """A value that can't go into a path, because it isn't a whole number from 1 to MAX_ID."""


@dataclass(frozen=True)
class Reply:
    status: int
    data: Any
    """The reply's JSON, or None for a reply that has none."""

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300


@dataclass(frozen=True)
class Caller:
    """The person who asked, as the app's own routes see them."""

    app: ASGIApp
    authorization: str | None
    """The Authorization header of the request that asked, token and all, or None if it had none."""
    host: str
    """Its Host header, port included, such as localhost:5173."""
    client: tuple[str, int]
    """The address it came from, which in the local copy decides whether it came from this computer."""
    today: date
    """The backend's today for the turn, which a look-up such as late deals needs and can't read from db.py."""
    reach: tuple[Route, ...] | None = None
    """The only routes this caller may call, or None before it's limited to one tool's."""

    @classmethod
    def from_request(cls, request: Request, today: date) -> "Caller":
        return cls(
            app=request.app,
            authorization=request.headers.get("authorization"),
            host=request.headers.get("host") or request.url.netloc,
            client=(request.client.host, request.client.port) if request.client else NO_ADDRESS,
            today=today,
        )

    def limited_to(self, routes: Iterable[Route]) -> "Caller":
        """The same person, able to call only these routes, as a tool's run and card are."""
        return replace(self, reach=tuple(routes))

    @staticmethod
    def path(template: str, *ids: int) -> str:
        """The template with each {} or {name} in it replaced by the next id, such as
        path("/api/deals/{}", 12). Anything but a whole number from 1 to MAX_ID is refused,
        so no argument can shape a path."""
        for value in ids:
            if type(value) is not int or not 1 <= value <= MAX_ID:
                raise NotAnId(f"{value!r} isn't a record's id")
        parts = VARYING.split(template)
        if len(parts) != len(ids) + 1:
            raise NotAnId(f"{template} takes {len(parts) - 1} ids, not {len(ids)}")
        return "".join(f"{part}{value}" for part, value in zip(parts, ids)) + parts[-1]

    async def get(self, path: str, params: Mapping[str, Any] | None = None) -> Reply:
        """A read, with these query values. A value of None is left out, and a list is sent once for each item."""
        given = {name: value for name, value in (params or {}).items() if value is not None}
        return await self._send("GET", path, params=given)

    async def post(self, path: str, body: Mapping[str, Any]) -> Reply:
        return await self._send("POST", path, json=dict(body))

    async def patch(self, path: str, body: Mapping[str, Any]) -> Reply:
        return await self._send("PATCH", path, json=dict(body))

    async def _send(self, method: Method, path: str, **sent: Any) -> Reply:
        self._check_reach(method, path)
        headers = {} if self.authorization is None else {"authorization": self.authorization}
        # A crash inside the app comes back as its JSON 500, as it would to the browser, rather than raising here.
        transport = httpx.ASGITransport(app=self.app, client=self.client, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url=f"http://{self.host}") as client:
            reply = await client.request(method, path, headers=headers, **sent)
        return Reply(status=reply.status_code, data=_json(reply))

    def _check_reach(self, method: Method, path: str) -> None:
        if not API_PATH.fullmatch(path):
            raise OutOfReach(f"{path} isn't one of the app's addresses")
        if self.reach is not None and not any(_matches(route, method, path) for route in self.reach):
            raise OutOfReach(f"{method} {path} isn't one of this tool's routes")


def _matches(route: Route, method: Method, path: str) -> bool:
    """Whether the request is the route's, with a whole number wherever its template varies."""
    pattern = "".join(
        re.escape(part) if index % 2 == 0 else "[1-9][0-9]*"
        for index, part in enumerate(re.split(r"(\{[a-z_]*\})", route.path))
    )
    return route.method == method and re.fullmatch(pattern, path) is not None


def _json(reply: httpx.Response) -> Any:
    if "application/json" not in reply.headers.get("content-type", ""):
        return None
    return reply.json()
