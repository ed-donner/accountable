"""The people who sign in: who they are and what they're called (U8, U9).

Rows come from tokens, and are never deleted, so a removed person's records still
show their name.
"""

from pydantic import BaseModel
from sqlalchemy import Column, Connection, DateTime, Table, Text, insert, select, update

from accountable import db

users = Table(
    "users",
    db.metadata,
    Column("id", Text, primary_key=True),  # Supabase's id, or a made-up teammate's
    Column("name", Text),
    Column("email", Text, nullable=False),
    Column("created_at", DateTime, nullable=False, default=db.utc_now),
    Column("updated_at", DateTime, nullable=False, default=db.utc_now, onupdate=db.utc_now),
)


class Person(BaseModel):
    """Who added or changed something, as replies carry it."""

    id: str
    name: str


class Profile(BaseModel):
    id: str
    name: str
    email: str
    initials: str


def name_of(name: str | None, email: str) -> str:
    """The display name, or the email for someone with none."""
    return (name or "").strip() or email


def initials(name: str | None, email: str) -> str:
    """AR for Alex Rivera, one letter for a one-word name, the email's first letter without a name."""
    words = (name or "").split()
    if not words:
        return email[:1].upper()
    if len(words) == 1:
        return words[0][0].upper()
    return (words[0][0] + words[-1][0]).upper()


def person(id: str | None, name: str | None, email: str | None) -> Person | None:
    """A reply's person, or None for a record from before sign-in (U12)."""
    if id is None or email is None:
        return None
    return Person(id=id, name=name_of(name, email))


def profile(id: str, name: str | None, email: str) -> Profile:
    return Profile(id=id, name=name_of(name, email), email=email, initials=initials(name, email))


def remember(conn: Connection, id: str, name: str | None, email: str) -> bool:
    """Adds the person, or updates their name and email if either changed. Returns whether it wrote.

    Call it inside db.writing(), so two first requests can't both add the same person.
    """
    name = (name or "").strip() or None
    known = conn.execute(select(users.c.name, users.c.email).where(users.c.id == id)).one_or_none()
    if known is None:
        conn.execute(insert(users).values(id=id, name=name, email=email))
        return True
    if (known.name, known.email) == (name, email):
        return False
    conn.execute(update(users).where(users.c.id == id).values(name=name, email=email))
    return True
