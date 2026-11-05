"""The sample invoices and payments, dated from a given day (M3), so the Invoices section, the
deals' panels and the dashboard's Money section look full from the first visit.

They're made from the CRM's won deals and the sample products as the database has them, and
the company's settings, since this area may read those tables but not the other areas' sample
data. Each won deal of the last 12 months gets an invoice whose subtotal is the deal's value,
issued on the day it closed, so INV-0001 is the oldest. Then:

- the newest of this month's wins are drafts, at least 2 even on the 1st;
- one deal from about four months ago was invoiced, voided, and invoiced again and paid;
- one invoice in each group of How late is overdue, two of them part paid;
- about 4 not yet due are part paid, last month's first, leaving at least 2 issued with nothing paid;
- the oldest is paid on its issue date, and one invoice is paid late, today, so each of the 12
  months has a payment: the latest win of each month is always paid, and its payment lands next month;
- the rest not yet due are issued, and every other one is paid, in one or two payments.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import Connection, Row, insert, select

from accountable import months, who
from accountable.company import documents, tax
from accountable.crm.tables import contacts, deals, organizations
from accountable.invoices import figures
from accountable.invoices.tables import DRAFT, ISSUED, VOID, invoice_lines, invoices, payments
from accountable.products.tables import products
from accountable.sample import moment
from accountable.users import add_missing_teammates, teammate

# Days late for the overdue invoices, one in each group of How late, and the share of each paid.
OVERDUE = [(10, 0), (45, 40), (75, 0), (120, 25)]
VOIDED_DAYS_AGO = 120
PART_PAID_NOT_DUE = 4
KEPT_ISSUED = 2
"""At least this many are issued and not yet due, with nothing paid."""
DRAFTS = (2, 3)
"""At least 2 drafts, and at most 3, from this month's wins of the last few days."""
METHODS = ["bank_transfer", "card", "check"]
# A sample invoice is issued an hour after it's added, and paid no sooner than an hour after that.
ISSUED_AFTER = timedelta(hours=1)


@dataclass
class Planned:
    """One invoice to make: its deal, when it's issued, and what's paid on it and when."""

    deal: Row
    issue_date: date | None
    status: str = ISSUED
    paid: list[tuple[date, int]] = field(default_factory=list)
    voided_on: date | None = None
    left_unpaid: bool = False
    """Overdue, with nothing paid."""


def _won_deals(conn: Connection, today: date) -> Sequence[Row]:
    first = date.fromisoformat(f"{months.last_months(today)[0].key}-01")
    return conn.execute(
        select(
            deals,
            organizations.c.name.label("organization_name"),
            contacts.c.name.label("contact_name"),
            contacts.c.email.label("contact_email"),
        )
        .outerjoin(organizations, deals.c.organization_id == organizations.c.id)
        .outerjoin(contacts, deals.c.main_contact_id == contacts.c.id)
        .where(deals.c.stage == "won", deals.c.close_date >= first, deals.c.close_date <= today)
        .order_by(deals.c.close_date, deals.c.id)
    ).all()


def _lines(number: int, cents: int, priced: Sequence[Row]) -> list[dict[str, Any]]:
    """1 to 4 lines from the price list, the last priced so the subtotal is the deal's value.
    The others take at most 60% of it, so the last is always a good part of the work."""
    flexible = [product for product in priced if product.unit_price_cents >= 200000] or priced
    last = flexible[number % len(flexible)]
    chosen, spent = [], 0
    for step in range(number % 4):
        product = priced[(number * 3 + step * 5) % len(priced)]
        quantity = 1 + (number + step) % 3
        cost = quantity * product.unit_price_cents
        if product.id == last.id or product.id in {line["product_id"] for line in chosen}:
            continue
        if spent + cost <= cents * 3 // 5:
            chosen.append(_line(product, quantity, product.unit_price_cents))
            spent += cost
    return [*chosen, _line(last, 1, cents - spent)]


def _line(product: Row, quantity: int, unit_price_cents: int) -> dict[str, Any]:
    return {
        "product_id": product.id,
        "name": product.name,
        "description": product.description,
        "quantity": quantity,
        "unit_price_cents": unit_price_cents,
    }


def _drafts(wins: Sequence[Row], today: date) -> set[int]:
    """This month's wins of the last few days, newest first, at least 2 and at most 3."""
    this_month = [deal for deal in reversed(wins) if months.month_key(deal.close_date) == months.month_key(today)]
    recent = [deal for deal in this_month if deal.close_date >= today - timedelta(days=6)]
    fewest, most = DRAFTS
    return {deal.id for deal in (recent or this_month)[:most]} | {deal.id for deal in this_month[:fewest]}


def _latest_of_each_month(wins: Sequence[Row]) -> set[int]:
    """Each month's latest win, whose payment always lands the next month, so no month is left without one."""
    latest: dict[str, Row] = {}
    for deal in wins:
        latest[months.month_key(deal.close_date)] = deal
    return {deal.id for deal in latest.values()}


def _closest(candidates: list[Planned], days_late: int, today: date, terms: int) -> Planned | None:
    """The invoice whose lateness is nearest the days given, in the same group of How late."""
    wanted = figures.late_group(today - timedelta(days=days_late), today)
    fitting = [
        plan
        for plan in candidates
        if plan.issue_date is not None and figures.late_group(plan.issue_date + timedelta(days=terms), today) == wanted
    ]
    due = today - timedelta(days=days_late + terms)

    def distance(plan: Planned) -> int:
        return abs(((plan.issue_date or due) - due).days)

    return min(fitting, key=distance) if fitting else None


def _paid_in_full(plan: Planned, total: int, number: int, today: date) -> None:
    """One payment, or two for every other one, 5 to 25 days after issue and never after today."""
    assert plan.issue_date is not None
    paid_on = min(plan.issue_date + timedelta(days=5 + number * 7 % 21), today)
    if number % 2 == 0:
        later = min(paid_on + timedelta(days=5 + number % 11), today)
        plan.paid = [(paid_on, total * 3 // 5), (later, total - total * 3 // 5)]
    else:
        plan.paid = [(paid_on, total)]


class _Plan:
    """What happens to each invoice, decided before anything is written, from the wins and today."""

    def __init__(self, wins: Sequence[Row], today: date, terms: int, totals: dict[int, int]):
        self.today, self.terms, self.totals = today, terms, totals
        drafts = _drafts(wins, today)
        self.plans = [Planned(deal, None if deal.id in drafts else deal.close_date) for deal in wins]
        for plan in self.plans:
            if plan.deal.id in drafts:
                plan.status = DRAFT
        self.latest = _latest_of_each_month(wins)
        self._void_and_invoice_again()
        self._pay()

    def _issued(self) -> list[Planned]:
        """Those issued with nothing decided for them yet."""
        return [plan for plan in self.plans if plan.status == ISSUED and not plan.paid and not plan.left_unpaid]

    def _due(self, plan: Planned) -> date:
        assert plan.issue_date is not None
        return plan.issue_date + timedelta(days=self.terms)

    def _void_and_invoice_again(self) -> None:
        older = [plan for plan in self._issued() if plan.issue_date and self._due(plan) < self.today]
        target = self.today - timedelta(days=VOIDED_DAYS_AGO)
        voided = min(older, key=lambda plan: abs(((plan.issue_date or target) - target).days))
        assert voided.issue_date is not None
        voided.status, voided.voided_on = VOID, voided.issue_date + timedelta(days=3)
        again = Planned(voided.deal, voided.issue_date + timedelta(days=4))
        self.plans.append(again)
        _paid_in_full(again, self.totals[voided.deal.id], 1, self.today)

    def _pay(self) -> None:
        oldest = self._issued()[0]
        assert oldest.issue_date is not None
        total = self.totals[oldest.deal.id]
        oldest.paid = [(oldest.issue_date, total // 2), (oldest.issue_date + timedelta(days=12), total - total // 2)]
        self._overdue()
        # Last month's first, then this month's, leaving some issued with nothing paid.
        not_due = [plan for plan in self._issued() if self._due(plan) >= self.today]
        part_paid = max(min(PART_PAID_NOT_DUE, len(not_due) - KEPT_ISSUED), 0)
        for number, plan in enumerate(not_due[:part_paid]):
            self._part_paid(plan, 30 + number * 5, 5 + number)
        past_due = [plan for plan in self._issued() if self._due(plan) < self.today]
        for number, plan in enumerate(past_due):
            _paid_in_full(plan, self.totals[plan.deal.id], number, self.today)
        # One paid late, today, so this month has a payment even on the 1st. Not a month's latest
        # win, whose payment is the next month's.
        late = [plan for plan in past_due if plan.deal.id not in self.latest]
        if late:
            late[-1].paid = [(self.today, self.totals[late[-1].deal.id])]

    def _overdue(self) -> None:
        """Left unpaid, or part paid, from the older wins. A month's latest win is left unpaid only if nothing else fits."""
        for days_late, share in OVERDUE:
            overdue = [plan for plan in self._issued() if self._due(plan) < self.today]
            unpaid_may_be = [plan for plan in overdue if share or plan.deal.id not in self.latest]
            chosen = _closest(unpaid_may_be, days_late, self.today, self.terms)
            if chosen is None:
                continue
            if share:
                self._part_paid(chosen, share, 6)
            else:
                chosen.left_unpaid = True

    def _part_paid(self, plan: Planned, share: int, days_after: int) -> None:
        assert plan.issue_date is not None
        paid_on = min(plan.issue_date + timedelta(days=days_after), self.today)
        plan.paid = [(paid_on, self.totals[plan.deal.id] * share // 100)]


def fill(conn: Connection, today: date) -> None:
    add_missing_teammates(conn)
    wins = _won_deals(conn, today)
    priced = conn.execute(select(products).where(products.c.active).order_by(products.c.id)).all()
    if not wins or not priced:
        return
    settings = documents.current_settings(conn)
    lines = {deal.id: _lines(number, deal.value * 100, priced) for number, deal in enumerate(wins)}
    totals = {deal.id: tax.totals(_as_lines(lines[deal.id]), settings.tax_rate).total_cents for deal in wins}
    planned = _Plan(wins, today, settings.payment_terms_days, totals).plans
    # Numbers go in the order the invoices were issued, so INV-0001 is the oldest (B15).
    in_order = sorted(planned, key=lambda plan: (plan.issue_date or date.max, plan.deal.id))
    for number, plan in enumerate(in_order):
        _write(conn, plan, lines[plan.deal.id], settings, number)


@dataclass(frozen=True)
class _AsLine:
    quantity: int
    unit_price_cents: int


def _as_lines(lines: list[dict[str, Any]]) -> list[_AsLine]:
    return [_AsLine(line["quantity"], line["unit_price_cents"]) for line in lines]


def _write(conn: Connection, plan: Planned, lines: list[dict[str, Any]], settings: Row, number: int) -> None:
    """Added by a made-up teammate on the day it was issued, or for a draft the day its deal was won (M7)."""
    deal = plan.deal
    added_at = moment(plan.issue_date or deal.close_date, number)
    values: dict[str, Any] = {
        "deal_id": deal.id,
        "status": DRAFT,
        "bill_to": figures.bill_to(deal.organization_name, deal.contact_name, deal.contact_email),
        **who.added(teammate(number), added_at),
    }
    if plan.issue_date is not None:
        values.update(_issued(plan, lines, settings, conn, number, added_at + ISSUED_AFTER))
    invoice_id = conn.execute(insert(invoices).values(**values).returning(invoices.c.id)).scalar_one()
    conn.execute(
        insert(invoice_lines),
        [
            {"invoice_id": invoice_id, "position": place, "created_at": added_at, **line}
            for place, line in enumerate(lines, start=1)
        ],
    )
    for paid_number, (paid_on, cents) in enumerate(plan.paid):
        method = METHODS[(number + paid_number) % len(METHODS)]
        conn.execute(
            insert(payments).values(
                invoice_id=invoice_id,
                paid_on=paid_on,
                amount_cents=cents,
                method=method,
                reference=_reference(method, number),
                created_at=max(moment(paid_on, number + paid_number), added_at + 2 * ISSUED_AFTER),
                created_by=teammate(number + paid_number + 1),
            )
        )


def _issued(
    plan: Planned, lines: list[dict[str, Any]], settings: Row, conn: Connection, number: int, issued_at: datetime
) -> dict[str, Any]:
    """What issuing writes (V11), by a made-up teammate, and voiding for the void one."""
    assert plan.issue_date is not None
    totals = tax.totals(_as_lines(lines), settings.tax_rate)
    issuer = teammate(number + 2)
    issued = {
        "status": VOID if plan.status == VOID else ISSUED,
        "number": documents.take_number(conn, "invoice"),
        "issue_date": plan.issue_date,
        "due_date": plan.issue_date + timedelta(days=settings.payment_terms_days),
        "organization_id": plan.deal.organization_id,
        "company_name": settings.company_name,
        "company_address": settings.address,
        "company_email": settings.email,
        "company_phone": settings.phone,
        "tax_label": settings.tax_label,
        "tax_rate": settings.tax_rate,
        "subtotal_cents": totals.subtotal_cents,
        "tax_cents": totals.tax_cents,
        "total_cents": totals.total_cents,
        "issued_by": issuer,
        **who.changed(issuer, issued_at),
    }
    if plan.voided_on is not None:
        voided_at = moment(plan.voided_on, number)
        issued.update({"voided_by": issuer, "voided_at": voided_at, **who.changed(issuer, voided_at)})
    return issued


def _reference(method: str, number: int) -> str | None:
    """About half have one, such as Wire 4471 or Check 1182."""
    if method == "bank_transfer" and number % 2 == 0:
        return f"Wire {4400 + number * 37 % 600}"
    if method == "check":
        return f"Check {1100 + number * 13 % 400}"
    return None
