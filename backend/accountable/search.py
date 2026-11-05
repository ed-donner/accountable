"""The top bar's search, GET /search: the check on the text, one query over the kinds
each area gives it, the order, the limit of 5 and the counts (K1 to K8).

It knows nothing about any area's tables. Each area's own search.py gives its kinds,
and main.py hands them over.
"""

import unicodedata
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import AfterValidator, BaseModel, SerializeAsAny
from sqlalchemy import ColumnElement, Connection, Row, Select, Text, cast, func, literal, null, union_all

from accountable import db

SHOWN = 5
LONGEST = 100
LIKE_ESCAPE = "/"

Matcher = Callable[[ColumnElement[str]], ColumnElement[bool]]
"""Whether a name holds the text being searched for."""


@dataclass(frozen=True)
class Kind:
    """One kind of record the search finds, as its area describes it."""

    name: str
    """The reply's key for this kind, such as "deals". Kinds come in the reply in the order given."""
    found: Callable[[Matcher], Select]
    """The records whose names match, as a select of id, name, detail and extra. Detail and
    extra are text, so every kind's select lines up in one union, which Postgres insists on."""
    result: Callable[[Row], BaseModel]
    """One row as the reply shows it."""


def blank_text() -> ColumnElement[Any]:
    """A column one kind doesn't have. Postgres won't guess its type the way SQLite does."""
    return cast(null(), Text)


def _search_text(value: str) -> str:
    value = value.strip()
    if not 1 <= len(value) <= LONGEST:
        raise ValueError(f"Search for 1 to {LONGEST} characters")
    if "\x00" in value:
        # Postgres can't hold it in text, so it would fail there and find nothing on SQLite.
        raise ValueError("Use plain text here")
    return value


SearchText = Annotated[str, Query(), AfterValidator(_search_text)]


class Group(BaseModel):
    """How many of one kind match, and the first few in order. Each area's results
    keep their own fields, which a plain BaseModel would serialize as {}."""

    count: int
    results: list[SerializeAsAny[BaseModel]]


def _holding(text: str) -> Matcher:
    """Names holding the text in any case, with the database's lower on both sides, so
    each database agrees with itself (K2). autoescape only takes a plain string, and
    this text goes through lower first, so % and _ are escaped here to match only themselves."""
    escaped = text.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
    for wildcard in ("%", "_"):
        escaped = escaped.replace(wildcard, LIKE_ESCAPE + wildcard)
    return lambda name: func.lower(name, type_=Text).contains(func.lower(escaped, type_=Text), escape=LIKE_ESCAPE)


def _matching(conn: Connection, kinds: Sequence[Kind], text: str) -> list[Row]:
    """Every match of every kind, in one query, because each one crosses the internet in the shared app."""
    holding = _holding(text)
    found = [kind.found(holding).add_columns(literal(kind.name).label("kind")) for kind in kinds]
    return list(conn.execute(union_all(*found)).all())


def _alphabetical(name: str) -> tuple[str, str]:
    """Letters before their accents, so Émile sorts among the Es. Sorted here, not by
    the database, because SQLite's and Postgres's orders differ."""
    letters = "".join(char for char in unicodedata.normalize("NFKD", name) if not unicodedata.combining(char))
    return letters.casefold(), name


def _in_order(rows: list[Row], text: str) -> list[Row]:
    """Names that start with the text first, then the rest, each alphabetically (K4)."""
    start = text.lower()
    return sorted(rows, key=lambda row: (not row.name.lower().startswith(start), _alphabetical(row.name), row.id))


def _group(rows: list[Row], result: Callable[[Row], BaseModel]) -> Group:
    return Group(count=len(rows), results=[result(row) for row in rows[:SHOWN]])


def router(kinds: Sequence[Kind]) -> APIRouter:
    """GET /search over these kinds, with a group for each in the reply, in their order."""
    routes = APIRouter()

    @routes.get("/search")
    def search(q: SearchText) -> dict[str, Group]:
        with db.reading() as conn:
            rows = _in_order(_matching(conn, kinds, q), q)
        return {kind.name: _group([row for row in rows if row.kind == kind.name], kind.result) for kind in kinds}

    return routes
