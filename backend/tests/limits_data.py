"""Fills a database to the Q1 limits: 1,000 contacts, 500 deals, 5,000 activities, 500 products,
and 1,000 invoices with 3,000 lines and 1,500 payments.

Run on its own, it replaces everything in the ACCOUNTABLE_DB database, for the
end-to-end stress tests. It refuses to touch the real data folder.
"""

import os
import sys
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import Connection, insert

ORGANIZATIONS = 120
CONTACTS = 1000
DEALS = 500
ACTIVITIES = 5000
PRODUCTS = 500
INVOICES = 1000
LINES_EACH = 3
PAYMENTS = 1500
ISSUED_COLUMNS = (
    "number",
    "organization_id",
    "issue_date",
    "due_date",
    "company_name",
    "tax_label",
    "tax_rate",
    "subtotal_cents",
    "tax_cents",
    "total_cents",
    "issued_by",
)

# Won and Lost get long columns, the worst case for dragging.
STAGE_SHARE = (
    ["new"] * 60 + ["qualified"] * 60 + ["proposal"] * 50 + ["negotiation"] * 30 + ["won"] * 240 + ["lost"] * 60
)


def fill(conn: Connection, today: date) -> None:
    """Every record is put down to one of the made-up teammates, as in the sample data."""
    from accountable import sample, users, who
    from accountable.crm import rules
    from accountable.crm.tables import activities, contacts, organizations
    from accountable.products.tables import name_key, products

    now = sample.moment(today - timedelta(days=1), 3)
    users.add_missing_teammates(conn)

    organization_ids = conn.scalars(
        insert(organizations).returning(organizations.c.id, sort_by_parameter_order=True),
        [
            {
                "name": f"Organization {number:03d} and Partners Holdings",
                "website": f"https://org{number}.example",
                "industry": f"Industry {number % 12}",
                **who.added(users.teammate(number), now),
            }
            for number in range(ORGANIZATIONS)
        ],
    ).all()

    contact_ids = conn.scalars(
        insert(contacts).returning(contacts.c.id, sort_by_parameter_order=True),
        [
            {
                "name": f"Contact {number:04d}",
                "email": f"contact{number}@limits.example",
                "phone": f"555-{number:04d}",
                "job_title": f"Job title {number % 20}",
                "organization_id": organization_ids[number % ORGANIZATIONS],
                "status": ("lead", "qualified", "customer")[number % 3],
                **who.added(users.teammate(number), now),
            }
            for number in range(CONTACTS)
        ],
    ).all()

    deal_ids = []
    for number in range(DEALS):
        stage = STAGE_SHARE[number]
        steps = [*rules.OPEN_STAGES[: 1 + number % 4]]
        close = (
            today - timedelta(days=number % 330)
            if stage in rules.CLOSED_STAGES
            else today + timedelta(days=number % 90 - 10)
        )
        deal_id = rules.add_deal(
            conn,
            {
                "name": f"Deal {number:03d} for a long stretch of work",
                "organization_id": organization_ids[number % ORGANIZATIONS],
                "main_contact_id": contact_ids[number % CONTACTS],
                "stage": "new",
                "value": 5000 + number * 137 % 90000,
                "close_date": close,
            },
            today=today,
            now=now,
            user_id=users.teammate(number),
        )
        path = [
            step
            for step in steps[1:]
            if stage not in rules.OPEN_STAGES or rules.OPEN_STAGES.index(step) <= rules.OPEN_STAGES.index(stage)
        ]
        for step in [*path, stage]:
            rules.change_stage(
                conn,
                deal_id,
                step,
                today=close if step == stage else today,
                now=now,
                user_id=users.teammate(number + 1),
            )
        deal_ids.append(deal_id)

    rows = []
    for number in range(ACTIVITIES):
        on_deal = number % 2 == 0
        waiting = number % 25 == 0
        rows.append(
            {
                "type": ("note", "call", "email")[number % 3],
                "deal_id": deal_ids[number % DEALS] if on_deal else None,
                "contact_id": None if on_deal else contact_ids[number % CONTACTS],
                "description": f"Activity number {number}",
                "occurred_at": now - timedelta(minutes=number * 37),
                "follow_up_date": today + timedelta(days=number % 40 - 20) if waiting else None,
                "follow_up_done": False,
                **who.added(users.teammate(number), now),
            }
        )
    conn.execute(insert(activities), rows)

    product_ids = conn.scalars(
        insert(products).returning(products.c.id, sort_by_parameter_order=True),
        [
            {
                "name": f"Product {number:03d} for a long stretch of work",
                "name_key": name_key(f"Product {number:03d} for a long stretch of work"),
                "description": f"Description of product {number}, long enough to be cut short in the table",
                "unit_price_cents": 4950 + number * 13_757 % 9_000_000,
                "active": number % 10 != 0,
                **who.added(users.teammate(number), now),
            }
            for number in range(PRODUCTS)
        ],
    ).all()
    won = [deal_id for number, deal_id in enumerate(deal_ids) if STAGE_SHARE[number] == "won"]
    _fill_invoices(conn, today, now, won, organization_ids, product_ids)


def _fill_invoices(conn: Connection, today: date, now, won: list[int], organization_ids, product_ids) -> None:
    """Every status: a tenth drafts, a tenth void, and the rest issued over the last 11 months,
    so some are overdue in each group, with payments on most of them."""
    from accountable import users, who
    from accountable.company import tax
    from accountable.invoices.tables import invoice_lines, invoices, payments

    rows, lines = [], []
    for number in range(INVOICES):
        status = "draft" if number % 10 == 0 else "void" if number % 10 == 1 else "issued"
        issued_on = today - timedelta(days=number % 330)
        quantities = [
            (1 + (number + line) % 5, 4950 + (number * 37 + line * 1301) % 900_000) for line in range(LINES_EACH)
        ]
        totals = tax.totals([_Line(*pair) for pair in quantities], 8875)
        row = {
            "deal_id": won[number % len(won)],
            "status": status,
            "bill_to": f"Organization {number % 120:03d} and Partners Holdings\nAttn: Contact {number:04d}",
            **who.added(users.teammate(number), now),
        }
        # A many-row insert takes its columns from the first row, so a draft names them too, blank.
        row.update(dict.fromkeys(ISSUED_COLUMNS))
        if status != "draft":
            row.update(
                number=f"INV-{number:05d}",
                organization_id=organization_ids[number % len(organization_ids)],
                issue_date=issued_on,
                due_date=issued_on + timedelta(days=30),
                company_name="Limits Company",
                tax_label="Sales tax",
                tax_rate=8875,
                subtotal_cents=totals.subtotal_cents,
                tax_cents=totals.tax_cents,
                total_cents=totals.total_cents,
                issued_by=users.teammate(number),
            )
        rows.append(row)
        lines.append(quantities)
    invoice_ids = conn.scalars(insert(invoices).returning(invoices.c.id, sort_by_parameter_order=True), rows).all()
    conn.execute(
        insert(invoice_lines),
        [
            {
                "invoice_id": invoice_id,
                "position": place,
                "product_id": product_ids[(number + place) % len(product_ids)],
                "name": f"Product {(number + place) % len(product_ids):03d} for a long stretch of work",
                "description": "A line on an invoice, long enough to wrap onto a second line in the preview",
                "quantity": quantity,
                "unit_price_cents": price,
                "created_at": now,
            }
            for number, (invoice_id, quantities) in enumerate(zip(invoice_ids, lines, strict=True))
            for place, (quantity, price) in enumerate(quantities, start=1)
        ],
    )
    conn.execute(insert(payments), _payments(rows, invoice_ids, today, now))


def _payments(rows: list[dict], invoice_ids, today: date, now) -> list[dict]:
    """Three of each of the first 300 paid ones' and two of the next 300's: some paid in full, some part paid."""
    from accountable import users

    paying = [
        (number, invoice_id, row)
        for number, (invoice_id, row) in enumerate(zip(invoice_ids, rows, strict=True))
        if row["status"] == "issued" and number % 4 != 0
    ][:600]
    made = []
    for place, (number, invoice_id, row) in enumerate(paying):
        count = 3 if place < 300 else 2
        owed = row["total_cents"] if number % 4 != 1 else row["total_cents"] // 2
        for part in range(count):
            amount = owed // count + (owed % count if part == count - 1 else 0)
            made.append(
                {
                    "invoice_id": invoice_id,
                    "paid_on": min(
                        row["issue_date"] + timedelta(days=5 + part * 7), row["issue_date"] + timedelta(days=29)
                    ),
                    "amount_cents": amount,
                    "method": ("bank_transfer", "card", "check")[part],
                    "reference": f"Wire {number}" if part == 0 else None,
                    "created_at": now,
                    "created_by": users.teammate(number + part),
                }
            )
    return made


class _Line:
    def __init__(self, quantity: int, unit_price_cents: int):
        self.quantity, self.unit_price_cents = quantity, unit_price_cents


def main() -> int:
    from accountable import cli, db

    path = db.database_path()
    if "ACCOUNTABLE_DB" not in os.environ or path.is_relative_to((db.ROOT / "data").resolve()):
        print(f"Refusing to fill {path}.", file=sys.stderr)
        return 2
    db.prepare_database(lambda _conn: None)
    with db.writing() as conn:
        cli._wipe(conn)
        fill(conn, date.today())
    print(f"Filled {Path(path).name} to the limits.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
