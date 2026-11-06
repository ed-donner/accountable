"""The made-up company whose settings a new database starts with (B12).

Its email uses the reserved .example domain and its phone number is in the 555-0100
to 555-0199 range kept for fiction, so nothing points at a real company (M5).
"""

from datetime import date, datetime
from pathlib import Path

from sqlalchemy import Connection, delete, insert, update

from accountable import months, who
from accountable.company import logo
from accountable.company.tables import company_logo, company_settings
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
    "invoice_design": "banner",
    "accent_color": "#0E6B6B",
}

# $40,000.00, enough to keep the sample cash balance above zero in every month (B12).
SAMPLE_OPENING_BALANCE_CENTS = 4_000_000

# A made-up logo for the made-up company, drawn once and kept with the sample data.
SAMPLE_LOGO = Path(__file__).with_name("sample-logo.png")

[DANA_WHITFIELD] = [teammate.id for teammate in TEAMMATES if teammate.name == "Dana Whitfield"]


def opening_day(today: date) -> date:
    """The first day of the cash flow's first month, so its balance line covers the whole year (Y10)."""
    return months.last_months(today)[0].first_day


def fill(conn: Connection, today: date, now: datetime) -> None:
    """Writes the sample company, its opening balance and its logo over the settings, put down
    to Dana Whitfield at this moment (M7)."""
    add_missing_teammates(conn)
    conn.execute(
        update(company_settings)
        .where(company_settings.c.id == 1)
        .values(
            **SAMPLE_COMPANY,
            opening_balance_cents=SAMPLE_OPENING_BALANCE_CENTS,
            opening_balance_on=opening_day(today),
            **who.changed(DANA_WHITFIELD, now),
        )
    )
    image = SAMPLE_LOGO.read_bytes()
    checked = logo.check(image)
    conn.execute(delete(company_logo))
    conn.execute(
        insert(company_logo).values(
            id=1,
            image=image,
            media_type=checked.media_type,
            width=checked.width,
            height=checked.height,
            created_at=now,
            updated_at=now,
        )
    )
