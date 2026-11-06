"""Fills a database to the Q1 limits: 1,000 contacts, 500 deals, 5,000 activities, 500 products,
1,000 quotes with 5,000 lines between them, the last a draft with 100 lines for the speed tests,
1,000 invoices with 3,000 lines and 1,500 payments, and 1,000 bills, with an opening balance
from before the oldest payment, so the cash flow folds every day of them.

Run on its own, it replaces everything in the ACCOUNTABLE_DB database, for the
end-to-end stress tests. It refuses to touch the real data folder.
"""

import os
import sys
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import Connection, insert, select, update

ORGANIZATIONS = 120
CONTACTS = 1000
DEALS = 500
ACTIVITIES = 5000
PRODUCTS = 500
QUOTES = 1000
LINES = 5000
LONGEST_QUOTE = 100
"""The last quote's lines, the most a quote can have. The other quotes share the rest."""
INVOICES = 1000
LINES_EACH = 3
PAYMENTS = 1500
ISSUED_COLUMNS = (
    "number",
    "issue_order",
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
BILLS = 1000
CATEGORIES = ("software", "contractors", "travel", "office", "marketing", "other")

# Won and Lost get long columns, the worst case for dragging.
STAGE_SHARE = (
    ["new"] * 60 + ["qualified"] * 60 + ["proposal"] * 50 + ["negotiation"] * 30 + ["won"] * 240 + ["lost"] * 60
)


def fill(conn: Connection, today: date) -> None:
    """Every record is put down to one of the made-up teammates, as in the sample data."""
    from accountable import sample

    now = sample.moment(today - timedelta(days=1), 3)
    organization_ids, deal_ids, product_ids = _crm_and_products(conn, today, now)
    _quotes(conn, today, now, deal_ids, product_ids)
    _invoices(conn, today, now, organization_ids, deal_ids, product_ids)
    _bills(conn, today, now, organization_ids)
    _opening_balance(conn, today)


def _crm_and_products(
    conn: Connection, today: date, now: datetime
) -> tuple[Sequence[int], Sequence[int], Sequence[int]]:
    """The organizations', deals' and products' ids, in the order they were added."""
    from accountable import users, who
    from accountable.crm import rules
    from accountable.crm.tables import activities, contacts, organizations
    from accountable.products.tables import name_key, products

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
    return organization_ids, deal_ids, product_ids


def _quotes(conn: Connection, today: date, now: datetime, deal_ids: Sequence[int], product_ids: Sequence[int]) -> None:
    """Two quotes on each deal, all four statuses among them with no deal accepting two, and a
    company name, so the 100-line draft's PDF can be made."""
    from accountable import users, who
    from accountable.company.tables import company_settings, number_counters
    from accountable.crm.tables import deals
    from accountable.quotes.tables import quote_lines, quotes

    conn.execute(update(company_settings).values(company_name="Limits Company", tax_rate=8875))
    stages = {row.id: row.stage for row in conn.execute(select(deals.c.id, deals.c.stage))}
    # The other quotes share the lines the longest leaves, four or five each.
    each, extra = divmod(LINES - LONGEST_QUOTE, QUOTES - 1)
    counts = [each + 1 if number < extra else each for number in range(QUOTES - 1)] + [LONGEST_QUOTE]
    rows = []
    for number in range(QUOTES):
        deal_id = deal_ids[number % len(deal_ids)]
        first_on_its_deal = number < len(deal_ids)
        status = ("draft", "sent", "declined")[number % 3]
        if stages[deal_id] == "won" and first_on_its_deal:
            status = "accepted"
        if number == QUOTES - 1:
            status = "draft"
        # Every row has every column, because a bulk insert takes its columns from the first.
        fixed = {"company_name": "Limits Company", "tax_label": "Sales tax", "tax_rate": 8875}
        if status == "draft":
            fixed = dict.fromkeys(fixed)
        rows.append(
            {
                "number": f"QT-{number + 1:04d}",
                "deal_id": deal_id,
                "status": status,
                "quote_date": today - timedelta(days=number % 60),
                "valid_until": today - timedelta(days=number % 60) + timedelta(days=30),
                "subtotal_cents": sum(4950 * (line + 1) for line in range(counts[number])),
                **fixed,
                **who.added(users.teammate(number), now),
            }
        )
    quote_ids = conn.scalars(insert(quotes).returning(quotes.c.id, sort_by_parameter_order=True), rows).all()
    conn.execute(insert(number_counters).values(kind="quote", last_number=QUOTES))
    conn.execute(
        insert(quote_lines),
        [
            {
                "quote_id": quote_id,
                "position": line + 1,
                "product_id": product_ids[(number + line) % len(product_ids)],
                "name": f"Product {(number + line) % len(product_ids):03d} for a long stretch of work",
                "description": f"Line {line + 1} of quote {number + 1}, with a description long enough to wrap",
                "quantity": line + 1,
                "unit_price_cents": 4950,
                "created_at": now,
                "updated_at": now,
            }
            for number, (quote_id, count) in enumerate(zip(quote_ids, counts, strict=True))
            for line in range(count)
        ],
    )


def _invoices(
    conn: Connection,
    today: date,
    now: datetime,
    organization_ids: Sequence[int],
    deal_ids: Sequence[int],
    product_ids: Sequence[int],
) -> None:
    """Every status: a tenth drafts, a tenth void, and the rest issued over the last 11 months,
    so some are overdue in each group, with payments on most of them."""
    from accountable import users, who
    from accountable.company import tax
    from accountable.invoices.tables import invoice_lines, invoices, payments

    won = [deal_id for number, deal_id in enumerate(deal_ids) if STAGE_SHARE[number] == "won"]
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
                issue_order=number,
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


def _bills(conn: Connection, today: date, now: datetime, organization_ids: Sequence[int]) -> None:
    """Dated over the last year, due 30 days on. Those due before today are paid, but for one in 10."""
    from accountable import users, who
    from accountable.bills.tables import bill_number_key, bills

    bill_rows = []
    for number in range(BILLS):
        bill_date = today - timedelta(days=number * 7 % 360)
        due_date = bill_date + timedelta(days=30)
        paid = due_date < today and number % 10 != 0
        bill_number = f"LIM-{number:05d} for a long stretch of work"
        bill_rows.append(
            {
                "organization_id": organization_ids[number % ORGANIZATIONS],
                "bill_number": bill_number,
                "bill_number_key": bill_number_key(bill_number),
                "bill_date": bill_date,
                "due_date": due_date,
                "amount_cents": 3800 + number * 13_757 % 900_000,
                "tax_cents": number * 311 % 8000,
                "category": CATEGORIES[number % len(CATEGORIES)],
                "notes": f"Notes on bill {number}" if number % 3 == 0 else None,
                "paid_on": due_date - timedelta(days=2) if paid else None,
                **who.added(users.teammate(number), now),
            }
        )
    conn.execute(insert(bills), bill_rows)


def _opening_balance(conn: Connection, today: date) -> None:
    """400 days back, before the oldest payment and paid bill, which are under a year old."""
    from accountable.company.tables import company_settings

    conn.execute(
        update(company_settings).values(
            opening_balance_cents=25_000_000, opening_balance_on=today - timedelta(days=400)
        )
    )


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
