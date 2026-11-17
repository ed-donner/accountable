"""Per-request dependencies: a database connection and today's date."""

from collections.abc import Iterator
from datetime import date, datetime
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import Connection

from app import config
from app.db import engine_for


def get_conn() -> Iterator[Connection]:
    """One connection per request. Write endpoints commit before they return."""
    with engine_for(config.db_path()).connect() as conn:
        yield conn


def get_today(x_local_date: Annotated[str | None, Header()] = None) -> date:
    """G10: the browser's local date when it sends a valid one, the server's otherwise."""
    if x_local_date:
        try:
            return date.fromisoformat(x_local_date.strip())
        except ValueError:
            pass
    return config.server_today()


def now_on(today: date) -> datetime:
    """A timestamp on the user's today, at the current time of day."""
    return datetime.combine(today, datetime.now().time())


Conn = Annotated[Connection, Depends(get_conn)]
Today = Annotated[date, Depends(get_today)]
