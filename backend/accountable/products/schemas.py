"""The price list's request and reply models, and the messages for its fields."""

from pydantic import MISSING, BaseModel, StrictBool

from accountable import api
from accountable.who import Authorship

NAME_TAKEN = "A product with this name already exists"
ARCHIVED_NAME_TAKEN = "An archived product has this name. Restore it or choose another."

# A description is optional, so a bad one gets the default "Check this field".
FIELD_MESSAGES = {
    "name": api.NAME_MESSAGE,
    "unit_price_cents": "Enter a price in dollars and cents, such as 49.50",
    "active": "Choose whether the product is active",
}


class ProductCreate(api.Request):
    """Every product is added active (G8)."""

    name: api.Name
    description: api.OptionalText = None
    unit_price_cents: api.Cents


class ProductUpdate(api.Request):
    """active set to false archives the product, and set to true restores it (G9)."""

    name: api.Name | MISSING = MISSING
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
