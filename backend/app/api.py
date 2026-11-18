"""Pieces every part of the JSON API shares: request field types, the 422 error shape and message wording."""

import re
from typing import Annotated

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import AfterValidator, BaseModel, StringConstraints
from sqlalchemy import Connection, Table, select

# Limits that keep one bad request from filling the database or overflowing SQLite.
MAX_NAME = 200
MAX_TEXT = 5000
MAX_ID = 2**63 - 1  # SQLite's largest INTEGER
MAX_BODY_BYTES = 1_000_000

# Request field types. Text is trimmed; Name and LongText must also not be blank.
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_NAME)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_TEXT)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TEXT)]

# A scheme such as `mailto:` or `file:`, but not a port as in `acme.com:8080`.
_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*:(?!\d)", re.IGNORECASE)
_EMAIL = re.compile(r"^[^\s@?&#/]+@[^\s@?&#/]+\.[^\s@?&#/.]+$")


def _web_address(value: str) -> str:
    """A website link: http(s) only, and `acme.com` becomes `https://acme.com`."""
    if not value:
        return value
    if re.search(r"\s", value):
        raise ValueError("Enter a web address, such as acme.com")
    if not _SCHEME.match(value):
        return f"https://{value}"
    if not value.lower().startswith(("http://", "https://")):
        raise ValueError("Enter a web address starting with http:// or https://")
    return value


def _email_address(value: str) -> str:
    if value and not _EMAIL.match(value):
        raise ValueError("Enter an email address, such as jane@acme.com")
    return value


WebAddress = Annotated[Text, AfterValidator(_web_address)]
EmailAddress = Annotated[Text, AfterValidator(_email_address)]


def fits(row_id: int) -> bool:
    """Whether an id can be a row id at all. Larger numbers would overflow SQLite."""
    return 1 <= row_id <= MAX_ID


def not_found_unless_fits(row_id: int, message: str) -> None:
    if not fits(row_id):
        raise HTTPException(404, message)


class DeletePreview(BaseModel):
    """What deleting a record will do (R26). Each record adds its own counts."""

    blocked: bool
    message: str


def plural(n: int, one: str, many: str) -> str:
    """`plural(1, "deal", "deals")` is "1 deal"; `plural(3, ...)` is "3 deals"."""
    return f"{n} {one if n == 1 else many}"


# ---------- 422 errors: one plain message per field (R58) ----------


def field_error(field: str, message: str) -> RequestValidationError:
    """A 422 for one field, in the same shape as a failed request validation."""
    return RequestValidationError([{"type": "value_error", "loc": ("body", field), "msg": message, "input": None}])


def require_row(conn: Connection, table: Table, row_id: int, field: str, message: str) -> None:
    """422 on `field` when a linked record doesn't exist, for example a deleted organization."""
    if not fits(row_id) or conn.execute(select(table.c.id).where(table.c.id == row_id)).first() is None:
        raise field_error(field, message)


def _field_message(error: dict) -> str:
    kind, ctx = error.get("type", ""), error.get("ctx") or {}
    if kind in ("missing", "string_too_short"):
        return "This is required"
    if kind == "string_too_long":
        return f"Keep this to {ctx.get('max_length')} characters or fewer"
    if kind == "greater_than_equal":
        return f"Must be {ctx.get('ge')} or more"
    if kind == "less_than_equal":
        return f"Must be {ctx.get('le')} or less"
    if kind in ("literal_error", "enum"):
        return "Choose one of the options"
    if kind.startswith("date") or kind.startswith("datetime"):
        return "Enter a valid date"
    if kind.startswith("int"):
        return "Enter a whole number"
    if kind == "value_error":
        return str(error.get("msg", "")).removeprefix("Value error, ")
    return str(error.get("msg", "Check this value"))


async def validation_error(_request: Request, exc: Exception) -> JSONResponse:
    """The app's handler for RequestValidationError, so forms can show each message next to its field."""
    assert isinstance(exc, RequestValidationError)
    fields: dict[str, str] = {}
    for error in exc.errors():
        loc = [str(part) for part in error.get("loc", []) if part not in ("body", "query", "path")]
        fields.setdefault(loc[-1] if loc else "form", _field_message(error))
    return JSONResponse(status_code=422, content={"detail": "Check the highlighted fields", "fields": fields})
