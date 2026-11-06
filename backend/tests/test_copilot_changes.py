"""The Copilot's changes beside move_deal (Z11, Z13, Z15, F2 to F9, S8, A1, A3).

Each change runs as the turn runs it: checked, then given a caller limited to its own routes,
signed in as Alex Rivera, so every write goes through the form's own route, as the person.
"""

import asyncio
from datetime import date
from typing import Any

import pytest
from accountable import db, users
from accountable.copilot import tools
from accountable.copilot.calls import Caller, Route
from accountable.copilot.schemas import CardField
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes
from conftest import NOW, THIS_COMPUTER, TODAY
from sqlalchemy import Table, func, select

ALEX = users.TEAMMATES[0]
# Z11's table: each change's one write, and its button.
WRITES = {
    "add_organization": (Route("POST", "/api/organizations"), "Add organization"),
    "edit_organization": (Route("PATCH", "/api/organizations/{organization_id}"), "Save organization"),
    "add_contact": (Route("POST", "/api/contacts"), "Add contact"),
    "edit_contact": (Route("PATCH", "/api/contacts/{contact_id}"), "Save contact"),
    "add_deal": (Route("POST", "/api/deals"), "Add deal"),
    "edit_deal": (Route("PATCH", "/api/deals/{deal_id}"), "Save deal"),
    "add_activity": (Route("POST", "/api/activities"), "Add activity"),
    "mark_follow_up_done": (Route("PATCH", "/api/activities/{activity_id}"), "Mark done"),
}
FUTURE_CLOSE = "A won or lost deal can't have a close date in the future"


def use(api, tool: str, /, **arguments: Any):
    checked = tools.check(tool, arguments)
    assert isinstance(checked, tools.Checked), checked
    return asyncio.run(checked.tool.run(as_the_person(api).limited_to(checked.tool.routes), checked.arguments))


def card(api, tool: str, /, **arguments: Any):
    checked = tools.check(tool, arguments)
    assert isinstance(checked, tools.Checked), checked
    assert checked.tool.card is not None
    return asyncio.run(checked.tool.card(as_the_person(api).limited_to(checked.tool.routes), checked.arguments))


def as_the_person(api) -> Caller:
    return Caller(
        app=api.app, authorization=api.headers["Authorization"], host="localhost", client=THIS_COMPUTER, today=TODAY
    )


def refused_by_the_check(tool: str, /, **arguments: Any) -> str:
    checked = tools.check(tool, arguments)
    assert isinstance(checked, tools.Refused), checked
    return checked.words


def row(table: Table, record_id: int):
    with db.reading() as conn:
        return conn.execute(select(table).where(table.c.id == record_id)).one()


def count(table: Table) -> int:
    with db.reading() as conn:
        return conn.execute(select(func.count()).select_from(table)).scalar_one()


def field(name: str, after: str, now: str | None = None, kind: str = "text") -> CardField:
    return CardField.model_validate({"name": name, "now": now, "after": after, "kind": kind})


@pytest.fixture
def harbor(make) -> dict[str, int]:
    organization = make.organization("Harbor & Pine", industry="Hospitality", website="https://harborpine.com")
    contact = make.contact("Sam Carter", organization_id=organization, status="qualified")
    links = {"organization_id": organization, "main_contact_id": contact}
    return {
        "organization": organization,
        "contact": contact,
        "renewal": make.deal("Harbor & Pine renewal", stage="proposal", probability=40, **links),
        "first in proposal": make.deal("Office move", stage="proposal", **links),
        "northwind": make.organization("Northwind Software"),
        "priya": make.contact("Priya Nair", organization_id=organization, status="customer"),
    }


# Each change, its route and its words


@pytest.mark.parametrize("name", WRITES)
def test_each_change_writes_through_its_forms_route_alone_with_its_own_button(name):
    tool = tools.every_tool()[name]
    write, button = WRITES[name]
    assert tool.kind == "change"
    assert [route for route in tool.routes if route.method != "GET"] == [write]
    assert tool.button == button


@pytest.mark.parametrize(
    ("name", "arguments", "words"),
    [
        ("add_organization", {"name": "Harbor & Pine"}, "Adding the organization"),
        ("edit_organization", {"id": 3, "industry": "Hotels"}, "Saving the organization"),
        ("add_contact", {"name": "Sam Carter", "organization_id": 3}, "Adding the contact"),
        ("edit_contact", {"id": 3, "status": "customer"}, "Saving the contact"),
        (
            "add_deal",
            {"name": "Renewal", "organization_id": 3, "main_contact_id": 4, "value": 0, "close_date": "2026-11-30"},
            "Adding the deal",
        ),
        ("edit_deal", {"id": 3, "value": 52000}, "Saving the deal"),
        ("add_activity", {"deal_id": 3, "type": "email", "description": "Sent the quote"}, "Adding an email"),
        ("add_activity", {"contact_id": 3, "description": "Met at the fair"}, "Adding a note"),
        ("mark_follow_up_done", {"id": 3}, "Marking the follow-up done"),
    ],
)
def test_each_change_says_what_it_does_as_it_starts(name, arguments, words):
    checked = tools.check(name, arguments)
    assert isinstance(checked, tools.Checked), checked
    assert checked.tool.running(checked.arguments) == words


def a_card_for_each_change(harbor: dict[str, int], follow_up: int) -> dict[str, dict[str, Any]]:
    """Arguments that get each change a card, on the fixtures' records, the won deal's note included."""
    return {
        "add_organization": {"name": "Northwind Software", "website": "northwind.example", "notes": "Supplier"},
        "edit_organization": {"id": harbor["organization"], "name": "Harbor and Pine", "website": None},
        "add_contact": {"name": "Lee Park", "organization_id": harbor["organization"], "status": "customer"},
        "edit_contact": {"id": harbor["contact"], "organization_id": harbor["northwind"], "status": "customer"},
        "add_deal": new_deal(harbor, stage="won", close_date="2026-10-30"),
        "edit_deal": {"id": harbor["renewal"], "value": 52000, "main_contact_id": harbor["priya"]},
        "add_activity": {"deal_id": harbor["renewal"], "description": "Called", "follow_up_date": "2026-11-04"},
        "mark_follow_up_done": {"id": follow_up},
    }


@pytest.mark.parametrize("name", WRITES)
def test_a_card_changes_nothing(api, harbor, follow_up, name):
    tables = (organizations, contacts, deals, activities, stage_changes)
    with db.reading() as conn:
        before = [conn.execute(select(table)).all() for table in tables]
    assert isinstance(card(api, name, **a_card_for_each_change(harbor, follow_up)[name]), tools.Card)
    with db.reading() as conn:
        assert [conn.execute(select(table)).all() for table in tables] == before


# What a form refuses on its own, before any card, and what only the API can refuse


@pytest.mark.parametrize(
    ("name", "arguments", "words"),
    [
        ("add_organization", {"name": "   "}, "Enter a name"),
        ("edit_organization", {"id": 3, "website": "javascript:alert(1)"}, "Enter a website address"),
        ("add_contact", {"name": "Lee Park", "organization_id": 3, "email": "lee at home"}, "Enter a valid email"),
        ("add_contact", {"name": "Lee Park", "organization_id": 3, "status": "partner"}, "status"),
        ("edit_contact", {"id": 3, "organization_id": None}, "organization_id"),
        ("edit_deal", {"id": 3, "value": -1}, "value"),
        ("edit_deal", {"id": 3, "probability": 101}, "probability"),
        ("edit_deal", {"id": 3, "value": 48000.5}, "value"),
        ("add_activity", {"contact_id": 3, "type": "meeting", "description": "Lunch"}, "type"),
        ("add_activity", {"deal_id": 3, "description": "  "}, "Enter a description"),
        ("add_activity", {"deal_id": 3, "description": "Called\x00"}, "Use plain text here"),
        ("add_organization", {"name": "Harbor\x00Pine"}, "Use plain text here"),
        ("edit_contact", {"id": 3, "phone": "555\x000100"}, "Use plain text here"),
        ("add_contact", {"name": "Lee Park", "organization_id": 3, "job_title": "\ud800"}, "Use plain text here"),
    ],
    ids=repr,
)
def test_a_value_the_form_refuses_on_its_own_is_refused_before_any_card(name, arguments, words):
    assert words in refused_by_the_check(name, **arguments)


def test_a_deal_edit_never_takes_a_stage():
    assert "stage" in refused_by_the_check("edit_deal", id=3, stage="won")
    assert "stage" in refused_by_the_check("edit_deal", id=3, value=52000, stage="won")


def test_an_activity_is_on_a_contact_or_a_deal_never_both():
    both = refused_by_the_check("add_activity", contact_id=3, deal_id=4, description="Called")
    neither = refused_by_the_check("add_activity", description="Called")
    assert "Give contact_id or deal_id, not both" in both
    assert "Give contact_id or deal_id, not both" in neither


def test_a_run_the_api_refuses_gives_its_words(api, harbor):
    gone = 999
    assert use(api, "add_contact", name="Lee Park", organization_id=gone) == tools.Refused("Choose an organization")
    assert use(api, "edit_organization", id=gone, industry="Hotels") == tools.Refused("Organization not found")
    assert use(api, "add_activity", deal_id=gone, description="Called") == tools.Refused("Deal not found")
    assert count(organizations) == 2
    assert count(contacts) == 2
    assert count(activities) == 0


# Organizations


def test_adding_an_organization_shows_each_field_given_as_it_will_be_saved(api):
    shown = card(api, "add_organization", name=" Northwind Software ", website="northwind.example", industry="Software")
    assert shown == tools.Card(
        title="Add the organization Northwind Software?",
        fields=[
            field("Name", "Northwind Software"),
            field("Website", "https://northwind.example"),
            field("Industry", "Software"),
        ],
    )


def test_adding_an_organization_adds_it_as_the_person(api):
    done = use(api, "add_organization", name="Northwind Software", notes="Our software supplier")
    assert isinstance(done, tools.Done)
    added = row(organizations, done.data["id"])
    assert (added.name, added.notes, added.website) == ("Northwind Software", "Our software supplier", None)
    assert (added.created_by, added.updated_by) == (ALEX.id, ALEX.id)
    assert done.words == "Added Northwind Software."
    assert done.link == f"/organizations/{added.id}"
    assert done.told["data"]["name"] == "Northwind Software"


def test_an_organizations_card_shows_only_what_the_edit_alters(api, harbor):
    shown = card(
        api, "edit_organization", id=harbor["organization"], name="Harbor & Pine", industry="Hotels", website=None
    )
    assert shown == tools.Card(
        title="Save changes to Harbor & Pine?",
        fields=[
            field("Website", "None", now="https://harborpine.com"),
            field("Industry", "Hotels", now="Hospitality"),
        ],
    )


def test_an_edit_that_alters_nothing_or_a_record_thats_gone_gets_no_card(api, harbor):
    same = card(api, "edit_organization", id=harbor["organization"], industry=" Hospitality ")
    assert same == tools.Refused("That changes nothing on Harbor & Pine.")
    assert card(api, "edit_organization", id=harbor["organization"]) == same
    assert card(api, "edit_organization", id=999, industry="Hotels") == tools.Refused("Organization not found")


def test_an_organizations_edit_saves_only_the_fields_given_as_the_person(api, harbor):
    done = use(api, "edit_organization", id=harbor["organization"], industry="Hotels", notes="")
    saved = row(organizations, harbor["organization"])
    assert (saved.name, saved.website, saved.industry, saved.notes) == (
        "Harbor & Pine",
        "https://harborpine.com",
        "Hotels",
        None,
    )
    assert (saved.created_by, saved.updated_by) == (None, ALEX.id)
    assert done == tools.Done(
        data=done.data, words="Saved changes to Harbor & Pine.", link=f"/organizations/{harbor['organization']}"
    )


def test_null_clears_an_organizations_website(api, harbor):
    use(api, "edit_organization", id=harbor["organization"], website=None)
    assert row(organizations, harbor["organization"]).website is None


# Contacts


def test_adding_a_contact_names_their_organization(api, harbor):
    shown = card(
        api, "add_contact", name="Lee Park", organization_id=harbor["northwind"], email="lee@northwind.example"
    )
    assert shown == tools.Card(
        title="Add the contact Lee Park?",
        fields=[
            field("Name", "Lee Park"),
            field("Organization", "Northwind Software"),
            field("Email", "lee@northwind.example"),
            field("Status", "Lead"),
        ],
    )


def test_a_contact_at_an_organization_thats_gone_gets_no_card(api):
    assert card(api, "add_contact", name="Lee Park", organization_id=999) == tools.Refused("Organization not found")


def test_adding_a_contact_adds_them_as_a_lead_as_the_person(api, harbor):
    done = use(api, "add_contact", name="Lee Park", organization_id=harbor["northwind"], job_title="Buyer")
    assert isinstance(done, tools.Done)
    added = row(contacts, done.data["id"])
    assert (added.name, added.organization_id, added.job_title, added.status) == (
        "Lee Park",
        harbor["northwind"],
        "Buyer",
        "lead",
    )
    assert (added.created_by, added.updated_by) == (ALEX.id, ALEX.id)
    assert (done.words, done.link) == ("Added Lee Park.", f"/contacts/{added.id}")


def test_a_contacts_card_names_the_organization_now_and_after(api, harbor, make):
    shown = card(api, "edit_contact", id=harbor["contact"], organization_id=harbor["northwind"], status="customer")
    assert shown == tools.Card(
        title="Save changes to Sam Carter?",
        fields=[
            field("Organization", "Northwind Software", now="Harbor & Pine"),
            field("Status", "Customer", now="Qualified"),
        ],
    )
    on_their_own = make.contact("Robin Shaw")
    shown = card(api, "edit_contact", id=on_their_own, organization_id=harbor["organization"])
    assert isinstance(shown, tools.Card)
    assert shown.fields == [field("Organization", "Harbor & Pine", now="None")]


def test_a_contacts_edit_saves_only_the_fields_given_as_the_person(api, harbor):
    done = use(api, "edit_contact", id=harbor["contact"], status="customer", phone="555 0100")
    saved = row(contacts, harbor["contact"])
    assert (saved.name, saved.organization_id, saved.status, saved.phone) == (
        "Sam Carter",
        harbor["organization"],
        "customer",
        "555 0100",
    )
    assert saved.updated_by == ALEX.id
    assert done == tools.Done(
        data=done.data, words="Saved changes to Sam Carter.", link=f"/contacts/{harbor['contact']}"
    )


def test_a_contacts_organization_thats_gone_is_refused_in_the_apis_words(api, harbor):
    refused = use(api, "edit_contact", id=harbor["contact"], organization_id=999)
    assert refused == tools.Refused("Choose an organization")
    assert row(contacts, harbor["contact"]).organization_id == harbor["organization"]


# Deals


def new_deal(harbor, **changes: Any) -> dict[str, Any]:
    return {
        "name": "Annual support",
        "organization_id": harbor["organization"],
        "main_contact_id": harbor["contact"],
        "stage": "proposal",
        "value": 48000,
        "close_date": "2026-11-30",
        **changes,
    }


def test_adding_a_deal_shows_its_links_by_name_and_the_stages_usual_probability(api, harbor):
    assert card(api, "add_deal", **new_deal(harbor)) == tools.Card(
        title="Add the deal Annual support?",
        fields=[
            field("Name", "Annual support"),
            field("Organization", "Harbor & Pine"),
            field("Main contact", "Sam Carter"),
            field("Stage", "Proposal"),
            field("Value", "$48,000", kind="money"),
            field("Probability", "40%", kind="percent"),
            field("Close date", "Nov 30, 2026", kind="date"),
        ],
        note=None,
    )


def test_a_new_deals_card_shows_the_probability_given_and_new_by_default(api, harbor):
    arguments = new_deal(harbor, probability=55)
    del arguments["stage"]
    shown = card(api, "add_deal", **arguments)
    assert isinstance(shown, tools.Card)
    assert field("Stage", "New") in shown.fields
    assert field("Probability", "55%", kind="percent") in shown.fields


def test_a_deal_added_at_won_says_its_main_contact_becomes_a_customer(api, harbor):
    won = new_deal(harbor, stage="won", close_date="2026-10-30")
    shown = card(api, "add_deal", **won)
    assert isinstance(shown, tools.Card)
    assert shown.note == "Sam Carter becomes a customer."
    assert field("Probability", "100%", kind="percent") in shown.fields
    for already in (new_deal(harbor, stage="won", main_contact_id=harbor["priya"]), new_deal(harbor, stage="lost")):
        shown = card(api, "add_deal", **already)
        assert isinstance(shown, tools.Card)
        assert shown.note is None


def test_a_deal_with_a_main_contact_thats_gone_gets_no_card(api, harbor):
    assert card(api, "add_deal", **new_deal(harbor, main_contact_id=999)) == tools.Refused("Contact not found")


def test_adding_a_deal_puts_it_at_the_top_of_its_column_as_the_person(api, harbor):
    done = use(api, "add_deal", **new_deal(harbor))
    assert isinstance(done, tools.Done)
    added = row(deals, done.data["id"])
    assert (added.stage, added.value, added.probability, added.close_date) == (
        "proposal",
        48000,
        40,
        date(2026, 11, 30),
    )
    assert added.position < row(deals, harbor["first in proposal"]).position
    assert (added.created_by, added.updated_by) == (ALEX.id, ALEX.id)
    assert (done.words, done.link) == ("Added Annual support.", f"/deals/{added.id}")


def test_a_deal_added_at_won_makes_its_main_contact_a_customer(api, harbor):
    use(api, "add_deal", **new_deal(harbor, stage="won", close_date="2026-10-30"))
    assert row(contacts, harbor["contact"]).status == "customer"
    assert count(stage_changes) == 0


def test_a_won_deal_with_a_close_date_ahead_is_refused_in_the_apis_words(api, harbor):
    refused = use(api, "add_deal", **new_deal(harbor, stage="won", close_date="2026-11-30"))
    assert refused == tools.Refused(FUTURE_CLOSE)
    assert count(deals) == 2


def test_a_deals_card_shows_what_the_edit_alters_with_names_for_links(api, harbor):
    shown = card(
        api,
        "edit_deal",
        id=harbor["renewal"],
        name="Harbor & Pine renewal",
        main_contact_id=harbor["priya"],
        value=52000,
        probability=55,
        close_date="2026-12-15",
    )
    assert shown == tools.Card(
        title="Save changes to Harbor & Pine renewal?",
        fields=[
            field("Main contact", "Priya Nair", now="Sam Carter"),
            field("Value", "$52,000", now="$10,000", kind="money"),
            field("Probability", "55%", now="40%", kind="percent"),
            field("Close date", "Dec 15, 2026", now="Dec 1, 2026", kind="date"),
        ],
    )


def test_a_deals_edit_never_changes_its_stage_or_its_place(api, harbor):
    before = row(deals, harbor["renewal"])
    done = use(api, "edit_deal", id=harbor["renewal"], value=52000, probability=55)
    saved = row(deals, harbor["renewal"])
    assert (saved.stage, saved.position, saved.close_date) == (before.stage, before.position, before.close_date)
    assert (saved.value, saved.probability, saved.updated_by) == (52000, 55, ALEX.id)
    assert count(stage_changes) == 0
    assert done == tools.Done(
        data=done.data, words="Saved changes to Harbor & Pine renewal.", link=f"/deals/{harbor['renewal']}"
    )


def test_a_won_deals_close_date_moved_ahead_is_refused_in_the_apis_words(api, harbor, make):
    won = make.deal("Spring retreat", stage="won", close_date=date(2026, 10, 1))
    assert use(api, "edit_deal", id=won, close_date="2026-11-30") == tools.Refused(FUTURE_CLOSE)
    assert row(deals, won).close_date == date(2026, 10, 1)


# Activities


def test_an_activitys_card_names_the_record_its_on(api, harbor):
    on_the_deal = card(
        api,
        "add_activity",
        deal_id=harbor["renewal"],
        type="call",
        description="Called about the renewal",
        follow_up_date="2026-11-05",
    )
    assert on_the_deal == tools.Card(
        title="Add a call on Harbor & Pine renewal?",
        fields=[
            field("Type", "Call"),
            field("Deal", "Harbor & Pine renewal"),
            field("Description", "Called about the renewal"),
            field("Follow-up date", "Nov 5, 2026", kind="date"),
        ],
    )
    on_the_contact = card(api, "add_activity", contact_id=harbor["contact"], type="email", description="Sent the quote")
    assert on_the_contact == tools.Card(
        title="Add an email on Sam Carter?",
        fields=[field("Type", "Email"), field("Contact", "Sam Carter"), field("Description", "Sent the quote")],
    )


def test_an_activity_on_a_record_thats_gone_is_refused_before_anything_is_written(api):
    assert card(api, "add_activity", deal_id=999, description="Called") == tools.Refused("Deal not found")
    assert use(api, "add_activity", contact_id=999, description="Called") == tools.Refused("Contact not found")
    assert count(activities) == 0


def test_adding_an_activity_to_a_deal_adds_it_now_as_the_person(api, harbor):
    done = use(
        api, "add_activity", deal_id=harbor["renewal"], type="call", description="Called", follow_up_date="2026-11-05"
    )
    assert isinstance(done, tools.Done)
    added = row(activities, done.data["id"])
    assert (added.deal_id, added.contact_id, added.type, added.description) == (
        harbor["renewal"],
        None,
        "call",
        "Called",
    )
    assert (added.occurred_at, added.follow_up_date, added.follow_up_done) == (NOW, date(2026, 11, 5), False)
    assert (added.created_by, added.updated_by) == (ALEX.id, ALEX.id)
    assert (done.words, done.link) == ("Added a call on Harbor & Pine renewal.", f"/deals/{harbor['renewal']}")


def test_adding_an_activity_to_a_contact_adds_a_note_by_default(api, harbor):
    done = use(api, "add_activity", contact_id=harbor["contact"], description="Met at the trade fair")
    assert isinstance(done, tools.Done)
    added = row(activities, done.data["id"])
    assert (added.contact_id, added.deal_id, added.type, added.follow_up_date) == (
        harbor["contact"],
        None,
        "note",
        None,
    )
    assert (done.words, done.link) == ("Added a note on Sam Carter.", f"/contacts/{harbor['contact']}")


# Marking a follow-up done


@pytest.fixture
def follow_up(make, harbor) -> int:
    return make.activity(
        deal_id=harbor["renewal"],
        type="call",
        description="Send the revised proposal",
        follow_up_date=date(2026, 11, 2),
    )


def test_a_follow_ups_card_names_it_and_when_its_due(api, follow_up):
    assert card(api, "mark_follow_up_done", id=follow_up) == tools.Card(
        title='Mark "Send the revised proposal" done?',
        fields=[field("Follow-up", "Done", now="Due Nov 2, 2026")],
    )


def test_a_follow_up_not_waiting_gets_no_card(api, harbor, make):
    done_already = make.activity(contact_id=harbor["contact"], follow_up_date=date(2026, 11, 2), follow_up_done=True)
    without_one = make.activity(contact_id=harbor["contact"])
    for activity in (done_already, without_one, 999):
        shown = card(api, "mark_follow_up_done", id=activity)
        assert isinstance(shown, tools.Refused)
        assert shown.words == "There's no follow-up waiting to be done with that id. It may be done already."


def test_marking_a_follow_up_done_changes_nothing_else(api, harbor, follow_up):
    before = row(activities, follow_up)
    done = use(api, "mark_follow_up_done", id=follow_up)
    after = row(activities, follow_up)
    assert after.follow_up_done is True
    assert after.updated_by == ALEX.id
    unchanged = ("type", "contact_id", "deal_id", "description", "occurred_at", "follow_up_date", "created_by")
    assert [getattr(after, name) for name in unchanged] == [getattr(before, name) for name in unchanged]
    assert done == tools.Done(
        data=done.data, words='Marked "Send the revised proposal" done.', link=f"/deals/{harbor['renewal']}"
    )


def test_a_follow_up_on_a_contact_links_to_the_contact(api, harbor, make):
    on_the_contact = make.activity(contact_id=harbor["contact"], follow_up_date=date(2026, 11, 2))
    done = use(api, "mark_follow_up_done", id=on_the_contact)
    assert isinstance(done, tools.Done)
    assert done.link == f"/contacts/{harbor['contact']}"


def test_marking_an_activity_thats_gone_is_refused_in_the_apis_words(api):
    assert use(api, "mark_follow_up_done", id=999) == tools.Refused("Activity not found")
