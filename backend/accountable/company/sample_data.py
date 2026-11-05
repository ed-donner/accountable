"""The made-up company whose settings a new database starts with (B12).

Its email uses the reserved .example domain and its phone number is in the 555-0100
to 555-0199 range kept for fiction, so nothing points at a real company (M5).
"""

from datetime import datetime

from sqlalchemy import Connection, update

from accountable import who
from accountable.company.tables import company_settings
from accountable.users import TEAMMATES, add_missing_teammates

SAMPLE_COMPANY = {
    "company_name": "Plainsong Systems",
    "address": "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
    "email": "accounts@plainsong.example",
    "phone": "(718) 555-0142",
    "tax_label": "Sales tax",
    "tax_rate": 8875,
    "payment_terms_days": 30,
    "quote_prefix": "QT-",
    "invoice_prefix": "INV-",
}

[DANA_WHITFIELD] = [teammate.id for teammate in TEAMMATES if teammate.name == "Dana Whitfield"]


def fill(conn: Connection, now: datetime) -> None:
    """Writes the sample company over the settings, put down to Dana Whitfield at this moment (M7)."""
    add_missing_teammates(conn)
    conn.execute(
        update(company_settings)
        .where(company_settings.c.id == 1)
        .values(**SAMPLE_COMPANY, **who.changed(DANA_WHITFIELD, now))
    )
