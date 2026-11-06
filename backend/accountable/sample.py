"""What every area's sample data shares: the time a sample record was put down at, which
made-up teammate added it and last changed it (U13, U14), and the lines of the sample quotes
and invoices, so a won deal's accepted quote and its invoice carry the same ones (M3)."""

from collections.abc import Mapping
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import Row

from accountable import who
from accountable.users import teammate


def moment(day: date, number: int) -> datetime:
    """A working-hours time on a local day, in UTC with no zone, varied by number.

    The hour repeats every 8 numbers. The activity types repeat every 3, so a repeat
    of 3 or 9 here would put every note at the same time of day.
    """
    local = datetime.combine(day, time(9 + number * 5 % 8, number * 17 % 60))
    return local.astimezone(UTC).replace(tzinfo=None)


def put_down_to(number: int, added_at: datetime, today: date, every: int) -> dict[str, Any]:
    """Added by one teammate, and for one record in every few, last changed by the next one since."""
    if number % every != 1:
        return who.added(teammate(number), added_at)
    changed_on = today - timedelta(days=3 + number * 7 % 90)
    return {**who.added(teammate(number), added_at), **who.changed(teammate(number + 1), moment(changed_on, number))}


@dataclass(frozen=True)
class Line:
    """A line of a sample quote or invoice, with the columns both areas' line tables have."""

    product_id: int
    name: str
    description: str | None
    quantity: int
    unit_price_cents: int


PriceList = Mapping[str, Row]
"""The active products, by name."""

# Each bundle's lines: the first line's quantity grows to bring the lines near a value, and the
# rest are as given. The last has a quantity of 1, so a won deal's last price can be set by hand
# to make its lines worth the deal's value to the cent.
BUNDLES = [
    [
        ("Standard license, per user per year", 0),
        ("Training day, remote", 2),
        ("Setup and configuration", 1),
        ("Annual support plan", 1),
    ],
    [("Extra user seat, per month", 0), ("Data migration, per system", 1), ("Training day, on site", 1)],
    [("Standard license, per user per year", 0), ("Premium support plan", 1), ("Training day, on site", 1)],
    [("Front desk kiosk", 0), ("Setup and configuration", 1), ("Training day, remote", 1)],
    [("Group-wide license, per site per year", 0), ("Training day, on site", 2), ("Annual support plan", 1)],
]


def lines_toward(price_list: PriceList, number: int, target_cents: int) -> list[Line]:
    """The number's bundle, its first quantity grown to bring the subtotal up to the target without
    passing it. A bundle whose first and last lines alone pass the target gives way to the next."""
    for turn in range(len(BUNDLES)):
        bundle = [(price_list[name], quantity) for name, quantity in BUNDLES[(number + turn) % len(BUNDLES)]]
        (first, _), *rest = bundle
        while len(rest) > 1 and first.unit_price_cents + sum(p.unit_price_cents * q for p, q in rest) > target_cents:
            rest.remove(max(rest[:-1], key=lambda line: line[0].unit_price_cents * line[1]))
        fixed = sum(product.unit_price_cents * quantity for product, quantity in rest)
        if first.unit_price_cents + fixed <= target_cents:
            grown = (target_cents - fixed) // first.unit_price_cents
            return [_line(product, quantity) for product, quantity in [(first, grown), *rest]]
    raise ValueError(f"No bundle fits {target_cents} cents")


def _line(product: Row, quantity: int) -> Line:
    return Line(product.id, product.name, product.description, quantity, product.unit_price_cents)


def sold_lines(price_list: PriceList, value: int) -> list[Line]:
    """The lines a won deal was sold with, worth its value in whole dollars to the cent: its accepted
    quote's, and its invoice's.

    Quotes and invoices never read each other, so the lines follow from the value alone, its
    thousands picking the bundle, and both areas give a deal the same ones. The last line's
    price is set by hand to make up the value.
    """
    cents = value * 100
    *rest, last = lines_toward(price_list, value // 1000, cents)
    short = cents - sum(line.quantity * line.unit_price_cents for line in [*rest, last])
    return [*rest, replace(last, unit_price_cents=last.unit_price_cents + short)]
