"""The cash flow through GET /api/cash-flow and GET /api/cash-flow/expected (Y1 to Y22), against a
few records with known answers and today fixed on Nov 5, 2026, so the chart runs from Dec 2025
to Feb 2027, across the turn of a year."""

from datetime import date, timedelta
from typing import Any

import pytest
from accountable import db
from accountable.bills import cash as bills_cash
from accountable.bills.tables import bill_number_key, bills
from accountable.crm import cash as crm_cash
from accountable.invoices import cash as invoices_cash
from sqlalchemy import event, insert

CASH_FLOW = "/api/cash-flow"
TODAY = date(2026, 11, 5)
TOMORROW = date(2026, 11, 6)
LISTED = ["2026-11", "2026-12", "2027-01", "2027-02"]
SUMS = ("in_cents", "out_cents", "expected_in_cents", "expected_out_cents", "likely_cents")
COUNTS = ("in_count", "out_count", "expected_in_count", "expected_out_count", "likely_count")
# $1 trillion in cents: the most a bill's amount can be, and its tax.
A_TRILLION_IN_CENTS = 100_000_000_000_000


class Books:
    """A customer with a won deal to invoice, and a supplier, with records put straight in the database."""

    def __init__(self, api, make, app) -> None:
        self.api, self.make, self.app = api, make, app
        self.customer = make.organization("Harbor & Pine")
        self.supplier = make.organization("Northwind Software")
        self.won = make.deal("Annual support", stage="won", close_date=date(2026, 1, 1), organization_id=self.customer)
        self.made = 0
        self.on(TODAY)

    def on(self, day: date) -> None:
        self.app.dependency_overrides[db.local_today] = lambda: day

    def _number(self) -> int:
        self.made += 1
        return self.made

    def invoice(self, cents: int, due: date, *, customer: int | None = None, status: str = "issued") -> int:
        return self.make.invoice(
            self.won,
            status=status,
            number=f"INV-{self._number():04d}",
            organization_id=self.customer if customer is None else customer,
            issue_date=due - timedelta(days=30),
            due_date=due,
            subtotal_cents=cents,
            tax_cents=0,
            total_cents=cents,
        )

    def pay(self, invoice: int, cents: int, on: date) -> None:
        self.make.payment(invoice, cents, on)

    def bill(self, amount: int, due: date, *, tax: int = 0, paid_on: date | None = None) -> int:
        return self.make.bill(
            self.supplier,
            f"B-{self._number()}",
            bill_date=min(due, paid_on or due) - timedelta(days=30),
            due_date=due,
            amount_cents=amount,
            tax_cents=tax,
            paid_on=paid_on,
        )

    def deal(self, close: date, *, value: int = 10_000, probability: int = 50, stage: str = "proposal") -> int:
        return self.make.deal(
            f"Deal {self._number()}",
            stage=stage,
            value=value,
            probability=probability,
            close_date=close,
            organization_id=self.customer,
        )

    def opening(self, cents: int, on: date) -> None:
        body = {
            "company_name": "Plainsong Systems",
            "opening_balance_cents": cents,
            "opening_balance_on": on.isoformat(),
        }
        reply = self.api.patch("/api/settings", json=body)
        assert reply.status_code == 200, reply.text

    def flow(self) -> dict[str, Any]:
        reply = self.api.get(CASH_FLOW)
        assert reply.status_code == 200, reply.text
        return reply.json()

    def month(self, key: str, flow: dict[str, Any] | None = None) -> dict[str, Any]:
        [found] = [month for month in (flow or self.flow())["months"] if month["month"] == key]
        return found

    def listed(self, key: str) -> dict[str, Any]:
        reply = self.api.get(f"{CASH_FLOW}/expected", params={"month": key})
        assert reply.status_code == 200, reply.text
        return reply.json()

    def landing(self, record: int, group: str = "coming_in") -> dict[str, Any]:
        """The one item for this record, from whichever month it's expected in."""
        [found] = [item for key in LISTED for item in self.listed(key)[group]["items"] if item["id"] == record]
        return found


@pytest.fixture
def books(api, make, local_app) -> Books:
    return Books(api, make, local_app)


def moved(month: dict[str, Any]) -> tuple:
    return month["in_cents"], month["in_count"], month["out_cents"], month["out_count"]


def still_expected(month: dict[str, Any]) -> tuple:
    return (
        month["expected_in_cents"],
        month["expected_in_count"],
        month["expected_out_cents"],
        month["expected_out_count"],
    )


def balances(flow: dict[str, Any]) -> list[str | None]:
    return [month["balance_cents"] for month in flow["months"]]


# The months (Y1)


def test_the_chart_covers_the_last_12_months_then_the_3_after_this_one(books):
    months = books.flow()["months"]
    assert [month["month"] for month in months] == [
        "2025-12",
        *(f"2026-{number:02d}" for number in range(1, 13)),
        "2027-01",
        "2027-02",
    ]
    assert [month["kind"] for month in months] == ["past"] * 11 + ["current"] + ["forecast"] * 3
    assert [(month["label"], month["year"]) for month in months[::6]] == [("Dec", 2025), ("Jun", 2026), ("Dec", 2026)]
    assert (months[-1]["label"], months[-1]["year"]) == ("Feb", 2027)


def test_with_nothing_anywhere_every_figure_is_zero_and_there_is_no_balance(books):
    flow = books.flow()
    assert flow["today"] == "2026-11-05"
    assert [flow[name] for name in ("opening", "cash_today", "forecast_end", "forecast_end_with_deals")] == [None] * 4
    for month in flow["months"]:
        assert [month[name] for name in SUMS] == ["0"] * 5, month
        assert [month[name] for name in COUNTS] == [0] * 5, month
        assert (month["balance_cents"], month["balance_with_deals_cents"]) == (None, None)


def test_each_past_months_money_in_and_out_are_its_payments_and_paid_bills_to_the_cent(books):
    """By the day each was paid, at the months' first and last days, with tax (Y2)."""
    invoice = books.invoice(1_000_000, date(2025, 11, 1))
    books.pay(invoice, 1_001, date(2025, 11, 30))
    books.pay(invoice, 12_345, date(2025, 12, 1))
    books.pay(invoice, 67_890, date(2026, 3, 31))
    books.pay(invoice, 10, date(2026, 3, 31))
    books.pay(invoice, 99, date(2026, 4, 1))
    books.bill(50_000, date(2026, 2, 28), tax=4_438, paid_on=date(2026, 2, 28))
    books.bill(1, date(2026, 3, 15), paid_on=date(2026, 3, 1))
    books.bill(70_000, date(2026, 3, 15))
    flow = books.flow()
    assert moved(books.month("2025-12", flow)) == ("12345", 1, "0", 0)
    assert moved(books.month("2026-02", flow)) == ("0", 0, "54438", 1)
    assert moved(books.month("2026-03", flow)) == ("67900", 2, "1", 1)
    assert moved(books.month("2026-04", flow)) == ("99", 1, "0", 0)
    assert sum(int(month["in_cents"]) for month in flow["months"]) == 12_345 + 67_890 + 10 + 99
    assert sum(int(month["out_cents"]) for month in flow["months"]) == 54_438 + 1


def test_this_month_shows_what_moved_so_far_apart_from_whats_still_expected(books):
    """So far up to today, and expected from tomorrow to the month's end (Y3)."""
    invoice = books.invoice(300_000, date(2026, 11, 20))
    books.pay(invoice, 100_000, date(2026, 11, 1))
    books.pay(invoice, 50_000, TODAY)
    books.bill(20_000, date(2026, 11, 3), paid_on=TODAY)
    books.bill(30_000, date(2026, 11, 25))
    november = books.month("2026-11")
    assert november["kind"] == "current"
    assert moved(november) == ("150000", 2, "20000", 1)
    assert still_expected(november) == ("150000", 1, "30000", 1)


def test_on_a_months_last_day_nothing_more_is_expected_in_it(books):
    books.on(date(2026, 11, 30))
    books.invoice(10_000, date(2026, 11, 30))
    books.bill(2_000, date(2026, 11, 30))
    flow = books.flow()
    assert still_expected(books.month("2026-11", flow)) == ("0", 0, "0", 0)
    assert still_expected(books.month("2026-12", flow)) == ("10000", 1, "2000", 1)


def test_a_payment_dated_after_today_which_the_saves_refuse_moves_nothing(books):
    invoice = books.invoice(10_000, date(2026, 12, 1))
    books.pay(invoice, 4_000, TOMORROW)
    assert moved(books.month("2026-11")) == ("0", 0, "0", 0)


# Where each open invoice lands (Y5, Y6)


@pytest.mark.parametrize(
    ("due", "lands"),
    [
        (date(2026, 11, 12), date(2026, 11, 12)),
        (TODAY, TOMORROW),
        (date(2026, 11, 4), TOMORROW),
        (date(2026, 8, 5), TOMORROW),
        (date(2027, 2, 28), date(2027, 2, 28)),
    ],
    ids=["due next week", "due today", "due yesterday", "three months overdue", "on the forecast's last day"],
)
def test_with_no_payment_history_anywhere_an_invoice_is_expected_on_its_due_date_or_tomorrow(books, due, lands):
    invoice = books.invoice(10_000, due)
    item = books.landing(invoice)
    assert item == {
        "id": invoice,
        "name": "INV-0001",
        "organization": "Harbor & Pine",
        "due_on": due.isoformat(),
        "expected_on": lands.isoformat(),
        "cents": "10000",
        "days_paid_late": 0,
    }


def paid_off(books: Books, customer: int, *days_late: int) -> None:
    """A fully paid invoice for the customer for each, cleared that many days after its due date, or before it."""
    for late in days_late:
        due = date(2026, 6, 1)
        invoice = books.invoice(10_000, due, customer=customer)
        books.pay(invoice, 10_000, due + timedelta(days=late))


DUE = date(2026, 12, 10)


@pytest.mark.parametrize(
    ("history", "average"),
    [((6,), 6), ((-10,), 0), ((2, 3), 3), ((2, 2, 3, 3, 2), 2), ((-4, 5), 3)],
    ids=["a late payer", "an early payer counts as 0", "2.5 rounds up", "2.4 rounds down", "early never below 0"],
)
def test_an_invoice_is_expected_its_customers_average_days_late_after_its_due_date(books, history, average):
    paid_off(books, books.customer, *history)
    invoice = books.invoice(5_000, DUE)
    item = books.landing(invoice)
    assert (item["expected_on"], item["days_paid_late"]) == ((DUE + timedelta(days=average)).isoformat(), average)


def test_the_payment_that_cleared_an_invoice_is_the_one_its_days_late_count_to(books):
    due = date(2026, 6, 1)
    paid = books.invoice(10_000, due)
    books.pay(paid, 6_000, due - timedelta(days=10))
    books.pay(paid, 4_000, due + timedelta(days=4))
    assert books.landing(books.invoice(5_000, DUE))["days_paid_late"] == 4


def test_a_part_paid_invoice_counts_for_whats_owed_but_not_toward_the_average(books):
    paid_off(books, books.customer, 2)
    part_paid = books.invoice(10_000, date(2026, 9, 1))
    books.pay(part_paid, 3_000, date(2026, 10, 1))
    item = books.landing(part_paid)
    assert (item["cents"], item["expected_on"], item["days_paid_late"]) == ("7000", TOMORROW.isoformat(), 2)
    assert books.landing(books.invoice(5_000, DUE))["expected_on"] == "2026-12-12"


def test_a_customer_with_no_fully_paid_invoice_takes_the_average_over_every_one(books, make):
    """Each fully paid invoice counts once: (2 + 3 + 7) / 3 is 4, where the customers' averages would give 5."""
    other, new = make.organization("Bright Lane"), make.organization("Copper Field")
    paid_off(books, books.customer, 2, 3)
    paid_off(books, other, 7)
    invoice = books.invoice(5_000, DUE, customer=new)
    item = books.landing(invoice)
    assert (item["organization"], item["expected_on"], item["days_paid_late"]) == ("Copper Field", "2026-12-14", 4)


def test_drafts_and_void_invoices_are_never_expected_nor_counted_toward_an_average(books):
    paid_off(books, books.customer, 2)
    void = books.invoice(10_000, date(2026, 6, 1), status="void")
    books.pay(void, 10_000, date(2026, 6, 21))
    books.invoice(20_000, date(2026, 12, 1), status="void")
    books.invoice(40_000, date(2026, 12, 1), status="draft")
    invoice = books.invoice(5_000, DUE)
    assert books.landing(invoice)["days_paid_late"] == 2
    assert sum(int(month["expected_in_cents"]) for month in books.flow()["months"]) == 5_000


# Where each unpaid bill lands (Y7, Y8)


@pytest.mark.parametrize(
    ("due", "lands"),
    [(date(2026, 12, 3), date(2026, 12, 3)), (TODAY, TOMORROW), (date(2026, 9, 1), TOMORROW)],
    ids=["due next month", "due today", "overdue"],
)
def test_an_unpaid_bill_is_expected_on_its_due_date_or_tomorrow_at_its_total(books, due, lands):
    bill = books.bill(10_000, due, tax=888)
    assert books.landing(bill, "going_out") == {
        "id": bill,
        "name": "B-1",
        "organization": "Northwind Software",
        "due_on": due.isoformat(),
        "expected_on": lands.isoformat(),
        "cents": "10888",
        "days_paid_late": None,
    }


def test_a_paid_bill_is_never_expected(books):
    books.bill(10_000, date(2026, 12, 3), paid_on=TODAY)
    assert all(month["expected_out_cents"] == "0" for month in books.flow()["months"])


def test_anything_expected_after_the_third_forecast_month_is_left_out(books):
    books.invoice(1_000, date(2027, 2, 28))
    books.invoice(2_000, date(2027, 3, 1))
    books.bill(300, date(2027, 2, 28))
    books.bill(400, date(2027, 3, 1))
    flow = books.flow()
    assert still_expected(books.month("2027-02", flow)) == ("1000", 1, "300", 1)
    assert sum(int(month["expected_in_cents"]) + int(month["expected_out_cents"]) for month in flow["months"]) == 1_300


# The cash balance (Y9 to Y12, Y16)


def test_the_balance_counts_from_the_opening_balances_date_including_that_days_money(books):
    invoice = books.invoice(1_000_000, date(2026, 1, 1))
    books.pay(invoice, 1_000, date(2026, 3, 9))
    books.pay(invoice, 20_000, date(2026, 3, 10))
    books.bill(5_000, date(2026, 4, 1), paid_on=date(2026, 4, 2))
    books.opening(100_000, date(2026, 3, 10))
    flow = books.flow()
    assert flow["opening"] == {"balance_cents": "100000", "on": "2026-03-10"}
    assert books.month("2026-03", flow)["in_cents"] == "21000"
    # What's still owed is overdue, so it's expected tomorrow.
    assert balances(flow) == [None] * 3 + ["120000"] + ["115000"] * 7 + ["1094000"] * 4
    assert (flow["cash_today"], flow["forecast_end"]) == ("115000", "1094000")
    assert [month["balance_with_deals_cents"] for month in flow["months"]] == balances(flow)
    assert flow["forecast_end_with_deals"] == "1094000"


def test_an_opening_balance_before_the_chart_gives_all_15_months_a_balance(books):
    invoice = books.invoice(50_000, date(2025, 6, 1))
    books.pay(invoice, 1_000, date(2025, 5, 31))
    books.pay(invoice, 49_000, date(2025, 7, 1))
    books.opening(10_000, date(2025, 6, 1))
    flow = books.flow()
    assert balances(flow) == ["59000"] * 15
    assert flow["cash_today"] == "59000"


def test_an_opening_balance_this_month_starts_the_balance_this_month(books):
    books.opening(10_000, date(2026, 11, 2))
    assert balances(books.flow()) == [None] * 11 + ["10000"] * 4


def test_the_balance_can_go_below_zero(books):
    books.opening(1_000, date(2026, 10, 1))
    books.bill(424_000, date(2026, 10, 15), tax=1_000, paid_on=date(2026, 10, 20))
    books.bill(500, date(2026, 12, 1))
    flow = books.flow()
    assert balances(flow)[-5:] == ["-424000", "-424000", "-424500", "-424500", "-424500"]
    assert (flow["cash_today"], flow["forecast_end"]) == ("-424000", "-424500")


def test_cash_today_counts_up_to_and_including_today(books):
    invoice = books.invoice(100_000, date(2026, 11, 30))
    books.pay(invoice, 25_000, TODAY)
    books.opening(0, date(2026, 1, 1))
    flow = books.flow()
    assert (flow["cash_today"], flow["forecast_end"]) == ("25000", "100000")


# Likely deals (Y13, Y14)


def test_a_likely_deal_is_its_expected_revenue_on_its_close_date_plus_the_payment_terms(books):
    """$1,010 at 5% is $50.50, which rounds up to $51, and the default terms are 30 days."""
    deal = books.deal(date(2026, 11, 20), value=1_010, probability=5)
    assert books.landing(deal, "likely_deals") == {
        "id": deal,
        "name": "Deal 1",
        "organization": "Harbor & Pine",
        "due_on": "2026-11-20",
        "expected_on": "2026-12-20",
        "cents": "5100",
        "days_paid_late": None,
    }


def test_a_likely_deal_takes_the_payment_terms_in_the_settings(books):
    saved = books.api.patch("/api/settings", json={"company_name": "Plainsong Systems", "payment_terms_days": 0})
    assert saved.status_code == 200
    deal = books.deal(date(2026, 11, 20))
    assert books.landing(deal, "likely_deals")["expected_on"] == "2026-11-20"


def test_a_late_deal_lands_tomorrow_and_closed_deals_and_one_past_the_forecast_are_left_out(books):
    late = books.deal(date(2026, 9, 1), value=2_000, probability=40)
    books.deal(date(2027, 2, 1))
    books.deal(date(2026, 12, 1), stage="won", probability=100)
    books.deal(date(2026, 12, 1), stage="lost", probability=0)
    assert books.landing(late, "likely_deals")["expected_on"] == TOMORROW.isoformat()
    flow = books.flow()
    assert [(month["likely_cents"], month["likely_count"]) for month in flow["months"]][-4:] == [
        ("80000", 1),
        ("0", 0),
        ("0", 0),
        ("0", 0),
    ]


LIKELY = {"likely_cents", "likely_count", "balance_with_deals_cents"}


def forecast(month: dict[str, Any]) -> dict[str, Any]:
    return {name: value for name, value in month.items() if name not in LIKELY}


def test_likely_deals_never_change_the_forecast(books):
    """The balances with them are added up beside the forecast's, never into it (Y14)."""
    books.opening(500_000, date(2026, 1, 1))
    books.invoice(70_000, date(2026, 12, 15))
    books.bill(30_000, date(2027, 1, 10))
    without = books.flow()
    books.deal(date(2026, 10, 1), value=10_000, probability=70)
    books.deal(date(2026, 11, 20), value=40_000, probability=50)
    books.deal(date(2026, 12, 20), value=1_000, probability=10)
    with_deals = books.flow()

    assert [forecast(month) for month in with_deals["months"]] == [forecast(month) for month in without["months"]]
    assert with_deals["forecast_end"] == without["forecast_end"] == "540000"
    assert balances(with_deals)[-5:] == ["500000", "500000", "570000", "540000", "540000"]
    # $7,000 tomorrow, then $20,000 in December and $100 in January.
    assert [month["balance_with_deals_cents"] for month in with_deals["months"]][-5:] == [
        "500000",
        "1200000",
        "3270000",
        "3250000",
        "3250000",
    ]
    assert with_deals["forecast_end_with_deals"] == "3250000"


# A month's list (Y17)


def test_each_months_list_holds_what_its_bars_hold_in_expected_date_order(books):
    first = books.invoice(1_000, date(2026, 12, 20))
    second = books.invoice(2_000, date(2026, 12, 3))
    third = books.invoice(3_000, date(2026, 12, 20))
    books.invoice(4_000, date(2026, 11, 1))
    books.bill(500, date(2027, 1, 31))
    books.bill(600, date(2027, 1, 2))
    books.deal(date(2027, 1, 10))
    flow = books.flow()
    for key in LISTED:
        listed, month = books.listed(key), books.month(key, flow)
        assert listed["month"] == key
        for group, prefix in (("coming_in", "expected_in"), ("going_out", "expected_out"), ("likely_deals", "likely")):
            items = listed[group]["items"]
            assert listed[group]["total_cents"] == month[f"{prefix}_cents"]
            assert sum(int(item["cents"]) for item in items) == int(month[f"{prefix}_cents"])
            assert len(items) == month[f"{prefix}_count"]
            assert [item["expected_on"] for item in items] == sorted(item["expected_on"] for item in items)
    assert [item["id"] for item in books.listed("2026-12")["coming_in"]["items"]] == [second, first, third]
    assert [item["name"] for item in books.listed("2027-01")["going_out"]["items"]] == ["B-6", "B-5"]


@pytest.mark.parametrize("month", ["2026-10", "2025-12", "2027-03", "2030-01"])
def test_a_month_other_than_this_one_and_the_three_after_it_is_missing(books, month):
    """A past month's money has already moved, so it has no list."""
    assert books.api.get(f"{CASH_FLOW}/expected", params={"month": month}).status_code == 404


@pytest.mark.parametrize("month", ["2026-13", "2026-00", "abc", "2026-1", "202612", ""])
def test_a_value_that_isnt_a_month_is_refused(books, month):
    reply = books.api.get(f"{CASH_FLOW}/expected", params={"month": month})
    assert reply.status_code == 422
    assert reply.json()["fields"] == {"month": "Choose a month, such as 2026-12"}


def test_a_list_asked_for_with_no_month_is_refused(books):
    reply = books.api.get(f"{CASH_FLOW}/expected")
    assert (reply.status_code, reply.json()["fields"]) == (422, {"month": "Choose a month, such as 2026-12"})


# Exact figures, and nothing stored (Y19, Y20)


def test_sums_past_2_to_the_53_cents_are_sent_as_exact_digits(books):
    """46 bills at the largest total pass 2^53 cents, where a browser's numbers stop being exact."""
    amounts = [(A_TRILLION_IN_CENTS, A_TRILLION_IN_CENTS)] * 46 + [(1, 0)]
    with db.writing() as conn:
        conn.execute(
            insert(bills),
            [
                {
                    "amount_cents": amount,
                    "tax_cents": tax,
                    "bill_number": f"BIG-{number}",
                    "bill_number_key": bill_number_key(f"BIG-{number}"),
                    "organization_id": books.supplier,
                    "bill_date": date(2026, 11, 1),
                    "due_date": date(2026, 12, 1),
                    "category": "software",
                }
                for number, (amount, tax) in enumerate(amounts)
            ],
        )
    books.opening(0, TODAY)
    exact = "9200000000000001"
    assert int(exact) > 2**53
    flow = books.flow()
    assert books.month("2026-12", flow)["expected_out_cents"] == exact
    assert books.listed("2026-12")["going_out"]["total_cents"] == exact
    assert flow["forecast_end"] == f"-{exact}"


def test_neither_route_writes_anything(books):
    books.opening(10_000, date(2026, 1, 1))
    books.invoice(1_000, date(2026, 12, 1))
    statements: list[str] = []

    def count(_conn, _cursor, statement, *_rest) -> None:
        statements.append(statement)

    event.listen(db.engine(), "before_cursor_execute", count)
    try:
        books.flow()
        books.listed("2026-12")
    finally:
        event.remove(db.engine(), "before_cursor_execute", count)
    assert statements
    assert all(statement.lstrip().upper().startswith("SELECT") for statement in statements), statements


def test_the_areas_give_the_cash_flow_their_money(local_app):
    """Without checking they're the only ones, so a later area can join them."""
    given = local_app.state.cash
    assert invoices_cash.CASH in given and invoices_cash.CASH.flow == "in"
    assert bills_cash.CASH in given and bills_cash.CASH.flow == "out"
    assert crm_cash.CASH in given and crm_cash.CASH.flow == "likely"
    assert crm_cash.CASH.moved is None
