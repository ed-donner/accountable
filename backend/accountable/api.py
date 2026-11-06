"""What every area's API shares: the base request model and its checks on what's sent,
the field types and request parameters, the errors shown beside a field, and a route
that reads numbers exactly."""

import json
import re
from collections.abc import Callable, Coroutine, Iterable, Mapping
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Any
from urllib.parse import urlsplit

from fastapi import Depends, Path, Query, Response
from fastapi import Request as HttpRequest
from fastapi.routing import APIRoute
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, PlainSerializer, StrictInt, field_validator

from accountable import db

MAX_VALUE = 1_000_000_000_000
# Prices go up to the same $1 trillion, in whole cents (G3).
MAX_CENTS = MAX_VALUE * 100
# The largest id both databases can hold: Postgres's integer columns stop here,
# well before SQLite's. A query given a bigger one crashes instead of finding nothing.
MAX_ID = 2**31 - 1

NAME_MESSAGE = "Enter a name"
DESCRIPTION_MESSAGE = "Enter a description"


class FieldError(Exception):
    """A rule that needs the database to check, reported beside its field."""

    def __init__(self, fields: dict[str, str]):
        super().__init__("Check the form.")
        self.fields = fields


def field_messages(errors: Iterable[Mapping[str, Any]], messages: Mapping[str, str]) -> dict[str, str]:
    """Each bad field's message: its check's own, or else the one the areas give that field.

    A field inside a list is keyed by its whole place, such as lines.2.quantity, which is
    the form's own path for it, and takes the message of its own name, quantity.
    """
    fields: dict[str, str] = {}
    for error in errors:
        field, name = _field(error["loc"])
        if error["type"] == "value_error":
            fields.setdefault(field, str(error["ctx"]["error"]))
        else:
            fields.setdefault(field, messages.get(name, "Check this field"))
    return fields


def _field(location: tuple[Any, ...]) -> tuple[str, str]:
    """Where a bad field is, and the name its message goes by: "name" for a field of the body,
    and for one inside a list, its place, such as "lines.2.quantity", with "quantity" as its name.
    An item that isn't a record at all, such as "lines.1", goes by its list's name.
    Anything deeper, such as which kind of value pydantic tried, isn't part of the field."""
    if len(location) < 2:
        return "body", "body"
    parts, name, rest = [str(location[1])], str(location[1]), location[2:]
    while len(rest) >= 2 and isinstance(rest[0], int) and isinstance(rest[1], str):
        parts += [str(rest[0]), rest[1]]
        name, rest = rest[1], rest[2:]
    if rest and isinstance(rest[0], int):
        parts.append(str(rest[0]))
    return ".".join(parts), name


def _name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(NAME_MESSAGE)
    return value


def _description(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(DESCRIPTION_MESSAGE)
    return value


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _email(value: str | None) -> str | None:
    value = _blank_to_none(value)
    if value is not None and not EMAIL.match(value):
        raise ValueError("Enter a valid email address")
    return value


HAS_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*:(?!\d)", re.IGNORECASE)
WEBSITE_MESSAGE = "Enter a website address, such as https://example.com"


def _website(value: str | None) -> str | None:
    value = _blank_to_none(value)
    if value is None:
        return None
    if not HAS_SCHEME.match(value):
        value = f"https://{value}"
    try:
        parts = urlsplit(value)
        port_is_fine = parts.port is None or parts.port >= 0  # Reading it is what checks it.
    except ValueError as error:
        raise ValueError(WEBSITE_MESSAGE) from error
    if (
        parts.scheme.lower() not in ("http", "https")
        or not parts.hostname
        or not port_is_fine
        or re.search(r"\s", value)
    ):
        raise ValueError(WEBSITE_MESSAGE)
    return value


def _with_z(value: datetime) -> str:
    """SQLite stores no zone, so without this the browser would read UTC as local."""
    return value.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")


Name = Annotated[str, AfterValidator(_name)]
# An activity's, which the activity form and the Copilot both check (A1, Z11).
Description = Annotated[str, AfterValidator(_description)]
OptionalText = Annotated[str | None, AfterValidator(_blank_to_none)]
Email = Annotated[str | None, AfterValidator(_email)]
Website = Annotated[str | None, AfterValidator(_website)]
Id = Annotated[int, Field(ge=1, le=MAX_ID)]
PathId = Annotated[int, Path(ge=1, le=MAX_ID)]
# A record to narrow a list to, such as /api/invoices?deal_id=7, or None for every row.
QueryId = Annotated[int | None, Query(ge=1, le=MAX_ID)]
PageLimit = Annotated[int, Query(ge=1, le=500)]
PageOffset = Annotated[int, Query(ge=0, le=MAX_ID)]
# Asked for per request, so tests can fix them.
Today = Annotated[date, Depends(db.local_today)]
Now = Annotated[datetime, Depends(db.utc_now)]
Dollars = Annotated[StrictInt, Field(ge=0, le=MAX_VALUE)]
# Strict, so 49.5, "4950" and true are refused rather than rounded or read as numbers.
Cents = Annotated[StrictInt, Field(ge=0, le=MAX_CENTS)]
UtcTime = Annotated[datetime, PlainSerializer(_with_z, return_type=str)]
# A sum of money in whole cents, sent as digits, with a minus sign below zero, such as "-425000".
# Each amount a sum adds up fits a JavaScript number exactly, but the sum can pass 2**53 cents,
# where it can't, so the browser reads it as a BigInt (E20, Y20).
CentsSum = Annotated[int, PlainSerializer(str, return_type=str, when_used="json")]


class Request(BaseModel):
    """What a form sends. In an update, MISSING marks a field that wasn't sent, which keeps its value.

    Who added or changed a record comes from the token, so a body naming someone
    has it ignored, like any other field a form doesn't send.
    """

    model_config = ConfigDict(extra="ignore")

    @field_validator("*")
    @classmethod
    def _storable(cls, value: Any) -> Any:
        if isinstance(value, str) and not _is_storable(value):
            raise ValueError("Use plain text here")
        return value


def _is_storable(text: str) -> bool:
    """JSON can carry text a database can't store, which would crash the save: a
    character with no valid encoding, or a NUL, which Postgres refuses in text."""
    if "\x00" in text:
        return False
    if text.isascii():
        return True
    try:
        text.encode()
    except UnicodeEncodeError:
        return False
    return True


class _ExactNumbersRequest(HttpRequest):
    async def json(self) -> Any:
        if not hasattr(self, "_json"):
            self._json = json.loads(await self.body(), parse_float=Decimal)
        return self._json


class ExactNumbersRoute(APIRoute):
    """A route that reads a JSON number with a point or an exponent as a Decimal, with every digit sent.

    FastAPI reads a body with Python's JSON reader, which makes such a number a float, and a
    float can't hold 8.8750000000000001: it arrives as 8.875, and no later check can tell.
    """

    def get_route_handler(self) -> Callable[[HttpRequest], Coroutine[Any, Any, Response]]:
        handle = super().get_route_handler()

        async def read_exactly(request: HttpRequest) -> Response:
            return await handle(_ExactNumbersRequest(request.scope, request.receive))

        return read_exactly
