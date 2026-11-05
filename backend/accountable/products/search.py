"""What the top bar's search looks for among products: active ones only, by name, with their price (K1, K5, G10)."""

from pydantic import BaseModel
from sqlalchemy import Select, Text, cast, select

from accountable.products.tables import products
from accountable.search import Kind, Matcher, blank_text


class ProductResult(BaseModel):
    id: int
    name: str
    unit_price_cents: int


def _products(holding: Matcher) -> Select:
    """The price goes in detail as text, which every kind's detail is, and the result turns it back into cents."""
    return select(
        products.c.id,
        products.c.name,
        cast(products.c.unit_price_cents, Text).label("detail"),
        blank_text().label("extra"),
    ).where(products.c.active, holding(products.c.name))


KINDS = [
    Kind(
        "products",
        _products,
        lambda row: ProductResult(id=row.id, name=row.name, unit_price_cents=int(row.detail)),
    ),
]
