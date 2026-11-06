"""The Profit and loss page's two reads (X1 to X7, X13, X15 to X17), against a small dataset with known
answers, today fixed at 2026-10-31, and the sums checked against the entries read straight from the tables."""

from collections import defaultdict
from datetime import date

import pytest
from accountable import db
from accountable.books import post
from accountable.books.tables import journal_entries, journal_lines
from conftest import NOW
from sqlalchemy import select

PAGE, ENTRIES = "/api/books/profit-and-loss", "/api/books/profit-and-loss/entries"
CATEGORIES = ["software", "contractors", "travel", "office", "marketing", "other"]


def at(day: date):
    return {"now": NOW, "user": None, "on": day}


@pytest.fixture
def books(api, make):
    """Posted through the same code every save uses, with the records that two of the entries name.

    Jan 15: invoice 1, $1,000.00 and $100.00 tax. Feb 10: invoice 2, $500.00, then voided.
    Feb 12: bill 1, $550.00 software, paid Mar 20. Feb 20: bill 2, $300.00 travel, then deleted.
    Mar 5: bill 3, $200.00 office, changed to $250.00. Feb 25: bill 4, $100.00 software, whose date moved to Mar 10.
    Mar 5: $600.00 of invoice 1 paid. Oct 31: invoice 3, $200.00 untaxed. Nov 1: bill 5, $5.00 other.
    """
    deal = make.deal()
    invoice_1 = make.invoice(deal, status="issued", number="INV-0001")
    invoice_2 = make.invoice(deal, status="issued", number="INV-0002")
    invoice_3 = make.invoice(deal, status="issued", number="INV-0003")
    supplier = make.organization("Northwind Software")
    bill_1 = make.bill(supplier, "8841")
    bill_3 = make.bill(supplier, "8843")
    with db.writing() as conn:
        post.opening_balance(conn, cents=1_000_000, **at(date(2026, 1, 1)))
        post.invoice_issued(
            conn,
            invoice_id=invoice_1,
            subtotal_cents=100_000,
            tax_cents=10_000,
            total_cents=110_000,
            number="INV-0001",
            **at(date(2026, 1, 15)),
        )
        post.invoice_issued(
            conn,
            invoice_id=invoice_2,
            subtotal_cents=50_000,
            tax_cents=0,
            total_cents=50_000,
            number="INV-0001",
            **at(date(2026, 2, 10)),
        )
        post.reverse(conn, source=post.invoice_source(invoice_2), event="invoice_voided", user=None, now=NOW)
        post.bill_added(
            conn,
            bill_id=bill_1,
            total_cents=55_000,
            category="software",
            bill_number="B-1",
            supplier=None,
            **at(date(2026, 2, 12)),
        )
        post.bill_paid(conn, bill_id=bill_1, total_cents=55_000, bill_number="B-1", **at(date(2026, 3, 20)))
        post.bill_added(
            conn,
            bill_id=902,
            total_cents=30_000,
            category="travel",
            bill_number="B-1",
            supplier=None,
            **at(date(2026, 2, 20)),
        )
        post.reverse(conn, source=post.bill_source(902), event="bill_deleted", user=None, now=NOW)
        post.bill_added(
            conn,
            bill_id=bill_3,
            total_cents=20_000,
            category="office",
            bill_number="B-1",
            supplier=None,
            **at(date(2026, 3, 5)),
        )
        post.reverse(conn, source=post.bill_source(bill_3), event="bill_changed", user=None, now=NOW)
        post.bill_added(
            conn,
            bill_id=bill_3,
            total_cents=25_000,
            category="office",
            event="bill_changed",
            bill_number="B-1",
            supplier=None,
            **at(date(2026, 3, 5)),
        )
        post.bill_added(
            conn,
            bill_id=904,
            total_cents=10_000,
            category="software",
            bill_number="B-1",
            supplier=None,
            **at(date(2026, 2, 25)),
        )
        post.reverse(conn, source=post.bill_source(904), event="bill_changed", user=None, now=NOW)
        post.bill_added(
            conn,
            bill_id=904,
            total_cents=10_000,
            category="software",
            event="bill_changed",
            bill_number="B-1",
            supplier=None,
            **at(date(2026, 3, 10)),
        )
        post.payment_recorded(
            conn, payment_id=1, invoice_id=invoice_1, cents=60_000, number="INV-0001", **at(date(2026, 3, 5))
        )
        post.invoice_issued(
            conn,
            invoice_id=invoice_3,
            subtotal_cents=20_000,
            tax_cents=0,
            total_cents=20_000,
            number="INV-0001",
            **at(date(2026, 10, 31)),
        )
        post.bill_added(
            conn,
            bill_id=905,
            total_cents=500,
            category="other",
            bill_number="B-1",
            supplier=None,
            **at(date(2026, 11, 1)),
        )
    return api


def page(api, **params) -> dict:
    reply = api.get(PAGE, params=params)
    assert reply.status_code == 200, reply.text
    return reply.json()


def categories(figures: dict) -> dict[str, int]:
    return {each["category"]: int(each["cents"]) for each in figures["categories"]}


def from_the_tables(first: date, last: date) -> dict[str, int]:
    """Revenue and each expense account over the entries dated in the range, read straight from the tables."""
    found: dict[str, int] = defaultdict(int)
    with db.reading() as conn:
        rows = conn.execute(
            select(journal_lines.c.account, journal_lines.c.debit_cents, journal_lines.c.credit_cents)
            .join(journal_entries, journal_entries.c.id == journal_lines.c.entry_id)
            .where(journal_entries.c.entry_date >= first, journal_entries.c.entry_date <= last)
        )
        for account, debit, credit in rows:
            if account == "revenue":
                found["revenue"] += credit - debit
            elif account.startswith("expense_"):
                found[account.removeprefix("expense_")] += debit - credit
    return found


def test_the_chart_has_the_last_12_months_with_each_months_figures_from_the_books(books):
    reply = page(books)
    assert reply["today"] == "2026-10-31"
    assert [month["month"] for month in reply["months"]] == ["2025-11", "2025-12"] + [
        f"2026-{n:02d}" for n in range(1, 11)
    ]
    for month in reply["months"]:
        entries = from_the_tables(date.fromisoformat(month["first"]), date.fromisoformat(month["last"]))
        assert int(month["revenue_cents"]) == entries["revenue"], month["month"]
        assert categories(month) == {name: entries[name] for name in CATEGORIES}, month["month"]
        assert int(month["expenses_cents"]) == sum(entries[name] for name in CATEGORIES)
        assert int(month["profit_cents"]) == int(month["revenue_cents"]) - int(month["expenses_cents"])


def test_each_month_follows_what_was_true_when_it_was_dated(books):
    by_month = {month["month"]: month for month in page(books)["months"]}
    assert int(by_month["2026-01"]["revenue_cents"]) == 100_000  # the subtotal, never the tax
    assert int(by_month["2026-02"]["revenue_cents"]) == 0  # issued then voided
    assert categories(by_month["2026-02"])["software"] == 55_000  # bill 4's reversal cancels its first entry
    assert categories(by_month["2026-02"])["travel"] == 0  # a deleted bill
    assert int(by_month["2026-02"]["profit_cents"]) == -55_000
    assert categories(by_month["2026-03"])["software"] == 10_000  # bill 4 now dated in March
    assert categories(by_month["2026-03"])["office"] == 25_000  # bill 3 changed in its amount
    assert int(by_month["2026-10"]["revenue_cents"]) == 20_000
    assert int(by_month["2025-12"]["expenses_cents"]) == 0


def test_a_payment_a_paid_bill_and_the_opening_balance_change_no_figure(books, api):
    before = page(api, period="year", on="2026-06-01")["period"]
    with db.writing() as conn:
        post.payment_recorded(conn, payment_id=2, invoice_id=1, cents=50_000, number="INV-0001", **at(date(2026, 4, 1)))
        post.bill_paid(conn, bill_id=906, total_cents=1_000, bill_number="B-1", **at(date(2026, 4, 1)))
        post.opening_balance(conn, cents=5, event="opening_balance_changed", **at(date(2026, 4, 1)))
    assert page(api, period="year", on="2026-06-01")["period"] == before


def test_the_statement_adds_up_for_a_month_a_quarter_and_a_year(books):
    for kind, day, first, last in [
        ("month", "2026-03-15", date(2026, 3, 1), date(2026, 3, 31)),
        ("quarter", "2026-03-15", date(2026, 1, 1), date(2026, 3, 31)),
        ("year", "2026-03-15", date(2026, 1, 1), date(2026, 12, 31)),
    ]:
        shown = page(books, period=kind, on=day)["period"]
        entries = from_the_tables(first, last)
        assert (shown["first"], shown["last"]) == (first.isoformat(), last.isoformat())
        assert int(shown["revenue_cents"]) == entries["revenue"]
        assert categories(shown) == {name: entries[name] for name in CATEGORIES}
        assert int(shown["expenses_cents"]) == sum(categories(shown).values())
        assert int(shown["profit_cents"]) == int(shown["revenue_cents"]) - int(shown["expenses_cents"])


def test_a_months_statement_equals_its_chart_column(books):
    column = next(month for month in page(books)["months"] if month["month"] == "2026-03")
    shown = page(books, period="month", on="2026-03-31")["period"]
    for key in ("revenue_cents", "expenses_cents", "profit_cents", "margin_tenths", "categories"):
        assert shown[key] == column[key]


def test_the_march_statement_and_its_changes(books):
    shown = page(books, period="month", on="2026-03-10")["period"]
    assert (shown["kind"], shown["label"], shown["current"]) == ("month", "March 2026", False)
    assert [int(shown[key]) for key in ("revenue_cents", "expenses_cents", "profit_cents")] == [0, 35_000, -35_000]
    assert shown["margin_tenths"] is None
    changes = shown["changes"]
    assert changes["revenue"] == {"kind": "none", "value": None}
    assert changes["expenses"] == {"kind": "percent", "value": -36}  # 55,000 down to 35,000
    assert changes["profit"] == {"kind": "percent", "value": 36}  # a loss that shrinks goes up
    assert changes["margin"] == {"kind": "none", "value": None}
    assert changes["categories"][3] == {"kind": "new", "value": None}  # office
    assert changes["categories"][0]["value"] == -82
    assert page(books, period="month", on="2026-03-10")["previous"]["label"] == "February 2026"


def test_the_margin_is_in_tenths_and_its_change_in_points(books):
    january = page(books, period="month", on="2026-01-20")["period"]
    assert january["margin_tenths"] == 1000
    october = page(books, period="month")["period"]
    assert october["margin_tenths"] == 1000
    assert october["changes"]["margin"] == {"kind": "new", "value": None}


def test_the_current_period_counts_whole_including_entries_after_today(books, local_app):
    local_app.dependency_overrides[db.local_today] = lambda: date(2026, 10, 15)
    with db.writing() as conn:
        post.bill_added(
            conn,
            bill_id=907,
            total_cents=7_000,
            category="travel",
            bill_number="B-1",
            supplier=None,
            **at(date(2026, 10, 16)),
        )
    reply = page(books)
    shown = reply["period"]
    assert shown["current"] is True
    assert categories(shown)["travel"] == 7_000
    assert categories(reply["months"][-1])["travel"] == 7_000
    # The whole of the previous month is the comparison, and the quarter still going counts whole.
    quarter = page(books, period="quarter")["period"]
    assert (quarter["label"], quarter["current"], quarter["last"]) == ("Q4 2026", True, "2026-12-31")
    assert quarter["changes"]["revenue"]["kind"] == "new"


def test_the_arrows_stop_at_the_current_period_and_the_earliest_entry(books):
    current = page(books)["period"]
    assert (current["forward_on"], current["back_on"]) == (None, "2026-09-01")
    march = page(books, period="month", on="2026-03-31")["period"]
    assert (march["back_on"], march["forward_on"]) == ("2026-02-01", "2026-04-01")
    january = page(books, period="month", on="2026-01-31")["period"]
    assert january["back_on"] is None  # the earliest entry on revenue or an expense is Jan 15
    assert page(books, period="quarter", on="2026-03-01")["period"]["back_on"] is None
    year = page(books, period="year")["period"]
    assert (year["back_on"], year["forward_on"]) == (None, None)
    assert page(books, period="year", on="2025-05-05")["period"]["forward_on"] == "2026-01-01"


def test_with_no_entries_both_arrows_are_off_and_everything_is_zero(api):
    reply = page(api)
    shown = reply["period"]
    assert (shown["back_on"], shown["forward_on"]) == (None, None)
    assert [int(shown[key]) for key in ("revenue_cents", "expenses_cents", "profit_cents")] == [0, 0, 0]
    assert shown["margin_tenths"] is None
    assert len(reply["months"]) == 12
    assert {month["revenue_cents"] for month in reply["months"]} == {"0"}
    assert shown["changes"]["revenue"] == {"kind": "none", "value": None}
    assert [change["kind"] for change in shown["changes"]["categories"]] == ["none"] * 6


def test_the_12_months_cross_the_turn_of_a_year(books, local_app):
    local_app.dependency_overrides[db.local_today] = lambda: date(2027, 1, 5)
    reply = page(books)
    assert [month["month"] for month in reply["months"]][:2] == ["2026-02", "2026-03"]
    assert reply["months"][-1]["month"] == "2027-01"
    assert reply["period"]["label"] == "January 2027"
    assert reply["previous"]["label"] == "December 2026"


@pytest.mark.parametrize(
    ("params", "field", "message"),
    [
        ({"period": "week"}, "period", "Choose a month, quarter or year"),
        ({"period": ""}, "period", "Choose a month, quarter or year"),
        ({"on": "tomorrow"}, "on", "Enter a date, such as 2026-12-31"),
        ({"on": "2026-11-01"}, "on", "The date can't be in the future"),
    ],
)
def test_a_bad_period_or_day_is_refused_beside_its_field(api, params, field, message):
    reply = api.get(PAGE, params=params)
    assert (reply.status_code, reply.json()["fields"]) == (422, {field: message})


def test_nothing_is_stored_so_a_new_entry_changes_the_figures_with_no_other_write(books):
    before = int(page(books)["period"]["revenue_cents"])
    with db.writing() as conn:
        post.invoice_issued(
            conn,
            invoice_id=77,
            subtotal_cents=1_234,
            tax_cents=100,
            total_cents=1_334,
            number="INV-0001",
            **at(date(2026, 10, 2)),
        )
    assert int(page(books)["period"]["revenue_cents"]) == before + 1_234


def test_sums_past_2_to_the_53_cents_are_exact_strings(api):
    huge = 2**60
    with db.writing() as conn:
        post.invoice_issued(
            conn,
            invoice_id=1,
            subtotal_cents=huge,
            tax_cents=0,
            total_cents=huge,
            number="INV-0001",
            **at(date(2026, 10, 2)),
        )
        post.bill_added(
            conn,
            bill_id=1,
            total_cents=huge + 1,
            category="other",
            bill_number="B-1",
            supplier=None,
            **at(date(2026, 10, 3)),
        )
    shown = page(api)["period"]
    assert shown["revenue_cents"] == str(huge)
    assert shown["expenses_cents"] == str(huge + 1)
    assert shown["profit_cents"] == "-1"


def test_the_reads_are_a_fixed_few_with_one_entry_and_with_many(api):
    from sqlalchemy import event

    def reads() -> int:
        statements: list[str] = []

        def count(_conn, _cursor, statement, *_rest) -> None:
            statements.append(statement)

        event.listen(db.engine(), "before_cursor_execute", count)
        try:
            assert api.get(PAGE).status_code == 200
        finally:
            event.remove(db.engine(), "before_cursor_execute", count)
        return len(statements)

    with db.writing() as conn:
        post.invoice_issued(
            conn, invoice_id=1, subtotal_cents=5, tax_cents=0, total_cents=5, number="INV-0001", **at(date(2026, 10, 1))
        )
    one = reads()
    with db.writing() as conn:
        for number in range(2, 202):
            post.bill_added(
                conn,
                bill_id=number,
                total_cents=5,
                category="other",
                bill_number="B-1",
                supplier=None,
                **at(date(2026, 9, 1 + number % 28)),
            )
    assert reads() == one <= 4


# The entries behind a figure (X13)


def entries_behind(api, figure: str, first: str, last: str, **params) -> dict:
    reply = api.get(ENTRIES, params={"figure": figure, "from": first, "to": last, **params})
    assert reply.status_code == 200, reply.text
    return reply.json()


def every_page(api, figure: str, first: str, last: str, size: int = 2) -> tuple[dict, list[dict]]:
    found, offset = [], 0
    while True:
        reply = entries_behind(api, figure, first, last, limit=size, offset=offset)
        found += reply["entries"]
        offset += size
        if offset >= reply["count"]:
            return reply, found


@pytest.mark.parametrize(
    ("first", "last", "kind"),
    [
        ("2026-03-01", "2026-03-31", "month"),
        ("2026-01-01", "2026-03-31", "quarter"),
        ("2026-01-01", "2026-12-31", "year"),
    ],
)
@pytest.mark.parametrize("figure", ["revenue", "expenses", "profit", *(f"expense_{name}" for name in CATEGORIES)])
def test_the_amounts_of_every_page_add_up_to_the_figure(books, figure, first, last, kind):
    shown = page(books, period=kind, on=first)["period"]
    expected = {
        "revenue": int(shown["revenue_cents"]),
        "expenses": int(shown["expenses_cents"]),
        "profit": int(shown["profit_cents"]),
        **{f"expense_{name}": cents for name, cents in categories(shown).items()},
    }[figure]
    reply, found = every_page(books, figure, first, last)
    assert int(reply["total"]) == expected
    assert sum(int(entry["amount"]) for entry in found) == expected
    assert len(found) == reply["count"] == len({entry["id"] for entry in found})


def test_the_list_is_newest_first_then_by_id_and_pages_give_each_entry_once(books):
    reply = entries_behind(books, "expenses", "2026-01-01", "2026-12-31")
    assert [(entry["entry_date"], entry["id"]) for entry in reply["entries"]] == sorted(
        [(entry["entry_date"], entry["id"]) for entry in reply["entries"]],
        key=lambda each: (-date.fromisoformat(each[0]).toordinal(), each[1]),
    )
    first = entries_behind(books, "expenses", "2026-01-01", "2026-12-31", limit=3)
    second = entries_behind(books, "expenses", "2026-01-01", "2026-12-31", limit=3, offset=3)
    ids = [entry["id"] for entry in first["entries"] + second["entries"]]
    assert ids == [entry["id"] for entry in reply["entries"]][: len(ids)]
    assert first["count"] == second["count"] == reply["count"] == 10


def test_which_entries_are_behind_which_figure(books):
    def events(figure: str, first="2026-01-01", last="2026-12-31") -> list[tuple[str, str]]:
        return [(entry["kind"], entry["event"]) for entry in entries_behind(books, figure, first, last)["entries"]]

    revenue = events("revenue")
    assert sorted(revenue) == sorted([("invoice", "invoice_issued")] * 3 + [("invoice", "invoice_voided")])
    assert len(events("expense_software")) == 4  # bill 1, and bill 4 added, reversed and added again
    assert events("expense_travel") == [("bill", "bill_added"), ("bill", "bill_deleted")]
    assert len(events("expenses")) == 10
    assert len(events("profit")) == 14
    for figure in ("revenue", "expenses", "profit"):
        assert {kind for kind, _ in events(figure)} <= {"invoice", "bill"}  # no payment, paid bill or opening balance


def test_a_changed_bill_lists_its_reversal_and_its_new_entry(books):
    office = entries_behind(books, "expense_office", "2026-03-01", "2026-03-31")
    assert sorted((entry["event"], entry["amount"]) for entry in office["entries"]) == [
        ("bill_added", "20000"),
        ("bill_changed", "-20000"),
        ("bill_changed", "25000"),
    ]
    reversal = next(entry for entry in office["entries"] if entry["amount"] == "-20000")
    assert reversal["reverses_id"] is not None
    assert office["total"] == "25000"


def test_an_entry_is_named_by_its_record_and_a_deleted_or_unnamed_one_by_nothing(books):
    found = entries_behind(books, "profit", "2026-01-01", "2026-12-31", limit=500)["entries"]
    labels = {(entry["kind"], entry["source_id"]): entry["label"] for entry in found}
    assert sorted(label for label in labels.values() if label) == [
        "8841 from Northwind Software",
        "8843 from Northwind Software",
        "INV-0001",
        "INV-0002",
        "INV-0003",
    ]
    deleted = [entry for entry in found if entry["source_id"] in (902, 904, 905)]
    assert deleted
    assert all(entry["label"] is None for entry in deleted)
    every = books.get("/api/books/entries", params={"limit": 500}).json()["entries"]
    assert {entry["kind"] for entry in every if entry["label"] is None} >= {"payment", "opening_balance"}
    assert all(entry["label"] for entry in every if entry["kind"] == "invoice")


def test_a_bill_payments_label_is_its_bills(books):
    paid = [
        entry
        for entry in books.get("/api/books/entries", params={"limit": 500}).json()["entries"]
        if entry["kind"] == "bill_payment"
    ]
    assert [entry["label"] for entry in paid] == ["8841 from Northwind Software"]


@pytest.mark.parametrize(
    "params",
    [
        {"figure": "cash", "from": "2026-01-01", "to": "2026-12-31"},
        {"figure": "", "from": "2026-01-01", "to": "2026-12-31"},
        {"from": "2026-01-01", "to": "2026-12-31"},
        {"figure": "revenue", "from": "soon", "to": "2026-12-31"},
        {"figure": "revenue", "from": "2026-01-01"},
        {"figure": "revenue", "from": "2026-01-01", "to": "2026-12-31", "limit": 0},
        {"figure": "revenue", "from": "2026-01-01", "to": "2026-12-31", "limit": 501},
        {"figure": "revenue", "from": "2026-01-01", "to": "2026-12-31", "offset": -1},
    ],
)
def test_a_bad_figure_date_or_limit_is_refused(api, params):
    assert api.get(ENTRIES, params=params).status_code == 422


def test_an_unknown_figure_names_its_message(api):
    reply = api.get(ENTRIES, params={"figure": "cash", "from": "2026-01-01", "to": "2026-12-31"})
    assert reply.json()["fields"] == {"figure": "Choose a figure from the statement"}


def test_a_range_with_nothing_in_it_is_an_empty_list_with_a_zero_total(books):
    reply = entries_behind(books, "profit", "2025-01-01", "2025-01-31")
    assert (reply["count"], reply["total"], reply["entries"]) == (0, "0", [])
