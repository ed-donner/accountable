"""The cash flow, GET /cash-flow (Y1 to Y22), and a month's list, GET /cash-flow/expected (Y17).

Every figure is worked out from what the areas give each time it's asked for, with the backend's
today, and none is stored (Y19). The areas' cash comes from the app, so this names none of them.
The settings come first, and each area reads its money once, so the figures take six reads of
the database and a month's list four, however many records there are (Q1, Y22).
"""

from collections import defaultdict
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from datetime import date

from fastapi import APIRouter, HTTPException
from sqlalchemy import Connection, Row

from accountable import api, db, months
from accountable.cash import AppCash, Cash, Flow, Item, expected_on
from accountable.cashflow import schemas
from accountable.company.documents import current_settings

router = APIRouter(prefix="/cash-flow")


@dataclass
class _Sum:
    cents: int = 0
    count: int = 0

    def add(self, cents: int, count: int = 1) -> None:
        self.cents += cents
        self.count += count


@dataclass
class _Tally:
    """One month's money, as it's folded together."""

    moved: dict[Flow, _Sum] = field(default_factory=lambda: defaultdict(_Sum))
    expected: dict[Flow, _Sum] = field(default_factory=lambda: defaultdict(_Sum))
    counted: int = 0
    """What moved in it from the opening balance's date on, in less out, which its balance counts (Y9)."""

    def expected_net(self) -> int:
        return self.expected["in"].cents - self.expected["out"].cents


@dataclass(frozen=True)
class _Opening:
    cents: int
    on: date


def _opening(settings: Row) -> _Opening | None:
    if settings.opening_balance_on is None:
        return None
    return _Opening(cents=settings.opening_balance_cents, on=settings.opening_balance_on)


def _net(flow: Flow, cents: int) -> int:
    return cents if flow == "in" else -cents


def _fold_moved(
    conn: Connection,
    cash: Sequence[Cash],
    tallies: dict[str, _Tally],
    first_day: date,
    opening: _Opening | None,
    today: date,
) -> int:
    """Each month's money in and out (Y2), and what moved from the opening balance's date up to
    the chart's first day, which the first balance starts from (Y9)."""
    since = first_day if opening is None else min(opening.on, first_day)
    before = 0
    for area in cash:
        for day in area.moved(conn, since) if area.moved else ():
            # The saves refuse a payment or a paid bill after today, so nothing has moved in the forecast.
            if day.on > today:
                continue
            counted = _net(area.flow, day.cents) if opening is not None and day.on >= opening.on else 0
            if day.on < first_day:
                before += counted
                continue
            tally = tallies[months.month_key(day.on)]
            tally.moved[area.flow].add(day.cents, day.count)
            tally.counted += counted
    return before


def _expected(conn: Connection, cash: Sequence[Cash], settings: Row, today: date) -> Iterator[tuple[Flow, date, Item]]:
    """Everything each area expects, with the day it's expected, never before tomorrow."""
    for area in cash:
        for item in area.expected(conn, settings):
            yield area.flow, expected_on(item.pays_on, today), item


def _fold_expected(
    conn: Connection, cash: Sequence[Cash], settings: Row, tallies: dict[str, _Tally], today: date
) -> None:
    for flow, on, item in _expected(conn, cash, settings, today):
        tally = tallies.get(months.month_key(on))
        # Anything expected after the third forecast month is left out, though it's still owed (Y8).
        if tally is not None:
            tally.expected[flow].add(item.cents)


def _kind(index: int, current: int) -> schemas.Kind:
    return "past" if index < current else "current" if index == current else "forecast"


def _month(month: months.Month, tally: _Tally, kind: schemas.Kind) -> schemas.Month:
    return schemas.Month(
        month=month.key,
        label=month.label,
        year=month.year,
        kind=kind,
        in_cents=tally.moved["in"].cents,
        in_count=tally.moved["in"].count,
        out_cents=tally.moved["out"].cents,
        out_count=tally.moved["out"].count,
        expected_in_cents=tally.expected["in"].cents,
        expected_in_count=tally.expected["in"].count,
        expected_out_cents=tally.expected["out"].cents,
        expected_out_count=tally.expected["out"].count,
        likely_cents=tally.expected["likely"].cents,
        likely_count=tally.expected["likely"].count,
        balance_cents=None,
        balance_with_deals_cents=None,
    )


def _add_balances(
    reply: list[schemas.Month], shown: list[months.Month], tallies: dict[str, _Tally], start: int
) -> None:
    """Each month's balance at its end, from the opening balance's month on (Y9, Y10). The likely
    deals are added up beside it, never into it, so the switch can't change the forecast (Y14)."""
    balance, likely = start, 0
    for month, tally in zip(reply, (tallies[shown_month.key] for shown_month in shown), strict=True):
        balance += tally.counted + tally.expected_net()
        likely += tally.expected["likely"].cents
        month.balance_cents = balance
        month.balance_with_deals_cents = balance + likely


@router.get("")
def cash_flow(cash: AppCash, today: api.Today) -> schemas.CashFlow:
    shown = months.last_months(today) + months.next_months(today)
    tallies = {month.key: _Tally() for month in shown}
    with db.reading() as conn:
        settings = current_settings(conn)
        opening = _opening(settings)
        before = _fold_moved(conn, cash, tallies, shown[0].first_day, opening, today)
        _fold_expected(conn, cash, settings, tallies, today)

    current = len(shown) - months.FORECAST - 1
    reply = [_month(month, tallies[month.key], _kind(index, current)) for index, month in enumerate(shown)]
    if opening is None:
        return schemas.CashFlow(
            today=today, opening=None, cash_today=None, forecast_end=None, forecast_end_with_deals=None, months=reply
        )
    # The line starts in the opening balance's month, and the months before it have no balance.
    starts = next((index for index, month in enumerate(shown) if month.last_day >= opening.on), len(shown))
    _add_balances(reply[starts:], shown[starts:], tallies, opening.cents + before)
    return schemas.CashFlow(
        today=today,
        opening=schemas.Opening(balance_cents=opening.cents, on=opening.on),
        cash_today=opening.cents + before + sum(tally.counted for tally in tallies.values()),
        forecast_end=reply[-1].balance_cents,
        forecast_end_with_deals=reply[-1].balance_with_deals_cents,
        months=reply,
    )


def _group(found: list[tuple[date, Item]]) -> schemas.Group:
    found.sort(key=lambda pair: (pair[0], pair[1].id))
    return schemas.Group(
        total_cents=sum(item.cents for _, item in found),
        items=[
            schemas.ExpectedItem(
                id=item.id,
                name=item.name,
                organization=item.organization,
                due_on=item.due_on,
                expected_on=on,
                cents=item.cents,
                days_paid_late=item.days_paid_late,
            )
            for on, item in found
        ],
    )


@router.get("/expected")
def expected(month: schemas.MonthQuery, cash: AppCash, today: api.Today) -> schemas.Expected:
    """This month, from tomorrow, or one of the three after it. A past month's money has already moved."""
    listed = {shown.key for shown in [*months.last_months(today, 1), *months.next_months(today)]}
    if month not in listed:
        raise HTTPException(404, "That month isn't in the forecast")
    found: dict[Flow, list[tuple[date, Item]]] = defaultdict(list)
    with db.reading() as conn:
        settings = current_settings(conn)
        for flow, on, item in _expected(conn, cash, settings, today):
            if months.month_key(on) == month:
                found[flow].append((on, item))
    return schemas.Expected(
        month=month, coming_in=_group(found["in"]), going_out=_group(found["out"]), likely_deals=_group(found["likely"])
    )
