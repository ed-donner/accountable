"""The price list's request and reply models, and the messages for its fields."""

from typing import Annotated

from pydantic import MISSING, AfterValidator, BaseModel, StrictBool

from accountable import api
from accountable.who import Authorship

NAME_TAKEN = "A product with this name already exists"
ARCHIVED_NAME_TAKEN = "An archived product has this name. Restore it or choose another."

# No character's key is more than 12 bytes, so a name of 200 keeps its key well inside
# what Postgres can index (tables.INDEXED_KEY_BYTES). A longer one would be a 500 there (G2).
MAX_NAME_LENGTH = 200
NAME_TOO_LONG = f"Keep the name to {MAX_NAME_LENGTH} characters or fewer"


def _fits(name: str) -> str:
    if len(name) > MAX_NAME_LENGTH:
        raise ValueError(NAME_TOO_LONG)
    return name


# Spaces at the ends are dropped first, so they don't count.
ProductName = Annotated[api.Name, AfterValidator(_fits)]

# A description is optional, so a bad one gets the default "Check this field".
FIELD_MESSAGES = {
    "name": api.NAME_MESSAGE,
    "unit_price_cents": "Enter a price in dollars and cents, such as 49.50",
    "active": "Choose whether the product is active",
}


class ProductCreate(api.Request):
    """Every product is added active (G8)."""

    name: ProductName
    description: api.OptionalText = None
    unit_price_cents: api.Cents


class ProductUpdate(api.Request):
    """active set to false archives the product, and set to true restores it (G9)."""

    name: ProductName | MISSING = MISSING
    description: api.OptionalText = None
    unit_price_cents: api.Cents | MISSING = MISSING
    active: StrictBool | MISSING = MISSING


class ProductRow(BaseModel):
    id: int
    name: str
    description: str | None
    unit_price_cents: int
    active: bool


class ProductDetail(ProductRow, Authorship):
    pass
