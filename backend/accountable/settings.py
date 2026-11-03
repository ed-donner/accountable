"""Which copy is running, read from the backend's own environment and never from .env (C8).

None of the three settings is the local copy. All three is the shared app. Some but
not all is a mistake, so the backend stops and names the ones missing.
"""

import os
from dataclasses import dataclass

from sqlalchemy import URL, make_url
from sqlalchemy.exc import ArgumentError

NAMES = ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY")

# Supabase and most hosts give a plain postgresql:// address. SQLAlchemy would pick
# psycopg2 for that, which isn't installed.
POSTGRES_SCHEMES = {"postgres", "postgresql", "postgresql+psycopg"}


class SettingsError(RuntimeError):
    pass


@dataclass(frozen=True)
class Shared:
    """The shared app's settings. The URL hides its password when printed."""

    database_url: URL
    supabase_url: str
    supabase_publishable_key: str


def load() -> Shared | None:
    """The shared app's settings, or None for the local copy."""
    values = {name: os.environ.get(name, "").strip() for name in NAMES}
    missing = [name for name, value in values.items() if not value]
    if len(missing) == len(NAMES):
        return None
    if missing:
        raise SettingsError(
            "Set all three of DATABASE_URL, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for the shared app, "
            f"or none of them for the local copy. Missing: {_and(missing)}."
        )
    return Shared(
        database_url=_postgres_url(values["DATABASE_URL"]),
        supabase_url=values["SUPABASE_URL"].rstrip("/"),
        supabase_publishable_key=values["SUPABASE_PUBLISHABLE_KEY"],
    )


def _postgres_url(value: str) -> URL:
    # The messages never repeat the address, because it holds the database password.
    try:
        url = make_url(value)
    except ArgumentError:
        raise SettingsError("DATABASE_URL isn't a database address.") from None
    if url.drivername not in POSTGRES_SCHEMES:
        raise SettingsError("DATABASE_URL must be a Postgres address, starting postgresql://.")
    return url.set(drivername="postgresql+psycopg")


def _and(names: list[str]) -> str:
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"
