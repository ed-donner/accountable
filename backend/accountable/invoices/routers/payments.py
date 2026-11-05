"""Recording a payment against an issued invoice, and deleting one entered by mistake (V15 to V18).

What's owed is read and checked inside the payment's own db.writing(), under the write lock,
so two payments recorded at the same moment can never add up to more than the total (V16).
"""

from datetime import date

from fastapi import APIRouter, HTTPException
from sqlalchemy import Connection, Row, delete, func, insert, select

from accountable import api, db
from accountable.auth import CurrentUser
from accountable.invoices import figures, schemas
from accountable.invoices.routers.invoices import detail, get_row, refuse
from accountable.invoices.tables import ISSUED, payments

router = APIRouter(prefix="/invoices")

# The fields a payment needs, with their message when one isn't sent.
_NEEDED = {"paid_on": schemas.DATE_MESSAGE, "amount_cents": schemas.AMOUNT_MESSAGE, "method": schemas.METHOD_MESSAGE}


def _paid(conn: Connection, invoice_id: int) -> int:
    return conn.execute(
        select(func.coalesce(func.sum(payments.c.amount_cents), 0)).where(payments.c.invoice_id == invoice_id)
    ).scalar_one()


def dollars(cents: int) -> str:
    """$1,250.00, as the page shows money on invoices."""
    return f"${cents // 100:,}.{cents % 100:02d}"


def _refuse_a_bad_payment(body: schemas.PaymentIn, invoice: Row, owed: int, today: date) -> None:
    problems = {field: message for field, message in _NEEDED.items() if field not in body.model_fields_set}
    paid_on, amount = body.model_dump().get("paid_on"), body.model_dump().get("amount_cents")
    if paid_on is not None and paid_on > today:
        problems["paid_on"] = schemas.DATE_IN_FUTURE
    elif paid_on is not None and paid_on < invoice.issue_date:
        problems["paid_on"] = schemas.DATE_BEFORE_ISSUE
    if amount is not None and amount > owed:
        problems["amount_cents"] = f"That's more than the {dollars(owed)} still owed"
    if problems:
        raise api.FieldError(problems)


@router.post("/{invoice_id}/payments", status_code=201)
def record_payment(
    invoice_id: api.PathId, body: schemas.PaymentIn, user: CurrentUser, today: api.Today, now: api.Now
) -> schemas.InvoiceDetail:
    with db.writing() as conn:
        invoice = get_row(conn, invoice_id)
        if invoice.status != ISSUED:
            raise refuse(schemas.NO_PAYMENT_TAKEN)
        owed = figures.owed(invoice.status, invoice.total_cents, _paid(conn, invoice_id))
        _refuse_a_bad_payment(body, invoice, owed, today)
        conn.execute(
            insert(payments).values(invoice_id=invoice_id, **body.model_dump(), created_by=user, created_at=now)
        )
        return detail(conn, invoice_id, today)


@router.delete("/{invoice_id}/payments/{payment_id}")
def delete_payment(invoice_id: api.PathId, payment_id: api.PathId, today: api.Today) -> schemas.InvoiceDetail:
    """What's owed goes back up, and a paid invoice shows as part paid, issued or overdue again (V17)."""
    with db.writing() as conn:
        get_row(conn, invoice_id)
        this_payment = (payments.c.id == payment_id) & (payments.c.invoice_id == invoice_id)
        if conn.scalar(select(payments.c.id).where(this_payment)) is None:
            raise HTTPException(404, "Payment not found")
        conn.execute(delete(payments).where(this_payment))
        return detail(conn, invoice_id, today)
