"""The books' postings (J3 to J8): the core, each event's exact entry, each reversal, what posts nothing,
the same transaction, and who made each change."""

import re
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from datetime import date
from pathlib import Path

import pytest
from accountable import db
from accountable.books import post
from accountable.books.tables import journal_entries, journal_lines
from accountable.users import TEAMMATES
from conftest import NOW
from sqlalchemy import Connection, func, select
from test_books_checks import hold

ALEX, DANA = TEAMMATES[0], TEAMMATES[1]
TOTAL = 391950  # One annual support plan, $3,600.00, with 8.875% tax.
SUBTOTAL, TAX = 360000, 31950
ON = date(2026, 10, 1)


def journal(conn: Connection | None = None) -> list[dict]:
    """Every entry in the order posted, with its lines as (account, debit, credit), sorted."""
    with nullcontext(conn) if conn is not None else db.reading() as reading:
        found = reading.execute(select(journal_entries).order_by(journal_entries.c.id)).all()
        rows = reading.execute(select(journal_lines).order_by(journal_lines.c.id)).all()
    return [
        {
            **entry._mapping,
            "lines": sorted(
                (line.account, line.debit_cents, line.credit_cents) for line in rows if line.entry_id == entry.id
            ),
        }
        for entry in found
    ]


def since(count: int) -> list[dict]:
    return journal()[count:]


def seen(entries: list[dict]) -> list[tuple]:
    """What each entry is, without its ids: event, kind, date and lines."""
    return [(entry["event"], entry["kind"], entry["entry_date"], entry["lines"]) for entry in entries]


def balanced(*pairs: tuple[str, int, int]) -> list[tuple[str, int, int]]:
    return sorted(pairs)


def swapped(lines: list[tuple[str, int, int]]) -> list[tuple[str, int, int]]:
    return sorted((account, credit, debit) for account, debit, credit in lines)


# The core


@pytest.fixture
def conn(database):
    with db.writing() as connection:
        yield connection


def entry_for(**values):
    return {"on": ON, "source": post.bill_source(7), "event": "bill_added", "user": None, "now": NOW, **values}


def test_a_balanced_entry_is_written_with_its_lines(conn):
    lines = [post.Line("expense_other", debit_cents=500), post.Line("payable", credit_cents=500)]
    entry_id = post.post(conn, **entry_for(lines=lines))
    [only] = journal(conn)
    assert (only["id"], only["entry_date"], only["kind"], only["source_id"], only["link"]) == (
        entry_id,
        ON,
        "bill",
        7,
        "/bills/7",
    )
    assert only["lines"] == balanced(("expense_other", 500, 0), ("payable", 0, 500))


def test_a_line_of_zero_is_left_out(conn):
    lines = [
        post.Line("receivable", debit_cents=100),
        post.Line("revenue", credit_cents=100),
        post.Line("tax_payable", credit_cents=0),
    ]
    post.post(conn, **entry_for(lines=lines))
    assert [account for account, _, _ in journal(conn)[0]["lines"]] == ["receivable", "revenue"]


def test_an_entry_with_no_money_in_it_is_not_posted(conn):
    assert post.post(conn, **entry_for(lines=[post.Line("cash"), post.Line("owners_equity")])) is None
    assert journal(conn) == []


def test_an_entry_that_does_not_balance_is_refused_and_writes_nothing(conn):
    lines = [post.Line("cash", debit_cents=100), post.Line("owners_equity", credit_cents=99)]
    with pytest.raises(post.Unbalanced):
        post.post(conn, **entry_for(lines=lines))
    assert journal(conn) == []


def test_a_reversal_cancels_the_entry_exactly_on_the_same_date(conn):
    lines = [post.Line("expense_travel", debit_cents=700), post.Line("payable", credit_cents=700)]
    first = post.post(conn, **entry_for(lines=lines, on=date(2026, 3, 9)))
    reversal = post.reverse(conn, source=post.bill_source(7), event="bill_deleted", user=None, now=NOW)
    original, undone = journal(conn)
    assert (original["id"], undone["id"], undone["reverses_id"]) == (first, reversal, first)
    assert undone["entry_date"] == date(2026, 3, 9)
    assert (undone["kind"], undone["source_id"], undone["link"], undone["event"]) == (
        "bill",
        7,
        "/bills/7",
        "bill_deleted",
    )
    assert undone["lines"] == swapped(original["lines"])


def test_an_entry_is_reversed_once_and_a_reversal_is_never_reversed(conn):
    lines = [post.Line("expense_travel", debit_cents=700), post.Line("payable", credit_cents=700)]
    post.post(conn, **entry_for(lines=lines))
    post.reverse(conn, source=post.bill_source(7), event="bill_deleted", user=None, now=NOW)
    assert post.reverse(conn, source=post.bill_source(7), event="bill_deleted", user=None, now=NOW) is None
    assert len(journal(conn)) == 2


def test_nothing_is_reversed_when_the_source_has_no_entry(conn):
    assert post.reverse(conn, source=post.bill_source(99), event="bill_deleted", user=None, now=NOW) is None


# Each event's exact entry


def test_an_issued_invoices_three_lines(billing):
    invoice = billing.issued(billing.line("Annual support plan"), on=date(2026, 10, 20))
    [entry] = journal()
    assert (entry["event"], entry["kind"], entry["source_id"], entry["entry_date"]) == (
        "invoice_issued",
        "invoice",
        invoice["id"],
        date(2026, 10, 20),
    )
    assert entry["link"] == f"/invoices/{invoice['id']}"
    assert entry["created_by"] == ALEX.id
    assert entry["lines"] == balanced(("receivable", TOTAL, 0), ("revenue", 0, SUBTOTAL), ("tax_payable", 0, TAX))


def test_an_untaxed_invoice_has_two_lines(billing):
    billing.api.patch("/api/settings", json={"tax_rate": "0"})
    billing.issued(billing.line("Annual support plan"))
    assert journal()[0]["lines"] == balanced(("receivable", SUBTOTAL, 0), ("revenue", 0, SUBTOTAL))


def test_a_payment_debits_cash_and_credits_receivable_and_opens_its_invoice(billing):
    invoice = billing.issued(billing.line("Annual support plan"), on=ON)
    paid = billing.pay(invoice, 150000, on=date(2026, 10, 12))["payments"][0]
    entry = journal()[1]
    assert (entry["event"], entry["kind"], entry["source_id"], entry["entry_date"]) == (
        "payment_recorded",
        "payment",
        paid["id"],
        date(2026, 10, 12),
    )
    assert entry["link"] == f"/invoices/{invoice['id']}"
    assert entry["lines"] == balanced(("cash", 150000, 0), ("receivable", 0, 150000))


def bill(supplier: int, **values) -> dict:
    return {
        "organization_id": supplier,
        "bill_number": "B-1",
        "bill_date": "2026-10-01",
        "amount_cents": 124000,
        "tax_cents": 11005,
        "category": "software",
        **values,
    }


def add_bill(billing, **values) -> int:
    reply = billing.api.post("/api/bills", json=bill(billing.organization, **values))
    assert reply.status_code == 201, reply.text
    return reply.json()["id"]


@pytest.mark.parametrize("category", ["software", "contractors", "travel", "office", "marketing", "other"])
def test_a_bill_debits_its_categorys_expense_with_tax_in_it(billing, category):
    bill_id = add_bill(billing, category=category)
    [entry] = journal()
    assert (entry["event"], entry["kind"], entry["source_id"], entry["entry_date"], entry["link"]) == (
        "bill_added",
        "bill",
        bill_id,
        ON,
        f"/bills/{bill_id}",
    )
    assert entry["lines"] == balanced((f"expense_{category}", 135005, 0), ("payable", 0, 135005))


def test_a_bill_added_paid_posts_its_paid_entry_on_the_paid_date(billing):
    bill_id = add_bill(billing, paid_on="2026-10-09")
    added, paid = journal()
    assert added["event"] == "bill_added"
    assert (paid["event"], paid["kind"], paid["source_id"], paid["entry_date"], paid["link"]) == (
        "bill_paid",
        "bill_payment",
        bill_id,
        date(2026, 10, 9),
        f"/bills/{bill_id}",
    )
    assert paid["lines"] == balanced(("payable", 135005, 0), ("cash", 0, 135005))


def test_marking_a_bill_paid_posts_its_paid_entry(billing):
    bill_id = add_bill(billing)
    assert billing.api.patch(f"/api/bills/{bill_id}", json={"paid_on": "2026-10-04"}).status_code == 200
    [_, paid] = journal()
    assert (paid["event"], paid["entry_date"]) == ("bill_paid", date(2026, 10, 4))


def opening(billing, cents: int | None, on: str | None = "2026-01-01"):
    reply = billing.api.patch("/api/settings", json={"opening_balance_cents": cents, "opening_balance_on": on})
    assert reply.status_code == 200, reply.text


def test_the_opening_balance_debits_cash_and_credits_owners_equity(billing):
    opening(billing, 500000)
    [entry] = journal()
    assert (entry["event"], entry["kind"], entry["source_id"], entry["link"], entry["entry_date"]) == (
        "opening_balance_set",
        "opening_balance",
        1,
        "/settings",
        date(2026, 1, 1),
    )
    assert entry["created_by"] == ALEX.id
    assert entry["lines"] == balanced(("cash", 500000, 0), ("owners_equity", 0, 500000))


def test_an_overdrawn_opening_balance_swaps_the_sides(billing):
    opening(billing, -120000)
    assert journal()[0]["lines"] == balanced(("cash", 0, 120000), ("owners_equity", 120000, 0))


def test_an_opening_balance_of_zero_posts_no_entry(billing):
    opening(billing, 0)
    assert journal() == []


# Reversals through the routes


def test_voiding_an_invoice_reverses_its_issue_entry_on_the_issue_date(billing):
    invoice = billing.issued(billing.line("Annual support plan"), on=date(2026, 10, 20))
    assert billing.api.post(f"/api/invoices/{invoice['id']}/void", json={}).status_code == 200
    issued, voided = journal()
    assert (voided["event"], voided["entry_date"], voided["reverses_id"]) == (
        "invoice_voided",
        date(2026, 10, 20),
        issued["id"],
    )
    assert voided["lines"] == swapped(issued["lines"])


def test_deleting_a_payment_reverses_its_entry(billing):
    invoice = billing.issued(billing.line("Annual support plan"), on=ON)
    paid = billing.pay(invoice, 150000, on=date(2026, 10, 12))["payments"][0]
    assert billing.api.delete(f"/api/invoices/{invoice['id']}/payments/{paid['id']}").status_code == 200
    _, payment, reversal = journal()
    assert (reversal["event"], reversal["entry_date"], reversal["reverses_id"]) == (
        "payment_deleted",
        date(2026, 10, 12),
        payment["id"],
    )
    assert reversal["lines"] == swapped(payment["lines"])


def test_marking_a_bill_unpaid_reverses_its_paid_entry_and_the_undo_posts_a_new_one_on_the_old_date(billing):
    bill_id = add_bill(billing, paid_on="2026-10-09")
    assert billing.api.patch(f"/api/bills/{bill_id}", json={"paid_on": None}).status_code == 200
    _, paid, unpaid = journal()
    assert (unpaid["event"], unpaid["entry_date"], unpaid["reverses_id"]) == (
        "bill_unpaid",
        date(2026, 10, 9),
        paid["id"],
    )
    assert billing.api.patch(f"/api/bills/{bill_id}", json={"paid_on": "2026-10-09"}).status_code == 200
    again = journal()[-1]
    assert (again["event"], again["entry_date"], again["lines"], again["reverses_id"]) == (
        "bill_paid",
        date(2026, 10, 9),
        paid["lines"],
        None,
    )


def test_deleting_an_unpaid_bill_reverses_its_entry(billing):
    bill_id = add_bill(billing)
    assert billing.api.delete(f"/api/bills/{bill_id}").status_code == 204
    added, deleted = journal()
    assert (deleted["event"], deleted["reverses_id"], deleted["lines"]) == (
        "bill_deleted",
        added["id"],
        swapped(added["lines"]),
    )


def test_deleting_a_paid_bill_reverses_both_entries_and_the_links_stay(billing):
    bill_id = add_bill(billing, paid_on="2026-10-09")
    assert billing.api.delete(f"/api/bills/{bill_id}").status_code == 204
    entries = journal()
    assert [entry["event"] for entry in entries] == ["bill_added", "bill_paid", "bill_deleted", "bill_deleted"]
    assert {entry["link"] for entry in entries} == {f"/bills/{bill_id}"}
    assert [entry["reverses_id"] for entry in entries[2:]] == [entries[0]["id"], entries[1]["id"]]


EXPENSE = ("expense_software", 135005, 0)
PAYABLE = ("payable", 0, 135005)
PAID = [("cash", 0, 135005), ("payable", 135005, 0)]


def the_bill_entry(total: int, category: str = "software", on: date = ON) -> list:
    return [(f"expense_{category}", total, 0), ("payable", 0, total)]


@pytest.mark.parametrize(
    ("change", "new_lines", "new_date"),
    [
        ({"amount_cents": 150000}, the_bill_entry(161005), ON),
        ({"tax_cents": 0}, the_bill_entry(124000), ON),
        ({"category": "travel"}, the_bill_entry(135005, "travel"), ON),
        ({"bill_date": "2026-09-20", "due_date": "2026-10-20"}, the_bill_entry(135005), date(2026, 9, 20)),
    ],
)
def test_a_changed_unpaid_bill_is_reversed_and_posted_again(billing, change, new_lines, new_date):
    bill_id = add_bill(billing)
    start = len(journal())
    assert billing.api.patch(f"/api/bills/{bill_id}", json=change).status_code == 200
    reversal, fresh = since(start)
    assert (reversal["event"], reversal["entry_date"], reversal["lines"]) == (
        "bill_changed",
        ON,
        swapped(sorted(the_bill_entry(135005))),
    )
    assert (fresh["event"], fresh["entry_date"], fresh["lines"], fresh["kind"]) == (
        "bill_changed",
        new_date,
        sorted(new_lines),
        "bill",
    )


def test_changing_a_paid_bills_total_reverses_and_posts_both_entries_again(billing):
    bill_id = add_bill(billing, paid_on="2026-10-09")
    start = len(journal())
    assert billing.api.patch(f"/api/bills/{bill_id}", json={"amount_cents": 150000}).status_code == 200
    assert [(event, kind) for event, kind, _, _ in seen(since(start))] == [
        ("bill_changed", "bill"),
        ("bill_changed", "bill_payment"),
        ("bill_changed", "bill"),
        ("bill_changed", "bill_payment"),
    ]
    assert since(start)[3]["lines"] == sorted([("cash", 0, 161005), ("payable", 161005, 0)])
    assert since(start)[3]["entry_date"] == date(2026, 10, 9)


def test_moving_a_paid_bills_paid_date_reposts_only_the_paid_entry(billing):
    bill_id = add_bill(billing, paid_on="2026-10-09")
    start = len(journal())
    assert billing.api.patch(f"/api/bills/{bill_id}", json={"paid_on": "2026-10-12"}).status_code == 200
    reversal, fresh = since(start)
    assert (reversal["kind"], reversal["entry_date"]) == ("bill_payment", date(2026, 10, 9))
    assert (fresh["kind"], fresh["entry_date"], fresh["lines"]) == ("bill_payment", date(2026, 10, 12), sorted(PAID))


def test_changing_a_paid_bills_category_leaves_the_paid_entry_alone(billing):
    bill_id = add_bill(billing, paid_on="2026-10-09")
    start = len(journal())
    assert billing.api.patch(f"/api/bills/{bill_id}", json={"category": "office"}).status_code == 200
    assert {entry["kind"] for entry in since(start)} == {"bill"}


def test_changing_the_opening_balances_amount_or_date_reverses_it_and_posts_the_new_one(billing):
    opening(billing, 500000)
    opening(billing, 750000)
    opening(billing, 750000, "2026-02-01")
    entries = journal()
    assert [entry["event"] for entry in entries] == ["opening_balance_set"] + ["opening_balance_changed"] * 4
    assert entries[1]["reverses_id"] == entries[0]["id"]
    assert (entries[2]["entry_date"], entries[2]["lines"]) == (
        date(2026, 1, 1),
        sorted([("cash", 750000, 0), ("owners_equity", 0, 750000)]),
    )
    assert entries[4]["entry_date"] == date(2026, 2, 1)


def test_clearing_the_opening_balance_reverses_it(billing):
    opening(billing, 500000)
    opening(billing, None, None)
    first, cleared = journal()
    assert (cleared["event"], cleared["reverses_id"], cleared["lines"]) == (
        "opening_balance_cleared",
        first["id"],
        swapped(first["lines"]),
    )


# What posts nothing


def test_a_draft_a_deleted_draft_and_a_quote_post_nothing(billing, open_deal):
    draft = billing.draft()
    assert (
        billing.api.patch(f"/api/invoices/{draft['id']}", json={"lines": [billing.line("Pro license")]}).status_code
        == 200
    )
    assert billing.api.delete(f"/api/invoices/{draft['id']}").status_code == 204
    quote = billing.api.post("/api/quotes", json={"deal_id": open_deal})
    assert quote.status_code == 201, quote.text
    assert journal() == []


def test_a_bills_notes_due_date_number_and_supplier_post_nothing(billing, make):
    bill_id = add_bill(billing)
    other = make.organization("Other supplier")
    start = len(journal())
    changes = {"notes": "Hello", "due_date": "2026-11-20", "bill_number": "B-9", "organization_id": other}
    assert billing.api.patch(f"/api/bills/{bill_id}", json=changes).status_code == 200
    assert since(start) == []


def test_a_settings_save_that_leaves_the_opening_balance_posts_nothing(billing):
    opening(billing, 500000)
    start = len(journal())
    assert (
        billing.api.patch(
            "/api/settings", json={"company_name": "Renamed", "opening_balance_cents": 500000}
        ).status_code
        == 200
    )
    assert since(start) == []


# The same transaction


def count(table) -> int:
    with db.reading() as conn:
        return conn.execute(select(func.count()).select_from(table)).scalar_one()


def test_an_issue_that_cannot_post_leaves_the_invoice_a_draft(billing):
    from accountable.invoices.tables import invoices

    draft = billing.draft()
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(post, "_write", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
        with pytest.raises(RuntimeError):
            billing.api.post(f"/api/invoices/{draft['id']}/issue", json={"lines": [billing.line("Pro license")]})
    with db.reading() as conn:
        assert conn.execute(select(invoices.c.status, invoices.c.number)).one() == ("draft", None)
    assert journal() == []


def test_a_payment_a_void_and_a_delete_that_cannot_post_change_nothing(billing):
    from accountable.invoices.tables import invoices, payments

    invoice = billing.issued(billing.line("Annual support plan"), on=ON)
    paid = billing.pay(invoice, 150000, on=ON)["payments"][0]
    other = billing.issued(billing.line("Pro license"), on=ON)
    entries = len(journal())
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(post, "_write", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
        with pytest.raises(RuntimeError):
            billing.pay(invoice, 100, on=ON)
        with pytest.raises(RuntimeError):
            billing.api.delete(f"/api/invoices/{invoice['id']}/payments/{paid['id']}")
        with pytest.raises(RuntimeError):
            billing.api.post(f"/api/invoices/{other['id']}/void", json={})
    assert count(payments) == 1
    with db.reading() as conn:
        assert {row.status for row in conn.execute(select(invoices.c.status))} == {"issued"}
    assert len(journal()) == entries


def test_a_bills_add_edit_and_delete_that_cannot_post_change_nothing(billing):
    from accountable.bills.tables import bills

    bill_id = add_bill(billing)
    entries = len(journal())
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(post, "_write", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
        with pytest.raises(RuntimeError):
            billing.api.post("/api/bills", json=bill(billing.organization, bill_number="B-2"))
        with pytest.raises(RuntimeError):
            billing.api.patch(f"/api/bills/{bill_id}", json={"amount_cents": 1})
        with pytest.raises(RuntimeError):
            billing.api.delete(f"/api/bills/{bill_id}")
    with db.reading() as conn:
        assert conn.execute(select(bills.c.amount_cents)).scalars().all() == [124000]
    assert len(journal()) == entries


def test_a_settings_save_that_cannot_post_leaves_the_settings_alone(billing):
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(post, "_write", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
        with pytest.raises(RuntimeError):
            opening(billing, 500000)
    assert billing.api.get("/api/settings").json()["opening_balance_cents"] is None
    assert journal() == []


def test_a_refused_save_leaves_no_entry(billing):
    reply = billing.api.post("/api/bills", json=bill(billing.organization, paid_on="2030-01-01"))
    assert reply.status_code == 422
    assert journal() == []


def test_twenty_payments_and_bills_at_once_keep_the_four_checks(billing):
    invoice = billing.issued(billing.line("Annual support plan"), on=ON)

    def pay(number: int):
        return billing.api.post(
            f"/api/invoices/{invoice['id']}/payments",
            json={"paid_on": "2026-10-10", "amount_cents": 1000, "method": "card"},
        ).status_code

    def add(number: int):
        return billing.api.post("/api/bills", json=bill(billing.organization, bill_number=f"N-{number}")).status_code

    with ThreadPoolExecutor(8) as pool:
        codes = list(pool.map(pay, range(10))) + list(pool.map(add, range(10)))
    assert codes == [201] * 20
    hold()


# Who made each change


def test_each_entry_is_put_down_to_the_signed_in_person_whatever_the_request_says(billing, sign_in_as):
    sign_in_as(DANA.id)
    add_bill(billing, created_by=ALEX.id, updated_by=ALEX.id)
    assert {entry["created_by"] for entry in journal()} == {DANA.id}


def test_no_function_updates_or_deletes_a_journal_row_but_the_clearing_steps():
    package = Path(post.__file__).parents[1]
    pattern = re.compile(r"(update|delete)\(\s*(books_tables\.)?journal_|journal_\w+\.(update|delete)\(")
    found = [
        path.relative_to(package).as_posix()
        for path in package.rglob("*.py")
        if "migrations" not in path.parts and pattern.search(path.read_text())
    ]
    assert found == []


@pytest.mark.parametrize("method", ["post", "patch", "put", "delete"])
@pytest.mark.parametrize("path", ["balances", "months", "entries"])
def test_the_books_have_no_route_that_writes(api, method, path):
    assert getattr(api, method)(f"/api/books/{path}", **({} if method == "delete" else {"json": {}})).status_code == 405
