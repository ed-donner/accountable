"""Invoices' routes and their queries: the list, starting a draft, saving it, issuing it,
voiding it and deleting it (V2 to V14, V19 to V23).

Every write reads the invoice's status inside its own db.writing(), before changing anything,
so a draft a teammate has just issued is never changed (V12).
"""

from collections.abc import Callable, Sequence
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import Connection, Row, and_, delete, func, insert, or_, select, update

from accountable import api, db, who
from accountable.auth import CurrentUser
from accountable.company import documents, tax
from accountable.company.schemas import rate_text
from accountable.crm.tables import contacts, deals, organizations
from accountable.invoices import characters, figures, schemas
from accountable.invoices.tables import DRAFT, ISSUED, VOID, invoice_lines, invoices, payments
from accountable.products.tables import products
from accountable.users import person, users

router = APIRouter(prefix="/invoices")

_deal_organization = organizations.alias("deal_organization")
_issued_to = organizations.alias("issued_to")
_issuer = users.alias("issuer")
_voider = users.alias("voider")
_recorder = users.alias("recorder")

_with_links = select(
    invoices,
    deals.c.name.label("deal_name"),
    deals.c.stage.label("deal_stage"),
    deals.c.organization_id.label("deal_organization_id"),
    _deal_organization.c.name.label("deal_organization_name"),
    _issued_to.c.name.label("organization_name"),
).select_from(
    invoices.join(deals, invoices.c.deal_id == deals.c.id)
    .outerjoin(_deal_organization, deals.c.organization_id == _deal_organization.c.id)
    .outerjoin(_issued_to, invoices.c.organization_id == _issued_to.c.id)
)
_with_names = (
    who.with_names(_with_links, invoices)
    .add_columns(
        _issuer.c.name.label("issued_by_name"),
        _issuer.c.email.label("issued_by_email"),
        _voider.c.name.label("voided_by_name"),
        _voider.c.email.label("voided_by_email"),
    )
    .outerjoin(_issuer, invoices.c.issued_by == _issuer.c.id)
    .outerjoin(_voider, invoices.c.voided_by == _voider.c.id)
)


def refuse(message: str) -> HTTPException:
    """What an invoice's status doesn't allow is a 409, in the words of V10 to V16."""
    return HTTPException(409, message)


def get_row(conn: Connection, invoice_id: int) -> Row:
    row = conn.execute(_with_names.where(invoices.c.id == invoice_id)).one_or_none()
    if row is None:
        raise HTTPException(404, "Invoice not found")
    return row


def _organization(row: Any) -> schemas.Named | None:
    """A draft's is its deal's, and an issued invoice's the one it was issued to (V11)."""
    if row.status == DRAFT:
        organization_id, name = row.deal_organization_id, row.deal_organization_name
    else:
        organization_id, name = row.organization_id, row.organization_name
    return None if organization_id is None else schemas.Named(id=organization_id, name=name)


def _row_fields(row: Any, total_cents: int, paid_cents: int, today: date) -> dict[str, Any]:
    status_total = None if row.status == DRAFT else total_cents
    return {
        "id": row.id,
        "number": row.number,
        "issue_order": row.issue_order,
        "shows_as": figures.shows_as(row.status, status_total, paid_cents, row.due_date, today),
        "deal": schemas.Named(id=row.deal_id, name=row.deal_name),
        "organization": _organization(row),
        "bill_to": row.bill_to,
        "issue_date": row.issue_date,
        "due_date": row.due_date,
        "total_cents": total_cents,
        "owed_cents": figures.owed(row.status, status_total, paid_cents),
    }


def _lines(conn: Connection, invoice_id: int) -> Sequence[Row]:
    return conn.execute(
        select(invoice_lines).where(invoice_lines.c.invoice_id == invoice_id).order_by(invoice_lines.c.position)
    ).all()


def _payments(conn: Connection, invoice_id: int) -> list[schemas.Payment]:
    rows = conn.execute(
        select(payments, _recorder.c.name.label("recorder_name"), _recorder.c.email.label("recorder_email"))
        .outerjoin(_recorder, payments.c.created_by == _recorder.c.id)
        .where(payments.c.invoice_id == invoice_id)
        .order_by(payments.c.paid_on, payments.c.id)
    ).all()
    return [
        schemas.Payment.model_validate(
            {**row._mapping, "created_by": person(row.created_by, row.recorder_name, row.recorder_email)}
        )
        for row in rows
    ]


def _written_on(conn: Connection, row: Any) -> tuple[schemas.Company, str | None, int]:
    """The company and the tax: the settings as they are now on a draft, and the copies made at issue otherwise."""
    if row.status != DRAFT:
        company = schemas.Company(
            name=row.company_name, address=row.company_address, email=row.company_email, phone=row.company_phone
        )
        return company, row.tax_label, row.tax_rate
    settings = documents.current_settings(conn)
    company = schemas.Company(
        name=settings.company_name, address=settings.address, email=settings.email, phone=settings.phone
    )
    return company, settings.tax_label, settings.tax_rate


def detail(conn: Connection, invoice_id: int, today: date) -> schemas.InvoiceDetail:
    """One invoice with everything its page and its PDF show."""
    row = get_row(conn, invoice_id)
    lines = _lines(conn, invoice_id)
    paid = _payments(conn, invoice_id)
    company, tax_label, rate = _written_on(conn, row)
    if row.status == DRAFT:
        totals = figures.draft_totals(lines, rate)
    else:
        totals = tax.Totals(subtotal_cents=row.subtotal_cents, tax_cents=row.tax_cents, total_cents=row.total_cents)
    paid_cents = sum(payment.amount_cents for payment in paid)
    fields = _row_fields(row, totals.total_cents, paid_cents, today)
    return schemas.InvoiceDetail(
        **fields,
        **who.authorship(row),
        status=row.status,
        days_late=figures.days_late(fields["shows_as"], row.due_date, today),
        deal_stage=row.deal_stage,
        company=company,
        tax_label=tax_label,
        tax_rate=rate_text(rate),
        lines=[
            schemas.Line(**line._mapping, amount_cents=tax.line_amount(line.quantity, line.unit_price_cents))
            for line in lines
        ],
        subtotal_cents=totals.subtotal_cents,
        tax_cents=totals.tax_cents,
        paid_cents=paid_cents,
        payments=paid,
        issued_by=person(row.issued_by, row.issued_by_name, row.issued_by_email),
        voided_by=person(row.voided_by, row.voided_by_name, row.voided_by_email),
        voided_at=row.voided_at,
    )


def _list_query(deal_id: int | None, organization_id: int | None):
    """Every invoice with its deal, its organization, its paid total and, for a draft, its subtotal, in one query."""
    paid = (
        select(payments.c.invoice_id, func.sum(payments.c.amount_cents).label("paid"))
        .group_by(payments.c.invoice_id)
        .subquery()
    )
    # Every saved draft's subtotal is at most $1 trillion, so no line's amount can overflow (B17).
    subtotals = (
        select(
            invoice_lines.c.invoice_id,
            func.sum(invoice_lines.c.quantity * invoice_lines.c.unit_price_cents).label("subtotal"),
        )
        .group_by(invoice_lines.c.invoice_id)
        .subquery()
    )
    query = (
        _with_links.add_columns(
            func.coalesce(paid.c.paid, 0).label("paid"), func.coalesce(subtotals.c.subtotal, 0).label("subtotal")
        )
        .outerjoin(paid, paid.c.invoice_id == invoices.c.id)
        .outerjoin(subtotals, subtotals.c.invoice_id == invoices.c.id)
        .order_by(invoices.c.id.desc())
    )
    if deal_id is not None:
        query = query.where(invoices.c.deal_id == deal_id)
    if organization_id is not None:
        # Those issued to it, and the drafts on its deals (V21).
        query = query.where(
            or_(
                invoices.c.organization_id == organization_id,
                and_(invoices.c.status == DRAFT, deals.c.organization_id == organization_id),
            )
        )
    return query


@router.get("")
def list_invoices(
    today: api.Today, deal_id: api.QueryId = None, organization_id: api.QueryId = None
) -> list[schemas.InvoiceRow]:
    """Every invoice, newest first, or a deal's or an organization's, for its panel (V20, V21, V22)."""
    with db.reading() as conn:
        rows = conn.execute(_list_query(deal_id, organization_id)).all()
        rate = documents.current_settings(conn).tax_rate
    replies = []
    for row in rows:
        total = row.subtotal + tax.tax_on(row.subtotal, rate) if row.status == DRAFT else row.total_cents
        replies.append(schemas.InvoiceRow(**_row_fields(row, total, row.paid, today)))
    return replies


@router.post("", status_code=201)
def start_invoice(body: schemas.NewInvoice, user: CurrentUser, today: api.Today, now: api.Now) -> schemas.InvoiceDetail:
    with db.writing() as conn:
        deal = conn.execute(
            select(
                deals,
                organizations.c.name.label("organization_name"),
                contacts.c.name.label("contact_name"),
                contacts.c.email.label("contact_email"),
            )
            .outerjoin(organizations, deals.c.organization_id == organizations.c.id)
            .outerjoin(contacts, deals.c.main_contact_id == contacts.c.id)
            .where(deals.c.id == body.deal_id)
        ).one_or_none()
        if deal is None:
            raise api.FieldError({"deal_id": schemas.DEAL_MESSAGE})
        if deal.stage != "won":
            raise refuse(schemas.NOT_WON)
        new_id = conn.execute(
            insert(invoices)
            .values(
                deal_id=deal.id,
                status=DRAFT,
                bill_to=figures.bill_to(deal.organization_name, deal.contact_name, deal.contact_email),
                **who.added(user, now),
            )
            .returning(invoices.c.id)
        ).scalar_one()
        return detail(conn, new_id, today)


@router.get("/{invoice_id}")
def get_invoice(invoice_id: api.PathId, today: api.Today) -> schemas.InvoiceDetail:
    with db.reading() as conn:
        return detail(conn, invoice_id, today)


def _draft(conn: Connection, invoice_id: int) -> Row:
    """The invoice, if it's still a draft (V12)."""
    row = get_row(conn, invoice_id)
    if row.status != DRAFT:
        raise refuse(schemas.ISSUED)
    return row


def _resolved_lines(conn: Connection, invoice_id: int, sent: list[schemas.DraftLine]) -> list[dict[str, Any]]:
    """The lines as they'll be saved: a saved line keeps its product and name, and a new one takes its product's (V6)."""
    saved = {line.id: line for line in _lines(conn, invoice_id)}
    wanted = [line.product_id for line in sent if line.id not in saved and line.product_id is not None]
    on_the_price_list = {
        product.id: product
        for product in conn.execute(select(products).where(products.c.id.in_(wanted), products.c.active))
    }
    resolved, problems, kept = [], {}, set()
    for place, line in enumerate(sent):
        given = line.model_dump(exclude={"id", "product_id"})
        if line.id in saved and line.id not in kept:
            kept.add(line.id)
            start = saved[line.id]._mapping
        elif line.product_id in on_the_price_list:
            product = on_the_price_list[line.product_id]
            start = {
                "id": None,
                "product_id": product.id,
                "name": product.name,
                "description": product.description,
                "quantity": 1,
                "unit_price_cents": product.unit_price_cents,
            }
        else:
            problems[f"lines.{place}.product_id"] = schemas.PRODUCT_MESSAGE
            continue
        resolved.append(
            {
                "id": start["id"],
                "product_id": start["product_id"],
                "name": start["name"],
                "description": given.get("description", start["description"]),
                "quantity": given.get("quantity", start["quantity"]),
                "unit_price_cents": given.get("unit_price_cents", start["unit_price_cents"]),
            }
        )
    if problems:
        raise api.FieldError(problems)
    return resolved


def _check_subtotal(lines: list[dict[str, Any]]) -> None:
    subtotal = sum(tax.line_amount(line["quantity"], line["unit_price_cents"]) for line in lines)
    if subtotal > tax.MAX_SUBTOTAL_CENTS:
        raise api.FieldError({"subtotal": tax.SUBTOTAL_MESSAGE})


def _text_problem(value: str | None, fits: Callable[[str | None], bool], too_long: str) -> str | None:
    if not fits(value):
        return too_long
    found = characters.unprintable(value)
    return characters.field_message(found) if found else None


def _check_text(bill_to: str | None, lines: list[dict[str, Any]]) -> None:
    """Every save of a draft, whatever sends it, holds a Bill to and descriptions within their
    limits and only what the invoice's fonts can draw (V8, V9). They're checked as they'll be
    saved, so a Bill to filled in from the deal, or a description taken from a product, is too."""
    problems = {}
    if problem := _text_problem(bill_to, schemas.bill_to_fits, schemas.BILL_TO_TOO_LONG):
        problems["bill_to"] = problem
    for place, line in enumerate(lines):
        if problem := _text_problem(line["description"], schemas.description_fits, schemas.DESCRIPTION_TOO_LONG):
            problems[f"lines.{place}.description"] = problem
        if found := characters.unprintable(line["name"]):
            problems[f"lines.{place}.name"] = characters.line_name_message(found)
    if problems:
        raise api.FieldError(problems)


_LINE_FIELDS = ("product_id", "name", "description", "quantity", "unit_price_cents")


def _same_lines(saved: Sequence[Row], lines: list[dict[str, Any]]) -> bool:
    def written(line: Any) -> tuple:
        return (line["id"], *(line[field] for field in _LINE_FIELDS))

    return [written(row._mapping) for row in saved] == [written(line) for line in lines]


def _write_lines(conn: Connection, invoice_id: int, lines: list[dict[str, Any]], now: datetime) -> None:
    """Saved lines are changed in place, so each keeps its id and the name it was added with."""
    kept = [line["id"] for line in lines if line["id"] is not None]
    conn.execute(delete(invoice_lines).where(invoice_lines.c.invoice_id == invoice_id, invoice_lines.c.id.not_in(kept)))
    for position, line in enumerate(lines, start=1):
        values = {field: line[field] for field in ("description", "quantity", "unit_price_cents")}
        if line["id"] is None:
            conn.execute(
                insert(invoice_lines).values(
                    invoice_id=invoice_id,
                    position=position,
                    product_id=line["product_id"],
                    name=line["name"],
                    created_at=now,
                    **values,
                )
            )
        else:
            conn.execute(
                update(invoice_lines).where(invoice_lines.c.id == line["id"]).values(position=position, **values)
            )


def _save_draft(conn: Connection, draft: Row, body: schemas.Draft, user: str, now: datetime) -> None:
    """The Bill to and the lines, checked and saved. A save that alters nothing isn't a change (U10)."""
    sent = body.model_dump(exclude_unset=True, include={"bill_to"})
    saved_lines = _lines(conn, draft.id)
    if "lines" in body.model_fields_set and isinstance(body.lines, list):
        lines = _resolved_lines(conn, draft.id, body.lines)
    else:
        lines = [dict(row._mapping) for row in saved_lines]
    _check_subtotal(lines)
    _check_text(sent.get("bill_to", draft.bill_to), lines)
    altered = who.alterations(sent, draft)
    lines_altered = not _same_lines(saved_lines, lines)
    if lines_altered:
        _write_lines(conn, draft.id, lines, now)
    if altered or lines_altered:
        conn.execute(update(invoices).where(invoices.c.id == draft.id).values(**altered, **who.changed(user, now)))


@router.patch("/{invoice_id}")
def save_draft(
    invoice_id: api.PathId, body: schemas.Draft, user: CurrentUser, today: api.Today, now: api.Now
) -> schemas.InvoiceDetail:
    with db.writing() as conn:
        _save_draft(conn, _draft(conn, invoice_id), body, user, now)
        return detail(conn, invoice_id, today)


# The company's details that issuing copies (V11), as V10's message names them.
_COPIED_DETAILS = {
    "company_name": "company name",
    "address": "address",
    "email": "email",
    "phone": "phone",
    "tax_label": "tax label",
}


def _company_problem(settings: Row) -> str | None:
    """Company settings take any characters (B4), so issuing is the one place they're checked (V10)."""
    if not settings.company_name:
        return schemas.NO_COMPANY_NAME
    for field, words in _COPIED_DETAILS.items():
        if found := characters.unprintable(getattr(settings, field)):
            return characters.company_message(words, found)
    return None


def _refuse_what_cant_be_issued(draft: Row, lines: Sequence[Row], settings: Row) -> None:
    """Each reason in V10: beside its field, or at the top of the form for the draft as a whole."""
    problems = {}
    if not draft.bill_to:
        problems["bill_to"] = schemas.BILL_TO_BLANK
    if not lines:
        problems["lines"] = schemas.NO_LINES
    if lines and tax.totals(lines, settings.tax_rate).total_cents == 0:
        problems["form"] = schemas.NOTHING_TO_PAY
    elif draft.deal_organization_id is None:
        problems["form"] = schemas.NO_ORGANIZATION
    elif company := _company_problem(settings):
        problems["form"] = company
    if problems:
        raise api.FieldError(problems)


def _issue(conn: Connection, invoice_id: int, user: str, today: date, now: datetime) -> None:
    """The steps in Backend rules: the checks, the number, the dates, the copies and the figures (V11)."""
    draft = get_row(conn, invoice_id)
    lines = _lines(conn, invoice_id)
    settings = documents.current_settings(conn)
    _refuse_what_cant_be_issued(draft, lines, settings)
    totals = tax.totals(lines, settings.tax_rate)
    # Taken last, inside this transaction, so a refusal above takes none and a failure gives it back (B15).
    taken = documents.take(conn, "invoice")
    conn.execute(
        update(invoices)
        .where(invoices.c.id == invoice_id)
        .values(
            status=ISSUED,
            number=taken.number,
            issue_order=taken.count,
            issue_date=today,
            due_date=today + timedelta(days=settings.payment_terms_days),
            organization_id=draft.deal_organization_id,
            company_name=settings.company_name,
            company_address=settings.address,
            company_email=settings.email,
            company_phone=settings.phone,
            tax_label=settings.tax_label,
            tax_rate=settings.tax_rate,
            subtotal_cents=totals.subtotal_cents,
            tax_cents=totals.tax_cents,
            total_cents=totals.total_cents,
            issued_by=user,
            **who.changed(user, now),
        )
    )


@router.post("/{invoice_id}/issue")
def issue_invoice(
    invoice_id: api.PathId, body: schemas.Draft, user: CurrentUser, today: api.Today, now: api.Now
) -> schemas.InvoiceDetail:
    """Saves the draft and issues it in one transaction, so a refusal leaves it as it was (V10)."""
    with db.writing() as conn:
        _save_draft(conn, _draft(conn, invoice_id), body, user, now)
        _issue(conn, invoice_id, user, today, now)
        return detail(conn, invoice_id, today)


@router.post("/{invoice_id}/void")
def void_invoice(invoice_id: api.PathId, user: CurrentUser, today: api.Today, now: api.Now) -> schemas.InvoiceDetail:
    with db.writing() as conn:
        row = get_row(conn, invoice_id)
        if row.status == DRAFT:
            raise refuse(schemas.DRAFTS_ARENT_VOIDED)
        if row.status == VOID:
            raise refuse(schemas.ALREADY_VOID)
        if conn.scalar(select(func.count()).select_from(payments).where(payments.c.invoice_id == invoice_id)):
            raise refuse(schemas.HAS_PAYMENTS)
        conn.execute(
            update(invoices)
            .where(invoices.c.id == invoice_id)
            .values(status=VOID, voided_by=user, voided_at=now, **who.changed(user, now))
        )
        return detail(conn, invoice_id, today)


@router.delete("/{invoice_id}", status_code=204)
def delete_draft(invoice_id: api.PathId) -> None:
    """Only a draft, which has no number, so the numbers never have a gap (V8, V11)."""
    with db.writing() as conn:
        _draft(conn, invoice_id)
        conn.execute(delete(invoices).where(invoices.c.id == invoice_id))
