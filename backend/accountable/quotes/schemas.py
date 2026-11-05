"""The quotes' request and reply models, and the messages for their fields and refusals."""

from datetime import date
from typing import Annotated, Literal

from pydantic import MISSING, AfterValidator, BaseModel, Field

from accountable import api
from accountable.company import tax
from accountable.company.documents import Company
from accountable.company.lines import Line
from accountable.who import Authorship

Status = Literal["draft", "sent", "accepted", "declined"]

MAX_LINES = 100
LINES_MESSAGE = f"Keep the quote to {MAX_LINES} lines or fewer"
PRICE_MESSAGE = "Enter a price in dollars and cents, such as 49.50"
BEFORE_THE_QUOTE_DATE = "Choose a date on or after the quote's date"
VALID_UNTIL_PASSED = "Choose a valid-until date from today on."
ARCHIVED_PRODUCT = "This product is archived. Choose another."
CHOOSE_A_PRODUCT = "Choose a product"
NOT_ON_THE_QUOTE = "This line isn't on the quote"

# For a value of the wrong kind, such as a quantity sent as text. A line's fields go by their own
# names, so a bad quantity on the third line, lines.2.quantity, gets the quantity's message.
FIELD_MESSAGES = {
    "deal_id": "Choose an open deal",
    "valid_until": "Choose a valid-until date",
    "lines": LINES_MESSAGE,
    "product_id": CHOOSE_A_PRODUCT,
    "quantity": tax.QUANTITY_MESSAGE,
    "unit_price_cents": PRICE_MESSAGE,
    "description": "Use plain text here",
}

# The refusals that belong to a quote's status or its deal, each a 409 (Q20, Q21, Q23, Q28, Q30).
DEAL_CLOSED_FOR_NEW = "This deal is closed, so it can't take a new quote."
DEAL_CLOSED_FOR_SENDING = "This deal is closed, so its quotes can't be sent."
DEAL_CLOSED_FOR_ACCEPTING = "This deal is closed, so its quotes can't be accepted."
NO_ORGANIZATION = "Give the deal an organization before sending its quote."
NO_LINES = "Add a line before sending the quote."
NO_COMPANY_NAME = "Add the company's name in Company settings first."


def cant_change(number: str, status: str) -> str:
    """Q21's words for any change to a quote that's no longer a draft."""
    return f"{number} has been {status}, so it can't be changed. Copy it to make a new draft."


def not_sent_yet(number: str) -> str:
    return f"{number} is a draft. Mark it as sent before accepting it."


def already_accepted(number: str) -> str:
    return f"This deal already has an accepted quote, {number}."


def _at_most_100(lines: list) -> list:
    if len(lines) > MAX_LINES:
        raise ValueError(LINES_MESSAGE)
    return lines


class LineIn(api.Request):
    """A line as the form sends it: one already on the quote, by its id, or a new one, by its
    product. Its name always comes from the product, never from here (Q13)."""

    id: api.Id | None = None
    product_id: api.Id | None = None
    description: api.OptionalText = None
    quantity: tax.Quantity
    unit_price_cents: api.Cents


Lines = Annotated[list[LineIn], AfterValidator(_at_most_100)]


class QuoteCreate(api.Request):
    """A new draft. Its number, date and amounts are the backend's to set, so none of them are taken from here."""

    deal_id: api.Id
    valid_until: date | None = None
    lines: Lines = Field(default_factory=list)


class QuoteUpdate(api.Request):
    """A draft's date or lines. Lines are sent whole, in order, and any left out are removed (Q12)."""

    valid_until: date | MISSING = MISSING
    lines: Lines | MISSING = MISSING


class PreparedFor(BaseModel):
    """Who the quote is for: fixed once it's sent or declined, or the deal's on a draft (Q18)."""

    organization: str | None
    contact: str | None
    email: str | None


class QuoteDocument(BaseModel):
    """A quote as its page and its PDF show it, with every amount worked out by the backend (Q15).

    The rate is text, such as "8.875", as the settings give it (B7). A blank tax label shows as "Tax".
    """

    number: str
    quote_date: date
    valid_until: date
    company: Company
    prepared_for: PreparedFor
    tax_label: str | None
    tax_rate: str
    lines: list[Line]
    subtotal_cents: int
    tax_cents: int
    total_cents: int


class DealLink(BaseModel):
    id: int
    name: str
    stage: str


class QuoteDetail(QuoteDocument, Authorship):
    """One quote, as GET /quotes/{id} and every save reply with it. Expired is never sent: the page
    works it out from valid_until and today (Q7)."""

    id: int
    status: Status
    deal: DealLink
    sent_on: date | None
    decided_on: date | None


class NewQuote(BaseModel):
    """What a new draft on a deal starts with, before its first save (Q8, Q9)."""

    deal: DealLink
    company: Company
    prepared_for: PreparedFor
    tax_label: str | None
    tax_rate: str


class QuoteRow(BaseModel):
    """One row of the Quotes table, or of a panel on a deal or an organization (Q33, Q36, Q37)."""

    id: int
    number: str
    status: Status
    deal_id: int
    deal_name: str
    deal_stage: str
    organization_id: int | None
    organization_name: str | None
    quote_date: date
    valid_until: date
    subtotal_cents: int
    tax_cents: int
    total_cents: int


class AcceptedDeal(BaseModel):
    id: int
    name: str
    value: int


class AcceptChanges(BaseModel):
    """What else accepting changed, for the message after it (Q22)."""

    close_date: date | None
    new_customer: str | None
    declined: list[str]


class Accepted(BaseModel):
    quote: QuoteDetail
    deal: AcceptedDeal
    changes: AcceptChanges
