"""A quote as its page and its PDF show it, which the router and the PDF both draw from, so the
two can't disagree (Q31).

A quote that's been sent, or declined as a draft, shows the company's details, the tax and
Prepared for as they were fixed on it. A draft shows them as the settings and its deal have them
now, so nothing on a draft needs updating when those change (Q17, Q18, Q30).
"""

from collections.abc import Mapping
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Connection, Row, Select, select

from accountable.company import lines
from accountable.company.documents import company_in, current_settings, details_now
from accountable.company.schemas import rate_text
from accountable.crm.tables import contacts, deals, organizations
from accountable.quotes import schemas
from accountable.quotes.tables import quote_lines, quotes

_deal_and_who = deals.outerjoin(organizations, deals.c.organization_id == organizations.c.id).outerjoin(
    contacts, deals.c.main_contact_id == contacts.c.id
)
# The deal's organization and main contact as they are now, which a draft is prepared for (Q18).
_WHO_NOW = (
    organizations.c.name.label("organization_now"),
    contacts.c.name.label("contact_now"),
    contacts.c.email.label("contact_email_now"),
)


def with_deal(query: Select) -> Select:
    """Adds each quote's deal, its stage and organization, and who a draft on it is prepared for now,
    so a quote's page needs no read of its own for them."""
    return query.add_columns(
        deals.c.name.label("deal_name"),
        deals.c.stage.label("deal_stage"),
        deals.c.organization_id.label("deal_organization_id"),
        *_WHO_NOW,
    ).join(_deal_and_who, quotes.c.deal_id == deals.c.id)


def _settings_now(conn: Connection) -> dict[str, Any]:
    return details_now(current_settings(conn))


def _who(row: Row) -> dict[str, Any]:
    return {
        "prepared_for_organization": row.organization_now,
        "prepared_for_contact": row.contact_now,
        "prepared_for_email": row.contact_email_now,
    }


def fixed_details(conn: Connection, deal_id: int) -> dict[str, Any]:
    """The company's details and the tax as the settings have them, and Prepared for as the deal
    has it, at this moment: what sending a quote, or declining a draft, copies onto it, in its columns."""
    who = conn.execute(select(*_WHO_NOW).select_from(_deal_and_who).where(deals.c.id == deal_id)).one()
    return {**_settings_now(conn), **_who(who)}


def details_of(conn: Connection, quote: Row) -> Mapping[str, Any]:
    """The quote's own fixed details, or, on a draft, the settings' and its deal's as they are now.
    The quote is read through with_deal()."""
    if quote.status != "draft":
        return quote._mapping
    return {**_settings_now(conn), **_who(quote)}


def _shown(details: Mapping[str, Any]) -> dict[str, Any]:
    """The company, Prepared for and the tax, as a reply carries them, from a quote's columns or fixed_details()."""
    return {
        "company": company_in(details),
        "prepared_for": schemas.PreparedFor(
            organization=details["prepared_for_organization"],
            contact=details["prepared_for_contact"],
            email=details["prepared_for_email"],
        ),
        "tax_label": details["tax_label"],
        "tax_rate": rate_text(details["tax_rate"]),
    }


def lines_of(conn: Connection, quote_id: int) -> list[Row]:
    """The quote's lines, in the order they were added (Q12)."""
    return lines.lines_of(conn, quote_lines.c.quote_id, quote_id)


def document(conn: Connection, quote: Row) -> schemas.QuoteDocument:
    """The quote, read through with_deal(), with its lines and their amounts, and the subtotal, tax
    and total worked out from them (B16)."""
    details = details_of(conn, quote)
    line_replies, sums = lines.document_figures(lines_of(conn, quote.id), details["tax_rate"])
    return schemas.QuoteDocument(
        number=quote.number,
        quote_date=quote.quote_date,
        valid_until=quote.valid_until,
        **_shown(details),
        lines=line_replies,
        subtotal_cents=sums.subtotal_cents,
        tax_cents=sums.tax_cents,
        total_cents=sums.total_cents,
    )


def recipient(prepared_for: schemas.PreparedFor) -> str | None:
    """Who the quote is prepared for, as the layout writes it: the organization, the contact and
    their email, each on its own line, leaving out any that's blank (Q18)."""
    parts = (prepared_for.organization, prepared_for.contact, prepared_for.email)
    return "\n".join(part for part in parts if part) or None


def layout_values(doc: schemas.QuoteDocument, look: dict[str, Any], *, draft: bool) -> dict[str, Any]:
    """The quote as the layout takes it, in the look Company settings have: plain values, as the
    quote's page gives layout.ts (Q31). A draft is marked as one, and no other status is (Q30)."""
    return {
        "kind": "quote",
        **look,
        "company": doc.company.model_dump(),
        "number": doc.number,
        "date": doc.quote_date.isoformat(),
        "end_date": doc.valid_until.isoformat(),
        "recipient": recipient(doc.prepared_for),
        "lines": [line.model_dump() for line in doc.lines],
        "subtotal_cents": doc.subtotal_cents,
        "tax_cents": doc.tax_cents,
        "total_cents": doc.total_cents,
        "paid_cents": 0,
        "tax_label": doc.tax_label,
        "tax_rate": doc.tax_rate,
        "mark": "draft" if draft else None,
    }


def new_document(conn: Connection, deal_id: int) -> schemas.NewQuote:
    """What a new draft on the deal starts with, before anything is saved (Q9)."""
    deal = conn.execute(
        select(deals.c.id, deals.c.name, deals.c.stage, *_WHO_NOW)
        .select_from(_deal_and_who)
        .where(deals.c.id == deal_id)
    ).one_or_none()
    if deal is None:
        raise HTTPException(404, "Deal not found")
    link = schemas.DealLink(id=deal.id, name=deal.name, stage=deal.stage)
    return schemas.NewQuote(deal=link, **_shown({**_settings_now(conn), **_who(deal)}))
