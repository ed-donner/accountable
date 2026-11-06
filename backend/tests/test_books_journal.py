"""The journal's reads (J12, J17 to J19): the entries' search and filters, a record's entries for a panel, and an
account's ledger with its running balance, against a small dataset with known answers."""

from datetime import date

import pytest
from accountable import cli, db
from accountable.books import accounts, post
from conftest import NOW
from sqlalchemy import event

ENTRIES, LEDGER, BALANCES = "/api/books/entries", "/api/books/accounts/{}/ledger", "/api/books/balances"


def at(day: date):
    return {"now": NOW, "user": None, "on": day}


def bill(conn, bill_id: int, total: int, day: date, number: str, supplier: str | None = "Northwind Software"):
    post.bill_added(
        conn,
        bill_id=bill_id,
        total_cents=total,
        category="software",
        bill_number=number,
        supplier=supplier,
        **at(day),
    )


@pytest.fixture
def books(api):
    """Jan 1: $10,000.00 opening balance. Feb 10: INV-0001 for $1,000.00 and $100.00 tax. Mar 5: $600.00 of it paid.
    Mar 20: bill NW-1, $550.00 with tax, paid Apr 2. Apr 10: bill B-2 for $300.00, then deleted. Oct 31: INV-0002
    for $200.00 untaxed, issued and then voided. Nov 1: bill B-3 for $5.00, tomorrow's."""
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
        bill(conn, 1, 55_000, date(2026, 3, 20), "NW-1")
        post.bill_paid(conn, bill_id=1, total_cents=55_000, bill_number="NW-1", **at(date(2026, 4, 2)))
        bill(conn, 2, 30_000, date(2026, 4, 10), "B-2", supplier=None)
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
        post.reverse(conn, source=post.invoice_source(2), event="invoice_voided", user=None, now=NOW)
        bill(conn, 3, 500, date(2026, 11, 1), "B-3")
    return api


def entries(api, **params) -> dict:
    reply = api.get(ENTRIES, params=params)
    assert reply.status_code == 200, reply.text
    return reply.json()


def descriptions(api, **params) -> list[str]:
    return [entry["description"] for entry in entries(api, **params)["entries"]]


# Search


def test_the_entries_carry_their_description_and_document(books):
    top = entries(books)["entries"][0]
    assert (top["description"], top["document"]) == ("Bill B-3 from Northwind Software", "B-3")
    opening = entries(books, kind="opening_balance", source_id=1)["entries"][0]
    assert (opening["description"], opening["document"]) == ("Opening balance set", None)


def test_a_search_finds_part_of_a_description_or_a_document_in_any_case(books):
    assert descriptions(books, q="inv-000") == [
        "Invoice INV-0002 voided",
        "Invoice INV-0002 issued",
        "Payment received on INV-0001",
        "Invoice INV-0001 issued",
    ]
    assert descriptions(books, q="NORTHWIND") == [
        "Bill B-3 from Northwind Software",
        "Bill NW-1 from Northwind Software",
    ]
    assert descriptions(books, q="nw-1") == ["Bill NW-1 paid", "Bill NW-1 from Northwind Software"]
    assert entries(books, q="inv-000")["total"] == 4


def test_a_document_number_inside_a_longer_description_is_found(books):
    assert descriptions(books, q="received on inv") == ["Payment received on INV-0001"]


def test_percent_underscore_and_slash_mean_only_themselves(books):
    with db.writing() as conn:
        bill(conn, 9, 100, date(2026, 5, 1), "A%B_C/D")
    assert descriptions(books, q="%") == ["Bill A%B_C/D from Northwind Software"]
    assert descriptions(books, q="_") == ["Bill A%B_C/D from Northwind Software"]
    assert descriptions(books, q="/") == ["Bill A%B_C/D from Northwind Software"]
    assert descriptions(books, q="b_c") == ["Bill A%B_C/D from Northwind Software"]
    assert descriptions(books, q="a%c") == []
    assert descriptions(books, q="a_b") == []


def test_a_search_folds_case_in_other_languages_as_the_top_bar_does(books):
    with db.writing() as conn:
        bill(conn, 9, 100, date(2026, 5, 1), "ÉCOLE-1", supplier="Café Müller")
    assert descriptions(books, q="école") == ["Bill ÉCOLE-1 from Café Müller"]
    assert descriptions(books, q="CAFÉ") == ["Bill ÉCOLE-1 from Café Müller"]
    assert descriptions(books, q="müller") == ["Bill ÉCOLE-1 from Café Müller"]


def test_a_search_that_finds_nothing_gives_an_empty_page(books):
    assert entries(books, q="zzz") == {"total": 0, "entries": []}


@pytest.mark.parametrize("value", ["", "   ", "x" * 101])
def test_a_search_of_no_text_or_over_100_characters_is_refused(books, value):
    reply = books.get(ENTRIES, params={"q": value})
    assert reply.status_code == 422
    assert list(reply.json()["fields"]) == ["q"]


# The filters


def test_an_account_keeps_every_line_of_each_entry_that_touches_it(books):
    reply = entries(books, account="tax_payable")
    assert reply["total"] == 1
    [entry] = reply["entries"]
    assert {line["account"] for line in entry["lines"]} == {"receivable", "revenue", "tax_payable"}


def test_from_and_to_include_both_days_alone_or_together(books):
    assert descriptions(books, **{"from": "2026-03-05", "to": "2026-03-20"}) == [
        "Bill NW-1 from Northwind Software",
        "Payment received on INV-0001",
    ]
    assert descriptions(books, **{"from": "2026-11-01"}) == ["Bill B-3 from Northwind Software"]
    assert descriptions(books, to="2026-01-01") == ["Opening balance set"]
    assert entries(books, **{"from": "2026-12-01"})["total"] == 0
    assert entries(books, **{"from": "2026-05-01", "to": "2026-04-01"})["total"] == 0


def test_everything_together_narrows_and_the_total_is_for_paging(books):
    window = {"q": "bill", "account": "payable", "from": "2026-03-01", "to": "2026-04-30"}
    assert descriptions(books, **window) == [
        "Bill B-2 deleted",
        "Bill B-2",
        "Bill NW-1 paid",
        "Bill NW-1 from Northwind Software",
    ]
    first, second = entries(books, **window, limit=2), entries(books, **window, limit=2, offset=2)
    assert (first["total"], second["total"]) == (4, 4)
    assert [e["description"] for e in first["entries"]] == ["Bill B-2 deleted", "Bill B-2"]
    assert [e["description"] for e in second["entries"]] == ["Bill NW-1 paid", "Bill NW-1 from Northwind Software"]


@pytest.mark.parametrize(
    "params",
    [
        {"account": "bank"},
        {"from": "2026-02-30"},
        {"to": "soon"},
        {"limit": 0},
        {"limit": 501},
        {"kind": "deal", "source_id": 1},
    ],
)
def test_a_bad_value_is_a_422(books, params):
    assert books.get(ENTRIES, params=params).status_code == 422


# A record's entries


def test_an_invoices_entries_are_its_issue_and_its_reversal_oldest_first(books):
    found = entries(books, kind="invoice", source_id=2)["entries"]
    assert [entry["description"] for entry in found] == ["Invoice INV-0002 issued", "Invoice INV-0002 voided"]
    assert [entry["reversed_by_id"] is not None for entry in found] == [True, False]
    assert found[1]["reverses_id"] == found[0]["id"]


def test_a_payments_entries_are_its_own(books):
    found = entries(books, kind="payment", source_id=1)["entries"]
    assert [entry["description"] for entry in found] == ["Payment received on INV-0001"]
    assert entries(books, kind="payment", source_id=2)["entries"] == []


def test_a_bills_entries_include_its_paid_entries(books):
    found = entries(books, kind="bill", source_id=1)["entries"]
    assert [entry["description"] for entry in found] == ["Bill NW-1 from Northwind Software", "Bill NW-1 paid"]
    assert entries(books, kind="bill_payment", source_id=1)["total"] == 1


def test_a_changed_bills_reversals_and_reposts_come_in_order(books):
    with db.writing() as conn:
        post.reverse(conn, source=post.bill_source(1), event="bill_changed", user=None, now=NOW)
        post.bill_added(
            conn,
            bill_id=1,
            total_cents=60_000,
            category="software",
            bill_number="NW-1b",
            supplier=None,
            event="bill_changed",
            **at(date(2026, 3, 21)),
        )
    assert descriptions(books, kind="bill", source_id=1) == [
        "Bill NW-1 from Northwind Software",
        "Bill NW-1 changed",
        "Bill NW-1b changed",
        "Bill NW-1 paid",
    ]


def test_a_deleted_bills_entries_are_still_found_by_its_id(books):
    found = entries(books, kind="bill", source_id=2)["entries"]
    assert [entry["description"] for entry in found] == ["Bill B-2", "Bill B-2 deleted"]


def test_the_opening_balance_never_matches_an_invoice_with_the_same_id(books):
    assert [e["kind"] for e in entries(books, kind="invoice", source_id=1)["entries"]] == ["invoice"]
    assert [e["kind"] for e in entries(books, kind="opening_balance", source_id=1)["entries"]] == ["opening_balance"]


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"kind": "invoice"}, "source_id"),
        ({"source_id": 1}, "kind"),
        ({"kind": "deal", "source_id": 1}, "kind"),
        ({"kind": "invoice", "source_id": 0}, "source_id"),
        ({"kind": "invoice", "source_id": "one"}, "source_id"),
    ],
)
def test_a_kind_and_a_source_id_come_together_and_are_valid(books, params, field):
    reply = books.get(ENTRIES, params=params)
    assert reply.status_code == 422
    assert list(reply.json()["fields"]) == [field]


# The ledger


def ledger(api, key: str, **params) -> dict:
    reply = api.get(LEDGER.format(key), params=params)
    assert reply.status_code == 200, reply.text
    return reply.json()


def running(api, key: str) -> list[tuple[str, int, int, str]]:
    return [
        (line["description"], line["debit_cents"], line["credit_cents"], line["balance_cents"])
        for line in ledger(api, key)["lines"]
    ]


def test_cash_runs_up_from_its_first_line_newest_first(books):
    assert running(books, "cash") == [
        ("Bill NW-1 paid", 0, 55_000, "1005000"),
        ("Payment received on INV-0001", 60_000, 0, "1060000"),
        ("Opening balance set", 1_000_000, 0, "1000000"),
    ]
    assert ledger(books, "cash")["balance_cents"] == "1005000"


def test_a_liabilitys_balance_rises_with_a_credit(books):
    assert running(books, "payable") == [
        ("Bill B-3 from Northwind Software", 0, 500, "500"),
        ("Bill B-2 deleted", 30_000, 0, "0"),
        ("Bill B-2", 0, 30_000, "30000"),
        ("Bill NW-1 paid", 55_000, 0, "0"),
        ("Bill NW-1 from Northwind Software", 0, 55_000, "55000"),
    ]
    assert ledger(books, "payable")["balance_cents"] == "500"


def balances_of(api, key: str) -> list[str]:
    return [line["balance_cents"] for line in ledger(api, key)["lines"]]


def test_equity_revenue_and_expense_accounts_follow_their_own_sides(books):
    assert balances_of(books, "owners_equity") == ["1000000"]
    assert balances_of(books, "revenue") == ["100000", "120000", "100000"]
    assert balances_of(books, "expense_software") == ["55500", "55000", "85000", "55000"]


def test_an_assets_balance_rises_with_a_debit_and_falls_with_a_credit(books):
    assert balances_of(books, "receivable") == ["50000", "70000", "50000", "110000"]
    assert ledger(books, "receivable")["balance_cents"] == "50000"


def test_an_overdrawn_cash_account_shows_below_zero(api):
    with db.writing() as conn:
        post.bill_paid(conn, bill_id=1, total_cents=500, bill_number="B-1", **at(date(2026, 1, 5)))
        post.opening_balance(conn, cents=-300, **at(date(2026, 1, 6)))
    found = ledger(api, "cash")
    assert [line["balance_cents"] for line in found["lines"]] == ["-800", "-500"]
    assert found["balance_cents"] == "-800"
    assert ledger(api, "payable")["balance_cents"] == "-500"


def test_a_later_page_has_the_same_balances_as_the_first(books):
    everything = ledger(books, "payable")["lines"]
    first = ledger(books, "payable", limit=2)
    second = ledger(books, "payable", limit=2, offset=2)
    assert first["lines"] + second["lines"] == everything[:4]
    assert first["balance_cents"] == second["balance_cents"] == "500"
    assert first["total"] == second["total"] == 5


def test_the_newest_balance_is_the_balance_in_the_books_for_every_account_on_the_sample_data(database, api):
    with db.writing() as conn:
        cli.fill_sample(conn)
    latest = max(entry["entry_date"] for entry in entries(api, limit=500)["entries"])
    books = {a["key"]: a["balance_cents"] for a in api.get(BALANCES, params={"on": latest}).json()["accounts"]}
    assert set(books) == set(accounts.KEYS)
    for key in accounts.KEYS:
        found = ledger(api, key, limit=1)
        assert found["balance_cents"] == books[key], key
        if found["lines"]:
            assert found["lines"][0]["balance_cents"] == books[key], key
        else:
            assert books[key] == "0"


def test_an_account_with_no_lines_is_zero_with_no_lines(api):
    assert ledger(api, "expense_travel") == {
        "key": "expense_travel",
        "name": "Travel",
        "type": "expense",
        "balance_cents": "0",
        "total": 0,
        "last_entry_date": None,
        "lines": [],
    }


def test_a_line_says_whether_it_reverses_or_was_reversed(books):
    revenue = {line["description"]: line for line in ledger(books, "revenue")["lines"]}
    flags = {name: (line["is_reversal"], line["is_reversed"]) for name, line in revenue.items()}
    assert flags == {
        "Invoice INV-0002 voided": (True, False),
        "Invoice INV-0002 issued": (False, True),
        "Invoice INV-0001 issued": (False, False),
    }


def test_a_line_gives_its_document_and_the_page_that_opens_it(books):
    [opening] = ledger(books, "owners_equity")["lines"]
    assert (opening["document"], opening["link"], opening["entry_date"]) == (None, "/settings", "2026-01-01")
    assert (opening["kind"], opening["event"]) == ("opening_balance", "opening_balance_set")
    payment = ledger(books, "cash")["lines"][1]
    assert (payment["document"], payment["link"]) == ("INV-0001", "/invoices/1")
    assert ledger(books, "cash")["last_entry_date"] == "2026-04-02"


def test_sums_past_2_to_the_53_are_exact_digits(api):
    big = 2**53 // 2 + 1
    with db.writing() as conn:
        for number in range(3):
            bill(conn, number + 1, big, date(2026, 3, 1), f"B-{number}")
    found = ledger(api, "payable")
    assert [line["balance_cents"] for line in found["lines"]] == [str(3 * big), str(2 * big), str(big)]
    assert found["balance_cents"] == str(3 * big) == "13510798882111491"


def test_an_unknown_key_is_a_404_and_a_bad_limit_a_422(books):
    assert books.get(LEDGER.format("bank")).status_code == 404
    assert books.get(LEDGER.format("cash"), params={"limit": 0}).status_code == 422
    assert books.get(LEDGER.format("cash"), params={"offset": -1}).status_code == 422


def test_the_ledger_reads_with_the_same_queries_whatever_the_page(books):
    seen: list[str] = []

    def record(_conn, _cursor, statement, *_rest):
        seen.append(statement)

    event.listen(db.engine(), "before_cursor_execute", record)
    try:
        counts = []
        for params in ({}, {"limit": 1}, {"limit": 1, "offset": 3}):
            seen.clear()
            ledger(books, "payable", **params)
            counts.append(len(seen))
    finally:
        event.remove(db.engine(), "before_cursor_execute", record)
    assert counts[0] == counts[1] == counts[2] <= 2


# Nothing changes entries (J6)


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
@pytest.mark.parametrize("path", [ENTRIES, LEDGER.format("cash")])
def test_nothing_writes_through_the_entries_or_the_ledger(books, method, path):
    assert books.request(method.upper(), path, json={}).status_code == 405
