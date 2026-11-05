"""The quotes' routes and their queries (Q5 to Q37).

Each write runs in one db.writing(), under the write lock, and checks the quote's status and its
deal's stage inside it, so a teammate's send or a move on the board can't slip in between the
check and the write (Q21). Every amount is worked out here from the lines, never taken from the
request (Q15). Quotes are never deleted, so there's no delete route, and DELETE gets a 405 (Q26).
"""

from dataclasses import replace
from datetime import date, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import MISSING
from sqlalchemy import Connection, Row, insert, select, update

from accountable import api, db, who
from accountable.auth import CurrentUser
from accountable.company import pdf, tax
from accountable.company.documents import current_logo, current_settings, take_number
from accountable.company.lines import LineToSave, same_lines, write_lines
from accountable.crm import rules
from accountable.crm.tables import deals, organizations
from accountable.products.tables import products
from accountable.quotes import document, schemas
from accountable.quotes.tables import quote_lines, quotes

router = APIRouter(prefix="/quotes")

VALID_FOR = timedelta(days=30)
"""How long a new quote holds, from its date (Q9)."""

OptionalId = Annotated[int | None, Query(ge=1, le=api.MAX_ID)]

# A quote with who added and changed it, and its deal, so a quote's page takes few reads.
_with_deal = document.with_deal(who.with_names(select(quotes), quotes))


def _get(conn: Connection, quote_id: int) -> Row:
    row = conn.execute(_with_deal.where(quotes.c.id == quote_id)).one_or_none()
    if row is None:
        raise HTTPException(404, "Quote not found")
    return row


def _detail(conn: Connection, quote: Row) -> schemas.QuoteDetail:
    return schemas.QuoteDetail(
        **document.document(conn, quote).model_dump(),
        **who.authorship(quote),
        id=quote.id,
        status=quote.status,
        deal=schemas.DealLink(id=quote.deal_id, name=quote.deal_name, stage=quote.deal_stage),
        sent_on=quote.sent_on,
        decided_on=quote.decided_on,
    )


def _refuse_unless_draft(quote: Row) -> None:
    if quote.status != "draft":
        raise HTTPException(409, schemas.cant_change(quote.number, quote.status))


def _refuse_if_closed(stage: str, message: str) -> None:
    if stage not in rules.OPEN_STAGES:
        raise HTTPException(409, message)


def _check_valid_until(valid_until: date, quote_date: date) -> None:
    if valid_until < quote_date:
        raise api.FieldError({"valid_until": schemas.BEFORE_THE_QUOTE_DATE})


def _lines_to_save(conn: Connection, quote_id: int | None, sent: list[schemas.LineIn]) -> list[LineToSave]:
    """The lines as sent, each kept line with its own product and name, and each new one with its
    product's name, which has to be an active product (Q11, Q13). Refuses beside each bad line."""
    current = {row.id: row for row in document.lines_of(conn, quote_id)} if quote_id is not None else {}
    wanted = {line.product_id for line in sent if line.id is None and line.product_id is not None}
    found = {row.id: row for row in conn.execute(select(products).where(products.c.id.in_(wanted)))}
    problems: dict[str, str] = {}
    lines: list[LineToSave] = []
    for place, line in enumerate(sent):
        if line.id is not None:
            kept = current.pop(line.id, None)
            if kept is None:
                problems[f"lines.{place}.id"] = schemas.NOT_ON_THE_QUOTE
                continue
            product_id, name = kept.product_id, kept.name
        else:
            product = found.get(line.product_id) if line.product_id is not None else None
            if product is None or not product.active:
                problems[f"lines.{place}.product_id"] = (
                    schemas.ARCHIVED_PRODUCT if product else schemas.CHOOSE_A_PRODUCT
                )
                continue
            product_id, name = product.id, product.name
        lines.append(LineToSave(line.id, product_id, name, line.description, line.quantity, line.unit_price_cents))
    if problems:
        raise api.FieldError(problems)
    return lines


def _subtotal(lines: list[LineToSave]) -> int:
    """The lines' amounts added up, refused past $1 trillion before anything is written (Q14, B17)."""
    subtotal = tax.subtotal(lines)
    if subtotal > tax.MAX_SUBTOTAL_CENTS:
        raise api.FieldError({"lines": tax.SUBTOTAL_MESSAGE})
    return subtotal


def _add(
    conn: Connection,
    deal_id: int,
    valid_until: date,
    lines: list[LineToSave],
    *,
    user: str,
    today: date,
    now: datetime,
) -> int:
    """A new draft, which takes its number in this same save, so a save that fails gives it back (B15)."""
    subtotal = _subtotal(lines)
    quote_id = conn.execute(
        insert(quotes)
        .values(
            number=take_number(conn, "quote"),
            deal_id=deal_id,
            status="draft",
            quote_date=today,
            valid_until=valid_until,
            subtotal_cents=subtotal,
            **who.added(user, now),
        )
        .returning(quotes.c.id)
    ).scalar_one()
    write_lines(conn, quote_lines.c.quote_id, quote_id, lines, now)
    return quote_id


@router.get("")
def list_quotes(deal_id: OptionalId = None, organization_id: OptionalId = None) -> list[schemas.QuoteRow]:
    """Every quote, newest first, or one deal's, or those on one organization's deals (Q33, Q36, Q37).
    A draft's tax follows the settings, and any other quote's is its own (Q17)."""
    query = (
        select(
            quotes,
            deals.c.name.label("deal_name"),
            deals.c.stage.label("deal_stage"),
            deals.c.organization_id,
            organizations.c.name.label("organization_name"),
        )
        .join(deals, quotes.c.deal_id == deals.c.id)
        .outerjoin(organizations, deals.c.organization_id == organizations.c.id)
        .order_by(quotes.c.id.desc())
    )
    if deal_id is not None:
        query = query.where(quotes.c.deal_id == deal_id)
    if organization_id is not None:
        query = query.where(deals.c.organization_id == organization_id)
    with db.reading() as conn:
        rate_now = current_settings(conn).tax_rate
        rows = conn.execute(query).all()
    return [_row(row, rate_now if row.status == "draft" else row.tax_rate) for row in rows]


def _row(row: Row, rate: int) -> schemas.QuoteRow:
    sums = tax.on_subtotal(row.subtotal_cents, rate)
    return schemas.QuoteRow(**row._mapping, tax_cents=sums.tax_cents, total_cents=sums.total_cents)


@router.get("/new/{deal_id}")
def new_quote(deal_id: api.PathId) -> schemas.NewQuote:
    with db.reading() as conn:
        return document.new_document(conn, deal_id)


@router.post("", status_code=201)
def add_quote(body: schemas.QuoteCreate, user: CurrentUser, today: api.Today, now: api.Now) -> schemas.QuoteDetail:
    """A draft on an open deal, dated today and valid for 30 days unless a date is sent (Q9, Q10)."""
    valid_until = body.valid_until or today + VALID_FOR
    _check_valid_until(valid_until, today)
    with db.writing() as conn:
        stage = conn.scalar(select(deals.c.stage).where(deals.c.id == body.deal_id))
        if stage is None:
            raise api.FieldError({"deal_id": schemas.FIELD_MESSAGES["deal_id"]})
        _refuse_if_closed(stage, schemas.DEAL_CLOSED_FOR_NEW)
        lines = _lines_to_save(conn, None, body.lines)
        quote_id = _add(conn, body.deal_id, valid_until, lines, user=user, today=today, now=now)
        return _detail(conn, _get(conn, quote_id))


@router.get("/{quote_id}")
def get_quote(quote_id: api.PathId) -> schemas.QuoteDetail:
    with db.reading() as conn:
        return _detail(conn, _get(conn, quote_id))


@router.patch("/{quote_id}")
def save_quote(quote_id: api.PathId, body: schemas.QuoteUpdate, user: CurrentUser, now: api.Now) -> schemas.QuoteDetail:
    """A draft's valid-until date and lines. A save that changes nothing isn't a change (U10)."""
    with db.writing() as conn:
        quote = _get(conn, quote_id)
        _refuse_unless_draft(quote)
        fields: dict[str, Any] = {}
        if body.valid_until is not MISSING:
            _check_valid_until(body.valid_until, quote.quote_date)
            fields["valid_until"] = body.valid_until
        lines_changed = False
        if body.lines is not MISSING:
            lines = _lines_to_save(conn, quote_id, body.lines)
            fields["subtotal_cents"] = _subtotal(lines)
            lines_changed = not same_lines(document.lines_of(conn, quote_id), lines)
            if lines_changed:
                write_lines(conn, quote_lines.c.quote_id, quote_id, lines, now)
        altered = who.alterations(fields, quote)
        if altered or lines_changed:
            conn.execute(update(quotes).where(quotes.c.id == quote_id).values(**altered, **who.changed(user, now)))
        return _detail(conn, _get(conn, quote_id))


def _refuse_what_stops_sending(conn: Connection, quote: Row, today: date) -> None:
    """Q20's checks, in its order. The date's refusal goes beside the date."""
    _refuse_if_closed(quote.deal_stage, schemas.DEAL_CLOSED_FOR_SENDING)
    if quote.deal_organization_id is None:
        raise HTTPException(409, schemas.NO_ORGANIZATION)
    if not document.lines_of(conn, quote.id):
        raise HTTPException(409, schemas.NO_LINES)
    if quote.valid_until < today:
        raise api.FieldError({"valid_until": schemas.VALID_UNTIL_PASSED})


@router.post("/{quote_id}/send")
def send_quote(quote_id: api.PathId, user: CurrentUser, today: api.Today, now: api.Now) -> schemas.QuoteDetail:
    """Fixes the company's details, the tax and Prepared for on the quote as they are now (Q20)."""
    with db.writing() as conn:
        quote = _get(conn, quote_id)
        _refuse_unless_draft(quote)
        _refuse_what_stops_sending(conn, quote, today)
        details = document.fixed_details(conn, quote.deal_id)
        if details["company_name"] is None:
            raise HTTPException(409, schemas.NO_COMPANY_NAME)
        conn.execute(
            update(quotes)
            .where(quotes.c.id == quote_id)
            .values(status="sent", sent_on=today, **details, **who.changed(user, now))
        )
        return _detail(conn, _get(conn, quote_id))


@router.post("/{quote_id}/decline")
def decline_quote(quote_id: api.PathId, user: CurrentUser, today: api.Today, now: api.Now) -> schemas.QuoteDetail:
    """A draft or a sent quote, whatever its deal's stage. A declined draft has its details fixed
    as sending would fix them, so only drafts follow the settings and the deal (Q24)."""
    with db.writing() as conn:
        quote = _get(conn, quote_id)
        if quote.status not in ("draft", "sent"):
            raise HTTPException(409, schemas.cant_change(quote.number, quote.status))
        fixed = document.fixed_details(conn, quote.deal_id) if quote.status == "draft" else {}
        conn.execute(
            update(quotes)
            .where(quotes.c.id == quote_id)
            .values(status="declined", decided_on=today, **fixed, **who.changed(user, now))
        )
        return _detail(conn, _get(conn, quote_id))


def _refuse_what_stops_accepting(conn: Connection, quote: Row) -> None:
    if quote.status == "draft":
        raise HTTPException(409, schemas.not_sent_yet(quote.number))
    if quote.status != "sent":
        raise HTTPException(409, schemas.cant_change(quote.number, quote.status))
    _refuse_if_closed(quote.deal_stage, schemas.DEAL_CLOSED_FOR_ACCEPTING)
    on_the_deal = quotes.c.deal_id == quote.deal_id
    accepted = conn.scalar(select(quotes.c.number).where(on_the_deal, quotes.c.status == "accepted"))
    if accepted is not None:
        raise HTTPException(409, schemas.already_accepted(accepted))


@router.post("/{quote_id}/accept")
def accept_quote(quote_id: api.PathId, user: CurrentUser, today: api.Today, now: api.Now) -> schemas.Accepted:
    """Accepts the quote, declines the deal's other sent quotes, and wins the deal through the stage
    rules with the quote's value in whole dollars, halves rounding up, all in one save (Q22)."""
    with db.writing() as conn:
        quote = _get(conn, quote_id)
        _refuse_what_stops_accepting(conn, quote)
        others = quotes.c.deal_id == quote.deal_id, quotes.c.status == "sent", quotes.c.id != quote_id
        declined = list(conn.scalars(select(quotes.c.number).where(*others).order_by(quotes.c.id)))
        decided = {"decided_on": today, **who.changed(user, now)}
        conn.execute(update(quotes).where(*others).values(status="declined", **decided))
        conn.execute(update(quotes).where(quotes.c.id == quote_id).values(status="accepted", **decided))
        value = (quote.subtotal_cents + 50) // 100
        won = rules.change_stage(conn, quote.deal_id, "won", today=today, now=now, user_id=user, value=value)
        return schemas.Accepted(
            quote=_detail(conn, _get(conn, quote_id)),
            deal=schemas.AcceptedDeal(id=quote.deal_id, name=quote.deal_name, value=value),
            changes=schemas.AcceptChanges(close_date=won.close_date, new_customer=won.new_customer, declined=declined),
        )


@router.post("/{quote_id}/copy", status_code=201)
def copy_quote(quote_id: api.PathId, user: CurrentUser, today: api.Today, now: api.Now) -> schemas.QuoteDetail:
    """A new draft on the same open deal with the same lines, an archived product's included,
    because they're copied rather than added from the price list. The original doesn't change (Q25)."""
    with db.writing() as conn:
        original = _get(conn, quote_id)
        _refuse_if_closed(original.deal_stage, schemas.DEAL_CLOSED_FOR_NEW)
        lines = [replace(LineToSave.saved(row), id=None) for row in document.lines_of(conn, quote_id)]
        copy_id = _add(conn, original.deal_id, today + VALID_FOR, lines, user=user, today=today, now=now)
        return _detail(conn, _get(conn, copy_id))


@router.get("/{quote_id}/pdf")
def quote_pdf(quote_id: api.PathId) -> Response:
    """Made now, from the quote as saved, in the design, accent color and logo Company settings
    have at this moment, as an invoice's is (Q30, Q31)."""
    with db.reading() as conn:
        quote = _get(conn, quote_id)
        doc = document.document(conn, quote)
        logo = current_logo(conn)
        look = pdf.look(current_settings(conn), logo)
    draft = quote.status == "draft"
    if draft and doc.company.name is None:
        raise HTTPException(409, schemas.NO_COMPANY_NAME)
    return pdf.download(document.layout_values(doc, look, draft=draft), logo)
