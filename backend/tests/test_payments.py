"""Payments through the API: each rule in V15, paying in full and in parts, two at once, and deleting one (V15 to V18)."""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import httpx
import pytest
from accountable.invoices.routers import payments as payments_router
from accountable.users import TEAMMATES
from conftest import TODAY

DANA = TEAMMATES[1]
TOTAL = 391950  # One annual support plan, $3,600.00, with 8.875% tax.
read_paid = payments_router._paid


@pytest.fixture
def invoice(billing) -> dict:
    """Issued ten days ago, so it can take payments dated from then until today."""
    return billing.issued(billing.line("Annual support plan"), on=TODAY - timedelta(days=10))


def pay(billing, invoice: dict, **body) -> httpx.Response:
    sent = {"paid_on": TODAY.isoformat(), "amount_cents": 100, "method": "card", **body}
    return billing.api.post(f"/api/invoices/{invoice['id']}/payments", json=sent)


def test_a_payment_brings_what_is_owed_down(billing, invoice):
    reply = pay(billing, invoice, amount_cents=150000, reference="Wire 4471", method="bank_transfer")
    assert reply.status_code == 201
    paid = reply.json()
    assert (paid["shows_as"], paid["paid_cents"], paid["owed_cents"]) == ("part_paid", 150000, TOTAL - 150000)
    [payment] = paid["payments"]
    assert {key: payment[key] for key in ("paid_on", "amount_cents", "method", "reference")} == {
        "paid_on": "2026-10-31",
        "amount_cents": 150000,
        "method": "bank_transfer",
        "reference": "Wire 4471",
    }


def test_paying_in_full_makes_it_paid(billing, invoice):
    assert pay(billing, invoice, amount_cents=TOTAL).json()["shows_as"] == "paid"


def test_paying_in_two_parts_makes_it_paid(billing, invoice):
    pay(billing, invoice, amount_cents=TOTAL - 1)
    paid = pay(billing, invoice, amount_cents=1).json()
    assert (paid["shows_as"], paid["owed_cents"], len(paid["payments"])) == ("paid", 0, 2)


def test_a_cent_more_than_is_owed_is_refused(billing, invoice):
    pay(billing, invoice, amount_cents=TOTAL - 125000)
    reply = pay(billing, invoice, amount_cents=125001)
    assert (reply.status_code, reply.json()["fields"]) == (
        422,
        {"amount_cents": "That's more than the $1,250.00 still owed"},
    )
    assert pay(billing, invoice, amount_cents=125000).status_code == 201


def test_a_paid_invoice_takes_no_more(billing, invoice):
    pay(billing, invoice, amount_cents=TOTAL)
    reply = pay(billing, invoice, amount_cents=1)
    assert reply.json()["fields"] == {"amount_cents": "That's more than the $0.00 still owed"}


@pytest.mark.parametrize("amount", [0, -1, 1.5, "100", True])
def test_an_amount_that_isnt_more_than_zero_whole_cents_is_refused(billing, invoice, amount):
    reply = pay(billing, invoice, amount_cents=amount)
    assert (reply.status_code, reply.json()["fields"]) == (422, {"amount_cents": "Enter an amount more than $0.00"})


@pytest.mark.parametrize(
    ("days", "message"),
    [
        (0, None),
        (-10, None),
        (1, "A payment can't be dated in the future"),
        (-11, "A payment can't be dated before the invoice was issued"),
    ],
)
def test_the_date_from_the_issue_date_to_today(billing, invoice, days, message):
    reply = pay(billing, invoice, paid_on=(TODAY + timedelta(days=days)).isoformat())
    if message is None:
        assert reply.status_code == 201
    else:
        assert (reply.status_code, reply.json()["fields"]) == (422, {"paid_on": message})


def test_each_field_left_out_gets_its_message(billing, invoice):
    reply = billing.api.post(f"/api/invoices/{invoice['id']}/payments", json={"reference": "x" * 101})
    assert reply.json()["fields"] == {"reference": "Keep the reference to 100 characters or fewer"}
    reply = billing.api.post(f"/api/invoices/{invoice['id']}/payments", json={})
    assert reply.json()["fields"] == {
        "paid_on": "Enter the date it was paid",
        "amount_cents": "Enter an amount more than $0.00",
        "method": "Choose how it was paid",
    }


@pytest.mark.parametrize("method", ["bank_transfer", "card", "check", "cash", "other"])
def test_each_method(billing, invoice, method):
    assert pay(billing, invoice, method=method).json()["payments"][0]["method"] == method


@pytest.mark.parametrize("method", ["cheque", "", None, "Card"])
def test_any_other_method_is_refused(billing, invoice, method):
    assert pay(billing, invoice, method=method).json()["fields"] == {"method": "Choose how it was paid"}


def test_a_reference_of_100_characters_is_kept_and_a_blank_one_is_none(billing, invoice):
    assert pay(billing, invoice, reference="x" * 100).json()["payments"][0]["reference"] == "x" * 100
    assert pay(billing, invoice, reference="  ").json()["payments"][1]["reference"] is None


def test_two_payments_at_once_that_would_overpay_together_cant_both_go_in(billing, invoice, monkeypatch):
    """Each waits, once it has read what's owed, for the other to read it too. Under the write
    lock the other can't, so the wait runs out and the second reads the first's payment (V16)."""
    amount = TOTAL // 2 + 1
    both_have_read = threading.Barrier(2)

    def read_then_wait(conn, invoice_id):
        found = read_paid(conn, invoice_id)
        try:
            both_have_read.wait(timeout=0.3)
        except threading.BrokenBarrierError:
            pass
        return found

    monkeypatch.setattr(payments_router, "_paid", read_then_wait)
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda _: pay(billing, invoice, amount_cents=amount), range(2)))
    assert sorted(reply.status_code for reply in replies) == [201, 422]
    assert billing.api.get(f"/api/invoices/{invoice['id']}").json()["paid_cents"] == amount


def test_a_draft_or_a_void_invoice_cant_take_a_payment(billing):
    draft = billing.draft()
    void = billing.api.post(f"/api/invoices/{billing.issued()['id']}/void", json={}).json()
    for refused in (draft, void):
        reply = pay(billing, refused)
        assert (reply.status_code, reply.json()) == (409, {"detail": "A draft or a void invoice can't take a payment."})


def test_a_missing_invoice_is_a_404_whatever_the_body(api):
    assert api.post("/api/invoices/999/payments", json={}).status_code == 404


def test_deleting_a_payment_puts_what_is_owed_back_and_paid_back_to_part_paid(billing, invoice):
    pay(billing, invoice, amount_cents=100000)
    paid = pay(billing, invoice, amount_cents=TOTAL - 100000).json()
    assert paid["shows_as"] == "paid"
    last = paid["payments"][-1]
    reply = billing.api.delete(f"/api/invoices/{invoice['id']}/payments/{last['id']}")
    assert reply.status_code == 200
    assert (reply.json()["shows_as"], reply.json()["owed_cents"]) == ("part_paid", TOTAL - 100000)


def test_deleting_the_only_payment_of_an_overdue_invoice_shows_it_overdue_again(billing):
    late = billing.issued(on=TODAY - timedelta(days=45))
    paid = billing.pay(late, late["total_cents"])
    assert paid["shows_as"] == "paid"
    reply = billing.api.delete(f"/api/invoices/{late['id']}/payments/{paid['payments'][0]['id']}")
    assert reply.json()["shows_as"] == "overdue"


def test_a_payment_of_another_invoice_isnt_deleted_here(billing, invoice):
    other = billing.issued()
    payment = billing.pay(other, 100)["payments"][0]
    assert billing.api.delete(f"/api/invoices/{invoice['id']}/payments/{payment['id']}").status_code == 404
    assert len(billing.api.get(f"/api/invoices/{other['id']}").json()["payments"]) == 1


def test_who_recorded_each_payment_comes_from_the_token(billing, invoice, sign_in_as):
    sign_in_as(DANA.id)
    reply = pay(billing, invoice, created_by=TEAMMATES[0].id).json()
    [payment] = reply["payments"]
    assert payment["created_by"] == {"id": DANA.id, "name": DANA.name}
    assert payment["created_at"] == "2026-10-31T15:00:00Z"


def test_recording_a_payment_isnt_a_change_to_the_invoice(billing, invoice, sign_in_as):
    sign_in_as(DANA.id)
    reply = pay(billing, invoice).json()
    assert reply["updated_by"]["id"] == TEAMMATES[0].id
