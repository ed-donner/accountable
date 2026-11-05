"""What every area's API shares: the base request model and its checks on what's sent,
the field types and request parameters, and the errors shown beside a field."""

import re
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime
from typing import Annotated, Any
from urllib.parse import urlsplit

from fastapi import Depends, Path, Query
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, PlainSerializer, StrictInt, field_validator

from accountable import db

MAX_VALUE = 1_000_000_000_000
# The largest id both databases can hold: Postgres's integer columns stop here,
# well before SQLite's. A query given a bigger one crashes instead of finding nothing.
MAX_ID = 2**31 - 1

NAME_MESSAGE = "Enter a name"


class FieldError(Exception):
    """A rule that needs the database to check, reported beside its field."""

    def __init__(self, fields: dict[str, str]):
        super().__init__("Check the form.")
        self.fields = fields


def field_messages(errors: Iterable[Mapping[str, Any]], messages: Mapping[str, str]) -> dict[str, str]:
    """Each bad field's message: its check's own, or else the one the areas give that field."""
    fields: dict[str, str] = {}
    for error in errors:
        location = error["loc"]
        field = str(location[1]) if len(location) > 1 else "body"
        if error["type"] == "value_error":
            fields.setdefault(field, str(error["ctx"]["error"]))
        else:
            fields.setdefault(field, messages.get(field, "Check this field"))
    return fields


def _name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(NAME_MESSAGE)
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
OptionalText = Annotated[str | None, AfterValidator(_blank_to_none)]
Email = Annotated[str | None, AfterValidator(_email)]
Website = Annotated[str | None, AfterValidator(_website)]
Id = Annotated[int, Field(ge=1, le=MAX_ID)]
PathId = Annotated[int, Path(ge=1, le=MAX_ID)]
PageLimit = Annotated[int, Query(ge=1, le=500)]
PageOffset = Annotated[int, Query(ge=0, le=MAX_ID)]
# Asked for per request, so tests can fix them.
Today = Annotated[date, Depends(db.local_today)]
Now = Annotated[datetime, Depends(db.utc_now)]
Dollars = Annotated[StrictInt, Field(ge=0, le=MAX_VALUE)]
UtcTime = Annotated[datetime, PlainSerializer(_with_z, return_type=str)]


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
