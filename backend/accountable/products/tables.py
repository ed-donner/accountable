import unicodedata

from sqlalchemy import BigInteger, Boolean, Column, Index, Integer, Table, Text

from accountable import who
from accountable.db import TABLE_OPTIONS, metadata

products = Table(
    "products",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Text, nullable=False),
    # Set from the name on every save. Its unique index is what keeps names unique (G2).
    Column("name_key", Text, nullable=False),
    Column("description", Text),
    Column("unit_price_cents", BigInteger, nullable=False),
    Column("active", Boolean, nullable=False, default=True),
    *who.columns(),
    Index("ix_products_name_key", "name_key", unique=True),
    **TABLE_OPTIONS,
)

# The price list's records, which npm run seed and npm run empty count before they delete them (C4).
RECORDS = (products,)


# The most bytes a key can have and still go in the unique index on Postgres, which
# refuses an entry over 2,704 bytes, its own few included: 2,690 was the most it took,
# measured on Postgres 16. SQLite has no such limit, so its tests can't show one.
INDEXED_KEY_BYTES = 2690


def name_key(name: str) -> str:
    """The name with its case taken out in any language, so "PRO LICENSE" clashes with
    "Pro license" and "ÉMILE" with "émile" (G2). Worked out here rather than by either
    database, so both agree. Normalized as well, so an accented letter typed as one
    character clashes with the same letter typed as a letter and an accent."""
    return unicodedata.normalize("NFC", name.casefold())
