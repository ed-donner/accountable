"""Fills a database to the Q1 limits: 1,000 contacts, 500 deals, 5,000 activities and 500 products.

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

    conn.execute(
        insert(products),
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
