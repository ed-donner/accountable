"""The books' reads (J12): a balance on a date, totals by month and the entries behind a figure.

Each is a fixed few queries however many entries there are (J14). The database groups by day and
account, which needs no date functions, and Python folds the days into months. Nothing here writes,
so POST, PATCH and DELETE get FastAPI's 405 (J6).
"""

from collections import defaultdict
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import Connection, exists, func, select

from accountable import api, db, months
from accountable.books import accounts, schemas
from accountable.books.tables import journal_entries, journal_lines
from accountable.users import person, users

router = APIRouter(prefix="/books")

_Totals = dict[str, tuple[int, int]]
_reversal = journal_entries.alias("reversal")


def _by_account(conn: Connection, *, until: date | None = None, before: date | None = None) -> _Totals:
    """Each account's debits and credits over the entries dated up to `until`, or before `before`."""
    query = (
        select(
            journal_lines.c.account,
            func.coalesce(func.sum(journal_lines.c.debit_cents), 0),
            func.coalesce(func.sum(journal_lines.c.credit_cents), 0),
        )
        .join(journal_entries, journal_entries.c.id == journal_lines.c.entry_id)
        .group_by(journal_lines.c.account)
    )
    if until is not None:
        query = query.where(journal_entries.c.entry_date <= until)
    if before is not None:
        query = query.where(journal_entries.c.entry_date < before)
    return {key: (int(debits), int(credits)) for key, debits, credits in conn.execute(query)}


@router.get("/balances")
def balances(today: api.Today, on: Annotated[date | None, Query()] = None) -> schemas.Balances:
    """Every account's balance, counting every entry dated up to and including the day."""
    day = on or today
    with db.reading() as conn:
        totals = _by_account(conn, until=day)
    return schemas.Balances(
        on=day,
        accounts=[
            schemas.Balance(
                key=account.key,
                name=account.name,
                type=account.type,
                balance_cents=accounts.balance(account.key, *totals.get(account.key, (0, 0))),
            )
            for account in accounts.CHART
        ],
    )


def _month_range(today: date, first: str | None, last: str | None) -> list[months.Month]:
    """The months asked for, or the last 12, ending with this one."""
    end = last or months.month_key(today)
    start = first or max(months.last_months(date.fromisoformat(f"{end}-01"))[0].key, schemas.FIRST_MONTH)
    if start > end:
        raise api.FieldError({"from": schemas.RANGE_MESSAGE})
    if months.count_between(start, end) > schemas.MAX_MONTHS:
        raise api.FieldError({"to": schemas.TOO_MANY_MONTHS})
    return months.between(start, end)


def _daily(conn: Connection, start: date, end: date) -> dict[date, _Totals]:
    rows = conn.execute(
        select(
            journal_entries.c.entry_date,
            journal_lines.c.account,
            func.sum(journal_lines.c.debit_cents),
            func.sum(journal_lines.c.credit_cents),
        )
        .join(journal_entries, journal_entries.c.id == journal_lines.c.entry_id)
        .where(journal_entries.c.entry_date >= start, journal_entries.c.entry_date <= end)
        .group_by(journal_entries.c.entry_date, journal_lines.c.account)
    ).all()
    days: dict[date, _Totals] = defaultdict(dict)
    for day, account, debits, credits in rows:
        days[day][account] = (int(debits), int(credits))
    return days


@router.get("/months")
def totals_by_month(
    today: api.Today,
    first: Annotated[schemas.MonthQuery | None, Query(alias="from")] = None,
    last: Annotated[schemas.MonthQuery | None, Query(alias="to")] = None,
) -> schemas.Months:
    """Each account's debits, credits and balance at the month's end, for each month asked for."""
    wanted = _month_range(today, first, last)
    start, end = wanted[0].first_day, wanted[-1].last_day
    with db.reading() as conn:
        before = _by_account(conn, before=start)
        days = _daily(conn, start, end)
    month_of = {month.key: month for month in wanted}
    debits = {month.key: dict.fromkeys(accounts.KEYS, 0) for month in wanted}
    credits = {month.key: dict.fromkeys(accounts.KEYS, 0) for month in wanted}
    for day, totals in days.items():
        for key, (debit, credit) in totals.items():
            debits[months.month_key(day)][key] += debit
            credits[months.month_key(day)][key] += credit
    running = {key: before.get(key, (0, 0)) for key in accounts.KEYS}
    replies = []
    for month in month_of.values():
        running = {
            key: (running[key][0] + debits[month.key][key], running[key][1] + credits[month.key][key])
            for key in accounts.KEYS
        }
        replies.append(
            schemas.Month(
                month=month.key,
                label=month.label,
                year=month.year,
                accounts=[
                    schemas.MonthAccount(
                        key=key,
                        debit_cents=debits[month.key][key],
                        credit_cents=credits[month.key][key],
                        balance_cents=accounts.balance(key, *running[key]),
                    )
                    for key in accounts.KEYS
                ],
            )
        )
    return schemas.Months(months=replies)


def _matching(accounts_wanted: list[str] | None, first: date | None, last: date | None):
    """The conditions on entries for the page and its count."""
    conditions = []
    if first is not None:
        conditions.append(journal_entries.c.entry_date >= first)
    if last is not None:
        conditions.append(journal_entries.c.entry_date <= last)
    if accounts_wanted:
        conditions.append(
            exists().where(
                journal_lines.c.entry_id == journal_entries.c.id, journal_lines.c.account.in_(accounts_wanted)
            )
        )
    return conditions


@router.get("/entries")
def entries(
    account: schemas.ENTRIES_ACCOUNTS = None,
    first: Annotated[date | None, Query(alias="from")] = None,
    last: Annotated[date | None, Query(alias="to")] = None,
    limit: schemas.Limit = schemas.DEFAULT_LIMIT,
    offset: schemas.Offset = 0,
) -> schemas.Entries:
    """The entries behind a figure, newest first and then by id, each with all of its lines."""
    conditions = _matching(schemas.check_accounts(account), first, last)
    with db.reading() as conn:
        page = conn.execute(
            select(
                journal_entries,
                _reversal.c.id.label("reversed_by_id"),
                users.c.name.label("created_by_name"),
                users.c.email.label("created_by_email"),
            )
            .outerjoin(_reversal, _reversal.c.reverses_id == journal_entries.c.id)
            .outerjoin(users, users.c.id == journal_entries.c.created_by)
            .where(*conditions)
            .order_by(journal_entries.c.entry_date.desc(), journal_entries.c.id)
            .limit(limit)
            .offset(offset)
        ).all()
        total = conn.execute(select(func.count()).select_from(journal_entries).where(*conditions)).scalar_one()
        lines = _lines_of(conn, [row.id for row in page])
    return schemas.Entries(
        total=total,
        entries=[
            schemas.Entry(
                **{key: value for key, value in row._mapping.items() if key != "created_by"},
                created_by=person(row.created_by, row.created_by_name, row.created_by_email),
                lines=lines[row.id],
            )
            for row in page
        ],
    )


def _lines_of(conn: Connection, entry_ids: list[int]) -> dict[int, list[schemas.Line]]:
    found: dict[int, list[schemas.Line]] = {entry_id: [] for entry_id in entry_ids}
    rows = conn.execute(
        select(
            journal_lines.c.entry_id,
            journal_lines.c.account,
            journal_lines.c.debit_cents,
            journal_lines.c.credit_cents,
        )
        .where(journal_lines.c.entry_id.in_(entry_ids))
        .order_by(journal_lines.c.id)
    )
    for row in rows:
        found[row.entry_id].append(
            schemas.Line(account=row.account, debit_cents=row.debit_cents, credit_cents=row.credit_cents)
        )
    return found
