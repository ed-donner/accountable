"""The double-entry books (J1 to J16): the journal's two tables, then the entries for every record
the database already has (J9), so the books are complete from the first day.

Entries are posted with no one recorded as making them. A void invoice gets its issue entry and a
reversal dated the same, drafts get none, a paid bill gets a paid entry, and the opening balance
gets its entry. It reads the records through table definitions of its own, so this migration
doesn't change when the app's tables do, and it takes a fixed number of queries however many
records there are. The database gives the ids, read back in order, so Postgres's sequences stay right.

On Postgres, the two new tables get row-level security with no policies, like every other.

Revision ID: 0012
Revises: 0011
"""

from datetime import UTC, date, datetime
from typing import Any

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

# Written out rather than imported, so this migration builds the same tables whatever the app later says.
ACCOUNTS = (
    "cash",
    "receivable",
    "payable",
    "tax_payable",
    "owners_equity",
    "revenue",
    "expense_software",
    "expense_contractors",
    "expense_travel",
    "expense_office",
    "expense_marketing",
    "expense_other",
)
NEW_TABLES = ["journal_entries", "journal_lines"]

_invoices = sa.table(
    "invoices",
    sa.column("id", sa.Integer),
    sa.column("status", sa.Text),
    sa.column("issue_date", sa.Date),
    sa.column("subtotal_cents", sa.BigInteger),
    sa.column("tax_cents", sa.BigInteger),
    sa.column("total_cents", sa.BigInteger),
)
_payments = sa.table(
    "payments",
    sa.column("id", sa.Integer),
    sa.column("invoice_id", sa.Integer),
    sa.column("paid_on", sa.Date),
    sa.column("amount_cents", sa.BigInteger),
)
_bills = sa.table(
    "bills",
    sa.column("id", sa.Integer),
    sa.column("bill_date", sa.Date),
    sa.column("amount_cents", sa.BigInteger),
    sa.column("tax_cents", sa.BigInteger),
    sa.column("category", sa.Text),
    sa.column("paid_on", sa.Date),
)
_settings = sa.table(
    "company_settings",
    sa.column("id", sa.Integer),
    sa.column("opening_balance_cents", sa.BigInteger),
    sa.column("opening_balance_on", sa.Date),
)
# Tables with a primary key, so the database's own ids can be read back in order after a bulk insert.
_written = sa.MetaData()
_entries = sa.Table(
    "journal_entries",
    _written,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("entry_date", sa.Date),
    sa.Column("kind", sa.Text),
    sa.Column("source_id", sa.Integer),
    sa.Column("event", sa.Text),
    sa.Column("link", sa.Text),
    sa.Column("reverses_id", sa.Integer),
    sa.Column("created_by", sa.Text),
    sa.Column("created_at", sa.DateTime),
)
_lines = sa.Table(
    "journal_lines",
    _written,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("entry_id", sa.Integer),
    sa.Column("account", sa.Text),
    sa.Column("debit_cents", sa.BigInteger),
    sa.Column("credit_cents", sa.BigInteger),
    sa.Column("created_at", sa.DateTime),
)

# An entry to write: its values, and its lines as (account, debit, credit).
Entry = tuple[dict[str, Any], list[tuple[str, int, int]]]


def upgrade() -> None:
    _create_entries()
    _create_lines()
    if op.get_context().dialect.name == "postgresql":
        for table in NEW_TABLES:
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    if not op.get_context().as_sql:
        _post_existing_records(op.get_bind())


def _create_entries() -> None:
    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("event", sa.Text(), nullable=False),
        sa.Column("link", sa.Text(), nullable=False),
        sa.Column("reverses_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["reverses_id"], ["journal_entries.id"], name=op.f("fk_journal_entries_reverses_id_journal_entries")
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_journal_entries_created_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_journal_entries")),
        sqlite_autoincrement=True,
    )
    op.create_index(op.f("ix_journal_entries_created_by"), "journal_entries", ["created_by"], unique=False)
    op.create_index("ix_journal_entries_entry_date", "journal_entries", ["entry_date"], unique=False)
    op.create_index("ix_journal_entries_source", "journal_entries", ["kind", "source_id"], unique=False)
    op.create_index("ix_journal_entries_reverses_id", "journal_entries", ["reverses_id"], unique=True)


def _create_lines() -> None:
    op.create_table(
        "journal_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entry_id", sa.Integer(), nullable=False),
        sa.Column("account", sa.Text(), nullable=False),
        sa.Column("debit_cents", sa.BigInteger(), nullable=False),
        sa.Column("credit_cents", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(sa.column("account").in_(ACCOUNTS), name=op.f("ck_journal_lines_account")),
        sa.CheckConstraint(
            sa.or_(
                sa.and_(sa.column("debit_cents") > 0, sa.column("credit_cents") == 0),
                sa.and_(sa.column("credit_cents") > 0, sa.column("debit_cents") == 0),
            ),
            name=op.f("ck_journal_lines_one_side"),
        ),
        sa.ForeignKeyConstraint(
            ["entry_id"], ["journal_entries.id"], name=op.f("fk_journal_lines_entry_id_journal_entries")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_journal_lines")),
        sqlite_autoincrement=True,
    )
    op.create_index("ix_journal_lines_entry_id", "journal_lines", ["entry_id"], unique=False)
    op.create_index("ix_journal_lines_account", "journal_lines", ["account"], unique=False)


def _entry(on: date, kind: str, source_id: int, event: str, link: str, lines: list[tuple[str, int, int]]) -> Entry:
    values = {"entry_date": on, "kind": kind, "source_id": source_id, "event": event, "link": link}
    return values, [line for line in lines if line[1] or line[2]]


def _invoice_entries(conn: sa.Connection) -> tuple[list[Entry], list[int]]:
    """The issue entries, and which of them are for a void invoice, which also get a reversal."""
    rows = conn.execute(
        sa.select(_invoices)
        .where(_invoices.c.status.in_(["issued", "void"]), _invoices.c.issue_date.is_not(None))
        .order_by(_invoices.c.id)
    ).all()
    entries = [
        _entry(
            row.issue_date,
            "invoice",
            row.id,
            "invoice_issued",
            f"/invoices/{row.id}",
            [
                ("receivable", row.total_cents, 0),
                ("revenue", 0, row.subtotal_cents),
                ("tax_payable", 0, row.tax_cents),
            ],
        )
        for row in rows
    ]
    return entries, [place for place, row in enumerate(rows) if row.status == "void"]


def _payment_entries(conn: sa.Connection) -> list[Entry]:
    rows = conn.execute(sa.select(_payments).order_by(_payments.c.id)).all()
    return [
        _entry(
            row.paid_on,
            "payment",
            row.id,
            "payment_recorded",
            f"/invoices/{row.invoice_id}",
            [("cash", row.amount_cents, 0), ("receivable", 0, row.amount_cents)],
        )
        for row in rows
    ]


def _bill_entries(conn: sa.Connection) -> list[Entry]:
    entries = []
    for row in conn.execute(sa.select(_bills).order_by(_bills.c.id)):
        total = row.amount_cents + row.tax_cents
        link = f"/bills/{row.id}"
        expense = f"expense_{row.category}"
        entries.append(
            _entry(row.bill_date, "bill", row.id, "bill_added", link, [(expense, total, 0), ("payable", 0, total)])
        )
        if row.paid_on is not None:
            lines = [("payable", total, 0), ("cash", 0, total)]
            entries.append(_entry(row.paid_on, "bill_payment", row.id, "bill_paid", link, lines))
    return entries


def _opening_balance_entries(conn: sa.Connection) -> list[Entry]:
    row = conn.execute(sa.select(_settings).where(_settings.c.id == 1)).one_or_none()
    if row is None or row.opening_balance_cents is None or row.opening_balance_on is None:
        return []
    amount = abs(row.opening_balance_cents)
    cash, equity = (("cash", amount, 0), ("owners_equity", 0, amount))
    if row.opening_balance_cents < 0:
        cash, equity = ("cash", 0, amount), ("owners_equity", amount, 0)
    return [_entry(row.opening_balance_on, "opening_balance", 1, "opening_balance_set", "/settings", [cash, equity])]


def _write(conn: sa.Connection, entries: list[Entry], reverses: list[int | None], now: datetime) -> None:
    """The entries and their lines in a fixed number of statements, with the ids the database gave read back.

    Each entry in this migration is the only one of its kind, source and event, which finds its id again.
    """
    rows = [
        {**values, "reverses_id": reverse, "created_by": None, "created_at": now}
        for (values, _), reverse in zip(entries, reverses, strict=True)
    ]
    conn.execute(sa.insert(_entries), rows)
    given = _ids(conn)
    line_rows = [
        {
            "entry_id": given[(values["kind"], values["source_id"], values["event"])],
            "account": account,
            "debit_cents": debit,
            "credit_cents": credit,
            "created_at": now,
        }
        for values, lines in entries
        for account, debit, credit in lines
    ]
    if line_rows:
        conn.execute(sa.insert(_lines), line_rows)


def _ids(conn: sa.Connection) -> dict[tuple[str, int, str], int]:
    rows = conn.execute(sa.select(_entries.c.id, _entries.c.kind, _entries.c.source_id, _entries.c.event))
    return {(row.kind, row.source_id, row.event): row.id for row in rows}


def _post_existing_records(conn: sa.Connection) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    invoices, void_places = _invoice_entries(conn)
    originals = [*invoices, *_payment_entries(conn), *_bill_entries(conn), *_opening_balance_entries(conn)]
    if not originals:
        return
    _write(conn, originals, [None] * len(originals), now)
    # A void invoice's reversal has the issue entry's lines with the sides swapped, dated the same.
    given = _ids(conn)
    reversals, reversed_ids = [], []
    for place in void_places:
        values, lines = originals[place]
        swapped = [(account, credit, debit) for account, debit, credit in lines]
        reversals.append(({**values, "event": "invoice_voided"}, swapped))
        reversed_ids.append(given[(values["kind"], values["source_id"], values["event"])])
    if reversals:
        _write(conn, reversals, reversed_ids, now)


def downgrade() -> None:
    op.drop_table("journal_lines")
    op.drop_table("journal_entries")
