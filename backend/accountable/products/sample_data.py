"""The sample price list, dated from a given day, priced to fit the sample deals (M3)."""

from datetime import date, timedelta
from typing import Any

from sqlalchemy import Connection, insert

from accountable import who
from accountable.products.tables import name_key, products
from accountable.sample import moment, put_down_to
from accountable.users import add_missing_teammates, teammate

# name, unit price in cents, description, whether it's archived. One description has
# two lines, so the product's page shows its line breaks, and one is blank.
PRODUCTS = [
    ("Standard license, per user per year", 48000, "One named user, with every module and updates.", False),
    ("Group-wide license, per site per year", 960000, "Unlimited users at one site.", False),
    ("Extra user seat, per month", 4950, "For seasonal staff, billed monthly on top of a license.", False),
    ("Annual support plan", 360000, "Email and phone support on weekdays, 9 to 5.", False),
    (
        "Premium support plan",
        780000,
        "Phone support around the clock, with a four-hour response.\nA named account manager and a yearly review.",
        False,
    ),
    ("Training day, on site", 125000, "Up to 12 people, at the customer's site. Travel is extra.", False),
    ("Training day, remote", 85000, "Up to 12 people, over video, in two half days.", False),
    ("Data migration, per system", 450000, "Moving the records from one old system, checked line by line.", False),
    ("Setup and configuration", 240000, None, False),
    ("Front desk kiosk", 114999, "A touch screen kiosk for check-ins, with a stand.", False),
    ("Label printer", 28995, "Thermal printer for shelf and parcel labels.", True),
    ("Phone system starter pack", 199000, "Six desk phones and a year of calls.", True),
]

ADDED_DAYS_AGO = 300
"""The first product's age. Each after it was added 20 days later, so the last is 80 days old."""


def _put_down_to(number: int, archived: bool, today: date) -> dict[str, Any]:
    """Added by the teammates in turn, every third one changed by the next one since.
    Archiving is a change, so an archived one was always last changed by another teammate."""
    added_at = moment(today - timedelta(days=ADDED_DAYS_AGO - number * 20), number)
    authorship = put_down_to(number, added_at, today, every=3)
    if archived:
        archived_at = moment(today - timedelta(days=10 + number), number + 1)
        authorship.update(who.changed(teammate(number + 1), archived_at))
    return authorship


def fill(conn: Connection, today: date) -> None:
    add_missing_teammates(conn)
    conn.execute(
        insert(products),
        [
            {
                "name": name,
                "name_key": name_key(name),
                "description": description,
                "unit_price_cents": cents,
                "active": not archived,
                **_put_down_to(number, archived, today),
            }
            for number, (name, cents, description, archived) in enumerate(PRODUCTS)
        ],
    )
