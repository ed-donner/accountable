"""The aged balances (X1 to X20): the parts on their own, then through GET /api/aged-balances/customers and
/suppliers on a few records with known answers and the day fixed."""

from datetime import date, timedelta
from typing import Any

import pytest
from accountable import db
from accountable.aging import ages
from accountable.bills.tables import bill_number_key, bills
from accountable.invoices import figures
from sqlalchemy import insert

DAY = date(2026, 9, 30)
CUSTOMERS = "/api/aged-balances/customers"
SUPPLIERS = "/api/aged-balances/suppliers"
BOUNDARIES = [0, 1, 30, 31, 60, 61, 90, 91]
PART_OF_BOUNDARY = {
    0: "not_due",
    1: "1_30",
    30: "1_30",
    31: "31_60",
    60: "31_60",
    61: "61_90",
    90: "61_90",
    91: "over_90",
}
A_TRILLION_IN_CENTS = 100_000_000_000_000


@pytest.mark.parametrize(
    ("days", "part"),
    [
        (-1, "not_due"),
        (0, "not_due"),
        (1, "1_30"),
        (30, "1_30"),
        (31, "31_60"),
        (60, "31_60"),
        (61, "61_90"),
        (90, "61_90"),
        (91, "over_90"),
    ],
)
def test_the_part_of_a_day_count(days, part):
    assert ages.part_of(days) == part


def test_the_parts_agree_with_the_dashboards_groups_on_every_day():
    assert ages.PARTS == figures.GROUPS
    today = date(2026, 11, 5)
    for days in range(-5, 401):
        assert ages.part_of(days) == figures.late_group(today - timedelta(days=days), today), days


def owed(id: int, organization: int, name: str, days: int, cents: int, number: str = "N") -> ages.Owed:
    return ages.Owed(id, organization, name, number, DAY - timedelta(days=days), cents)


def test_rows_are_ordered_by_oldest_then_amount_then_name_then_id():
    rows, _ = ages.aged(
        [
            owed(1, 1, "Zed", 10, 500),
            owed(2, 2, "Bea", 10, 500),
            owed(3, 3, "al", 10, 500),
            owed(4, 4, "Al", 10, 500),
            owed(5, 5, "Big", 10, 900),
            owed(6, 6, "Old", 95, 1),
            owed(7, 7, "Soon", -5, 100),
            owed(8, 8, "Sooner", -2, 300),
        ],
        DAY,
    )
    assert [row.name for row in rows] == ["Old", "Big", "al", "Al", "Bea", "Zed", "Sooner", "Soon"]


def test_an_organizations_oldest_is_its_oldest_item_and_never_below_zero():
    rows, _ = ages.aged([owed(1, 1, "A", -9, 1), owed(2, 1, "A", 40, 1), owed(3, 2, "B", -9, 1)], DAY)
    assert [(row.name, row.oldest) for row in rows] == [("A", 40), ("B", 0)]


def test_items_are_ordered_by_due_date_then_number():
    rows, _ = ages.aged(
        [owed(1, 1, "A", 5, 1, "B-2"), owed(2, 1, "A", 5, 1, "B-1"), owed(3, 1, "A", 50, 1, "B-9")], DAY
    )
    assert [item.number for item in rows[0].items] == ["B-9", "B-1", "B-2"]


class Aged:
    """A customer, a supplier and a won deal, with invoices and bills put straight into the database."""

    def __init__(self, api, make) -> None:
        self.api, self.make = api, make
        self.customer = make.organization("Harbor & Pine")
        self.supplier = make.organization("Northwind Software")
        self.deal = make.deal("Annual support", stage="won", organization_id=self.customer)
        self.made = 0
        self.on(DAY)

    def on(self, day: date) -> None:
        self.api.app.dependency_overrides[db.local_today] = lambda: day

    def _number(self) -> int:
        self.made += 1
        return self.made

    def invoice(
        self,
        cents: int,
        due: date,
        *,
        customer: int | None = None,
        issued: date | None = None,
        status: str = "issued",
        number: str | None = None,
    ) -> int:
        return self.make.invoice(
            self.deal,
            status=status,
            number=number or f"INV-{self._number():04d}",
            organization_id=self.customer if customer is None else customer,
            issue_date=issued or due - timedelta(days=30),
            due_date=due,
            subtotal_cents=cents,
            tax_cents=0,
            total_cents=cents,
        )

    def bill(
        self,
        cents: int,
        due: date,
        *,
        tax: int = 0,
        supplier: int | None = None,
        dated: date | None = None,
        paid_on: date | None = None,
        number: str | None = None,
    ) -> int:
        return self.make.bill(
            self.supplier if supplier is None else supplier,
            number or f"B-{self._number()}",
            bill_date=dated or due - timedelta(days=30),
            due_date=due,
            amount_cents=cents,
            tax_cents=tax,
            paid_on=paid_on,
        )

    def read(self, path: str, on: date | None = None) -> dict[str, Any]:
        reply = self.api.get(path, params={} if on is None else {"on": on.isoformat()})
        assert reply.status_code == 200, reply.text
        return reply.json()

    def total(self, path: str, on: date | None = None) -> int:
        return int(self.read(path, on)["totals"]["total_cents"])


@pytest.fixture
def aged(api, make) -> Aged:
    return Aged(api, make)


def amounts(parts: list[dict[str, Any]]) -> dict[str, int]:
    return {part["key"]: int(part["cents"]) for part in parts}


def only_row(reply: dict[str, Any]) -> dict[str, Any]:
    [row] = reply["rows"]
    return row


@pytest.mark.parametrize("days", BOUNDARIES)
def test_an_invoice_is_in_the_part_its_days_past_due_say(aged, days):
    aged.invoice(1000, DAY - timedelta(days=days))
    row = only_row(aged.read(CUSTOMERS))
    assert {key for key, cents in amounts(row["parts"]).items() if cents} == {PART_OF_BOUNDARY[days]}
    assert row["items"][0]["days_past_due"] == days


@pytest.mark.parametrize("days", BOUNDARIES)
def test_a_bill_is_in_the_part_its_days_past_due_say(aged, days):
    aged.bill(1000, DAY - timedelta(days=days))
    row = only_row(aged.read(SUPPLIERS))
    assert {key for key, cents in amounts(row["parts"]).items() if cents} == {PART_OF_BOUNDARY[days]}


@pytest.mark.parametrize("days", [-1, 0])
def test_due_on_the_day_and_the_day_after_are_not_yet_due(aged, days):
    aged.invoice(1000, DAY - timedelta(days=days))
    aged.bill(1000, DAY - timedelta(days=days))
    for path in (CUSTOMERS, SUPPLIERS):
        assert amounts(only_row(aged.read(path))["parts"])["not_due"] == 1000


def test_a_payment_counts_from_its_own_day(aged):
    invoice = aged.invoice(10_000, DAY - timedelta(days=10), issued=DAY - timedelta(days=40))
    aged.make.payment(invoice, 2500, DAY - timedelta(days=5))
    aged.make.payment(invoice, 1000, DAY)
    aged.make.payment(invoice, 500, DAY + timedelta(days=1))
    # Payments dated up to and including the day count, so the one dated after doesn't.
    assert aged.total(CUSTOMERS, DAY) == 6500
    assert aged.total(CUSTOMERS, DAY - timedelta(days=5)) == 7500
    assert aged.total(CUSTOMERS, DAY - timedelta(days=6)) == 10_000
    assert only_row(aged.read(CUSTOMERS, DAY))["items"][0]["cents"] == "6500"


def test_a_fully_paid_invoice_is_not_listed_until_the_day_before_its_payment(aged):
    invoice = aged.invoice(10_000, DAY - timedelta(days=10), issued=DAY - timedelta(days=40))
    aged.make.payment(invoice, 10_000, DAY - timedelta(days=2))
    assert aged.read(CUSTOMERS)["rows"] == []
    assert aged.total(CUSTOMERS, DAY - timedelta(days=3)) == 10_000


def test_an_invoice_issued_after_the_day_is_not_counted(aged):
    aged.invoice(10_000, DAY + timedelta(days=5), issued=DAY + timedelta(days=1))
    assert aged.total(CUSTOMERS, DAY) == 0
    assert aged.total(CUSTOMERS, DAY - timedelta(days=1)) == 0
    aged.on(DAY + timedelta(days=1))
    assert aged.total(CUSTOMERS) == 10_000


def test_a_draft_and_a_void_invoice_are_never_counted(aged):
    aged.invoice(10_000, DAY - timedelta(days=3), status="draft")
    aged.invoice(10_000, DAY - timedelta(days=3), status="void")
    for day in (DAY, DAY - timedelta(days=20), DAY - timedelta(days=40)):
        assert aged.read(CUSTOMERS, day)["rows"] == []


def test_a_bill_is_owed_from_its_date_until_its_paid_day(aged):
    aged.bill(1000, DAY - timedelta(days=5), tax=100, dated=DAY - timedelta(days=20), paid_on=DAY)
    assert aged.total(SUPPLIERS, DAY - timedelta(days=21)) == 0
    assert aged.total(SUPPLIERS, DAY - timedelta(days=20)) == 1100
    assert aged.total(SUPPLIERS, DAY - timedelta(days=1)) == 1100
    # Paid on the day, so it isn't owed on it.
    assert aged.total(SUPPLIERS, DAY) == 0


def test_a_bill_paid_before_the_day_is_not_counted_and_one_paid_after_it_is(aged):
    aged.bill(1000, DAY - timedelta(days=5), paid_on=DAY - timedelta(days=2))
    aged.bill(2000, DAY - timedelta(days=5), paid_on=DAY - timedelta(days=1))
    aged.bill(4000, DAY - timedelta(days=5), paid_on=DAY + timedelta(days=1))
    aged.on(DAY + timedelta(days=1))
    assert aged.total(SUPPLIERS, DAY - timedelta(days=3)) == 7000
    assert aged.total(SUPPLIERS, DAY - timedelta(days=2)) == 6000
    assert aged.total(SUPPLIERS, DAY - timedelta(days=1)) == 4000
    assert aged.total(SUPPLIERS, DAY) == 4000
    assert aged.total(SUPPLIERS) == 0


def test_a_bill_dated_after_the_day_is_not_counted(aged):
    aged.bill(1000, DAY + timedelta(days=10), dated=DAY + timedelta(days=1))
    assert aged.total(SUPPLIERS, DAY) == 0


def test_every_rows_parts_and_the_totals_add_up_in_whole_cents(aged):
    other = aged.make.organization("Birch Row")
    for days, cents in zip(BOUNDARIES, range(101, 109), strict=True):
        aged.invoice(cents, DAY - timedelta(days=days), customer=aged.customer if days % 2 else other)
    reply = aged.read(CUSTOMERS)
    for row in reply["rows"]:
        assert sum(amounts(row["parts"]).values()) == int(row["total_cents"])
        assert sum(int(item["cents"]) for item in row["items"]) == int(row["total_cents"])
        assert sum(part["count"] for part in row["parts"]) == len(row["items"])
    totals = reply["totals"]
    assert sum(amounts(totals["parts"]).values()) == int(totals["total_cents"]) == sum(range(101, 109))
    assert totals["total_cents"] == str(sum(int(row["total_cents"]) for row in reply["rows"]))
    assert [part["key"] for part in totals["parts"]] == ages.PARTS


def test_sums_past_two_to_the_53_stay_exact_as_strings(aged):
    rows = [
        {
            "organization_id": aged.supplier,
            "bill_number": f"N{number}",
            "bill_number_key": bill_number_key(f"N{number}"),
            "bill_date": DAY - timedelta(days=100),
            "due_date": DAY - timedelta(days=95),
            "amount_cents": A_TRILLION_IN_CENTS,
            "tax_cents": 1,
            "category": "software",
        }
        for number in range(100)
    ]
    with db.writing() as conn:
        conn.execute(insert(bills), rows)
    totals = aged.read(SUPPLIERS)["totals"]
    assert totals["total_cents"] == str(100 * (A_TRILLION_IN_CENTS + 1))
    assert 100 * A_TRILLION_IN_CENTS > 2**53
    assert totals["parts"][4]["cents"] == totals["total_cents"]


def test_an_organization_that_is_both_is_in_each_view_with_its_own_figures(aged):
    aged.invoice(7000, DAY - timedelta(days=3))
    aged.bill(900, DAY - timedelta(days=40), supplier=aged.customer)
    customers, suppliers = aged.read(CUSTOMERS), aged.read(SUPPLIERS)
    assert [(row["name"], row["total_cents"]) for row in customers["rows"]] == [("Harbor & Pine", "7000")]
    assert [(row["name"], row["total_cents"]) for row in suppliers["rows"]] == [("Harbor & Pine", "900")]


def test_rows_come_oldest_first_and_organizations_owing_nothing_are_left_out(aged):
    young = aged.make.organization("Young Co")
    soon = aged.make.organization("Soon Co")
    paid = aged.make.organization("Paid Co")
    aged.invoice(100, DAY - timedelta(days=5), customer=young)
    aged.invoice(100, DAY + timedelta(days=5), customer=soon)
    aged.invoice(100, DAY - timedelta(days=95))
    done = aged.invoice(100, DAY - timedelta(days=95), customer=paid)
    aged.make.payment(done, 100, DAY - timedelta(days=1))
    reply = aged.read(CUSTOMERS)
    assert [row["name"] for row in reply["rows"]] == ["Harbor & Pine", "Young Co", "Soon Co"]
    assert [row["oldest_days_past_due"] for row in reply["rows"]] == [95, 5, 0]


def test_items_have_their_figures_and_a_part_paid_one_shows_what_is_left(aged):
    first = aged.invoice(5000, DAY - timedelta(days=45), number="INV-0002")
    aged.invoice(300, DAY - timedelta(days=45), number="INV-0001")
    aged.invoice(700, DAY - timedelta(days=2), number="INV-0003")
    aged.make.payment(first, 2000, DAY - timedelta(days=1))
    items = only_row(aged.read(CUSTOMERS))["items"]
    assert [item["number"] for item in items] == ["INV-0001", "INV-0002", "INV-0003"]
    assert [item["cents"] for item in items] == ["300", "3000", "700"]
    assert [item["part"] for item in items] == ["31_60", "31_60", "1_30"]
    assert items[2]["due_on"] == (DAY - timedelta(days=2)).isoformat()
    assert all({"id", "days_past_due"} <= set(item) for item in items)


def test_a_bills_item_has_the_suppliers_number_and_its_total_with_tax(aged):
    bill = aged.bill(1000, DAY - timedelta(days=3), tax=80, number="SUP-9")
    [item] = only_row(aged.read(SUPPLIERS))["items"]
    assert (item["id"], item["number"], item["cents"]) == (bill, "SUP-9", "1080")


def test_the_reply_says_todays_date_and_the_day_shown(aged):
    aged.invoice(100, DAY)
    reply = aged.read(CUSTOMERS, DAY - timedelta(days=1))
    assert (reply["today"], reply["on"]) == (DAY.isoformat(), (DAY - timedelta(days=1)).isoformat())
    assert aged.read(CUSTOMERS)["on"] == DAY.isoformat()


@pytest.mark.parametrize("path", [CUSTOMERS, SUPPLIERS])
def test_a_day_before_any_record_gives_the_empty_view(aged, path):
    aged.invoice(100, DAY)
    aged.bill(100, DAY)
    reply = aged.read(path, date(2000, 1, 1))
    assert reply["rows"] == []
    assert reply["totals"]["total_cents"] == "0"
    assert [part["cents"] for part in reply["totals"]["parts"]] == ["0"] * 5


@pytest.mark.parametrize("path", [CUSTOMERS, SUPPLIERS])
@pytest.mark.parametrize("on", ["2026-09-29", "2026-09-30"])
def test_the_day_may_be_today_or_earlier(aged, path, on):
    assert aged.api.get(path, params={"on": on}).status_code == 200


@pytest.mark.parametrize("path", [CUSTOMERS, SUPPLIERS])
@pytest.mark.parametrize("on", ["2026-10-01", "2099-01-01", "soon", "2026-13-01", ""])
def test_a_later_day_or_one_that_is_not_a_date_is_refused_with_a_message(aged, path, on):
    reply = aged.api.get(path, params={"on": on})
    assert reply.status_code == 422
    assert reply.json()["fields"] == {"on": "Choose today or an earlier day"}


@pytest.mark.parametrize("path", [CUSTOMERS, SUPPLIERS])
@pytest.mark.parametrize("method", ["post", "patch", "delete"])
def test_the_views_only_read(aged, path, method):
    assert getattr(aged.api, method)(path, **({} if method == "delete" else {"json": {}})).status_code == 405
