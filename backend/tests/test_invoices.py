"""Invoices through the API: drafts, saving, issuing, voiding, the list and who did each (V2 to V14, V19 to V23)."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pytest
from accountable import db
from accountable.company.tables import number_counters
from accountable.invoices.tables import invoice_lines, invoices
from accountable.users import TEAMMATES
from conftest import LOCAL, NOW, THIS_COMPUTER, TODAY
from fastapi.testclient import TestClient
from sqlalchemy import func, select

ALEX, DANA = TEAMMATES[0], TEAMMATES[1]
ISSUED = "This invoice has been issued, so it can't be changed."


def invoice_path(invoice: dict, *rest: str) -> str:
    return "/".join([f"/api/invoices/{invoice['id']}", *rest])


def row_count(table) -> int:
    with db.reading() as conn:
        return conn.execute(select(func.count()).select_from(table)).scalar_one()


def numbers_taken() -> int | None:
    with db.reading() as conn:
        return conn.scalar(select(number_counters.c.last_number).where(number_counters.c.kind == "invoice"))


# Starting a draft (V4, V5)


def test_a_draft_starts_on_a_won_deal_with_its_bill_to_filled_in(billing):
    draft = billing.draft()
    assert draft["status"] == "draft"
    assert draft["shows_as"] == "draft"
    assert draft["number"] is None and draft["issue_date"] is None and draft["due_date"] is None
    assert draft["bill_to"] == "Harbor & Pine\nAttn: Sam Carter\nsam@harbor.example"
    assert draft["lines"] == [] and draft["total_cents"] == 0 and draft["owed_cents"] == 0
    assert draft["organization"] == {"id": billing.organization, "name": "Harbor & Pine"}
    assert draft["deal"] == {"id": billing.deal, "name": "Annual support"}


def test_the_bill_to_leaves_out_what_is_blank(billing, make):
    contact = make.contact("Robin Hale")
    deal = make.deal("No organization", stage="won", close_date=TODAY, main_contact_id=contact)
    assert billing.draft(deal)["bill_to"] == "Attn: Robin Hale"
    bare = make.deal("Nobody", stage="won", close_date=TODAY)
    assert billing.draft(bare)["bill_to"] is None


@pytest.mark.parametrize("stage", ["new", "qualified", "proposal", "negotiation", "lost"])
def test_only_a_won_deal_can_start_an_invoice(billing, make, stage):
    deal = make.deal("Open", stage=stage, close_date=TODAY)
    reply = billing.api.post("/api/invoices", json={"deal_id": deal})
    assert (reply.status_code, reply.json()) == (409, {"detail": "Only a won deal can start an invoice."})
    assert row_count(invoices) == 0


def test_a_deal_that_isnt_there_is_refused_beside_the_deal(billing):
    reply = billing.api.post("/api/invoices", json={"deal_id": 999})
    assert (reply.status_code, reply.json()["fields"]) == (422, {"deal_id": "Choose a won deal"})


def test_a_missing_invoice_is_a_404(api):
    assert api.get("/api/invoices/999").status_code == 404
    assert api.patch("/api/invoices/999", json={}).status_code == 404


# Saving a draft (V6 to V9)


def test_lines_take_their_products_name_price_and_description(billing):
    draft = billing.draft()
    reply = billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Pro license")]})
    assert reply.status_code == 200
    [line] = reply.json()["lines"]
    assert {key: line[key] for key in ("name", "description", "quantity", "unit_price_cents", "amount_cents")} == {
        "name": "Pro license",
        "description": "One named user",
        "quantity": 1,
        "unit_price_cents": 4950,
        "amount_cents": 4950,
    }


def test_a_line_keeps_its_name_and_price_after_the_product_changes(billing):
    draft = billing.draft()
    [line] = billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Pro license")]}).json()["lines"]
    billing.api.patch(
        f"/api/products/{billing.products['Pro license']}", json={"name": "Pro license 2027", "unit_price_cents": 1}
    )
    resaved = billing.api.patch(invoice_path(draft), json={"lines": [{"id": line["id"], "quantity": 3}]}).json()
    assert [(kept["name"], kept["unit_price_cents"], kept["quantity"]) for kept in resaved["lines"]] == [
        ("Pro license", 4950, 3)
    ]
    assert resaved["lines"][0]["id"] == line["id"]


def test_an_archived_product_cant_start_a_line(billing):
    billing.api.patch(f"/api/products/{billing.products['Training day']}", json={"active": False})
    draft = billing.draft()
    lines = [billing.line("Pro license"), billing.line("Training day")]
    reply = billing.api.patch(invoice_path(draft), json={"lines": lines})
    assert (reply.status_code, reply.json()["fields"]) == (422, {"lines.1.product_id": "Choose an active product"})
    assert row_count(invoice_lines) == 0


def test_a_line_archived_after_it_was_added_stays(billing):
    draft = billing.draft()
    [line] = billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Training day")]}).json()["lines"]
    billing.api.patch(f"/api/products/{billing.products['Training day']}", json={"active": False})
    resaved = billing.api.patch(invoice_path(draft), json={"lines": [{"id": line["id"]}]})
    assert resaved.status_code == 200
    assert [kept["name"] for kept in resaved.json()["lines"]] == ["Training day"]


def test_lines_keep_their_order_and_a_removed_one_goes(billing):
    draft = billing.draft()
    names = ["Training day", "Pro license", "Annual support plan"]
    saved = billing.api.patch(invoice_path(draft), json={"lines": [billing.line(name) for name in names]}).json()
    assert [line["name"] for line in saved["lines"]] == names
    first, _, last = saved["lines"]
    reordered = billing.api.patch(invoice_path(draft), json={"lines": [{"id": last["id"]}, {"id": first["id"]}]})
    assert [line["name"] for line in reordered.json()["lines"]] == ["Annual support plan", "Training day"]
    assert row_count(invoice_lines) == 2


def test_another_invoices_line_is_a_new_line_here(billing):
    other = billing.draft()
    [line] = billing.api.patch(invoice_path(other), json={"lines": [billing.line("Pro license")]}).json()["lines"]
    draft = billing.draft()
    taken = billing.api.patch(invoice_path(draft), json={"lines": [{"id": line["id"]}]})
    assert taken.json()["fields"] == {"lines.0.product_id": "Choose an active product"}
    copied = billing.api.patch(
        invoice_path(draft), json={"lines": [{"id": line["id"], **billing.line("Training day")}]}
    )
    assert [kept["name"] for kept in copied.json()["lines"]] == ["Training day"]
    assert [kept["name"] for kept in billing.api.get(invoice_path(other)).json()["lines"]] == ["Pro license"]


def test_amounts_and_totals_sent_are_ignored(billing):
    draft = billing.draft()
    line = {**billing.line("Pro license", quantity=2), "amount_cents": 1, "name": "Free"}
    reply = billing.api.patch(
        invoice_path(draft), json={"lines": [line], "subtotal_cents": 1, "tax_cents": 0, "total_cents": 1}
    ).json()
    assert (reply["lines"][0]["name"], reply["lines"][0]["amount_cents"]) == ("Pro license", 9900)
    assert (reply["subtotal_cents"], reply["tax_cents"], reply["total_cents"]) == (9900, 879, 10779)


def test_three_lines_add_up_exactly_with_the_half_cent_rounding_up(billing):
    """2 x $49.50 + $3,600.00 + $1,257.00 = $4,956.00, and 8.875% of it is $439.845 (B16)."""
    draft = billing.draft()
    lines = [
        billing.line("Pro license", quantity=2),
        billing.line("Annual support plan"),
        billing.line("Training day", unit_price_cents=125700),
    ]
    saved = billing.api.patch(invoice_path(draft), json={"lines": lines}).json()
    assert [line["amount_cents"] for line in saved["lines"]] == [9900, 360000, 125700]
    assert (saved["subtotal_cents"], saved["tax_cents"], saved["total_cents"]) == (495600, 43985, 539585)
    issued = billing.api.post(invoice_path(draft, "issue"), json={}).json()
    assert (issued["subtotal_cents"], issued["tax_cents"], issued["total_cents"]) == (495600, 43985, 539585)
    assert issued["owed_cents"] == 539585


def test_a_drafts_figures_follow_the_settings_rate_until_its_issued(billing):
    draft = billing.draft()
    billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Annual support plan")]})
    billing.api.patch("/api/settings", json={"tax_rate": "10", "tax_label": "VAT"})
    reread = billing.api.get(invoice_path(draft)).json()
    assert (reread["tax_rate"], reread["tax_label"], reread["tax_cents"]) == ("10", "VAT", 36000)
    [listed] = billing.api.get("/api/invoices").json()
    assert listed["total_cents"] == 396000


BILL_TO_TOO_LONG = "Keep the Bill to to 6 lines and 500 characters"


@pytest.mark.parametrize(
    ("bill_to", "fine"),
    [
        ("x" * 500, True),
        ("x" * 501, False),
        ("\n".join(["Line"] * 6), True),
        ("\n".join(["Line"] * 7), False),
    ],
)
def test_the_bill_to_at_and_past_its_limits(billing, bill_to, fine):
    reply = billing.api.patch(invoice_path(billing.draft()), json={"bill_to": bill_to})
    if fine:
        assert (reply.status_code, reply.json()["bill_to"]) == (200, bill_to)
    else:
        assert (reply.status_code, reply.json()["fields"]) == (422, {"bill_to": BILL_TO_TOO_LONG})


DESCRIPTION_TOO_LONG = "Keep the description to 1,000 characters or fewer"


@pytest.mark.parametrize("route", ["", "issue"])
def test_a_bill_to_filled_in_from_the_deal_is_held_to_the_same_limits(billing, make, route):
    """Organization names have no limit of their own, so the Bill to a draft starts with can be too long (V8, V9)."""
    organization = make.organization("x" * 501)
    deal = make.deal("Long name", stage="won", close_date=TODAY, organization_id=organization)
    draft = billing.draft(deal)
    method = billing.api.post if route else billing.api.patch
    reply = method(invoice_path(draft, *([route] if route else [])), json={"lines": [billing.line("Pro license")]})
    assert (reply.status_code, reply.json()["fields"]) == (422, {"bill_to": BILL_TO_TOO_LONG})
    saved = billing.api.get(invoice_path(draft)).json()
    assert (saved["status"], saved["lines"]) == ("draft", [])


@pytest.mark.parametrize("route", ["", "issue"])
def test_a_description_taken_from_the_product_is_held_to_the_same_limit(billing, make, route):
    """Product descriptions have no limit of their own, so a line that takes one can be too long (V8, V9)."""
    product = make.product("Long notes", unit_price_cents=100, description="x" * 1001)
    draft = billing.draft()
    method = billing.api.post if route else billing.api.patch
    lines = [billing.line("Pro license"), {"product_id": product}]
    reply = method(invoice_path(draft, *([route] if route else [])), json={"lines": lines})
    assert (reply.status_code, reply.json()["fields"]) == (422, {"lines.1.description": DESCRIPTION_TOO_LONG})
    saved = billing.api.get(invoice_path(draft)).json()
    assert (saved["status"], saved["lines"]) == ("draft", [])


def test_the_bill_to_keeps_what_was_typed_inside_it(billing):
    typed = "Harbor & Pine\n  Unit 4,   Dock Road\n\nAttn: Sam"
    reply = billing.api.patch(invoice_path(billing.draft()), json={"bill_to": f"  {typed}\n\n"})
    assert reply.json()["bill_to"] == typed


@pytest.mark.parametrize(
    ("line", "field", "message"),
    [
        ({"description": "x" * 1001}, "description", "Keep the description to 1,000 characters or fewer"),
        ({"quantity": 0}, "quantity", "Enter a whole number from 1 to 1,000,000"),
        ({"quantity": 1_000_001}, "quantity", "Enter a whole number from 1 to 1,000,000"),
        ({"quantity": 1.5}, "quantity", "Enter a whole number from 1 to 1,000,000"),
        ({"quantity": "2"}, "quantity", "Enter a whole number from 1 to 1,000,000"),
        ({"unit_price_cents": -1}, "unit_price_cents", "Enter a price in dollars and cents, such as 49.50"),
        ({"unit_price_cents": 49.5}, "unit_price_cents", "Enter a price in dollars and cents, such as 49.50"),
        ({"unit_price_cents": 10**14 + 1}, "unit_price_cents", "Enter a price in dollars and cents, such as 49.50"),
    ],
)
def test_each_lines_rule_past_its_limit_is_keyed_by_its_place(billing, line, field, message):
    lines = [billing.line("Pro license"), billing.line("Pro license"), billing.line("Pro license", **line)]
    reply = billing.api.patch(invoice_path(billing.draft()), json={"lines": lines})
    assert (reply.status_code, reply.json()["fields"]) == (422, {f"lines.2.{field}": message})


@pytest.mark.parametrize(
    "line",
    [
        {"description": "x" * 1000},
        {"description": "Two\nlines"},
        {"quantity": 1},
        {"quantity": 1_000_000},
        {"unit_price_cents": 0},
        {"unit_price_cents": 10**8},
    ],
)
def test_each_lines_rule_at_its_limit_is_fine(billing, line):
    reply = billing.api.patch(invoice_path(billing.draft()), json={"lines": [billing.line("Pro license", **line)]})
    assert reply.status_code == 200


def test_up_to_100_lines(billing):
    draft = billing.draft()
    hundred = [billing.line("Pro license")] * 100
    assert len(billing.api.patch(invoice_path(draft), json={"lines": hundred}).json()["lines"]) == 100
    reply = billing.api.patch(invoice_path(draft), json={"lines": [*hundred, billing.line("Pro license")]})
    assert (reply.status_code, reply.json()["fields"]) == (422, {"lines": "An invoice can have up to 100 lines"})


def test_the_subtotal_is_at_most_a_trillion_dollars(billing):
    draft = billing.draft()
    trillion = billing.line("Pro license", quantity=1_000_000, unit_price_cents=10**8)
    assert billing.api.patch(invoice_path(draft), json={"lines": [trillion]}).json()["subtotal_cents"] == 10**14
    reply = billing.api.patch(invoice_path(draft), json={"lines": [trillion, billing.line("Pro license")]})
    assert (reply.status_code, reply.json()["fields"]) == (
        422,
        {"subtotal": "Keep the subtotal to $1 trillion or less"},
    )


def test_a_field_not_sent_keeps_what_is_saved(billing):
    draft = billing.draft()
    billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Pro license")]})
    kept = billing.api.patch(invoice_path(draft), json={"bill_to": "Someone else"}).json()
    assert ([line["name"] for line in kept["lines"]], kept["bill_to"]) == (["Pro license"], "Someone else")


# Issuing (V10, V11)


def test_issuing_gives_the_number_dates_organization_and_copies(billing):
    draft = billing.draft()
    with billing.on(date(2026, 10, 20)):
        issued = billing.api.post(
            invoice_path(draft, "issue"), json={"lines": [billing.line("Annual support plan")]}
        ).json()
    assert issued["status"] == "issued" and issued["shows_as"] == "issued"
    assert issued["number"] == "INV-0001"
    assert (issued["issue_date"], issued["due_date"]) == ("2026-10-20", "2026-11-19")
    assert issued["organization"] == {"id": billing.organization, "name": "Harbor & Pine"}
    assert issued["company"] == {
        "name": "Plainsong Systems",
        "address": "48 Orchard Row\nBrooklyn, NY 11201",
        "email": "accounts@plainsong.example",
        "phone": "(718) 555-0142",
    }
    assert (issued["tax_label"], issued["tax_rate"]) == ("Sales tax", "8.875")
    assert (issued["subtotal_cents"], issued["tax_cents"], issued["total_cents"]) == (360000, 31950, 391950)
    assert issued["issued_by"] == {"id": ALEX.id, "name": ALEX.name}


def test_the_prefix_and_the_payment_terms_are_the_settings_at_that_moment(billing):
    billing.issued()
    billing.api.patch("/api/settings", json={"invoice_prefix": "B-", "payment_terms_days": 0})
    second = billing.issued()
    assert (second["number"], second["issue_date"], second["due_date"]) == ("B-0002", "2026-10-31", "2026-10-31")


def test_each_invoice_keeps_its_place_in_the_order_issued_not_the_order_started(billing):
    """Two drafts started in one order and issued the same day in the other, across a prefix change (V22, B15)."""
    first_started, second_started = billing.draft(), billing.draft()
    lines = {"lines": [billing.line("Pro license")]}
    billing.api.post(invoice_path(second_started, "issue"), json=lines)
    billing.api.patch("/api/settings", json={"invoice_prefix": "B-"})
    billing.api.post(invoice_path(first_started, "issue"), json=lines)
    still_a_draft = billing.draft()
    listed = {row["id"]: (row["number"], row["issue_order"]) for row in billing.api.get("/api/invoices").json()}
    assert listed[second_started["id"]] == ("INV-0001", 1)
    assert listed[first_started["id"]] == ("B-0002", 2)
    assert listed[still_a_draft["id"]] == (None, None)
    assert billing.api.get(invoice_path(first_started)).json()["issue_order"] == 2


def test_each_v10_refusal_beside_its_field_or_at_the_top(billing, make):
    draft = billing.draft()
    reply = billing.api.post(invoice_path(draft, "issue"), json={"bill_to": " "})
    assert reply.json()["fields"] == {"bill_to": "Enter who the invoice is for", "lines": "Add a line before issuing"}

    free = billing.line("Pro license", unit_price_cents=0)
    reply = billing.api.post(invoice_path(draft, "issue"), json={"lines": [free]})
    assert reply.json()["fields"] == {"form": "The total must be more than $0.00 to issue."}

    deal = make.deal("No organization", stage="won", close_date=TODAY)
    nowhere = billing.draft(deal)
    reply = billing.api.post(
        invoice_path(nowhere, "issue"), json={"bill_to": "Someone", "lines": [billing.line("Pro license")]}
    )
    assert reply.json()["fields"] == {"form": "This deal has no organization. Choose one on the deal before issuing."}
    assert numbers_taken() is None


def test_without_a_company_name_issuing_is_refused(api, make):
    organization = make.organization()
    deal = make.deal(stage="won", close_date=TODAY, organization_id=organization)
    product = make.product()
    draft = api.post("/api/invoices", json={"deal_id": deal}).json()
    reply = api.post(invoice_path(draft, "issue"), json={"lines": [{"product_id": product}]})
    assert (reply.status_code, reply.json()["fields"]) == (
        422,
        {"form": "Enter the company's name in Company settings before issuing."},
    )


def test_a_refused_issue_saves_nothing_and_takes_no_number(billing):
    draft = billing.draft()
    reply = billing.api.post(
        invoice_path(draft, "issue"),
        json={"bill_to": "Changed", "lines": [billing.line("Pro license", unit_price_cents=0)]},
    )
    assert reply.status_code == 422
    reread = billing.api.get(invoice_path(draft)).json()
    assert (reread["status"], reread["bill_to"], reread["lines"]) == ("draft", draft["bill_to"], [])
    assert numbers_taken() is None
    assert billing.issued()["number"] == "INV-0001"


def test_a_failure_partway_through_issuing_gives_its_number_back(billing, monkeypatch, local_app):
    draft = billing.draft()
    billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Pro license")]})

    def fail(*_args, **_kwargs):
        raise RuntimeError("partway through")

    answering = TestClient(
        local_app, base_url=LOCAL, headers=billing.api.headers, raise_server_exceptions=False, client=THIS_COMPUTER
    )
    with monkeypatch.context() as patch:
        patch.setattr("accountable.invoices.routers.invoices.detail", fail)
        assert answering.post(invoice_path(draft, "issue"), json={}).status_code == 500
    assert numbers_taken() is None
    assert billing.api.get(invoice_path(draft)).json()["status"] == "draft"


def test_twenty_drafts_issued_at_once_get_twenty_numbers_in_a_row(billing):
    drafts = [billing.draft() for _ in range(20)]
    for draft in drafts:
        billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Pro license")]})

    with ThreadPoolExecutor(max_workers=20) as pool:
        replies = list(pool.map(lambda draft: billing.api.post(invoice_path(draft, "issue"), json={}), drafts))

    assert [reply.status_code for reply in replies] == [200] * 20
    assert sorted(reply.json()["number"] for reply in replies) == [f"INV-{number:04d}" for number in range(1, 21)]
    assert numbers_taken() == 20


def test_a_deal_out_of_won_keeps_its_draft_working(billing):
    draft = billing.draft()
    billing.api.patch(f"/api/deals/{billing.deal}", json={"stage": "negotiation"})
    billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Pro license")]})
    assert billing.api.post(invoice_path(draft, "issue"), json={}).json()["deal_stage"] == "negotiation"
    reply = billing.api.post("/api/invoices", json={"deal_id": billing.deal})
    assert reply.status_code == 409


# An issued invoice never changes (V12)


def every_write(invoice: dict, billing) -> list[tuple[str, str, dict]]:
    return [
        ("PATCH", invoice_path(invoice), {"bill_to": "Changed"}),
        ("PATCH", invoice_path(invoice), {"lines": [billing.line("Training day")]}),
        ("POST", invoice_path(invoice, "issue"), {}),
        ("DELETE", invoice_path(invoice), {}),
    ]


@pytest.mark.parametrize("voided", [False, True])
def test_every_change_to_an_issued_invoice_is_refused_and_nothing_changes(billing, voided):
    issued = billing.issued(billing.line("Pro license"))
    if voided:
        issued = billing.api.post(invoice_path(issued, "void"), json={}).json()
    for method, path, body in every_write(issued, billing):
        reply = billing.api.request(method, path, json=body)
        assert (reply.status_code, reply.json()) == (409, {"detail": ISSUED}), (method, path, body)
    assert billing.api.get(invoice_path(issued)).json() == issued


def test_a_draft_saved_after_a_teammate_issued_it_gets_the_409(billing, sign_in_as):
    draft = billing.draft()
    billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Pro license")]})
    issued = sign_in_as(DANA.id).post(invoice_path(draft, "issue"), json={}).json()
    reply = sign_in_as(ALEX.id).patch(invoice_path(draft), json={"bill_to": "Typed meanwhile"})
    assert (reply.status_code, reply.json()) == (409, {"detail": ISSUED})
    assert billing.api.get(invoice_path(draft)).json()["bill_to"] == issued["bill_to"]


def test_later_changes_to_the_settings_and_products_leave_an_issued_invoice_as_it_was(billing):
    issued = billing.issued(billing.line("Training day"))
    billing.api.patch(
        "/api/settings",
        json={
            "company_name": "Renamed Ltd",
            "address": "Elsewhere",
            "email": "new@renamed.example",
            "phone": "555-0199",
            "tax_label": "VAT",
            "tax_rate": "20",
            "invoice_prefix": "R-",
            "payment_terms_days": 90,
        },
    )
    billing.api.patch(
        f"/api/products/{billing.products['Training day']}",
        json={"name": "Training week", "description": "Renamed", "unit_price_cents": 1},
    )
    assert billing.api.get(invoice_path(issued)).json() == issued


def test_an_issued_invoice_stays_with_its_organization_after_the_deal_changes(billing, make):
    issued = billing.issued()
    elsewhere = make.organization("Elsewhere Inc")
    billing.api.patch(f"/api/deals/{billing.deal}", json={"organization_id": elsewhere})
    draft = billing.draft()

    assert billing.api.get(invoice_path(issued)).json()["organization"]["name"] == "Harbor & Pine"
    harbor = billing.api.get(f"/api/invoices?organization_id={billing.organization}").json()
    assert [invoice["id"] for invoice in harbor] == [issued["id"]]
    moved = billing.api.get(f"/api/invoices?organization_id={elsewhere}").json()
    assert [invoice["id"] for invoice in moved] == [draft["id"]]
    assert billing.api.delete(f"/api/organizations/{billing.organization}").status_code == 409


# Voiding and deleting (V8, V14)


def test_voiding_keeps_the_number_and_owes_nothing(billing, sign_in_as):
    issued = billing.issued()
    voided = sign_in_as(DANA.id).post(invoice_path(issued, "void"), json={})
    assert voided.status_code == 200
    void = voided.json()
    assert (void["status"], void["shows_as"], void["number"], void["owed_cents"]) == ("void", "void", "INV-0001", 0)
    assert void["total_cents"] == issued["total_cents"]
    assert void["voided_by"] == {"id": DANA.id, "name": DANA.name}
    assert void["voided_at"] == "2026-10-31T15:00:00Z"
    assert billing.issued()["number"] == "INV-0002"


def test_an_invoice_with_payments_cant_be_voided(billing):
    issued = billing.issued()
    billing.pay(issued, 100)
    reply = billing.api.post(invoice_path(issued, "void"), json={})
    assert (reply.status_code, reply.json()) == (409, {"detail": "This invoice has payments, so it can't be voided."})
    assert billing.api.get(invoice_path(issued)).json()["status"] == "issued"


def test_a_draft_is_deleted_rather_than_voided(billing):
    draft = billing.draft()
    reply = billing.api.post(invoice_path(draft, "void"), json={})
    assert (reply.status_code, reply.json()) == (409, {"detail": "A draft is deleted rather than voided."})
    void = billing.api.post(invoice_path(billing.issued(), "void"), json={}).json()
    again = billing.api.post(invoice_path(void, "void"), json={})
    assert (again.status_code, again.json()) == (409, {"detail": "This invoice is already void."})


def test_a_draft_can_be_deleted_with_its_lines(billing):
    draft = billing.draft()
    billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Pro license")]})
    assert billing.api.delete(invoice_path(draft)).status_code == 204
    assert billing.api.get(invoice_path(draft)).status_code == 404
    assert (row_count(invoices), row_count(invoice_lines)) == (0, 0)


# The list (V20 to V22)


def test_the_list_has_each_invoices_figures_newest_first(billing):
    issued = billing.issued(billing.line("Annual support plan"))
    billing.pay(issued, 100000)
    draft = billing.draft()
    listed = billing.api.get("/api/invoices").json()
    assert [invoice["id"] for invoice in listed] == [draft["id"], issued["id"]]
    assert listed[1] == {
        "id": issued["id"],
        "number": "INV-0001",
        "issue_order": 1,
        "shows_as": "part_paid",
        "deal": {"id": billing.deal, "name": "Annual support"},
        "organization": {"id": billing.organization, "name": "Harbor & Pine"},
        "bill_to": "Harbor & Pine\nAttn: Sam Carter\nsam@harbor.example",
        "issue_date": "2026-10-31",
        "due_date": "2026-11-30",
        "total_cents": 391950,
        "owed_cents": 291950,
    }
    assert (listed[0]["shows_as"], listed[0]["number"], listed[0]["owed_cents"]) == ("draft", None, 0)


def test_the_list_by_deal_and_by_organization(billing, make):
    other_deal = make.deal("Other", stage="won", close_date=TODAY, organization_id=billing.organization)
    on_deal = billing.draft()
    on_other = billing.issued(deal=other_deal)
    assert [invoice["id"] for invoice in billing.api.get(f"/api/invoices?deal_id={billing.deal}").json()] == [
        on_deal["id"]
    ]
    by_organization = billing.api.get(f"/api/invoices?organization_id={billing.organization}").json()
    assert [invoice["id"] for invoice in by_organization] == [on_other["id"], on_deal["id"]]
    assert billing.api.get("/api/invoices?deal_id=0").status_code == 422


def test_an_overdue_invoice_shows_overdue_in_the_list_and_on_its_page(billing):
    issued = billing.issued(on=TODAY - timedelta(days=45))
    [listed] = billing.api.get("/api/invoices").json()
    page = billing.api.get(invoice_path(issued)).json()
    assert (listed["shows_as"], page["shows_as"], page["days_late"]) == ("overdue", "overdue", 15)


# Who did each (U7, U10)


def test_who_added_changed_and_issued_each(billing, sign_in_as):
    draft = billing.draft()
    assert draft["created_by"] == draft["updated_by"] == {"id": ALEX.id, "name": ALEX.name}
    assert draft["created_at"] == draft["updated_at"] == "2026-10-31T15:00:00Z"
    issued = (
        sign_in_as(DANA.id).post(invoice_path(draft, "issue"), json={"lines": [billing.line("Pro license")]}).json()
    )
    assert issued["created_by"]["id"] == ALEX.id
    assert issued["updated_by"]["id"] == issued["issued_by"]["id"] == DANA.id


def test_a_save_that_changes_nothing_isnt_a_change(billing, sign_in_as):
    draft = billing.draft()
    saved = billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Pro license")]}).json()
    lines = [{"id": line["id"], "description": line["description"]} for line in saved["lines"]]
    again = sign_in_as(DANA.id).patch(invoice_path(draft), json={"bill_to": saved["bill_to"], "lines": lines}).json()
    assert again["updated_by"]["id"] == ALEX.id


def test_who_comes_from_the_token_never_the_body(billing):
    draft = billing.draft()
    reply = billing.api.patch(invoice_path(draft), json={"bill_to": "Changed", "updated_by": DANA.id})
    assert reply.json()["updated_by"]["id"] == ALEX.id


def test_times_are_utc(billing):
    assert billing.draft()["created_at"] == f"{NOW.isoformat()}Z"


# Characters the fonts can't draw (V9, V10)

UNPRINTABLE = {"an emoji": "\U0001f600", "a Chinese character": "漢", "an Arabic one": "ي"}


@pytest.mark.parametrize("kind", UNPRINTABLE)
@pytest.mark.parametrize("route", ["", "issue"])
def test_a_character_the_fonts_lack_is_refused_in_the_bill_to_and_a_description(billing, kind, route):
    character = UNPRINTABLE[kind]
    draft = billing.draft()
    method = billing.api.post if route else billing.api.patch
    lines = [billing.line("Pro license"), billing.line("Pro license", description=f"Setup {character}")]
    reply = method(
        invoice_path(draft, *([route] if route else [])), json={"bill_to": f"Acme {character}", "lines": lines}
    )
    assert reply.status_code == 422
    message = f'Invoices can\'t show "{character}". Take it out to save'
    assert reply.json()["fields"] == {"bill_to": message, "lines.1.description": message}
    assert billing.api.get(invoice_path(draft)).json()["lines"] == []


def test_a_tab_is_named_as_a_tab(billing):
    reply = billing.api.patch(invoice_path(billing.draft()), json={"bill_to": "Acme\tCo"})
    assert reply.json()["fields"] == {"bill_to": "Invoices can't show a tab. Take it out to save"}


def test_a_line_whose_products_name_the_fonts_lack_is_refused_beside_the_line(billing, make):
    product = make.product("漢 license")
    reply = billing.api.patch(invoice_path(billing.draft()), json={"lines": [{"product_id": product}]})
    assert reply.json()["fields"] == {
        "lines.0.name": 'Invoices can\'t show "漢". Remove this line, rename the product and add it again'
    }


def test_accented_letters_and_common_symbols_are_kept(billing):
    typed = "Société Générale – Zürich\nAttn: Łukasz Nowak\n© 2026, €500 “paid”"
    reply = billing.api.patch(
        invoice_path(billing.draft()),
        json={"bill_to": typed, "lines": [billing.line("Pro license", description="Café & Crème")]},
    )
    assert reply.status_code == 200
    assert (reply.json()["bill_to"], reply.json()["lines"][0]["description"]) == (typed, "Café & Crème")


@pytest.mark.parametrize(
    ("field", "words"),
    [
        ("company_name", "company name"),
        ("address", "address"),
        ("email", "email"),
        ("phone", "phone"),
        ("tax_label", "tax label"),
    ],
)
def test_a_character_the_fonts_lack_in_the_companys_details_stops_issuing_naming_the_field(billing, field, words):
    value = "漢@plainsong.example" if field == "email" else "Plainsong 漢"
    assert billing.api.patch("/api/settings", json={field: value}).status_code == 200
    draft = billing.draft()
    reply = billing.api.post(invoice_path(draft, "issue"), json={"lines": [billing.line("Pro license")]})
    assert (reply.status_code, reply.json()["fields"]) == (
        422,
        {
            "form": f'The {words} in Company settings has "漢", which invoices can\'t show. Change it there before issuing.'
        },
    )
    assert numbers_taken() is None
    assert billing.api.patch(invoice_path(draft), json={"lines": [billing.line("Pro license")]}).status_code == 200
