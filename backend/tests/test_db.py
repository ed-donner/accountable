"""TB09: foreign keys and the one-parent rule."""

from datetime import date

import pytest
from sqlalchemy import insert, text
from sqlalchemy.exc import IntegrityError

from app.db import activities, contacts, deals, organizations


def test_foreign_keys_on_for_every_connection(engine):
    for _ in range(3):
        with engine.connect() as conn:
            assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_foreign_key_enforced(conn):
    with pytest.raises(IntegrityError):
        conn.execute(insert(contacts).values(name="Ghost", status="lead", organization_id=999))


def _parents(conn):
    org_id = conn.execute(insert(organizations).values(name="Org")).inserted_primary_key[0]
    contact_id = conn.execute(
        insert(contacts).values(name="C", status="lead")
    ).inserted_primary_key[0]
    deal_id = conn.execute(
        insert(deals).values(name="D", organization_id=org_id, stage="new", value=1, probability=10)
    ).inserted_primary_key[0]
    return contact_id, deal_id


@pytest.mark.parametrize("which", ["both", "neither"])
def test_activity_needs_exactly_one_parent(conn, which):
    contact_id, deal_id = _parents(conn)
    values = {"type": "call", "description": "x", "occurred_on": date(2026, 11, 1)}
    if which == "both":
        values |= {"contact_id": contact_id, "deal_id": deal_id}
    with pytest.raises(IntegrityError):
        conn.execute(insert(activities).values(**values))


def test_activity_with_one_parent_is_fine(conn):
    contact_id, deal_id = _parents(conn)
    base = {"type": "call", "description": "x", "occurred_on": date(2026, 11, 1)}
    conn.execute(insert(activities).values(**base, contact_id=contact_id))
    conn.execute(insert(activities).values(**base, deal_id=deal_id))
