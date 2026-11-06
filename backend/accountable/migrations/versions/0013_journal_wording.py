"""The journal's wording (J4, J9): each entry's description and document number.

Both columns are added, filled in for the entries already there from the record each came from,
with the description required. The fill is one UPDATE for each kind of entry and one
for the descriptions, so it takes a fixed number of queries however many entries there are. An
entry whose record has gone gets its event's wording and no document number. The wording is
written out here, as the tables are, so this migration doesn't change when the app does.

Also adds the index the ledger's one pass over an account's lines uses.

Revision ID: 0013
Revises: 0012
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

# (the words before the document number, the words after) for each event, and the words with no number.
WITH_DOCUMENT = {
    "invoice_issued": ("Invoice ", " issued"),
    "payment_recorded": ("Payment received on ", ""),
    "bill_added": ("Bill ", ""),
    "bill_paid": ("Bill ", " paid"),
    "invoice_voided": ("Invoice ", " voided"),
    "payment_deleted": ("Payment deleted from ", ""),
    "bill_changed": ("Bill ", " changed"),
    "bill_unpaid": ("Bill ", " marked unpaid"),
    "bill_deleted": ("Bill ", " deleted"),
}
WITHOUT_DOCUMENT = {
    "invoice_issued": "Invoice issued",
    "payment_recorded": "Payment received",
    "bill_added": "Bill added",
    "bill_paid": "Bill paid",
    "invoice_voided": "Invoice voided",
    "payment_deleted": "Payment deleted",
    "bill_changed": "Bill changed",
    "bill_unpaid": "Bill marked unpaid",
    "bill_deleted": "Bill deleted",
    "opening_balance_set": "Opening balance set",
    "opening_balance_changed": "Opening balance changed",
    "opening_balance_cleared": "Opening balance cleared",
}

_entries = sa.table(
    "journal_entries",
    sa.column("id", sa.Integer),
    sa.column("kind", sa.Text),
    sa.column("source_id", sa.Integer),
    sa.column("event", sa.Text),
    sa.column("description", sa.Text),
    sa.column("document", sa.Text),
)
_invoices = sa.table("invoices", sa.column("id", sa.Integer), sa.column("number", sa.Text))
_payments = sa.table("payments", sa.column("id", sa.Integer), sa.column("invoice_id", sa.Integer))
_bills = sa.table(
    "bills", sa.column("id", sa.Integer), sa.column("bill_number", sa.Text), sa.column("organization_id", sa.Integer)
)
_organizations = sa.table("organizations", sa.column("id", sa.Integer), sa.column("name", sa.Text))


def _documents() -> list[sa.Update]:
    """One UPDATE for each kind of entry."""
    invoice = sa.select(_invoices.c.number).where(_invoices.c.id == _entries.c.source_id).scalar_subquery()
    payment = (
        sa.select(_invoices.c.number)
        .select_from(_payments.join(_invoices, _invoices.c.id == _payments.c.invoice_id))
        .where(_payments.c.id == _entries.c.source_id)
        .scalar_subquery()
    )
    bill = sa.select(_bills.c.bill_number).where(_bills.c.id == _entries.c.source_id).scalar_subquery()
    return [
        sa.update(_entries).where(_entries.c.kind == "invoice").values(document=invoice),
        sa.update(_entries).where(_entries.c.kind == "payment").values(document=payment),
        sa.update(_entries).where(_entries.c.kind.in_(["bill", "bill_payment"])).values(document=bill),
        sa.update(_entries).where(_entries.c.kind == "opening_balance").values(document=None),
    ]


def _description() -> sa.ColumnElement:
    # One join, so the subquery has a single correlation to the entry being filled in.
    supplier = (
        sa.select(_organizations.c.name)
        .select_from(_bills.join(_organizations, _organizations.c.id == _bills.c.organization_id))
        .where(_bills.c.id == _entries.c.source_id)
        .scalar_subquery()
    )
    cases = []
    for event, (before, after) in WITH_DOCUMENT.items():
        words = sa.literal(before) + _entries.c.document + sa.literal(after)
        if event == "bill_added":
            words = sa.case(
                (supplier.is_not(None), sa.literal("Bill ") + _entries.c.document + sa.literal(" from ") + supplier),
                else_=words,
            )
        cases.append((sa.and_(_entries.c.event == event, _entries.c.document.is_not(None)), words))
    for event, words in WITHOUT_DOCUMENT.items():
        cases.append((_entries.c.event == event, sa.literal(words)))
    return sa.case(*cases, else_=sa.literal("Entry"))


def fill(conn: sa.Connection) -> None:
    """Fills in the description and document of every entry, in a fixed number of queries."""
    for statement in _documents():
        conn.execute(statement)
    conn.execute(sa.update(_entries).values(description=_description()))


def upgrade() -> None:
    # Required, with an empty default that only a row written around the app ever takes: posting
    # always writes the sentence, and test_books_checks.py, which may not be edited, writes bare rows.
    with op.batch_alter_table("journal_entries", table_kwargs={"sqlite_autoincrement": True}) as batch_op:
        batch_op.add_column(sa.Column("description", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("document", sa.Text(), nullable=True))
    if not op.get_context().as_sql:
        fill(op.get_bind())
    op.create_index("ix_journal_lines_account_entry", "journal_lines", ["account", "entry_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_journal_lines_account_entry", table_name="journal_lines")
    with op.batch_alter_table("journal_entries", table_kwargs={"sqlite_autoincrement": True}) as batch_op:
        batch_op.drop_column("document")
        batch_op.drop_column("description")
