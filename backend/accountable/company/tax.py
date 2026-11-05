"""The sums on a quote or an invoice, in whole cents (B16, B17): each line's amount, the
subtotal, the tax worked out once on the subtotal, and the total.

The frontend's company/tax.ts does the same sums, for what a page shows before it saves,
and both run the cases in shared/totals-cases.json. The backend's sums are the ones saved,
worked out from the lines, never taken from totals the browser sends.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Annotated, Protocol

from pydantic import Field, StrictInt

from accountable import api
from accountable.company.schemas import MAX_RATE, PER_PERCENT

MAX_QUANTITY = 1_000_000
QUANTITY_MESSAGE = "Enter a whole number from 1 to 1,000,000"

# A deal is worth at most $1 trillion, and an accepted quote's subtotal becomes its deal's
# value. Kept to that, every amount, with tax at 100%, stays a whole number of cents that
# the browser holds exactly, which it can up to about $90 trillion.
MAX_SUBTOTAL_CENTS = api.MAX_CENTS
SUBTOTAL_MESSAGE = "Keep the subtotal to $1 trillion or less"

# Strict, so 1.5, "2" and true are refused rather than rounded or read as numbers (B17).
Quantity = Annotated[StrictInt, Field(ge=1, le=MAX_QUANTITY)]

_ALL = MAX_RATE * PER_PERCENT
"""A rate of 100%, in thousandths of a percent."""


class Line(Protocol):
    """A line as any area keeps it, such as a row of its table: only read here."""

    @property
    def quantity(self) -> int: ...

    @property
    def unit_price_cents(self) -> int: ...


@dataclass(frozen=True)
class Totals:
    subtotal_cents: int
    tax_cents: int
    total_cents: int


def line_amount(quantity: int, unit_price_cents: int) -> int:
    return quantity * unit_price_cents


def tax_on(subtotal_cents: int, rate: int) -> int:
    """The tax at a rate in thousandths of a percent, to the nearest cent, with halves rounding up.

    Whole-number arithmetic only, as expected revenue's: Python's round() sends a half cent
    to the even one, so 2.5 cents would be 2 here and 3 in the browser.
    """
    return (subtotal_cents * rate + _ALL // 2) // _ALL


def totals(lines: Iterable[Line], rate: int) -> Totals:
    """Tax once, on the subtotal, never line by line, where each line's rounding would add up."""
    subtotal = sum(line_amount(line.quantity, line.unit_price_cents) for line in lines)
    tax = tax_on(subtotal, rate)
    return Totals(subtotal_cents=subtotal, tax_cents=tax, total_cents=subtotal + tax)
