"""The books' reads (J12): a balance on a date, totals by month and the entries behind a figure.

Each is a fixed few queries however many entries there are (J14). The database groups by day and
account, which needs no date functions, and Python folds the days into months. Nothing here writes,
so POST, PATCH and DELETE get FastAPI's 405 (J6).
"""

from collections import defaultdict
from collections.abc import Sequence
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import Connection, exists, func, select

from accountable import api, db, months
from accountable.books import accounts, profit_and_loss, schemas
from accountable.books.tables import journal_entries, journal_lines
from accountable.labels import AppLabels, names_of
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


def _daily(conn: Connection, start: date, end: date, only: Sequence[str] = ()) -> dict[date, _Totals]:
    query = (
        select(
            journal_entries.c.entry_date,
            journal_lines.c.account,
            func.sum(journal_lines.c.debit_cents),
            func.sum(journal_lines.c.credit_cents),
        )
        .join(journal_entries, journal_entries.c.id == journal_lines.c.entry_id)
        .where(journal_entries.c.entry_date >= start, journal_entries.c.entry_date <= end)
        .group_by(journal_entries.c.entry_date, journal_lines.c.account)
    )
    if only:
        query = query.where(journal_lines.c.account.in_(only))
    rows = conn.execute(query).all()
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


def _matching(wanted: Sequence[str], first: date | None, last: date | None):
    """The conditions on entries for the page and its count: dated within the range, and with a line in
    one of the accounts if any are given. Every list of entries behind a figure is decided here."""
    conditions = []
    if first is not None:
        conditions.append(journal_entries.c.entry_date >= first)
    if last is not None:
        conditions.append(journal_entries.c.entry_date <= last)
    if wanted:
        conditions.append(
            exists().where(journal_lines.c.entry_id == journal_entries.c.id, journal_lines.c.account.in_(wanted))
        )
    return conditions


def _page_of(conn: Connection, conditions: list, limit: int, offset: int, *, counted: bool = False):
    """One page of entries, newest first and then by id, with who made each and the entry reversing it.
    With `counted`, each row also has `matching`, how many entries match in all, from the same read."""
    columns = [
        journal_entries,
        _reversal.c.id.label("reversed_by_id"),
        users.c.name.label("created_by_name"),
        users.c.email.label("created_by_email"),
    ]
    if counted:
        columns.append(func.count().over().label("matching"))
    return conn.execute(
        select(*columns)
        .outerjoin(_reversal, _reversal.c.reverses_id == journal_entries.c.id)
        .outerjoin(users, users.c.id == journal_entries.c.created_by)
        .where(*conditions)
        .order_by(journal_entries.c.entry_date.desc(), journal_entries.c.id)
        .limit(limit)
        .offset(offset)
    ).all()


def _entry_fields(row, lines: list[schemas.Line], names: dict[tuple[str, int], str]) -> dict:
    fields = {key: value for key, value in row._mapping.items() if key not in ("created_by", "matching")}
    return {
        **fields,
        "created_by": person(row.created_by, row.created_by_name, row.created_by_email),
        "lines": lines,
        "label": names.get((row.kind, row.source_id)),
    }


@router.get("/entries")
def entries(
    labels: AppLabels,
    account: schemas.ENTRIES_ACCOUNTS = None,
    first: Annotated[date | None, Query(alias="from")] = None,
    last: Annotated[date | None, Query(alias="to")] = None,
    limit: schemas.Limit = schemas.DEFAULT_LIMIT,
    offset: schemas.Offset = 0,
) -> schemas.Entries:
    """The entries behind a figure, newest first and then by id, each with all of its lines."""
    conditions = _matching(schemas.check_accounts(account) or [], first, last)
    with db.reading() as conn:
        page = _page_of(conn, conditions, limit, offset)
        total = conn.execute(select(func.count()).select_from(journal_entries).where(*conditions)).scalar_one()
        lines = _lines_of(conn, [row.id for row in page])
        names = names_of(conn, labels, [(row.kind, row.source_id) for row in page])
    return schemas.Entries(
        total=total,
        entries=[schemas.Entry(**_entry_fields(row, lines[row.id], names)) for row in page],
    )


def _folded(lines: list[schemas.Line]) -> dict[str, tuple[int, int]]:
    totals: dict[str, tuple[int, int]] = {}
    for line in lines:
        debits, credits = totals.get(line.account, (0, 0))
        totals[line.account] = (debits + line.debit_cents, credits + line.credit_cents)
    return totals


@router.get("/profit-and-loss/entries")
def figure_entries(
    labels: AppLabels,
    figure: schemas.FigureQuery,
    first: Annotated[date, Query(alias="from")],
    last: Annotated[date, Query(alias="to")],
    limit: schemas.Limit = schemas.DEFAULT_LIMIT,
    offset: schemas.Offset = 0,
) -> schemas.FigureEntries:
    """The entries behind one figure of the statement, each with its amount on the figure (X13).

    An entry is behind a figure if it has a line in one of the figure's accounts, and its amount is
    what those lines add to the figure, so the amounts of every page add up to `total`, the figure.
    """
    wanted = profit_and_loss.figure_accounts(figure)
    conditions = _matching(wanted, first, last)
    with db.reading() as conn:
        page = _page_of(conn, conditions, limit, offset, counted=True)
        total = _totals(conn, first, last)
        lines = _lines_of(conn, [row.id for row in page])
        names = names_of(conn, labels, [(row.kind, row.source_id) for row in page])
    return schemas.FigureEntries(
        figure=figure,
        count=page[0].matching if page else 0,
        total=profit_and_loss.amount_of(figure, total),
        entries=[
            schemas.FigureEntry(
                **_entry_fields(row, lines[row.id], names),
                amount=profit_and_loss.amount_of(figure, _folded(lines[row.id])),
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


def _totals(conn: Connection, first: date, last: date) -> _Totals:
    """Revenue's and each expense account's debits and credits over the entries dated in the range."""
    rows = conn.execute(
        select(
            journal_lines.c.account,
            func.sum(journal_lines.c.debit_cents),
            func.sum(journal_lines.c.credit_cents),
        )
        .join(journal_entries, journal_entries.c.id == journal_lines.c.entry_id)
        .where(
            journal_entries.c.entry_date >= first,
            journal_entries.c.entry_date <= last,
            journal_lines.c.account.in_(profit_and_loss.ACCOUNTS),
        )
        .group_by(journal_lines.c.account)
    )
    return {account: (int(debits), int(credits)) for account, debits, credits in rows}


def _earliest(conn: Connection) -> date | None:
    """The day of the books' earliest entry on Revenue or an expense account (X5)."""
    return conn.execute(
        select(func.min(journal_entries.c.entry_date))
        .join(journal_lines, journal_lines.c.entry_id == journal_entries.c.id)
        .where(journal_lines.c.account.in_(profit_and_loss.ACCOUNTS))
    ).scalar_one()


def _amounts(found: profit_and_loss.Figures) -> dict:
    return {
        "revenue_cents": found.revenue,
        "categories": [
            schemas.CategoryAmount(category=accounts.category_of(key), name=accounts.BY_KEY[key].name, cents=cents)
            for key, cents in zip(accounts.EXPENSE_ACCOUNTS, found.categories, strict=True)
        ],
        "expenses_cents": found.expenses,
        "profit_cents": found.profit,
        "margin_tenths": found.margin,
    }


def _change(found: profit_and_loss.Change) -> schemas.Change:
    return schemas.Change(kind=found.kind, value=found.value)


def _changes(found: profit_and_loss.Changes) -> schemas.Changes:
    return schemas.Changes(
        revenue=_change(found.revenue),
        categories=[_change(each) for each in found.categories],
        expenses=_change(found.expenses),
        profit=_change(found.profit),
        margin=_change(found.margin),
    )


def _period_figures(period: profit_and_loss.Period, found: profit_and_loss.Figures) -> dict:
    return {"kind": period.kind, "label": period.label, "first": period.first, "last": period.last, **_amounts(found)}


@router.get("/profit-and-loss")
def profit_and_loss_page(
    today: api.Today,
    period: schemas.PeriodQuery = "month",
    on: Annotated[date | None, Query()] = None,
) -> schemas.ProfitAndLoss:
    """The whole Profit and loss page in four reads (X16, X18): the last 12 months, the period and the one
    before it, and the earliest entry. Everything is added up from the books' entries (X1)."""
    if on is not None and on > today:
        raise api.FieldError({"on": schemas.FUTURE_MESSAGE})
    shown = profit_and_loss.period_containing(period, on or today)
    earlier = profit_and_loss.before(shown)
    later = profit_and_loss.after(shown)
    wanted = months.last_months(today)
    with db.reading() as conn:
        days = _daily(conn, wanted[0].first_day, wanted[-1].last_day, profit_and_loss.ACCOUNTS)
        now_totals = _totals(conn, shown.first, shown.last)
        before_totals = _totals(conn, earlier.first, earlier.last) if earlier else {}
        earliest = _earliest(conn)
    by_month: dict[str, dict[str, tuple[int, int]]] = {month.key: {} for month in wanted}
    for day, totals in days.items():
        into = by_month[months.month_key(day)]
        for key, (debits, credits) in totals.items():
            old = into.get(key, (0, 0))
            into[key] = (old[0] + debits, old[1] + credits)
    now = profit_and_loss.figures_of(now_totals)
    previous = profit_and_loss.figures_of(before_totals)
    return schemas.ProfitAndLoss(
        today=today,
        months=[
            schemas.ChartMonth(
                month=month.key,
                label=month.label,
                year=month.year,
                first=month.first_day,
                last=month.last_day,
                **_amounts(profit_and_loss.figures_of(by_month[month.key])),
            )
            for month in wanted
        ],
        period=schemas.ShownPeriod(
            **_period_figures(shown, now),
            current=shown.first <= today <= shown.last,
            back_on=earlier.first if earlier and earliest is not None and earliest < shown.first else None,
            forward_on=later.first if later and later.first <= today else None,
            changes=_changes(profit_and_loss.changes_between(previous, now)),
        ),
        previous=schemas.PeriodFigures(**_period_figures(earlier, previous)) if earlier else None,
    )
