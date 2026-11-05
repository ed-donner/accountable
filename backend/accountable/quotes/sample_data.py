"""The sample quotes, built from the sample products on the sample deals, dated from a given day (M3, M4, M8).

They're read from the database rather than from the CRM's or the price list's sample data, so
this goes in after both, and after the sample company, whose details each sent quote keeps and
whose prefix and count number them. Every quote is dated from its deal's own stage changes, so
none is older than the day its deal reached Proposal, and an accepted one was accepted on the day
its deal was won, by whoever moved it there.
"""

from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import Connection, Row, insert, select

from accountable import who
from accountable.company.documents import take_number
from accountable.crm.tables import deals, stage_changes
from accountable.products.tables import products
from accountable.quotes.document import fixed_details
from accountable.quotes.tables import quote_lines, quotes
from accountable.sample import Line, PriceList, lines_toward, moment, sold_lines
from accountable.users import TEAMMATES

VALID_FOR = timedelta(days=30)

# What happens to the quotes on each deal in Proposal and Negotiation, oldest first, deal by deal.
# Expired is a sent quote whose valid-until date has passed, and copied is a newer quote with the
# same lines as the declined one before it, its first price brought down, as a revised copy would be.
PLAYS = [
    ["sent"],
    ["draft"],
    ["sent", "draft"],
    ["sent"],
    ["draft"],
    ["sent", "sent"],
    ["draft"],
    ["sent"],
    ["declined after sending", "sent copy"],
    ["expired", "draft"],
    ["sent", "sent"],
    ["expired", "sent"],
    ["sent", "draft"],
    ["declined draft", "draft copy"],
    ["sent"],
    ["sent", "draft"],
]


@dataclass
class _Quote:
    deal_id: int
    status: str
    quote_date: date
    lines: list[Line]
    created_by: str
    created_at: datetime
    valid_until: date | None = None
    sent_on: date | None = None
    decided_on: date | None = None
    changed: dict[str, Any] = field(default_factory=dict)


def _local_day(at: datetime) -> date:
    """The local day of a time stored in UTC, as moment() made it."""
    return at.replace(tzinfo=UTC).astimezone().date()


def _later(day: date, number: int, than: datetime) -> datetime:
    """A time on the day, put after the other one if the day's working hours would have it before."""
    return max(moment(day, number), than + timedelta(hours=2))


def _next_teammate(user_id: str) -> str:
    ids = [teammate.id for teammate in TEAMMATES]
    return ids[(ids.index(user_id) + 1) % len(ids)]


def _first_move_to(conn: Connection, deal_id: int, stage: str) -> Row:
    """When the deal first reached the stage, and who moved it there. Every sample deal has its full history (M4)."""
    return conn.execute(
        select(stage_changes.c.changed_at, stage_changes.c.created_by)
        .where(stage_changes.c.deal_id == deal_id, stage_changes.c.to_stage == stage)
        .order_by(stage_changes.c.changed_at)
        .limit(1)
    ).one()


def _start_of_month(today: date, months_back: int) -> date:
    index = today.year * 12 + today.month - 1 - months_back
    return date(index // 12, index % 12 + 1, 1)


def _priced_by_hand(lines: list[Line], percent_off: int) -> list[Line]:
    first, *rest = lines
    return [replace(first, unit_price_cents=first.unit_price_cents * (100 - percent_off) // 100), *rest]


def _accepted(conn: Connection, deal: Row, number: int, price_list: PriceList) -> _Quote:
    """Dated the day after its deal reached Proposal, sent the next day, and accepted when the deal was
    won, by whoever moved it to Won (M4). It has the lines the deal was sold with, which its invoice
    has too, worth the deal's value to the cent."""
    proposal = _first_move_to(conn, deal.id, "proposal")
    won = _first_move_to(conn, deal.id, "won")
    quote_date = _local_day(proposal.changed_at) + timedelta(days=1)
    created_at = moment(quote_date, number)
    return _Quote(
        deal_id=deal.id,
        status="accepted",
        quote_date=quote_date,
        lines=sold_lines(price_list, deal.value),
        created_by=deal.created_by,
        created_at=created_at,
        sent_on=quote_date + timedelta(days=1),
        decided_on=deal.close_date,
        changed=who.changed(won.created_by, won.changed_at),
    )


def _open_quotes(
    conn: Connection, deal: Row, plays: list[str], number: int, today: date, price_list: PriceList
) -> list[_Quote]:
    """The deal's quotes, the first the day after it reached Proposal, and any second halfway to today."""
    first_day = min(_local_day(_first_move_to(conn, deal.id, "proposal").changed_at) + timedelta(days=1), today)
    days = [first_day, first_day + (today - first_day) // 2]
    made: list[_Quote] = []
    for turn, play in enumerate(plays):
        quote_number = number + turn
        lines = lines_toward(price_list, quote_number, deal.value * 100 * 9 // 10)
        if play.endswith("copy"):
            lines = _priced_by_hand(made[-1].lines, 5)
        elif quote_number % 3 == 0:
            lines = _priced_by_hand(lines, 10)
        owner = deal.created_by
        quote = _Quote(deal.id, play, days[turn], lines, owner, moment(days[turn], quote_number))
        made.append(_played(quote, play, quote_number, today, later=days[-1]))
    return made


def _played(quote: _Quote, play: str, number: int, today: date, later: date) -> _Quote:
    """The quote's status, dates and who last changed it, as the play has them."""
    owner, created_at, day = quote.created_by, quote.created_at, quote.quote_date
    if play in ("draft", "draft copy"):
        quote.status = "draft"
        if number % 3 == 1:
            quote.changed = who.changed(_next_teammate(owner), created_at + timedelta(hours=3))
    elif play in ("sent", "sent copy", "expired"):
        quote.status, quote.sent_on = "sent", day
        quote.changed = who.changed(owner, _later(day, number + 1, created_at))
        if play == "expired":
            # Shortened by hand, and never before the quote's own date.
            quote.valid_until = max(day, min(day + timedelta(days=14), today - timedelta(days=1)))
    else:
        quote.status, quote.decided_on = "declined", later
        quote.sent_on = day if play == "declined after sending" else None
        quote.changed = who.changed(owner, _later(later, number + 1, created_at))
    return quote


def _plans(conn: Connection, today: date) -> list[_Quote]:
    price_list = {row.name: row for row in conn.execute(select(products).where(products.c.active))}
    plans: list[_Quote] = []
    quoting = ["proposal", "negotiation"]
    open_deals = conn.execute(select(deals).where(deals.c.stage.in_(quoting)).order_by(deals.c.id)).all()
    for place, deal in enumerate(sorted(open_deals, key=lambda deal: quoting.index(deal.stage))):
        plans += _open_quotes(conn, deal, PLAYS[place % len(PLAYS)], place * 2, today, price_list)

    # Won this month or in the two before.
    since = _start_of_month(today, 2)
    won = conn.execute(
        select(deals).where(deals.c.stage == "won", deals.c.close_date >= since).order_by(deals.c.id)
    ).all()
    plans += [_accepted(conn, deal, place, price_list) for place, deal in enumerate(won)]
    return sorted(plans, key=lambda quote: quote.created_at)


def fill(conn: Connection, today: date) -> None:
    """Adds the quotes in the order they were made, so take_number numbers them from QT-0001 (M8)."""
    for plan in _plans(conn, today):
        details = fixed_details(conn, plan.deal_id) if plan.status != "draft" else {}
        quote_id = conn.execute(
            insert(quotes)
            .values(
                number=take_number(conn, "quote"),
                deal_id=plan.deal_id,
                status=plan.status,
                quote_date=plan.quote_date,
                valid_until=plan.valid_until or plan.quote_date + VALID_FOR,
                subtotal_cents=sum(line.quantity * line.unit_price_cents for line in plan.lines),
                sent_on=plan.sent_on,
                decided_on=plan.decided_on,
                **details,
                **{**who.added(plan.created_by, plan.created_at), **plan.changed},
            )
            .returning(quotes.c.id)
        ).scalar_one()
        conn.execute(
            insert(quote_lines),
            [
                {
                    "quote_id": quote_id,
                    "position": place,
                    **vars(line),
                    "created_at": plan.created_at,
                    "updated_at": plan.created_at,
                }
                for place, line in enumerate(plan.lines, start=1)
            ],
        )
