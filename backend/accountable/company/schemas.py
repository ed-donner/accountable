"""The company settings' request and reply models, their checks, and the messages for their fields (B4 to B7)."""

import base64
import binascii
import re
from decimal import Decimal
from typing import Annotated, Any, Literal

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


def taken_clash_message(kind: str, number: str) -> str:
    """B6's words for a new prefix that a number the other kind has already taken starts with."""
    return f"Clashes with {kind} {number}, which starts with it, ignoring capitals"


DESIGN_MESSAGE = "Choose a design"
ACCENT_FORMAT_MESSAGE = "Enter a color as # and six hex digits, such as #0E6B6B"
ACCENT_LIGHT_MESSAGE = "Too light to read on white. Choose a darker color"
LOGO_MESSAGE = "Choose a PNG or JPEG image"

# For a value of the wrong kind, such as a prefix sent as null or the payment terms as text.
FIELD_MESSAGES = {
    "company_name": COMPANY_NAME_MESSAGE,
    "tax_rate": RATE_RANGE_MESSAGE,
    "payment_terms_days": PAYMENT_TERMS_MESSAGE,
    "quote_prefix": QUOTE_PREFIX_BLANK_MESSAGE,
    "invoice_prefix": INVOICE_PREFIX_BLANK_MESSAGE,
    "invoice_design": DESIGN_MESSAGE,
    "accent_color": ACCENT_FORMAT_MESSAGE,
    "logo": LOGO_MESSAGE,
}

DESIGNS = ("classic", "banner", "ledger")
Design = Literal["classic", "banner", "ledger"]
HEX_COLOR = re.compile(r"#[0-9A-Fa-f]{6}")
# Small text needs 4.5:1, so text in the accent on white, and white text on it, can both be read (B20).
LEAST_CONTRAST = 4.5

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


def _thousandths(value: Any) -> int:
    """8.875 is 8875: thousandths of a percent, as the table keeps them, from text as typed or a JSON number (B7).

    Anything else, a boolean included, which would otherwise pass as 1 or 0, is refused.
    """
    if isinstance(value, str):
        return _thousandths_of_text(value.strip())
    if isinstance(value, int | float | Decimal) and not isinstance(value, bool):
        # The settings' routes read a number with a point as a Decimal, with every digit sent. A
        # float from anywhere else writes its shortest form, so 8.875 reads as 8.875.
        return _thousandths_of_number(Decimal(str(value)) if isinstance(value, float) else Decimal(value))
    # Anything else has no digits, so it gets the same message as blank text.
    return _thousandths_of_text("")


def _thousandths_of_number(number: Decimal) -> int:
    """Decimals compare exactly, and nothing here rounds the number or writes it out in full,
    which for 1e999999999 would take a billion digits."""
    if not number.is_finite() or number.is_signed() or number > MAX_RATE:
        raise ValueError(RATE_RANGE_MESSAGE)
    _, digits, exponent = number.as_tuple()
    # Trailing zeros don't count as decimal places, so 8.8750 is 8.875.
    significant = "".join(map(str, digits)).rstrip("0")
    if not significant:
        return 0
    exponent = int(exponent) + len(digits) - len(significant)
    if exponent < -DECIMAL_PLACES:
        raise ValueError(RATE_DECIMALS_MESSAGE)
    # At most 100, with at most three places, so these are small numbers.
    return int(significant) * 10 ** (exponent + DECIMAL_PLACES)


def _thousandths_of_text(text: str) -> int:
    match = RATE_DIGITS.fullmatch(text)
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


def _linear(channel: int) -> float:
    value = channel / 255
    return value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4


def contrast_with_white(color: str) -> float:
    """WCAG's contrast ratio between #RRGGBB and white, which company/accent.ts works out the same way."""
    red, green, blue = (int(color[start : start + 2], 16) for start in (1, 3, 5))
    luminance = 0.2126 * _linear(red) + 0.7152 * _linear(green) + 0.0722 * _linear(blue)
    return 1.05 / (luminance + 0.05)


def _accent(value: str) -> str:
    """Kept as # and six capitals, from a color typed in either case (B20)."""
    value = value.strip()
    if not HEX_COLOR.fullmatch(value):
        raise ValueError(ACCENT_FORMAT_MESSAGE)
    if contrast_with_white(value) < LEAST_CONTRAST:
        raise ValueError(ACCENT_LIGHT_MESSAGE)
    return value.upper()


def _decoded(value: Any) -> bytes:
    """The logo travels as base64 text, so the request stays JSON. Text that isn't base64 isn't an image."""
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError, TypeError) as error:
        raise ValueError(LOGO_MESSAGE) from error


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
AccentColor = Annotated[str, AfterValidator(_accent)]
# Checked as an image by logo.check in the router, once it's bytes.
LogoFile = Annotated[bytes, BeforeValidator(_decoded), WithJsonSchema({"type": "string", "contentEncoding": "base64"})]


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
    invoice_design: Design | MISSING = MISSING
    accent_color: AccentColor | MISSING = MISSING
    # The file, or None to remove it. Left out, the logo stays as it is.
    logo: LogoFile | None | MISSING = MISSING


class Logo(BaseModel):
    """The logo's checked type and size. Its bytes come from GET /settings/logo, never with the settings."""

    media_type: str
    width: int
    height: int


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
    invoice_design: Design
    accent_color: str
    logo: Logo | None
    updated_at: api.UtcTime
    updated_by: Person | None
