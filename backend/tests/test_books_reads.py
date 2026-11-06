"""The books' three reads (J12), against a small dataset with known answers and today fixed at 2026-10-31."""

from datetime import date

import pytest
from accountable import db
from accountable.books import accounts, post
from conftest import NOW

BALANCES, MONTHS, ENTRIES = "/api/books/balances", "/api/books/months", "/api/books/entries"
ACCOUNT_KEYS = list(accounts.KEYS)


def at(day: date):
    return {"now": NOW, "user": None, "on": day}


@pytest.fixture
def books(api):
    """Posted through the same code every save uses.

    Jan 1: $10,000.00 opening balance. Feb 10: invoice 1 for $1,000.00 and $100.00 tax. Mar 5: $600.00 of it paid.
    Mar 20: bill 1, $500.00 and $50.00 tax, paid Apr 2. Apr 10: bill 2 for $300.00, then deleted the same day.
    Oct 31 (today): invoice 2 for $200.00 untaxed. Nov 1: a $5.00 bill, tomorrow's.
    """
    with db.writing() as conn:
        post.opening_balance(conn, cents=1_000_000, **at(date(2026, 1, 1)))
        post.invoice_issued(
            conn,
            invoice_id=1,
            subtotal_cents=100_000,
            tax_cents=10_000,
            total_cents=110_000,
            number="INV-0001",
            **at(date(2026, 2, 10)),
        )
        post.payment_recorded(conn, payment_id=1, invoice_id=1, cents=60_000, number="INV-0001", **at(date(2026, 3, 5)))
        post.bill_added(
            conn,
            bill_id=1,
            total_cents=55_000,
            category="software",
            bill_number="B-1",
            supplier="Northwind",
            **at(date(2026, 3, 20)),
        )
        post.bill_paid(conn, bill_id=1, total_cents=55_000, bill_number="B-1", **at(date(2026, 4, 2)))
        post.bill_added(
            conn,
            bill_id=2,
            total_cents=30_000,
            category="travel",
            bill_number="B-2",
            supplier="Northwind",
            **at(date(2026, 4, 10)),
        )
        post.reverse(conn, source=post.bill_source(2), event="bill_deleted", user=None, now=NOW)
        post.invoice_issued(
            conn,
            invoice_id=2,
            subtotal_cents=20_000,
            tax_cents=0,
            total_cents=20_000,
            number="INV-0002",
            **at(date(2026, 10, 31)),
        )
        post.bill_added(
            conn,
            bill_id=3,
            total_cents=500,
            category="other",
            bill_number="B-3",
            supplier="Northwind",
            **at(date(2026, 11, 1)),
        )
    return api


def balances(api, on: str | None = None) -> dict[str, str]:
    reply = api.get(BALANCES, params={"on": on} if on else {})
    assert reply.status_code == 200, reply.text
    return {account["key"]: account["balance_cents"] for account in reply.json()["accounts"]}


def test_every_account_is_given_in_the_charts_order_with_its_name_and_type(books):
    reply = books.get(BALANCES, params={"on": "2026-12-31"}).json()
    assert [account["key"] for account in reply["accounts"]] == ACCOUNT_KEYS
    assert reply["on"] == "2026-12-31"
    assert [(account["name"], account["type"]) for account in reply["accounts"]][:6] == [
        ("Cash", "asset"),
        ("Receivable", "asset"),
        ("Payable", "liability"),
        ("Tax payable", "liability"),
        ("Owner's equity", "equity"),
        ("Revenue", "revenue"),
    ]
    assert [account["name"] for account in reply["accounts"]][6:] == [
        "Software",
        "Contractors",
        "Travel",
        "Office",
        "Marketing",
        "Other",
    ]


def test_a_balance_counts_the_entries_to_the_day_and_not_the_next(books):
    before = balances(books, "2026-03-04")
    assert (before["cash"], before["receivable"], before["revenue"], before["tax_payable"]) == (
        "1000000",
        "110000",
        "100000",
        "10000",
    )
    on_the_day = balances(books, "2026-03-05")
    assert (on_the_day["cash"], on_the_day["receivable"]) == ("1060000", "50000")


def test_each_types_balance_is_positive_on_its_usual_side(books):
    paid = balances(books, "2026-04-30")
    assert paid["cash"] == str(1_000_000 + 60_000 - 55_000)
    assert paid["owners_equity"] == "1000000"
    assert paid["payable"] == "0"
    assert paid["expense_software"] == "55000"
    assert paid["expense_travel"] == "0"


def test_a_reversal_cancels_its_entry_in_its_own_month(books):
    assert balances(books, "2026-04-09")["payable"] == "0"
    assert balances(books, "2026-04-10")["expense_travel"] == "0"


def test_without_a_day_the_balance_is_todays(books):
    assert balances(books) == balances(books, "2026-10-31")
    assert balances(books)["receivable"] == str(50_000 + 20_000)
    assert balances(books)["expense_other"] == "0"
    assert balances(books, "2026-11-01")["expense_other"] == "500"


def test_a_balance_below_zero_shows_a_minus_sign(api):
    with db.writing() as conn:
        post.bill_paid(conn, bill_id=1, total_cents=500, bill_number="B-1", **at(date(2026, 1, 5)))
    assert balances(api)["cash"] == "-500"
    assert balances(api)["payable"] == "-500"


@pytest.mark.parametrize("value", ["2026-13-01", "tomorrow", "2026-02-30", "20261031"])
def test_a_bad_day_is_refused_with_a_message(api, value):
    reply = api.get(BALANCES, params={"on": value})
    assert (reply.status_code, reply.json()["fields"]) == (422, {"on": "Enter a date, such as 2026-12-31"})


def months(api, **params) -> list[dict]:
    reply = api.get(MONTHS, params=params)
    assert reply.status_code == 200, reply.text
    return reply.json()["months"]


def figures(month: dict, key: str) -> tuple[str, str, str]:
    [found] = [account for account in month["accounts"] if account["key"] == key]
    return found["debit_cents"], found["credit_cents"], found["balance_cents"]


def test_the_default_is_the_last_twelve_months_ending_this_one(books):
    shown = months(books)
    assert [month["month"] for month in shown][:2] == ["2025-11", "2025-12"]
    assert [month["month"] for month in shown][-1] == "2026-10"
    assert len(shown) == 12
    assert (shown[0]["label"], shown[0]["year"]) == ("Nov", 2025)


def test_a_months_debits_credits_and_closing_balance(books):
    shown = {month["month"]: month for month in months(books, **{"from": "2026-01", "to": "2026-04"})}
    assert [month for month in shown] == ["2026-01", "2026-02", "2026-03", "2026-04"]
    assert figures(shown["2026-01"], "cash") == ("1000000", "0", "1000000")
    assert figures(shown["2026-03"], "cash") == ("60000", "0", "1060000")
    assert figures(shown["2026-04"], "cash") == ("0", "55000", "1005000")
    assert figures(shown["2026-04"], "expense_travel") == ("30000", "30000", "0")
    assert figures(shown["2026-02"], "revenue") == ("0", "100000", "100000")


def test_a_balance_carries_on_through_months_with_nothing(books):
    shown = months(books, **{"from": "2026-05", "to": "2026-06"})
    assert [figures(month, "cash") for month in shown] == [("0", "0", "1005000")] * 2


def test_a_range_across_the_turn_of_a_year(books):
    shown = months(books, **{"from": "2025-11", "to": "2026-02"})
    assert [(month["month"], month["label"], month["year"]) for month in shown] == [
        ("2025-11", "Nov", 2025),
        ("2025-12", "Dec", 2025),
        ("2026-01", "Jan", 2026),
        ("2026-02", "Feb", 2026),
    ]
    assert [figures(month, "cash")[2] for month in shown] == ["0", "0", "1000000", "1000000"]


def test_a_months_figures_come_from_the_months_own_entries(books):
    [only] = months(books, **{"from": "2026-10", "to": "2026-10"})
    assert figures(only, "receivable") == ("20000", "0", "70000")


def test_to_alone_ends_the_default_twelve_there(books):
    shown = months(books, to="2026-03")
    assert (shown[0]["month"], shown[-1]["month"], len(shown)) == ("2025-04", "2026-03", 12)


def test_sixty_months_are_allowed_and_sixty_one_are_not(api):
    assert len(months(api, **{"from": "2022-01", "to": "2026-12"})) == 60
    reply = api.get(MONTHS, params={"from": "2021-12", "to": "2026-12"})
    assert (reply.status_code, reply.json()["fields"]) == (422, {"to": "Choose up to 60 months"})


def test_a_range_that_ends_before_it_starts_is_refused(api):
    reply = api.get(MONTHS, params={"from": "2026-05", "to": "2026-04"})
    assert (reply.status_code, reply.json()["fields"]) == (422, {"from": "The first month can't be after the last"})


@pytest.mark.parametrize("value", ["2026-13", "2026-00", "202-01", "June", "2026-1", "0000-01"])
def test_a_bad_month_is_refused_with_a_message(api, value):
    for field in ("from", "to"):
        reply = api.get(MONTHS, params={field: value})
        assert (reply.status_code, reply.json()["fields"]) == (422, {field: "Choose a month, such as 2026-12"})


def entries(api, **params) -> dict:
    reply = api.get(ENTRIES, params=params)
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_entries_come_newest_first_then_newest_posted_first_each_with_its_lines_and_link(books):
    reply = entries(books)
    assert reply["total"] == len(reply["entries"]) == 9
    found = reply["entries"]
    assert [entry["entry_date"] for entry in found] == sorted((entry["entry_date"] for entry in found), reverse=True)
    april = [entry["event"] for entry in found if entry["entry_date"] == "2026-04-10"]
    assert april == ["bill_deleted", "bill_added"]
    top = found[0]
    assert (top["entry_date"], top["event"], top["kind"], top["source_id"], top["link"]) == (
        "2026-11-01",
        "bill_added",
        "bill",
        3,
        "/bills/3",
    )
    assert top["lines"] == [
        {"account": "expense_other", "debit_cents": 500, "credit_cents": 0},
        {"account": "payable", "debit_cents": 0, "credit_cents": 500},
    ]
    assert top["created_by"] is None


def test_a_range_keeps_both_end_days(books):
    found = entries(books, **{"from": "2026-03-05", "to": "2026-03-20"})["entries"]
    assert [entry["entry_date"] for entry in found] == ["2026-03-20", "2026-03-05"]


def test_an_account_keeps_every_line_of_each_entry_that_touches_it(books):
    reply = entries(books, account="tax_payable")
    assert reply["total"] == 1
    [entry] = reply["entries"]
    assert {line["account"] for line in entry["lines"]} == {"receivable", "revenue", "tax_payable"}


PROFIT_ACCOUNTS = [key for key in ACCOUNT_KEYS if key == "revenue" or key.startswith("expense_")]


def profit_effect(entry: dict) -> int:
    """A credit to Revenue adds to Profit to date and a debit to an expense takes away: credit less debit."""
    return sum(
        line["credit_cents"] - line["debit_cents"] for line in entry["lines"] if line["account"] in PROFIT_ACCOUNTS
    )


def test_two_accounts_keep_an_entry_that_touches_either_once(books):
    reply = entries(books, account=["cash", "tax_payable"])
    cash = entries(books, account="cash")
    tax = entries(books, account="tax_payable")
    ids = [entry["id"] for entry in reply["entries"]]
    assert len(ids) == len(set(ids)) == reply["total"]
    assert set(ids) == {entry["id"] for entry in cash["entries"] + tax["entries"]}


def test_an_entry_with_lines_in_both_accounts_is_in_the_page_and_the_total_once(books):
    reply = entries(books, account=["receivable", "revenue"])
    both = [
        entry for entry in reply["entries"] if {line["account"] for line in entry["lines"]} >= {"receivable", "revenue"}
    ]
    assert len(both) == 2
    assert reply["total"] == len(reply["entries"])


def test_revenue_and_the_expense_accounts_together_add_up_to_profit_to_date(books):
    for day in ("2026-02-09", "2026-03-20", "2026-04-30", "2026-10-31"):
        found = entries(books, account=PROFIT_ACCOUNTS, to=day)["entries"]
        profit = sum(profit_effect(entry) for entry in found)
        now = balances(books, day)
        expected = int(now["revenue"]) - sum(int(now[key]) for key in PROFIT_ACCOUNTS if key != "revenue")
        assert profit == expected


def test_paging_through_several_accounts_keeps_one_total(books):
    keys = ["cash", "payable"]
    everything = entries(books, account=keys)
    pages = [entries(books, account=keys, limit=2, offset=offset) for offset in range(0, everything["total"], 2)]
    assert {page["total"] for page in pages} == {everything["total"]}
    paged = [entry["id"] for page in pages for entry in page["entries"]]
    assert paged == [entry["id"] for entry in everything["entries"]]


@pytest.mark.parametrize("params", [["cash", "bank"], ["bank", "cash"], ["cash", "payable", "bank"]])
def test_a_bad_account_anywhere_in_the_list_is_refused_beside_its_field(api, params):
    reply = api.get(ENTRIES, params={"account": params})
    assert reply.status_code == 422
    assert reply.json()["fields"] == {"account": "Choose one of the books' accounts"}


def test_one_account_and_no_account_reply_as_before(books):
    assert entries(books, account=["cash"]) == entries(books, account="cash")
    assert entries(books)["total"] == 9


def test_limit_offset_and_the_total_page_through_the_entries(books):
    first = entries(books, limit=4)
    second = entries(books, limit=4, offset=4)
    everything = entries(books)
    assert (first["total"], second["total"]) == (9, 9)
    assert [entry["id"] for entry in first["entries"] + second["entries"]] == [
        entry["id"] for entry in everything["entries"][:8]
    ]
    assert entries(books, limit=4, offset=20)["entries"] == []


def test_a_reversal_and_what_it_reverses_point_at_each_other(books):
    found = {entry["id"]: entry for entry in entries(books)["entries"]}
    [reversal] = [entry for entry in found.values() if entry["event"] == "bill_deleted"]
    original = found[reversal["reverses_id"]]
    assert (original["reversed_by_id"], original["reverses_id"], reversal["reversed_by_id"]) == (
        reversal["id"],
        None,
        None,
    )


def test_the_entries_behind_a_balance_and_a_month_add_up_to_it(books):
    found = entries(books, account="cash", to="2026-04-30")["entries"]
    cash = sum(
        line["debit_cents"] - line["credit_cents"]
        for entry in found
        for line in entry["lines"]
        if line["account"] == "cash"
    )
    assert str(cash) == balances(books, "2026-04-30")["cash"]
    march = entries(books, account="cash", **{"from": "2026-03-01", "to": "2026-03-31"})["entries"]
    debits = sum(line["debit_cents"] for entry in march for line in entry["lines"] if line["account"] == "cash")
    [month] = [month for month in months(books, **{"from": "2026-03", "to": "2026-03"})]
    assert str(debits) == figures(month, "cash")[0]


def test_a_deleted_records_entries_stay_with_their_link(books):
    with db.writing() as conn:
        post.reverse(conn, source=post.bill_source(1), event="bill_deleted", user=None, now=NOW)
    mine = [entry for entry in entries(books)["entries"] if entry["source_id"] == 1 and entry["kind"] == "bill"]
    assert [entry["link"] for entry in mine] == ["/bills/1", "/bills/1"]


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"account": "bank"}, "account"),
        ({"from": "2026-02-30"}, "from"),
        ({"to": "soon"}, "to"),
        ({"limit": 0}, "limit"),
        ({"limit": 501}, "limit"),
        ({"limit": "many"}, "limit"),
    ],
)
def test_a_bad_value_is_refused_with_a_message_beside_its_field(api, params, field):
    reply = api.get(ENTRIES, params=params)
    assert reply.status_code == 422
    assert list(reply.json()["fields"]) == [field]


def test_sums_past_2_to_the_53_cents_are_sent_as_exact_digits(api):
    big = 2**53 // 2 + 1
    with db.writing() as conn:
        for number in range(3):
            post.bill_added(
                conn,
                bill_id=number + 1,
                total_cents=big,
                category="software",
                bill_number=f"B-{number + 1}",
                supplier="Northwind",
                **at(date(2026, 3, 1)),
            )
    expected = str(3 * big)
    assert expected == "13510798882111491"
    assert balances(api)["payable"] == expected
    [march] = months(api, **{"from": "2026-03", "to": "2026-03"})
    assert figures(march, "payable") == ("0", expected, expected)
    assert figures(march, "expense_software") == (expected, "0", expected)


def test_an_entry_has_a_label_that_is_its_records_name_or_nothing(books, make):
    deal = make.deal()
    invoice = make.invoice(deal, status="issued", number="INV-0042")
    bill = make.bill(make.organization("Northwind Software"), "8841")
    with db.writing() as conn:
        post.invoice_issued(
            conn,
            invoice_id=invoice,
            subtotal_cents=100,
            tax_cents=0,
            total_cents=100,
            number="INV-0001",
            **at(date(2026, 5, 1)),
        )
        post.bill_added(
            conn,
            bill_id=bill,
            total_cents=100,
            category="other",
            bill_number="B-1",
            supplier=None,
            **at(date(2026, 5, 2)),
        )
        post.bill_paid(conn, bill_id=bill, total_cents=100, bill_number="B-1", **at(date(2026, 5, 3)))
    found = books.get(ENTRIES, params={"limit": 500}).json()["entries"]
    labels = {(entry["kind"], entry["source_id"]): entry["label"] for entry in found}
    assert labels[("invoice", invoice)] == "INV-0042"
    assert labels[("bill", bill)] == "8841 from Northwind Software"
    assert labels[("bill_payment", bill)] == "8841 from Northwind Software"
    assert labels[("bill", 3)] is None  # deleted, or never a record
    assert labels[("payment", 1)] is None
    assert labels[("opening_balance", 1)] is None


def test_a_page_of_100_entries_names_its_records_in_one_read_for_each_kind(books, make):
    from sqlalchemy import event

    deal = make.deal()
    supplier = make.organization("Northwind Software")
    made = [
        (make.invoice(deal, status="issued", number=f"INV-{number:04d}"), make.bill(supplier, f"B{number}"))
        for number in range(1, 51)
    ]
    with db.writing() as conn:
        for invoice, bill in made:
            post.invoice_issued(
                conn,
                invoice_id=invoice,
                subtotal_cents=5,
                tax_cents=0,
                total_cents=5,
                number="INV-0001",
                **at(date(2026, 6, 1)),
            )
            post.bill_added(
                conn,
                bill_id=bill,
                total_cents=5,
                category="other",
                bill_number="B-1",
                supplier=None,
                **at(date(2026, 6, 2)),
            )
    statements: list[str] = []

    def count(_conn, _cursor, statement, *_rest) -> None:
        statements.append(statement)

    event.listen(db.engine(), "before_cursor_execute", count)
    try:
        reply = books.get(ENTRIES, params={"limit": 100, "from": "2026-06-01", "to": "2026-06-30"}).json()
    finally:
        event.remove(db.engine(), "before_cursor_execute", count)
    assert len(reply["entries"]) == 100
    assert all(entry["label"] for entry in reply["entries"])
    # The page, the count, the lines, then a name for invoices and a name for bills.
    assert len(statements) == 5, statements
