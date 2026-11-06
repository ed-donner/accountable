"""The bills routes, the Money section's figures, and their queries (E1 to E24).

Replies never say whether a bill is overdue: the page works that out from the due date
and its own today, so a bill turns overdue at midnight with nobody saving it (E8).
"""

from collections.abc import Generator, Iterable, Mapping, Sequence
from contextlib import contextmanager
from datetime import date, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import Connection, Row, delete, insert, select, update
from sqlalchemy.exc import IntegrityError

from accountable import api, db, who
from accountable.auth import CurrentUser
from accountable.bills import books, schemas
from accountable.bills.tables import CATEGORIES, bill_number_key, bills
from accountable.crm.tables import organizations
from accountable.months import last_months, month_key

router = APIRouter(prefix="/bills")

# Fixed, not the company's payment terms, which are what our customers get (E5).
DUE_AFTER = timedelta(days=30)
# The Money section's timeline runs from today to this many days on, both days included (E22).
DUE_WITHIN = timedelta(days=30)

# Worked out in every query, so a total can never disagree with its parts (E4).
_total = (bills.c.amount_cents + bills.c.tax_cents).label("total_cents")
_rows = select(
    *(column for column in bills.c if column is not bills.c.bill_number_key),
    organizations.c.name.label("supplier_name"),
    _total,
).join(organizations, organizations.c.id == bills.c.organization_id)
_with_names = who.with_names(_rows, bills)

SupplierId = Annotated[int | None, Query(ge=1, le=api.MAX_ID)]


def _fields(row: Row) -> dict[str, Any]:
    return {**row._mapping, "organization": schemas.Supplier(id=row.organization_id, name=row.supplier_name)}


def _get(conn: Connection, bill_id: int) -> Row:
    row = conn.execute(_with_names.where(bills.c.id == bill_id)).one_or_none()
    if row is None:
        raise HTTPException(404, "Bill not found")
    return row


def _detail(row: Row) -> schemas.BillDetail:
    return schemas.BillDetail(**{**_fields(row), **who.authorship(row)})


def due_date_for(bill_date: date) -> date:
    """30 days after the bill date, or the calendar's last day for a bill dated within 30 days of it."""
    return bill_date + DUE_AFTER if bill_date <= date.max - DUE_AFTER else date.max


def _number_taken(conn: Connection, organization_id: int, number: str, bill_id: int | None) -> bool:
    """A bill's own number doesn't count, so it can change its case."""
    query = select(bills.c.id).where(
        bills.c.organization_id == organization_id, bills.c.bill_number_key == bill_number_key(number)
    )
    if bill_id is not None:
        query = query.where(bills.c.id != bill_id)
    return conn.execute(query).first() is not None


def _number_problems(conn: Connection, bill: Mapping[str, Any], bill_id: int | None) -> dict[str, str]:
    if _number_taken(conn, bill["organization_id"], bill["bill_number"], bill_id):
        return {"bill_number": schemas.NUMBER_TAKEN}
    return {}


def _supplier_problems(conn: Connection, bill: Mapping[str, Any], bill_id: int | None) -> dict[str, str]:
    """A supplier that's gone is refused here, before the database's foreign key would turn it into a 500."""
    if conn.execute(select(organizations.c.id).where(organizations.c.id == bill["organization_id"])).first() is None:
        return {"organization_id": schemas.SUPPLIER_MESSAGE}
    return _number_problems(conn, bill, bill_id)


def _date_problems(bill: Mapping[str, Any], today: date) -> dict[str, str]:
    problems = {}
    if bill["due_date"] < bill["bill_date"]:
        problems["due_date"] = schemas.DUE_BEFORE_BILL
    paid_on = bill["paid_on"]
    if paid_on is not None and paid_on > today:
        problems["paid_on"] = schemas.PAID_IN_FUTURE
    elif paid_on is not None and paid_on < bill["bill_date"]:
        problems["paid_on"] = schemas.PAID_BEFORE_BILL
    return problems


def _check(conn: Connection, bill: Mapping[str, Any], today: date, bill_id: int | None = None) -> None:
    """Checks the bill as it would be after the save, so a paid date is checked against a
    bill date changed in the same save, and a number against the supplier it will have (E16).
    It runs inside the write lock, so the usual case never reaches the unique index."""
    problems = {**_supplier_problems(conn, bill, bill_id), **_date_problems(bill, today)}
    if problems:
        raise api.FieldError(problems)


@contextmanager
def _numbers_kept_unique(bill_id: int | None = None) -> Generator[dict[str, Any]]:
    """Gives the unique index's refusal the same message as the check (E3).

    The save puts the bill it's about to write in the dict this yields. The write lock is
    the app's own, so only a change from outside it, such as a second copy of the app,
    could get past the check to the index. Postgres aborts the transaction when the index
    refuses, so this reads who has the number afresh, once the save has rolled back. A
    refusal for any other reason stays a crash.
    """
    saving: dict[str, Any] = {}
    try:
        yield saving
    except IntegrityError as refusal:
        if not saving:
            raise
        with db.reading() as conn:
            taken = _number_taken(conn, saving["organization_id"], saving["bill_number"], bill_id)
        if not taken:
            raise
        raise api.FieldError({"bill_number": schemas.NUMBER_TAKEN}) from refusal


@router.get("")
def list_bills(organization_id: SupplierId = None) -> list[schemas.BillRow]:
    """Every bill, or one organization's for its Bills panel (E19), by due date."""
    query = _rows.order_by(bills.c.due_date, bills.c.id)
    if organization_id is not None:
        query = query.where(bills.c.organization_id == organization_id)
    with db.reading() as conn:
        rows = conn.execute(query).all()
    return [schemas.BillRow(**_fields(row)) for row in rows]


@router.post("", status_code=201)
def add_bill(body: schemas.BillCreate, user: CurrentUser, now: api.Now, today: api.Today) -> schemas.BillDetail:
    bill = body.model_dump()
    if bill["due_date"] is None:
        bill["due_date"] = due_date_for(bill["bill_date"])
    with _numbers_kept_unique() as saving, db.writing() as conn:
        _check(conn, bill, today)
        saving.update(bill)
        values = {**bill, "bill_number_key": bill_number_key(bill["bill_number"]), **who.added(user, now)}
        new_id = conn.execute(insert(bills).values(**values).returning(bills.c.id)).scalar_one()
        books.added(conn, new_id, bill, user, now)
        return _detail(_get(conn, new_id))


# The Money section (E20 to E23). Declared before /{bill_id}, so "dashboard" is never read as an id.


def _figure(owing: Sequence[Row]) -> schemas.Figure:
    return schemas.Figure(total_cents=sum(bill.total_cents for bill in owing), count=len(owing))


def spending(dated: Iterable[Row], today: date) -> list[schemas.SpendingMonth]:
    """Each of the last 12 months' bills by category, in the month of their bill date, paid or not (E23).

    Folded here rather than grouped by the database, because grouping by month needs date
    functions that differ between SQLite and Postgres. A bill dated after this month is left out.
    """
    months = [
        schemas.SpendingMonth(
            month=month.key, label=month.label, total_cents=0, categories=dict.fromkeys(CATEGORIES, 0)
        )
        for month in last_months(today)
    ]
    by_month = {month.month: month for month in months}
    for bill in dated:
        month = by_month.get(month_key(bill.bill_date))
        if month is not None:
            month.total_cents += bill.total_cents
            month.categories[bill.category] += bill.total_cents
    return months


@router.get("/dashboard")
def money(today: api.Today) -> schemas.Money:
    """What we owe, what's overdue and what's due in the next 30 days, from one read of the
    unpaid bills, and the 12 months' spending from a second, with tax counted in each (E20)."""
    since = date.fromisoformat(f"{last_months(today)[0].key}-01")
    with db.reading() as conn:
        unpaid = conn.execute(
            select(
                bills.c.id,
                organizations.c.name.label("supplier"),
                bills.c.bill_number,
                bills.c.due_date,
                bills.c.category,
                _total,
            )
            .join(organizations, organizations.c.id == bills.c.organization_id)
            .where(bills.c.paid_on.is_(None))
            .order_by(bills.c.due_date, bills.c.id)
        ).all()
        dated = conn.execute(
            select(bills.c.bill_date, bills.c.category, _total).where(bills.c.bill_date >= since)
        ).all()

    due = [bill for bill in unpaid if today <= bill.due_date <= today + DUE_WITHIN]
    return schemas.Money(
        today=today,
        owed=_figure(unpaid),
        overdue=_figure([bill for bill in unpaid if bill.due_date < today]),
        due=schemas.Due(**_figure(due).model_dump(), bills=[schemas.DueBill(**bill._mapping) for bill in due]),
        months=spending(dated, today),
    )


@router.get("/{bill_id}")
def get_bill(bill_id: api.PathId) -> schemas.BillDetail:
    with db.reading() as conn:
        return _detail(_get(conn, bill_id))


@router.patch("/{bill_id}")
def edit_bill(
    bill_id: api.PathId, body: schemas.BillUpdate, user: CurrentUser, now: api.Now, today: api.Today
) -> schemas.BillDetail:
    """Marking a bill paid or unpaid is a change like any other (E12), and a save that alters nothing writes nothing."""
    fields = body.model_dump(exclude_unset=True)
    with _numbers_kept_unique(bill_id) as saving, db.writing() as conn:
        current = _get(conn, bill_id)
        altered = who.alterations(fields, current)
        if altered:
            bill = {**current._mapping, **altered}
            _check(conn, bill, today, bill_id)
            saving.update(bill)
            if "bill_number" in altered:
                altered["bill_number_key"] = bill_number_key(altered["bill_number"])
            conn.execute(update(bills).where(bills.c.id == bill_id).values(**altered, **who.changed(user, now)))
            books.changed(conn, bill_id, current._mapping, bill, user, now)
        return _detail(_get(conn, bill_id))


@router.delete("/{bill_id}", status_code=204)
def delete_bill(bill_id: api.PathId, user: CurrentUser, now: api.Now) -> None:
    """Nothing is deleted with a bill, and nothing points at one (E17), but its entries are reversed (E25)."""
    with db.writing() as conn:
        _get(conn, bill_id)
        books.deleted(conn, bill_id, user, now)
        conn.execute(delete(bills).where(bills.c.id == bill_id))
