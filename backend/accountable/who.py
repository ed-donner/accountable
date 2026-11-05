"""Who added each record and who last changed it, and when (U10), for every area: the
columns its tables keep, the values a save writes, and the names in replies.

The person always comes from the token, through the routes' CurrentUser, never from
the request body.
"""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import Column, DateTime, ForeignKey, Select, Table
from sqlalchemy.engine.default import DefaultExecutionContext

from accountable.api import UtcTime
from accountable.db import utc_now
from accountable.users import Person, person, users

_added_by = users.alias("added_by")
_changed_by = users.alias("changed_by")


def _same_as_created(context: DefaultExecutionContext):
    return context.get_current_parameters()["created_at"]


def columns() -> list[Column]:
    """Every record's times, and who added it and who last changed it, blank on records from before sign-in (U12).

    A new record's two times are one moment, so "changed" means updated_at differs.
    """
    return [
        Column("created_at", DateTime, nullable=False, default=utc_now),
        Column("updated_at", DateTime, nullable=False, default=_same_as_created, onupdate=utc_now),
        Column("created_by", ForeignKey(users.c.id), index=True),
        Column("updated_by", ForeignKey(users.c.id), index=True),
    ]


def added(user_id: str | None, now: datetime) -> dict[str, Any]:
    """What an add records. Both times are one moment, so a record nobody has changed shows it.

    None records nobody, as on a record from before sign-in. Only tests still make those.
    """
    return {"created_by": user_id, "created_at": now, "updated_by": user_id, "updated_at": now}


def changed(user_id: str | None, now: datetime) -> dict[str, Any]:
    return {"updated_by": user_id, "updated_at": now}


def alterations(fields: Mapping[str, Any], current: Any) -> dict[str, Any]:
    """The fields a save would really alter. A save that alters nothing isn't a change."""
    return {name: value for name, value in fields.items() if getattr(current, name) != value}


def with_names(query: Select, table: Table) -> Select:
    """Adds who added and who last changed each of the table's rows, for authorship()."""
    return (
        query.add_columns(
            _added_by.c.name.label("created_by_name"),
            _added_by.c.email.label("created_by_email"),
            _changed_by.c.name.label("updated_by_name"),
            _changed_by.c.email.label("updated_by_email"),
        )
        .outerjoin(_added_by, table.c.created_by == _added_by.c.id)
        .outerjoin(_changed_by, table.c.updated_by == _changed_by.c.id)
    )


def authorship(row: Any) -> dict[str, Any]:
    """A reply's who and when, from a row read through with_names()."""
    return {
        "created_at": row.created_at,
        "created_by": person(row.created_by, row.created_by_name, row.created_by_email),
        "updated_at": row.updated_at,
        "updated_by": person(row.updated_by, row.updated_by_name, row.updated_by_email),
    }


class Authorship(BaseModel):
    """Who added the record and who last changed it, and when. Nobody, on records from before sign-in."""

    created_at: UtcTime
    created_by: Person | None
    updated_at: UtcTime
    updated_by: Person | None
