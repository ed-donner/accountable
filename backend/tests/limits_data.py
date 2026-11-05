"""Fills a database to the Q1 limits: 1,000 contacts, 500 deals, 5,000 activities, 500 products, and
1,000 quotes with 5,000 lines between them, the last a draft with 100 lines for the speed tests.

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

# Won and Lost get long columns, the worst case for dragging.
STAGE_SHARE = (
    ["new"] * 60 + ["qualified"] * 60 + ["proposal"] * 50 + ["negotiation"] * 30 + ["won"] * 240 + ["lost"] * 60
)


def fill(conn: Connection, today: date) -> None:
    """Every record is put down to one of the made-up teammates, as in the sample data."""
    from accountable import sample

    now = sample.moment(today - timedelta(days=1), 3)
    deal_ids, product_ids = _crm_and_products(conn, today, now)
    _quotes(conn, today, now, deal_ids, product_ids)


def _crm_and_products(conn: Connection, today: date, now: datetime) -> tuple[Sequence[int], Sequence[int]]:
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
    return deal_ids, product_ids


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
