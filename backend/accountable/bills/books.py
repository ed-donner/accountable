"""What a bill's save posts to the books, from the bill before and after it (E25, J6).

The area knows what changed, so it works that out here and `books/post.py` only writes.
"""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from sqlalchemy import Connection

from accountable.books import post

# What the bill's entry is made of. A change to any of them reverses it and posts it again.
_ENTRY_FIELDS = ("amount_cents", "tax_cents", "category", "bill_date")


def _total(bill: Mapping[str, Any]) -> int:
    return bill["amount_cents"] + bill["tax_cents"]


def added(conn: Connection, bill_id: int, bill: Mapping[str, Any], user: str, now: datetime) -> None:
    """A new bill posts its entry, and its paid entry too if it was added paid (E25)."""
    post.bill_added(
        conn,
        bill_id=bill_id,
        on=bill["bill_date"],
        total_cents=_total(bill),
        category=bill["category"],
        user=user,
        now=now,
    )
    _post_paid(conn, bill_id, bill, user, now, "bill_paid")


def _post_paid(conn: Connection, bill_id: int, bill: Mapping[str, Any], user: str, now: datetime, event: str) -> None:
    if bill["paid_on"] is not None:
        post.bill_paid(
            conn, bill_id=bill_id, on=bill["paid_on"], total_cents=_total(bill), user=user, now=now, event=event
        )


def changed(
    conn: Connection, bill_id: int, before: Mapping[str, Any], after: Mapping[str, Any], user: str, now: datetime
) -> None:
    """Reverses and posts again what the change touched, and posts nothing for one that moves no money."""
    entry_changed = any(before[field] != after[field] for field in _ENTRY_FIELDS)
    paid_changed = (before["paid_on"], _total(before)) != (after["paid_on"], _total(after))
    if not entry_changed and not paid_changed:
        return
    if entry_changed:
        post.reverse(conn, source=post.bill_source(bill_id), event="bill_changed", user=user, now=now)
    if paid_changed:
        # Marking unpaid reverses the paid entry, and marking paid again posts a new one (E10).
        post.reverse(
            conn,
            source=post.bill_payment_source(bill_id),
            event="bill_unpaid" if after["paid_on"] is None else "bill_changed",
            user=user,
            now=now,
        )
    if entry_changed:
        post.bill_added(
            conn,
            bill_id=bill_id,
            on=after["bill_date"],
            total_cents=_total(after),
            category=after["category"],
            user=user,
            now=now,
            event="bill_changed",
        )
    if paid_changed:
        _post_paid(conn, bill_id, after, user, now, "bill_paid" if before["paid_on"] is None else "bill_changed")


def deleted(conn: Connection, bill_id: int, user: str, now: datetime) -> None:
    """Reverses the bill's entry, and its paid entry if it's paid."""
    post.reverse(conn, source=post.bill_source(bill_id), event="bill_deleted", user=user, now=now)
    post.reverse(conn, source=post.bill_payment_source(bill_id), event="bill_deleted", user=user, now=now)
