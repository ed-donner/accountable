"""The sums on a quote or an invoice (B16, B17), from company/tax.py, with the cases the frontend runs too."""

import json
from dataclasses import dataclass
from decimal import Decimal

import pytest
from accountable import db
from accountable.company import tax
from pydantic import BaseModel, ValidationError

CASES = json.loads((db.ROOT / "shared" / "totals-cases.json").read_text())


@dataclass(frozen=True)
class Line:
    quantity: int
    unit_price_cents: int


def thousandths(rate: str) -> int:
    """8.875 is 8875, as the settings keep it (B7)."""
    return int(Decimal(rate) * 1000)


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["why"])
def test_shared_cases(case):
    lines = [Line(quantity, price) for quantity, price in case["lines"]]
    assert tax.totals(lines, thousandths(case["rate"])) == tax.Totals(case["subtotal"], case["tax"], case["total"])


def test_a_lines_amount_is_its_quantity_times_its_unit_price():
    assert tax.line_amount(3, 4950) == 14850


def test_the_most_any_amount_can_be_stays_a_number_the_browser_holds_exactly():
    most = tax.totals([Line(1, tax.MAX_SUBTOTAL_CENTS)], thousandths("100"))
    assert most.total_cents <= 2**53 - 1


class Sent(BaseModel):
    quantity: tax.Quantity


@pytest.mark.parametrize("quantity", [1, 7, tax.MAX_QUANTITY])
def test_a_quantity_is_a_whole_number_from_1_to_a_million(quantity):
    assert Sent.model_validate({"quantity": quantity}).quantity == quantity


@pytest.mark.parametrize("quantity", [0, -1, tax.MAX_QUANTITY + 1, 1.5, 2.0, "2", True, None])
def test_anything_else_is_refused_as_a_quantity(quantity):
    with pytest.raises(ValidationError):
        Sent.model_validate({"quantity": quantity})
