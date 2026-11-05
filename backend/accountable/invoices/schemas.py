"""Invoices' and payments' request and reply models, and the messages for their fields (V8, V10, V15).

A field a route needs but that wasn't sent is MISSING here, and the route gives its
message once it has found the invoice, so a missing invoice is a 404 whatever the body.
"""

from datetime import date
from typing import Annotated, Any, Literal

from pydantic import MISSING, AfterValidator, BaseModel, BeforeValidator, Field, StrictInt

from accountable import api
from accountable.company import tax
from accountable.invoices.figures import LateGroup, ShowsAs
from accountable.users import Person
from accountable.who import Authorship

MAX_LINES = 100
MAX_BILL_TO_LINES = 6
MAX_BILL_TO_CHARACTERS = 500
MAX_DESCRIPTION = 1000
MAX_REFERENCE = 100

BILL_TO_BLANK = "Enter who the invoice is for"
BILL_TO_TOO_LONG = "Keep the Bill to to 6 lines and 500 characters"
DESCRIPTION_TOO_LONG = "Keep the description to 1,000 characters or fewer"
PRICE_MESSAGE = "Enter a price in dollars and cents, such as 49.50"
NO_LINES = "Add a line before issuing"
TOO_MANY_LINES = "An invoice can have up to 100 lines"
PRODUCT_MESSAGE = "Choose an active product"
DEAL_MESSAGE = "Choose a won deal"

NOTHING_TO_PAY = "The total must be more than $0.00 to issue."
NO_ORGANIZATION = "This deal has no organization. Choose one on the deal before issuing."
NO_COMPANY_NAME = "Enter the company's name in Company settings before issuing."

DATE_MESSAGE = "Enter the date it was paid"
DATE_IN_FUTURE = "A payment can't be dated in the future"
DATE_BEFORE_ISSUE = "A payment can't be dated before the invoice was issued"
AMOUNT_MESSAGE = "Enter an amount more than $0.00"
METHOD_MESSAGE = "Choose how it was paid"
REFERENCE_TOO_LONG = "Keep the reference to 100 characters or fewer"

ISSUED = "This invoice has been issued, so it can't be changed."
NOT_WON = "Only a won deal can start an invoice."
HAS_PAYMENTS = "This invoice has payments, so it can't be voided."
DRAFTS_ARENT_VOIDED = "A draft is deleted rather than voided."
ALREADY_VOID = "This invoice is already void."
NO_PAYMENT_TAKEN = "A draft or a void invoice can't take a payment."
DRAFT_HAS_NO_PDF = "A draft has no PDF. Issue it first."

# For a value of the wrong kind, such as a quantity sent as text, and for a field left out.
FIELD_MESSAGES = {
    "bill_to": BILL_TO_TOO_LONG,
    "description": DESCRIPTION_TOO_LONG,
    "quantity": tax.QUANTITY_MESSAGE,
    "unit_price_cents": PRICE_MESSAGE,
    "product_id": PRODUCT_MESSAGE,
    "deal_id": DEAL_MESSAGE,
    "paid_on": DATE_MESSAGE,
    "amount_cents": AMOUNT_MESSAGE,
    "method": METHOD_MESSAGE,
    "reference": REFERENCE_TOO_LONG,
}

METHODS = ("bank_transfer", "card", "check", "cash", "other")
Method = Literal["bank_transfer", "card", "check", "cash", "other"]


def _bill_to(value: str | None) -> str | None:
    if value is not None and (len(value) > MAX_BILL_TO_CHARACTERS or value.count("\n") >= MAX_BILL_TO_LINES):
        raise ValueError(BILL_TO_TOO_LONG)
    return value


def _at_most(count: int, message: str):
    def check(value: str | None) -> str | None:
        if value is not None and len(value) > count:
            raise ValueError(message)
        return value

    return check


def _at_most_100_lines(value: Any) -> Any:
    """Before the lines are read, so a long list is refused without reading each of them."""
    if isinstance(value, list) and len(value) > MAX_LINES:
        raise ValueError(TOO_MANY_LINES)
    return value


# Spaces and line breaks at the ends are dropped, as in every other field, and the rest kept as typed (V5).
BillTo = Annotated[api.OptionalText, AfterValidator(_bill_to)]
Description = Annotated[api.OptionalText, AfterValidator(_at_most(MAX_DESCRIPTION, DESCRIPTION_TOO_LONG))]
Reference = Annotated[api.OptionalText, AfterValidator(_at_most(MAX_REFERENCE, REFERENCE_TOO_LONG))]
Amount = Annotated[StrictInt, Field(ge=1, le=api.MAX_CENTS)]


class DraftLine(api.Request):
    """A line with the id of one of this invoice's lines keeps that line's product and name (V6).
    One without takes its product's name now, and its price, description and a quantity of 1
    unless they're sent. A line's amount, sent or not, is never read (V9)."""

    id: api.Id | None = None
    product_id: api.Id | None = None
    description: Description | MISSING = MISSING
    quantity: tax.Quantity | MISSING = MISSING
    unit_price_cents: api.Cents | MISSING = MISSING


Lines = Annotated[list[DraftLine], BeforeValidator(_at_most_100_lines)]


class Draft(api.Request):
    """What Save draft and Issue invoice send. A field not sent keeps what's saved, and the lines
    sent are the whole list, in order. Totals sent are ignored, like any unknown field (V9)."""

    bill_to: BillTo | MISSING = MISSING
    lines: Lines | MISSING = MISSING


class NewInvoice(api.Request):
    deal_id: api.Id


class PaymentIn(api.Request):
    paid_on: date | MISSING = MISSING
    amount_cents: Amount | MISSING = MISSING
    method: Method | MISSING = MISSING
    reference: Reference = None


class Named(BaseModel):
    id: int
    name: str


class InvoiceRow(BaseModel):
    """An invoice in a list, and the start of every invoice reply."""

    id: int
    number: str | None
    shows_as: ShowsAs
    deal: Named
    organization: Named | None
    bill_to: str | None
    issue_date: date | None
    due_date: date | None
    total_cents: int
    owed_cents: int


class Company(BaseModel):
    name: str | None
    address: str | None
    email: str | None
    phone: str | None


class Line(BaseModel):
    id: int
    product_id: int
    name: str
    description: str | None
    quantity: int
    unit_price_cents: int
    amount_cents: int


class Payment(BaseModel):
    id: int
    paid_on: date
    amount_cents: int
    method: Method
    reference: str | None
    created_at: api.UtcTime
    created_by: Person | None


class InvoiceDetail(InvoiceRow, Authorship):
    """For a draft, the company and the tax are the settings as they are now. For an issued invoice, its copies (V11)."""

    status: Literal["draft", "issued", "void"]
    days_late: int | None
    deal_stage: str
    company: Company
    tax_label: str | None
    tax_rate: str
    lines: list[Line]
    subtotal_cents: int
    tax_cents: int
    paid_cents: int
    payments: list[Payment]
    issued_by: Person | None
    voided_by: Person | None
    voided_at: api.UtcTime | None


class Sum(BaseModel):
    cents: int
    count: int


class Group(Sum):
    key: LateGroup


class Month(Sum):
    month: str
    label: str


class Money(BaseModel):
    owed: Sum
    overdue: Sum
    groups: list[Group]
    payments: list[Month]
