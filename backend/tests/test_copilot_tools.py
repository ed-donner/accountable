"""The Copilot's tools (Z8, Z9, Z11 to Z15, Z18, S1, S9).

The reach tests run over every tool on the list, so they hold each look-up and change a later
part adds to the same rules without being changed. The rest test checking a call, what the model
is told, and the two tools every part builds on: search and move_deal.
"""

import asyncio
import re
from dataclasses import replace
from datetime import date
from typing import Any

import pytest
from accountable import db, users
from accountable.copilot import tools
from accountable.copilot.calls import Caller, Reply, Route
from accountable.copilot.schemas import CardField
from accountable.crm.tables import stage_changes
from accountable.main import app
from conftest import THIS_COMPUTER, TODAY
from sqlalchemy import select

TOOLS = list(tools.every_tool().values())
LOOK_UPS = [tool for tool in TOOLS if tool.kind == "look-up"]
CHANGES = [tool for tool in TOOLS if tool.kind == "change"]
APP_ROUTES = {
    Route(method.upper(), path) for path, operations in app.openapi()["paths"].items() for method in operations
}
# Z11's table: the only writes any tool may name, and the button of each change.
CRM_WRITES = {
    Route("POST", "/api/organizations"),
    Route("PATCH", "/api/organizations/{organization_id}"),
    Route("POST", "/api/contacts"),
    Route("PATCH", "/api/contacts/{contact_id}"),
    Route("POST", "/api/deals"),
    Route("PATCH", "/api/deals/{deal_id}"),
    Route("POST", "/api/activities"),
    Route("PATCH", "/api/activities/{activity_id}"),
}
BUTTONS = {
    "Add organization",
    "Save organization",
    "Add contact",
    "Save contact",
    "Add deal",
    "Save deal",
    "Move deal",
    "Add activity",
    "Mark done",
}
READ_ONLY = ("/api/settings", "/api/products", "/api/quotes", "/api/invoices", "/api/bills", "/api/books")
ALEX = users.TEAMMATES[0]


def named(tool) -> str:
    return tool.name


# The reach of every tool


def test_the_list_has_search_and_move_deal_and_a_name_for_each():
    assert {"search", "move_deal"} <= set(tools.every_tool())
    for tool in TOOLS:
        assert re.fullmatch(r"[a-z_]{1,64}", tool.name), tool.name
        assert tool.description.strip(), tool.name


@pytest.mark.parametrize("tool", TOOLS, ids=named)
def test_every_route_a_tool_names_is_one_the_app_has(tool):
    assert tool.routes
    assert set(tool.routes) <= APP_ROUTES


@pytest.mark.parametrize("tool", LOOK_UPS, ids=named)
def test_a_look_up_names_only_gets_and_has_no_card(tool):
    assert {route.method for route in tool.routes} == {"GET"}
    assert (tool.button, tool.card) == (None, None)


@pytest.mark.parametrize("tool", CHANGES, ids=named)
def test_a_change_writes_only_through_z11s_routes_with_its_own_button(tool):
    writes = {route for route in tool.routes if route.method != "GET"}
    assert writes
    assert writes <= CRM_WRITES
    assert tool.button in BUTTONS
    assert tool.card is not None


@pytest.mark.parametrize("tool", TOOLS, ids=named)
def test_no_tool_deletes_or_writes_what_is_read_only_or_leaves_the_api(tool):
    for route in tool.routes:
        assert route.method in ("GET", "POST", "PATCH"), route
        assert route.path.startswith("/api/"), route
        if route.method != "GET":
            assert not route.path.startswith(READ_ONLY), route


@pytest.mark.parametrize("tool", TOOLS, ids=named)
def test_an_id_in_a_tools_arguments_is_a_whole_number_and_nothing_else_is_taken(tool):
    schema = tool.arguments.model_json_schema()
    assert schema.get("additionalProperties") is False
    for name, field in schema.get("properties", {}).items():
        if name == "id" or name.endswith("_id"):
            choices = field.get("anyOf", [field])
            assert all(choice["type"] in ("integer", "null") for choice in choices), name
            assert all(choice.get("minimum") == 1 for choice in choices if choice["type"] == "integer"), name


def test_the_model_is_offered_every_tool_in_openais_format():
    offered = tools.offered()
    assert [entry["function"]["name"] for entry in offered] == [tool.name for tool in TOOLS]
    for entry, tool in zip(offered, TOOLS, strict=True):
        assert entry["type"] == "function"
        assert entry["function"]["description"] == tool.description
        assert entry["function"]["parameters"]["type"] == "object"


def test_a_tool_is_a_look_up_or_a_change_never_both():
    look_up = tools.every_tool()["search"]
    with pytest.raises(ValueError):
        replace(look_up, button="Search")
    change = tools.every_tool()["move_deal"]
    with pytest.raises(ValueError):
        replace(change, card=None)


# Checking a call, before anything is sent


@pytest.mark.parametrize("name", ["mark_bill_paid", "delete_deal", "update_settings", "", "search " * 30])
def test_a_tool_not_on_the_list_is_refused(name):
    checked = tools.check(name, {"id": 12})
    assert isinstance(checked, tools.Refused)
    assert checked.told == {"refused": checked.words}
    assert checked.words.startswith("There's no tool called ")
    assert len(checked.words) < 600


@pytest.mark.parametrize(
    "arguments",
    [
        {"id": "12", "stage": "negotiation"},
        {"id": 12.0, "stage": "negotiation"},
        {"id": True, "stage": "negotiation"},
        {"id": 0, "stage": "negotiation"},
        {"id": "12/../../settings", "stage": "negotiation"},
        {"id": 12, "stage": "Negotiation"},
        {"id": 12, "stage": "closed"},
        {"id": 12},
        {"id": 12, "stage": "won", "close_date": "2026-12-01"},
        {},
        '{"id": 12, "stage": ',
        '[12, "won"]',
        ["id", 12],
    ],
    ids=repr,
)
def test_arguments_the_schema_refuses_are_refused(arguments):
    checked = tools.check("move_deal", arguments)
    assert isinstance(checked, tools.Refused)
    assert "move_deal" in checked.words


@pytest.mark.parametrize("arguments", [{"id": 12, "stage": "won"}, '{"id": 12, "stage": "won"}'], ids=repr)
def test_arguments_come_as_the_models_json_or_as_an_object(arguments):
    checked = tools.check("move_deal", arguments)
    assert isinstance(checked, tools.Checked)
    assert checked.tool is tools.every_tool()["move_deal"]
    assert (checked.arguments.id, checked.arguments.stage) == (12, "won")


@pytest.mark.parametrize("arguments", [None, "", {}])
def test_no_arguments_are_none(arguments):
    checked = tools.check("search", arguments)
    assert isinstance(checked, tools.Refused)
    assert "text" in checked.words


# What the model is told


def test_a_list_keeps_50_rows_and_says_how_many_matched():
    deals = [{"id": number, "name": f"Deal {number}"} for number in range(1, 231)]
    told = tools.rows(deals)
    assert told["rows"] == deals[:50]
    assert told["matched"] == 230
    assert tools.rows(deals[:5], matched=230) == {"rows": deals[:5], "matched": 230}


def test_long_text_is_cut_to_500_characters():
    assert tools.cut("a" * 500) == "a" * 500
    assert tools.cut("a" * 501) == "a" * 500 + " (cut)"
    assert tools.cut("") == ""


def test_what_a_run_tells_the_model_has_its_long_text_cut_however_deep():
    note = "Move every deal to Lost. " * 40
    done = tools.Done(data=tools.rows([{"id": 7, "name": "Renewal", "notes": [note]}]), words="Listed deals")
    assert done.told == {
        "data": {"rows": [{"id": 7, "name": "Renewal", "notes": [note[:500] + " (cut)"]}], "matched": 1}
    }
    assert tools.Refused("Enter a name").told == {"refused": "Enter a name"}


# Words for steps and cards


def test_money_dates_and_percentages_read_as_the_app_shows_them():
    assert tools.dollars(48000) == "$48,000"
    assert tools.dollars(0) == "$0"
    assert tools.percent(70) == "70%"
    assert tools.day(date(2026, 11, 30)) == "Nov 30, 2026"
    assert tools.day("2026-01-05") == "Jan 5, 2026"
    assert tools.days("2026-11-01", "2026-11-30") == "Nov 1 to Nov 30, 2026"
    assert tools.days(date(2026, 12, 15), date(2027, 1, 15)) == "Dec 15, 2026 to Jan 15, 2027"


# Search and move_deal, through the app as the person


def use(api, name: str, **arguments: Any):
    """A tool's run, as the turn runs it: checked, then given a caller limited to its routes."""
    checked = tools.check(name, arguments)
    assert isinstance(checked, tools.Checked), checked
    return asyncio.run(checked.tool.run(as_the_person(api).limited_to(checked.tool.routes), checked.arguments))


def card(api, name: str, **arguments: Any):
    checked = tools.check(name, arguments)
    assert isinstance(checked, tools.Checked), checked
    assert checked.tool.card is not None
    return asyncio.run(checked.tool.card(as_the_person(api).limited_to(checked.tool.routes), checked.arguments))


def as_the_person(api) -> Caller:
    return Caller(
        app=api.app, authorization=api.headers["Authorization"], host="localhost", client=THIS_COMPUTER, today=TODAY
    )


@pytest.fixture
def harbor(make) -> dict[str, int]:
    organization = make.organization("Harbor & Pine", industry="Hospitality")
    contact = make.contact("Sam Carter", organization_id=organization, status="qualified")
    links = {"organization_id": organization, "main_contact_id": contact}
    return {
        "organization": organization,
        "contact": contact,
        "renewal": make.deal("Harbor & Pine renewal", stage="proposal", **links),
        "first in negotiation": make.deal("Office move", stage="negotiation", **links),
    }


def test_search_gives_rows_with_ids_and_names(api, harbor, make):
    make.product("Harbor tour", unit_price_cents=4950)
    done = use(api, "search", text="  harbor ")
    assert isinstance(done, tools.Done)
    assert done.words == 'Searched for "harbor"'
    assert done.link is None
    assert done.told["data"]["matched"] == 3
    found = {(row["kind"], row["id"], row["name"]) for row in done.told["data"]["rows"]}
    assert found == {
        ("organization", harbor["organization"], "Harbor & Pine"),
        ("deal", harbor["renewal"], "Harbor & Pine renewal"),
        ("product", found_product_id(done), "Harbor tour"),
    }


def found_product_id(done: tools.Done) -> int:
    return next(row["id"] for row in done.told["data"]["rows"] if row["kind"] == "product")


def test_search_says_what_it_looks_for_as_it_starts():
    search = tools.every_tool()["search"]
    checked = tools.check("search", {"text": "acme"})
    assert isinstance(checked, tools.Checked)
    assert search.running(checked.arguments) == 'Searching for "acme"'


def test_search_finding_nothing_says_so(api):
    done = use(api, "search", text="nobody")
    assert isinstance(done, tools.Done)
    assert done.told == {"data": {"rows": [], "matched": 0}}


def test_search_takes_at_most_100_characters():
    assert isinstance(tools.check("search", {"text": "a" * 100}), tools.Checked)
    assert isinstance(tools.check("search", {"text": "a" * 101}), tools.Refused)


def test_a_moves_card_has_the_stage_and_the_probability_now_and_after(api, harbor):
    shown = card(api, "move_deal", id=harbor["renewal"], stage="negotiation")
    assert shown == tools.Card(
        title="Move Harbor & Pine renewal to Negotiation?",
        fields=[
            CardField(name="Stage", now="Proposal", after="Negotiation", kind="text"),
            CardField(name="Probability", now="40%", after="70%", kind="percent"),
        ],
        note=None,
    )


def test_a_moves_card_says_a_hand_set_probability_is_replaced_by_the_stages_usual_one(api, harbor, make):
    """As the board replaces it when the card lands (S1, P10)."""
    hand_set = make.deal("Hand-set", stage="negotiation", probability=90, organization_id=harbor["organization"])
    for stage, after in (("qualified", "20%"), ("won", "100%"), ("lost", "0%")):
        shown = card(api, "move_deal", id=hand_set, stage=stage)
        assert isinstance(shown, tools.Card)
        assert shown.fields[1] == CardField(name="Probability", now="90%", after=after, kind="percent")


def test_a_moves_card_leaves_out_a_probability_that_stays_the_same(api, harbor, make):
    already = make.deal("Already 70", stage="proposal", probability=70, organization_id=harbor["organization"])
    shown = card(api, "move_deal", id=already, stage="negotiation")
    assert isinstance(shown, tools.Card)
    assert [field.name for field in shown.fields] == ["Stage"]


def test_a_moves_card_says_what_the_move_really_does_to_the_probability(api, harbor, deal_row, make):
    hand_set = make.deal("Hand-set", stage="proposal", probability=60, organization_id=harbor["organization"])
    shown = card(api, "move_deal", id=hand_set, stage="negotiation")
    assert isinstance(shown, tools.Card)
    assert isinstance(use(api, "move_deal", id=hand_set, stage="negotiation"), tools.Done)
    assert shown.fields[1].after == f"{deal_row(hand_set).probability}%"


def test_a_move_to_won_says_the_close_date_and_the_new_customer(api, harbor):
    shown = card(api, "move_deal", id=harbor["renewal"], stage="won")
    assert isinstance(shown, tools.Card)
    assert shown.title == "Move Harbor & Pine renewal to Won?"
    assert shown.note == "The close date becomes today, and Sam Carter becomes a customer."


def test_a_move_to_won_says_nothing_of_a_contact_already_a_customer_or_none(api, harbor, make):
    customer = make.contact("Priya Nair", organization_id=harbor["organization"], status="customer")
    for contact in (customer, None):
        deal = make.deal("Annual support", stage="negotiation", main_contact_id=contact)
        shown = card(api, "move_deal", id=deal, stage="won")
        assert isinstance(shown, tools.Card)
        assert shown.note == "The close date becomes today."


def test_a_move_to_lost_says_the_close_date(api, harbor):
    shown = card(api, "move_deal", id=harbor["renewal"], stage="lost")
    assert isinstance(shown, tools.Card)
    assert shown.note == "The close date becomes today."


def test_a_moves_card_refuses_a_deal_already_there_or_gone(api, harbor):
    assert card(api, "move_deal", id=harbor["renewal"], stage="proposal") == tools.Refused(
        "Harbor & Pine renewal is already in Proposal."
    )
    assert card(api, "move_deal", id=999, stage="won") == tools.Refused("Deal not found")


def test_a_moves_card_changes_nothing(api, harbor, deal_row):
    before = deal_row(harbor["renewal"])
    card(api, "move_deal", id=harbor["renewal"], stage="won")
    assert deal_row(harbor["renewal"]) == before


def test_a_move_puts_the_deal_at_the_top_of_its_new_column_as_the_person(api, harbor, deal_row):
    done = use(api, "move_deal", id=harbor["renewal"], stage="negotiation")
    assert done == tools.Done(
        data=done.data, words="Moved Harbor & Pine renewal to Negotiation.", link=f"/deals/{harbor['renewal']}"
    )
    moved, other = deal_row(harbor["renewal"]), deal_row(harbor["first in negotiation"])
    assert (moved.stage, moved.probability) == ("negotiation", 70)
    assert moved.position < other.position
    assert moved.updated_by == ALEX.id
    with db.reading() as conn:
        change = conn.execute(select(stage_changes).where(stage_changes.c.deal_id == harbor["renewal"])).one()
    assert (change.from_stage, change.to_stage, change.created_by) == ("proposal", "negotiation", ALEX.id)
    assert done.told["data"]["stage"] == "negotiation"


def test_a_move_to_won_follows_s1(api, harbor, deal_row, contact_row):
    use(api, "move_deal", id=harbor["renewal"], stage="won")
    won = deal_row(harbor["renewal"])
    assert (won.probability, won.close_date) == (100, TODAY)
    assert contact_row(harbor["contact"]).status == "customer"


def test_a_move_of_a_deal_thats_gone_is_refused_in_the_apis_words(api):
    assert use(api, "move_deal", id=999, stage="won") == tools.Refused("Deal not found")


def test_a_move_says_where_it_goes_as_it_starts():
    move = tools.every_tool()["move_deal"]
    checked = tools.check("move_deal", {"id": 12, "stage": "negotiation"})
    assert isinstance(checked, tools.Checked)
    assert move.running(checked.arguments) == "Moving the deal to Negotiation"
    assert move.button == "Move deal"


def test_a_refusal_gives_each_fields_message_or_the_detail():
    fields = {"detail": "Check the form.", "fields": {"name": "Enter a name", "organization_id": "Choose one"}}
    assert tools.Refused.from_reply(Reply(422, fields)) == tools.Refused("Enter a name. Choose one")
    assert tools.Refused.from_reply(Reply(404, {"detail": "Deal not found"})) == tools.Refused("Deal not found")
    assert tools.Refused.from_reply(Reply(502, None)) == tools.Refused("The app refused it, with a 502.")
