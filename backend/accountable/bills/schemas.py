"""The bills' request and reply models, the six categories, and the messages for their fields."""

from datetime import date
from typing import Annotated, Literal

from pydantic import MISSING, AfterValidator, BaseModel

from accountable import api
from accountable.who import Authorship

Category = Literal["software", "contractors", "travel", "office", "marketing", "other"]

SUPPLIER_MESSAGE = "Choose a supplier"
BILL_NUMBER_MESSAGE = "Enter the bill number"
MAX_BILL_NUMBER_LENGTH = 50
BILL_NUMBER_TOO_LONG = f"Keep the bill number to {MAX_BILL_NUMBER_LENGTH} characters or fewer"
NUMBER_TAKEN = "This supplier already has a bill with this number"
DUE_BEFORE_BILL = "The due date can't be before the bill date"
PAID_IN_FUTURE = "The paid date can't be in the future"
PAID_BEFORE_BILL = "The paid date can't be before the bill date"

# Notes and the paid date are optional, so a bad one gets the default "Check this field".
FIELD_MESSAGES = {
    "organization_id": SUPPLIER_MESSAGE,
    "bill_number": BILL_NUMBER_MESSAGE,
    "bill_date": "Choose a bill date",
    "due_date": "Choose a due date",
    "amount_cents": "Enter an amount in dollars and cents, such as 49.50",
    "tax_cents": "Enter an amount in dollars and cents, such as 49.50",
    "category": "Choose a category",
}


def _bill_number(value: str) -> str:
    """Kept as typed, with the spaces at its ends dropped first, so they don't count (E3)."""
    value = value.strip()
    if not value:
        raise ValueError(BILL_NUMBER_MESSAGE)
    if len(value) > MAX_BILL_NUMBER_LENGTH:
        raise ValueError(BILL_NUMBER_TOO_LONG)
    return value


BillNumber = Annotated[str, AfterValidator(_bill_number)]


class BillCreate(api.Request):
    """Without a due date, it's 30 days after the bill date (E5). With paid_on, it's added paid (E11)."""

    organization_id: api.Id
    bill_number: BillNumber
    bill_date: date
    due_date: date | None = None
    amount_cents: api.Cents
    tax_cents: api.Cents = 0
    category: Category
    notes: api.OptionalText = None
    paid_on: date | None = None


class BillUpdate(api.Request):
    """paid_on set to a date marks the bill paid, and set to null marks it unpaid (E9, E10).
    The supplier can be changed but not cleared, and neither can the dates (E2, E5)."""

    organization_id: api.Id | MISSING = MISSING
    bill_number: BillNumber | MISSING = MISSING
    bill_date: date | MISSING = MISSING
    due_date: date | MISSING = MISSING
    amount_cents: api.Cents | MISSING = MISSING
    tax_cents: api.Cents | MISSING = MISSING
    category: Category | MISSING = MISSING
    notes: api.OptionalText = None
    paid_on: date | None = None


class Supplier(BaseModel):
    id: int
    name: str


class BillRow(BaseModel):
    """The total is worked out by the backend, never taken from a request (E4)."""

    id: int
    organization: Supplier
    bill_number: str
    bill_date: date
    due_date: date
    amount_cents: int
    tax_cents: int
    total_cents: int
    category: Category
    notes: str | None
    paid_on: date | None


class BillDetail(BillRow, Authorship):
    pass


# The Money section (E20 to E23)


class Figure(BaseModel):
    total_cents: int
    count: int


class DueBill(BaseModel):
    id: int
    supplier: str
    bill_number: str
    due_date: date
    category: Category
    total_cents: int


class Due(Figure):
    bills: list[DueBill]
    """In due date order."""


class SpendingMonth(BaseModel):
    month: str
    """Such as "2026-10"."""
    label: str
    """Such as "Oct"."""
    total_cents: int
    categories: dict[Category, int]
    """A total in cents for each of the six."""


class Money(BaseModel):
    today: date
    """The backend's, so the page can tell when the day has passed it (E20)."""
    owed: Figure
    overdue: Figure
    due: Due
    months: list[SpendingMonth]
    """The last 12, oldest first."""
