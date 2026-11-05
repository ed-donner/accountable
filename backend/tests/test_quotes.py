"""Quotes through the API (Q5 to Q29): adding, lines, amounts and tax, Prepared for, sending,
accepting, declining, copying, and who added and last changed each one."""

import threading
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import pytest
from accountable import db, users
from accountable.api import MAX_CENTS
from accountable.company.tables import company_settings
from accountable.crm.tables import deals, stage_changes
from accountable.products.tables import products
from accountable.quotes.tables import quote_lines, quotes
from conftest import NOW, TODAY, insert_row
from sqlalchemy import func, insert, select, update
from sqlalchemy.exc import IntegrityError

ALEX, DANA, THEO = (teammate.id for teammate in users.TEAMMATES[:3])

PLAINSONG = {
    "company_name": "Plainsong Systems",
    "address": "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
    "email": "accounts@plainsong.example",
    "phone": "(718) 555-0142",
    "tax_label": "Sales tax",
    "tax_rate": "8.875",
}
PLAINSONG_ON_A_QUOTE = {
    "name": "Plainsong Systems",
    "address": "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
    "email": "accounts@plainsong.example",
    "phone": "(718) 555-0142",
}
HARBOR_AND_PINE = {"organization": "Harbor & Pine", "contact": "Sam Carter", "email": "sam.carter@harborpine.example"}


@dataclass
class World:
    """A company with its settings saved, a deal in Proposal, and some products."""

    organization: int
    contact: int
    deal: int
    license: int
    training: int
    seat: int
    archived: int


@pytest.fixture
def world(api, make) -> World:
    assert api.patch("/api/settings", json=PLAINSONG).status_code == 200
    organization = make.organization("Harbor & Pine")
    contact = make.contact(
        "Sam Carter", email="sam.carter@harborpine.example", organization_id=organization, status="qualified"
    )
    deal = make.deal(
        "Renewal and upgrade", stage="proposal", organization_id=organization, main_contact_id=contact, value=24000
    )
    return World(
        organization=organization,
        contact=contact,
        deal=deal,
        license=make.product("Standard license", unit_price_cents=48000, description="One named user"),
        training=make.product("Training day", unit_price_cents=125000, description="Up to 12 people"),
        seat=make.product("Extra user seat", unit_price_cents=4950),
        archived=make.product("Label printer", unit_price_cents=28995, active=False),
    )


def new_line(product: int, quantity: Any = 1, unit_price_cents: Any = 4950, **more: Any) -> dict[str, Any]:
    """A new line by its product. The quantity and price can be anything, so tests can send bad ones."""
    return {"product_id": product, "quantity": quantity, "unit_price_cents": unit_price_cents, **more}


def kept(line: dict[str, Any], **changes: Any) -> dict[str, Any]:
    """A line already on the quote, as the form sends it back."""
    fields = ("id", "description", "quantity", "unit_price_cents")
    return {**{field: line[field] for field in fields}, **changes}


def add(api, deal: int, *lines: dict[str, Any], **more: Any) -> dict[str, Any]:
    reply = api.post("/api/quotes", json={"deal_id": deal, "lines": list(lines), **more})
    assert reply.status_code == 201, reply.text
    return reply.json()


def act(api, quote: dict[str, Any], action: str):
    """Sends, accepts, declines or copies, with the empty body every POST needs."""
    return api.post(f"/api/quotes/{quote['id']}/{action}", json={})


def done(api, quote: dict[str, Any], action: str) -> dict[str, Any]:
    reply = act(api, quote, action)
    assert reply.status_code in (200, 201), reply.text
    return reply.json()


def refusal(reply) -> tuple[int, str]:
    return reply.status_code, reply.json()["detail"]


def fields(reply) -> dict[str, str]:
    assert reply.status_code == 422, reply.text
    return reply.json()["fields"]


def on_day(api, day: date) -> None:
    """Makes today another day for the rest of the test."""
    api.app.dependency_overrides[db.local_today] = lambda: day


def a_sent_quote(api, world: World) -> dict[str, Any]:
    return done(api, add(api, world.deal, new_line(world.license, 2, 48000)), "send")


# Adding


def test_a_new_draft_takes_the_next_number_todays_date_and_30_days(api, world):
    first = add(api, world.deal, new_line(world.license, 12, 48000))
    second = add(api, world.deal)
    assert (first["number"], second["number"]) == ("QT-0001", "QT-0002")
    assert first["status"] == "draft"
    assert (first["quote_date"], first["valid_until"]) == ("2026-10-31", "2026-11-30")
    assert first["deal"] == {"id": world.deal, "name": "Renewal and upgrade", "stage": "proposal"}
    assert (first["sent_on"], first["decided_on"]) == (None, None)


def test_the_number_takes_the_prefix_as_it_is_now(api, world):
    add(api, world.deal)
    api.patch("/api/settings", json={"quote_prefix": "Q-"})
    assert add(api, world.deal)["number"] == "Q-0002"


def test_a_valid_until_date_sent_is_kept(api, world):
    assert add(api, world.deal, valid_until="2026-12-18")["valid_until"] == "2026-12-18"
    assert add(api, world.deal, valid_until="2026-10-31")["valid_until"] == "2026-10-31"


def test_a_valid_until_date_before_the_quotes_date_is_refused_beside_it(api, world):
    reply = api.post("/api/quotes", json={"deal_id": world.deal, "valid_until": "2026-10-30"})
    assert fields(reply) == {"valid_until": "Choose a date on or after the quote's date"}


def test_an_add_that_fails_gives_its_number_back(api, world):
    refused = api.post("/api/quotes", json={"deal_id": world.deal, "lines": [new_line(world.archived)]})
    assert refused.status_code == 422
    assert add(api, world.deal)["number"] == "QT-0001"


@pytest.mark.parametrize("stage", ["new", "qualified", "proposal", "negotiation"])
def test_any_open_deal_can_take_a_quote(api, world, make, stage):
    deal = make.deal("Open", stage=stage)
    assert add(api, deal)["deal"]["stage"] == stage


@pytest.mark.parametrize("stage", ["won", "lost"])
def test_a_closed_deal_cant_take_a_quote(api, world, make, stage):
    deal = make.deal("Closed", stage=stage)
    reply = api.post("/api/quotes", json={"deal_id": deal})
    assert refusal(reply) == (409, "This deal is closed, so it can't take a new quote.")


def test_a_deal_that_isnt_there_is_refused_beside_the_picker(api, world):
    assert fields(api.post("/api/quotes", json={"deal_id": 999})) == {"deal_id": "Choose an open deal"}


def test_a_new_draft_starts_with_the_settings_and_the_deals_details(api, world):
    assert api.get(f"/api/quotes/new/{world.deal}").json() == {
        "deal": {"id": world.deal, "name": "Renewal and upgrade", "stage": "proposal"},
        "company": PLAINSONG_ON_A_QUOTE,
        "prepared_for": HARBOR_AND_PINE,
        "tax_label": "Sales tax",
        "tax_rate": "8.875",
    }
    assert api.get("/api/quotes/new/999").status_code == 404


def test_asking_what_a_new_draft_starts_with_saves_nothing_and_takes_no_number(api, world):
    api.get(f"/api/quotes/new/{world.deal}")
    assert api.get("/api/quotes").json() == []
    assert add(api, world.deal)["number"] == "QT-0001"


# Lines


def test_lines_take_the_products_name_and_their_amounts_are_worked_out(api, world):
    quote = add(
        api,
        world.deal,
        new_line(world.license, 12, 48000, description="Annual license, per seat", name="Made up"),
        new_line(world.training, 2, 125000),
    )
    assert [(line["name"], line["description"], line["amount_cents"]) for line in quote["lines"]] == [
        ("Standard license", "Annual license, per seat", 576000),
        ("Training day", None, 250000),
    ]
    assert [line["product_id"] for line in quote["lines"]] == [world.license, world.training]


def test_an_archived_product_cant_be_added(api, world):
    reply = api.post(
        "/api/quotes", json={"deal_id": world.deal, "lines": [new_line(world.seat), new_line(world.archived)]}
    )
    assert fields(reply) == {"lines.1.product_id": "This product is archived. Choose another."}


def test_a_new_line_needs_a_product_that_exists(api, world):
    reply = api.post(
        "/api/quotes", json={"deal_id": world.deal, "lines": [new_line(999), {"quantity": 1, "unit_price_cents": 1}]}
    )
    assert fields(reply) == {"lines.0.product_id": "Choose a product", "lines.1.product_id": "Choose a product"}


def test_a_kept_line_keeps_its_product_and_name_whatever_happens_to_the_product(api, world):
    quote = add(api, world.deal, new_line(world.license, 1, 48000))
    with db.writing() as conn:
        conn.execute(update(products).where(products.c.id == world.license).values(name="Renamed", active=False))
    [line] = quote["lines"]
    sent = {**kept(line, quantity=3), "product_id": world.training, "name": "Made up"}
    saved = api.patch(f"/api/quotes/{quote['id']}", json={"lines": [sent]}).json()
    assert [(line["id"], line["product_id"], line["name"], line["quantity"]) for line in saved["lines"]] == [
        (line["id"], world.license, "Standard license", 3)
    ]


def test_lines_are_saved_whole_in_the_order_sent(api, world):
    quote = add(api, world.deal, new_line(world.license), new_line(world.training), new_line(world.seat))
    first, second, third = quote["lines"]
    saved = api.patch(
        f"/api/quotes/{quote['id']}",
        json={"lines": [kept(third), kept(first, description="Edited"), new_line(world.seat)]},
    ).json()
    assert [(line["id"], line["description"]) for line in saved["lines"][:2]] == [
        (third["id"], None),
        (first["id"], "Edited"),
    ]
    assert saved["lines"][2]["id"] not in (first["id"], second["id"], third["id"])
    with db.reading() as conn:
        assert conn.execute(select(func.count()).select_from(quote_lines)).scalar_one() == 3


def test_another_quotes_line_cant_be_sent(api, world):
    other = add(api, world.deal, new_line(world.license))
    quote = add(api, world.deal, new_line(world.seat))
    reply = api.patch(f"/api/quotes/{quote['id']}", json={"lines": [kept(other["lines"][0])]})
    assert fields(reply) == {"lines.0.id": "This line isn't on the quote"}
    assert api.get(f"/api/quotes/{other['id']}").json()["lines"] == other["lines"]


def test_one_line_cant_be_sent_twice(api, world):
    quote = add(api, world.deal, new_line(world.license))
    [line] = quote["lines"]
    reply = api.patch(f"/api/quotes/{quote['id']}", json={"lines": [kept(line), kept(line)]})
    assert fields(reply) == {"lines.1.id": "This line isn't on the quote"}


@pytest.mark.parametrize("quantity", [1, 1_000_000])
def test_a_quantity_at_either_limit_is_saved(api, world, quantity):
    assert add(api, world.deal, new_line(world.seat, quantity, 1))["lines"][0]["quantity"] == quantity


@pytest.mark.parametrize("quantity", [0, -1, 1_000_001, 1.5, "2", True, None])
def test_a_quantity_past_the_limits_or_not_whole_is_refused(api, world, quantity):
    reply = api.post("/api/quotes", json={"deal_id": world.deal, "lines": [new_line(world.seat, quantity, 1)]})
    assert fields(reply) == {"lines.0.quantity": "Enter a whole number from 1 to 1,000,000"}


@pytest.mark.parametrize("cents", [0, MAX_CENTS])
def test_a_price_at_either_limit_is_saved(api, world, cents):
    assert add(api, world.deal, new_line(world.seat, 1, cents))["lines"][0]["unit_price_cents"] == cents


@pytest.mark.parametrize("cents", [-1, MAX_CENTS + 1, 49.5, "4950", True, None])
def test_a_price_past_the_limits_or_not_whole_cents_is_refused(api, world, cents):
    reply = api.post("/api/quotes", json={"deal_id": world.deal, "lines": [new_line(world.seat, 1, cents)]})
    assert fields(reply) == {"lines.0.unit_price_cents": "Enter a price in dollars and cents, such as 49.50"}


def test_a_hundred_lines_are_saved_and_a_hundred_and_one_refused(api, world):
    assert len(add(api, world.deal, *[new_line(world.seat)] * 100)["lines"]) == 100
    reply = api.post("/api/quotes", json={"deal_id": world.deal, "lines": [new_line(world.seat)] * 101})
    assert fields(reply) == {"lines": "Keep the quote to 100 lines or fewer"}


def test_a_subtotal_past_a_trillion_dollars_is_refused(api, world):
    assert add(api, world.deal, new_line(world.seat, 1, MAX_CENTS))["subtotal_cents"] == MAX_CENTS
    reply = api.post("/api/quotes", json={"deal_id": world.deal, "lines": [new_line(world.seat, 1, MAX_CENTS)] * 2})
    assert fields(reply) == {"lines": "Keep the subtotal to $1 trillion or less"}
    assert api.get("/api/quotes").json()[0]["number"] == "QT-0001"


def test_a_nul_character_in_a_description_is_refused(api, world):
    reply = api.post(
        "/api/quotes", json={"deal_id": world.deal, "lines": [new_line(world.seat, description="Rush\x00order")]}
    )
    assert fields(reply) == {"lines.0.description": "Use plain text here"}


def test_a_bad_field_on_the_third_line_is_named_by_its_place(api, world):
    lines = [new_line(world.seat), new_line(world.seat), new_line(world.seat, "lots")]
    assert fields(api.post("/api/quotes", json={"deal_id": world.deal, "lines": lines})) == {
        "lines.2.quantity": "Enter a whole number from 1 to 1,000,000"
    }


def test_a_bad_valid_until_date_is_named_on_its_own(api, world):
    reply = api.post("/api/quotes", json={"deal_id": world.deal, "valid_until": "soon"})
    assert fields(reply) == {"valid_until": "Choose a valid-until date"}


# Amounts and tax


def test_the_quote_adds_up_with_tax_once_on_the_subtotal(api, world):
    quote = add(
        api,
        world.deal,
        new_line(world.license, 12, 48000),
        new_line(world.training, 2, 125000),
        new_line(world.seat, 3, 4950),
    )
    # 12 x $480.00 + 2 x $1,250.00 + 3 x $49.50 = $8,408.50, and 8.875% of that is $746.254375.
    assert (quote["subtotal_cents"], quote["tax_cents"], quote["total_cents"]) == (840850, 74625, 915475)
    assert (quote["tax_label"], quote["tax_rate"]) == ("Sales tax", "8.875")


def test_made_up_amounts_in_the_request_are_ignored(api, world):
    line = new_line(world.license, 2, 48000, amount_cents=1, name="Free")
    reply = api.post(
        "/api/quotes",
        json={"deal_id": world.deal, "lines": [line], "subtotal_cents": 1, "tax_cents": 1, "total_cents": 2},
    )
    quote = reply.json()
    assert (quote["lines"][0]["amount_cents"], quote["subtotal_cents"], quote["total_cents"]) == (96000, 96000, 104520)


def test_a_drafts_tax_and_company_follow_the_settings(api, world):
    quote = add(api, world.deal, new_line(world.license, 1, 100000))
    api.patch("/api/settings", json={"company_name": "Plainsong Ltd", "tax_label": "", "tax_rate": "5", "phone": ""})
    again = api.get(f"/api/quotes/{quote['id']}").json()
    assert again["company"] == {**PLAINSONG_ON_A_QUOTE, "name": "Plainsong Ltd", "phone": None}
    assert (again["tax_label"], again["tax_rate"], again["tax_cents"]) == (None, "5", 5000)


def test_a_drafts_prepared_for_follows_its_deal(api, world, make):
    quote = add(api, world.deal)
    other = make.contact("Elena Petrova", email=None)
    api.patch(f"/api/organizations/{world.organization}", json={"name": "Harbor and Pine"})
    api.patch(f"/api/deals/{world.deal}", json={"main_contact_id": other})
    again = api.get(f"/api/quotes/{quote['id']}").json()
    assert again["prepared_for"] == {"organization": "Harbor and Pine", "contact": "Elena Petrova", "email": None}


@pytest.mark.parametrize("action", ["send", "decline"])
def test_once_sent_or_declined_nothing_changes_its_details(api, world, make, action):
    quote = done(api, add(api, world.deal, new_line(world.license, 1, 100000)), action)
    api.patch("/api/settings", json={"company_name": "Plainsong Ltd", "address": "", "tax_rate": "5"})
    api.patch(f"/api/organizations/{world.organization}", json={"name": "Harbor and Pine"})
    api.patch(f"/api/contacts/{world.contact}", json={"name": "Samuel Carter"})
    api.patch(f"/api/deals/{world.deal}", json={"main_contact_id": make.contact("Someone else")})
    again = api.get(f"/api/quotes/{quote['id']}").json()
    assert again["company"] == PLAINSONG_ON_A_QUOTE
    assert again["prepared_for"] == HARBOR_AND_PINE
    assert (again["tax_label"], again["tax_rate"], again["tax_cents"], again["total_cents"]) == (
        "Sales tax",
        "8.875",
        8875,
        108875,
    )
    assert api.get("/api/quotes").json()[0]["tax_cents"] == 8875


def test_the_list_shows_each_quotes_tax_as_its_page_does(api, world):
    draft = add(api, world.deal, new_line(world.license, 1, 100000))
    sent = a_sent_quote(api, world)
    api.patch("/api/settings", json={"tax_rate": "5"})
    rows = {row["id"]: row for row in api.get("/api/quotes").json()}
    assert (rows[draft["id"]]["tax_cents"], rows[draft["id"]]["total_cents"]) == (5000, 105000)
    assert rows[sent["id"]]["tax_cents"] == api.get(f"/api/quotes/{sent['id']}").json()["tax_cents"] == 8520


# Statuses


def test_sending_fixes_the_details_and_records_the_day(api, world):
    sent = a_sent_quote(api, world)
    assert (sent["status"], sent["sent_on"], sent["decided_on"]) == ("sent", "2026-10-31", None)
    with db.reading() as conn:
        row = conn.execute(select(quotes).where(quotes.c.id == sent["id"])).one()
    assert (row.company_name, row.tax_label, row.tax_rate, row.prepared_for_contact) == (
        "Plainsong Systems",
        "Sales tax",
        8875,
        "Sam Carter",
    )


@pytest.mark.parametrize("start", ["draft", "sent"])
def test_a_draft_or_a_sent_quote_can_be_declined(api, world, start):
    quote = add(api, world.deal, new_line(world.license))
    if start == "sent":
        quote = done(api, quote, "send")
    declined = done(api, quote, "decline")
    assert (declined["status"], declined["decided_on"]) == ("declined", "2026-10-31")


def test_only_a_draft_can_be_changed(api, world):
    sent = a_sent_quote(api, world)
    words = "QT-0001 has been sent, so it can't be changed. Copy it to make a new draft."
    for body in ({"valid_until": "2026-12-31"}, {"lines": []}, {}):
        assert refusal(api.patch(f"/api/quotes/{sent['id']}", json=body)) == (409, words)
    assert api.get(f"/api/quotes/{sent['id']}").json()["lines"] == sent["lines"]


@pytest.mark.parametrize(
    ("ends", "action", "words"),
    [
        ("sent", "send", "QT-0001 has been sent, so it can't be changed. Copy it to make a new draft."),
        ("accepted", "send", "QT-0001 has been accepted, so it can't be changed. Copy it to make a new draft."),
        ("accepted", "accept", "QT-0001 has been accepted, so it can't be changed. Copy it to make a new draft."),
        ("accepted", "decline", "QT-0001 has been accepted, so it can't be changed. Copy it to make a new draft."),
        ("declined", "send", "QT-0001 has been declined, so it can't be changed. Copy it to make a new draft."),
        ("declined", "accept", "QT-0001 has been declined, so it can't be changed. Copy it to make a new draft."),
        ("declined", "decline", "QT-0001 has been declined, so it can't be changed. Copy it to make a new draft."),
        ("draft", "accept", "QT-0001 is a draft. Mark it as sent before accepting it."),
    ],
)
def test_statuses_only_move_forward(api, world, ends, action, words):
    quote = add(api, world.deal, new_line(world.license))
    for step in {"draft": [], "sent": ["send"], "accepted": ["send", "accept"], "declined": ["decline"]}[ends]:
        quote = done(api, quote, step)
        quote = quote.get("quote", quote)
    assert refusal(act(api, quote, action)) == (409, words)
    assert api.get(f"/api/quotes/{quote['id']}").json()["status"] == ends


@pytest.mark.parametrize(
    ("problem", "words"),
    [
        ("closed", "This deal is closed, so its quotes can't be sent."),
        ("no organization", "Give the deal an organization before sending its quote."),
        ("no lines", "Add a line before sending the quote."),
        ("no company name", "Add the company's name in Company settings first."),
    ],
)
def test_what_stops_a_quote_being_sent_leaves_it_a_draft(api, world, problem, words):
    quote = add(api, world.deal, *([] if problem == "no lines" else [new_line(world.license)]))
    with db.writing() as conn:
        if problem == "closed":
            conn.execute(update(deals).where(deals.c.id == world.deal).values(stage="lost"))
        if problem == "no organization":
            conn.execute(update(deals).where(deals.c.id == world.deal).values(organization_id=None))
        if problem == "no company name":
            conn.execute(update(company_settings).values(company_name=None))
    assert refusal(act(api, quote, "send")) == (409, words)
    assert api.get(f"/api/quotes/{quote['id']}").json()["status"] == "draft"


def test_a_valid_until_date_before_today_stops_sending_beside_the_date(api, world):
    quote = add(api, world.deal, new_line(world.license), valid_until="2026-11-02")
    on_day(api, date(2026, 11, 3))
    assert fields(act(api, quote, "send")) == {"valid_until": "Choose a valid-until date from today on."}
    on_day(api, date(2026, 11, 2))
    assert done(api, quote, "send")["status"] == "sent"


def test_an_expired_quote_can_still_be_accepted(api, world):
    sent = a_sent_quote(api, world)
    on_day(api, date(2027, 3, 1))
    assert done(api, sent, "accept")["quote"]["status"] == "accepted"


def test_a_closed_deals_quotes_can_still_be_declined(api, world):
    draft = add(api, world.deal)
    sent = a_sent_quote(api, world)
    api.post(f"/api/deals/{world.deal}/move", json={"stage": "lost", "before_deal_id": None})
    assert done(api, draft, "decline")["status"] == "declined"
    assert done(api, sent, "decline")["status"] == "declined"


# Accepting


def test_accepting_wins_the_deal_by_the_stage_rules_with_the_quotes_value(api, world, make, deal_row, contact_row):
    already_won = make.deal("Already won", stage="won")
    quote = add(api, world.deal, new_line(world.license, 1, 4800050))  # $48,000.50
    accepted = done(api, done(api, quote, "send"), "accept")

    deal = deal_row(world.deal)
    assert (deal.stage, deal.probability, deal.close_date, deal.value) == ("won", 100, TODAY, 48001)
    assert (deal.updated_by, deal.updated_at) == (ALEX, NOW)
    assert deal.position < deal_row(already_won).position
    contact = contact_row(world.contact)
    assert (contact.status, contact.updated_by) == ("customer", ALEX)
    with db.reading() as conn:
        [change] = conn.execute(select(stage_changes).where(stage_changes.c.deal_id == world.deal)).all()
    assert (change.from_stage, change.to_stage, change.created_by) == ("proposal", "won", ALEX)
    assert accepted["deal"] == {"id": world.deal, "name": "Renewal and upgrade", "value": 48001}
    assert accepted["changes"] == {"close_date": "2026-10-31", "new_customer": "Sam Carter", "declined": []}
    assert (accepted["quote"]["status"], accepted["quote"]["decided_on"]) == ("accepted", "2026-10-31")


@pytest.mark.parametrize(("cents", "dollars"), [(4800049, 48000), (4800050, 48001), (4800099, 48001), (0, 0)])
def test_the_deals_value_is_the_subtotal_to_the_nearest_dollar_halves_up(api, world, deal_row, cents, dollars):
    accepted = done(api, done(api, add(api, world.deal, new_line(world.license, 1, cents)), "send"), "accept")
    assert accepted["deal"]["value"] == deal_row(world.deal).value == dollars


def test_the_timeline_shows_who_accepted(api, world, sign_in_as):
    sent = a_sent_quote(api, world)
    sign_in_as(DANA)
    done(api, sent, "accept")
    [entry] = api.get(f"/api/deals/{world.deal}/timeline").json()["entries"]
    assert (entry["kind"], entry["description"], entry["created_by"]["name"]) == (
        "stage_change",
        "Moved from Proposal to Won",
        "Dana Whitfield",
    )


def test_accepting_declines_the_deals_other_sent_quotes_and_leaves_its_drafts(api, world, sign_in_as):
    draft = add(api, world.deal)
    other_sent = a_sent_quote(api, world)
    chosen = a_sent_quote(api, world)
    sign_in_as(DANA)
    accepted = done(api, chosen, "accept")
    assert accepted["changes"]["declined"] == [other_sent["number"]]
    declined = api.get(f"/api/quotes/{other_sent['id']}").json()
    assert (declined["status"], declined["decided_on"], declined["updated_by"]["name"]) == (
        "declined",
        "2026-10-31",
        "Dana Whitfield",
    )
    assert api.get(f"/api/quotes/{draft['id']}").json()["status"] == "draft"


def test_a_deal_already_closed_cant_accept_a_quote(api, world):
    sent = a_sent_quote(api, world)
    api.post(f"/api/deals/{world.deal}/move", json={"stage": "won", "before_deal_id": None})
    assert refusal(act(api, sent, "accept")) == (409, "This deal is closed, so its quotes can't be accepted.")
    assert api.get(f"/api/quotes/{sent['id']}").json()["status"] == "sent"


def test_a_won_deal_dragged_back_keeps_its_accepted_quote_and_cant_accept_another(api, world):
    first = a_sent_quote(api, world)
    done(api, first, "accept")
    api.post(f"/api/deals/{world.deal}/move", json={"stage": "negotiation", "before_deal_id": None})
    second = a_sent_quote(api, world)
    assert refusal(act(api, second, "accept")) == (409, "This deal already has an accepted quote, QT-0001.")
    assert api.get(f"/api/quotes/{first['id']}").json()["status"] == "accepted"


def test_two_accepts_at_once_give_one_accepted_quote(api, world):
    quotes_sent = [a_sent_quote(api, world) for _ in range(2)]
    replies: list[int] = []
    start = threading.Barrier(2)

    def accept(quote):
        start.wait()
        replies.append(act(api, quote, "accept").status_code)

    threads = [threading.Thread(target=accept, args=(quote,)) for quote in quotes_sent]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(replies) == [200, 409]
    statuses = sorted(api.get(f"/api/quotes/{quote['id']}").json()["status"] for quote in quotes_sent)
    assert statuses == ["accepted", "declined"]


def test_the_database_refuses_a_second_accepted_quote_on_a_deal(api, world):
    row = {
        "deal_id": world.deal,
        "status": "accepted",
        "quote_date": TODAY,
        "valid_until": TODAY,
        "subtotal_cents": 0,
    }
    with db.writing() as conn:
        insert_row(conn, quotes, number="QT-0001", **row)
        insert_row(conn, quotes, number="QT-0002", **{**row, "status": "declined"})
    with pytest.raises(IntegrityError), db.writing() as conn:
        conn.execute(insert(quotes).values(number="QT-0003", **row))


# Copying


def test_copying_makes_a_new_draft_with_the_same_lines_and_leaves_the_original(api, world):
    original = add(
        api, world.deal, new_line(world.license, 12, 47500, description="Discounted"), new_line(world.seat, 3, 4950)
    )
    original = done(api, original, "send")
    with db.writing() as conn:
        conn.execute(update(products).where(products.c.id == world.license).values(active=False))
    on_day(api, date(2026, 11, 20))
    copy = done(api, original, "copy")

    assert (copy["number"], copy["status"], copy["quote_date"], copy["valid_until"]) == (
        "QT-0002",
        "draft",
        "2026-11-20",
        "2026-12-20",
    )

    def lines(quote):
        return [
            (line["product_id"], line["name"], line["description"], line["quantity"], line["unit_price_cents"])
            for line in quote["lines"]
        ]

    assert lines(copy) == lines(original)
    assert {line["id"] for line in copy["lines"]}.isdisjoint(line["id"] for line in original["lines"])
    assert api.get(f"/api/quotes/{original['id']}").json() == original


def test_a_closed_deals_quotes_cant_be_copied(api, world):
    sent = a_sent_quote(api, world)
    done(api, sent, "accept")
    assert refusal(act(api, sent, "copy")) == (409, "This deal is closed, so it can't take a new quote.")


# The rest


def test_quotes_are_never_deleted(api, world):
    quote = add(api, world.deal)
    assert api.delete(f"/api/quotes/{quote['id']}").status_code == 405
    assert api.get(f"/api/quotes/{quote['id']}").status_code == 200


def test_a_missing_quote_is_a_404(api, world):
    for reply in (
        api.get("/api/quotes/999"),
        api.patch("/api/quotes/999", json={}),
        api.post("/api/quotes/999/send", json={}),
        api.get("/api/quotes/999/pdf"),
    ):
        assert (reply.status_code, reply.json()["detail"]) == (404, "Quote not found")


def test_the_list_is_newest_first_and_narrows_to_a_deal_or_an_organization(api, world, make):
    other_organization = make.organization("Lantern Hotels")
    other_deal = make.deal("Kiosks", stage="proposal", organization_id=other_organization)
    no_organization = make.deal("Loose", stage="new")
    first = add(api, world.deal, new_line(world.license, 2, 48000))
    second = add(api, other_deal)
    third = add(api, no_organization)

    every = api.get("/api/quotes").json()
    assert [row["id"] for row in every] == [third["id"], second["id"], first["id"]]
    assert every[2] == {
        "id": first["id"],
        "number": "QT-0001",
        "status": "draft",
        "deal_id": world.deal,
        "deal_name": "Renewal and upgrade",
        "deal_stage": "proposal",
        "organization_id": world.organization,
        "organization_name": "Harbor & Pine",
        "quote_date": "2026-10-31",
        "valid_until": "2026-11-30",
        "subtotal_cents": 96000,
        "tax_cents": 8520,
        "total_cents": 104520,
    }
    assert every[0]["organization_name"] is None
    assert [row["id"] for row in api.get(f"/api/quotes?deal_id={other_deal}").json()] == [second["id"]]
    assert [row["id"] for row in api.get(f"/api/quotes?organization_id={world.organization}").json()] == [first["id"]]
    assert api.get("/api/quotes?deal_id=0").status_code == 422


def test_who_added_and_last_changed_a_quote_through_every_change(api, world, sign_in_as):
    quote = add(api, world.deal, new_line(world.license))
    assert (quote["created_by"]["name"], quote["updated_by"]["name"]) == ("Alex Rivera", "Alex Rivera")
    assert quote["created_at"] == quote["updated_at"]

    for teammate, action in ((DANA, "save"), (THEO, "send"), (DANA, "accept")):
        sign_in_as(teammate)
        on_day(api, TODAY)
        api.app.dependency_overrides[db.utc_now] = lambda teammate=teammate: NOW + timedelta(hours=len(teammate))
        if action == "save":
            reply = api.patch(f"/api/quotes/{quote['id']}", json={"lines": [kept(quote["lines"][0], quantity=5)]})
            quote = reply.json()
        else:
            reply = done(api, quote, action)
            quote = reply.get("quote", reply)
        name = {DANA: "Dana Whitfield", THEO: "Theo Brandt"}[teammate]
        assert (quote["created_by"]["name"], quote["updated_by"]["name"]) == ("Alex Rivera", name), action
        assert quote["updated_at"] != quote["created_at"]


def test_a_save_that_changes_nothing_leaves_who_and_when_alone(api, world, sign_in_as):
    quote = add(api, world.deal, new_line(world.license, 2, 48000, description="Seats"))
    sign_in_as(DANA)
    api.app.dependency_overrides[db.utc_now] = lambda: datetime(2026, 10, 31, 16, 0)
    same = {"valid_until": quote["valid_until"], "lines": [kept(line) for line in quote["lines"]]}
    again = api.patch(f"/api/quotes/{quote['id']}", json=same).json()
    assert (again["updated_by"], again["updated_at"]) == (quote["updated_by"], quote["updated_at"])
    with db.reading() as conn:
        [line] = conn.execute(select(quote_lines)).all()
    assert line.updated_at == line.created_at


def test_a_quote_on_a_deal_with_no_contact_or_organization_is_prepared_for_nobody(api, world, make):
    quote = add(api, make.deal("Loose", stage="new"))
    assert quote["prepared_for"] == {"organization": None, "contact": None, "email": None}
