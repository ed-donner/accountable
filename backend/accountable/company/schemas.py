"""The company settings' request and reply models, their checks, and the messages for their fields (B4 to B7)."""

import re
from decimal import Decimal
from typing import Annotated, Any

from pydantic import MISSING, AfterValidator, BaseModel, BeforeValidator, Field, StrictInt, WithJsonSchema

from accountable import api
from accountable.users import Person

COMPANY_NAME_MESSAGE = "Enter the company name"
RATE_RANGE_MESSAGE = "Enter a rate from 0 to 100%"
RATE_DECIMALS_MESSAGE = "Use at most three decimal places"
PAYMENT_TERMS_MESSAGE = "Enter a whole number of days from 0 to 365"
QUOTE_PREFIX_BLANK_MESSAGE = "Enter a prefix, such as QT-"
INVOICE_PREFIX_BLANK_MESSAGE = "Enter a prefix, such as INV-"
PREFIX_CHARACTERS_MESSAGE = "Use up to 10 letters, digits and hyphens"
CLASH_MESSAGE = "Clashes with the quote prefix. Neither can start with the other, ignoring capitals"

# For a value of the wrong kind, such as a prefix sent as null or the payment terms as text.
# The keys can't be any other area's field names, because the error handler reads every area's.
FIELD_MESSAGES = {
    "company_name": COMPANY_NAME_MESSAGE,
    "tax_rate": RATE_RANGE_MESSAGE,
    "payment_terms_days": PAYMENT_TERMS_MESSAGE,
    "quote_prefix": QUOTE_PREFIX_BLANK_MESSAGE,
    "invoice_prefix": INVOICE_PREFIX_BLANK_MESSAGE,
}

MAX_RATE = 100
DECIMAL_PLACES = 3
PER_PERCENT = 10**DECIMAL_PLACES
# Digits with an optional point, and at least one digit: 8.875, 8, .5 or 5. Only ASCII
# digits, as the page allows, though Python's \d and Decimal take any script's.
RATE_DIGITS = re.compile(r"(?=\.?[0-9])([0-9]*)(?:\.([0-9]*))?")
PREFIX = re.compile(r"[A-Za-z0-9-]{1,10}")


def _company_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(COMPANY_NAME_MESSAGE)
    return value


def _rate_digits(value: Any) -> str:
    """The rate as plain digits, from text as typed or from a JSON number, never through a binary fraction (B7).

    Anything else, a boolean included, which would otherwise pass as 1 or 0, gives no digits.
    """
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, bool) or not isinstance(value, int | float):
        return ""
    # A float writes its shortest form, so 8.875 arrives as 8.875. "f" leaves out the exponent,
    # and writes infinity and NaN as words, which have no digits.
    return format(Decimal(str(value)), "f")


def _thousandths(value: Any) -> int:
    """8.875 is 8875: thousandths of a percent, as the table keeps them."""
    match = RATE_DIGITS.fullmatch(_rate_digits(value))
    if match is None:
        raise ValueError(RATE_RANGE_MESSAGE)
    whole_digits = match.group(1).lstrip("0")
    places = (match.group(2) or "").rstrip("0")
    # Checked before int(), which refuses text past 4,300 digits.
    if len(whole_digits) > len(str(MAX_RATE)):
        raise ValueError(RATE_RANGE_MESSAGE)
    whole = int(whole_digits or "0")
    if whole > MAX_RATE or (whole == MAX_RATE and places):
        raise ValueError(RATE_RANGE_MESSAGE)
    if len(places) > DECIMAL_PLACES:
        raise ValueError(RATE_DECIMALS_MESSAGE)
    return whole * PER_PERCENT + int(places.ljust(DECIMAL_PLACES, "0"))


def rate_text(thousandths: int) -> str:
    """8875 as "8.875", and 8500 as "8.5": no trailing zeros, and never a binary fraction (B7)."""
    whole, places = divmod(thousandths, PER_PERCENT)
    return f"{whole}.{places:0{DECIMAL_PLACES}d}".rstrip("0").removesuffix(".")


def _prefix(blank_message: str):
    def check(value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError(blank_message)
        if not PREFIX.fullmatch(value):
            raise ValueError(PREFIX_CHARACTERS_MESSAGE)
        return value

    return check


def prefixes_clash(quote: str, invoice: str) -> bool:
    """Whether a quote's number and an invoice's could ever be the same (B6)."""
    quote, invoice = quote.lower(), invoice.lower()
    return quote.startswith(invoice) or invoice.startswith(quote)


CompanyName = Annotated[str, AfterValidator(_company_name)]
TaxRate = Annotated[
    int,
    BeforeValidator(_thousandths),
    WithJsonSchema({"anyOf": [{"type": "string"}, {"type": "number"}]}),
]
PaymentTerms = Annotated[StrictInt, Field(ge=0, le=365)]
QuotePrefix = Annotated[str, AfterValidator(_prefix(QUOTE_PREFIX_BLANK_MESSAGE))]
InvoicePrefix = Annotated[str, AfterValidator(_prefix(INVOICE_PREFIX_BLANK_MESSAGE))]


class SettingsUpdate(api.Request):
    """Any of the settings. The rest keep their saved values, and the checks needing those run in the router."""

    company_name: CompanyName | MISSING = MISSING
    address: api.OptionalText | MISSING = MISSING
    email: api.Email | MISSING = MISSING
    phone: api.OptionalText | MISSING = MISSING
    tax_label: api.OptionalText | MISSING = MISSING
    tax_rate: TaxRate | MISSING = MISSING
    payment_terms_days: PaymentTerms | MISSING = MISSING
    quote_prefix: QuotePrefix | MISSING = MISSING
    invoice_prefix: InvoicePrefix | MISSING = MISSING


class CompanySettings(BaseModel):
    """The settings with who last changed them, nobody at the defaults (B9, B13). The rate is text, such as "8.875"."""

    company_name: str | None
    address: str | None
    email: str | None
    phone: str | None
    tax_label: str | None
    tax_rate: str
    payment_terms_days: int
    quote_prefix: str
    invoice_prefix: str
    updated_at: api.UtcTime
    updated_by: Person | None
