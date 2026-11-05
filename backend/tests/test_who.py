"""Who added each record and who last changed it, through every kind of change (U10, U11, U12, R6)."""

from datetime import timedelta

import pytest
from accountable import db, users
from accountable.crm.tables import activities, contacts, deals, organizations
from conftest import NOW, TODAY, insert_row
from sqlalchemy import select

ORGS = "/api/organizations"
CONTACTS = "/api/contacts"
DEALS = "/api/deals"
ACTIVITIES = "/api/activities"

ALEX, DANA, _THEO, ROBIN = users.TEAMMATES
LATER = NOW + timedelta(hours=2)
NOW_TEXT = "2026-10-31T15:00:00Z"
LATER_TEXT = "2026-10-31T17:00:00Z"


def named(teammate) -> dict:
    return {"id": teammate.id, "name": teammate.name or teammate.email}


def row(table, record_id: int):
    with db.reading() as conn:
        return conn.execute(select(table).where(table.c.id == record_id)).one()


@pytest.fixture
def as_(api, sign_in_as):
    """Makes the next requests as this teammate, two hours after the api's own, which are Alex's."""

    def switch(teammate):
        api.app.dependency_overrides[db.utc_now] = lambda: LATER
        return sign_in_as(teammate.id)

    return switch


@pytest.fixture
def records(api):
    """One of each kind, added by Alex through the API."""
    organization = api.post(ORGS, json={"name": "Harbor & Pine"}).json()["id"]
    contact = api.post(CONTACTS, json={"name": "Sam Carter", "organization_id": organization}).json()["id"]
    deal = api.post(
        DEALS,
        json={
            "name": "Annual support",
            "organization_id": organization,
            "main_contact_id": contact,
            "value": 1000,
            "close_date": "2026-12-01",
        },
    ).json()["id"]
    activity = api.post(
        ACTIVITIES, json={"description": "Called", "deal_id": deal, "follow_up_date": "2026-11-02"}
    ).json()["id"]
    return {"organization": organization, "contact": contact, "deal": deal, "activity": activity}


def authorship(reply: dict) -> tuple:
    return reply["created_by"], reply["created_at"], reply["updated_by"], reply["updated_at"]


# Adding


def test_an_add_records_who_added_it_at_one_moment(api, records):
    for path, key in ((ORGS, "organization"), (CONTACTS, "contact"), (DEALS, "deal")):
        reply = api.get(f"{path}/{records[key]}").json()
        assert authorship(reply) == (named(ALEX), NOW_TEXT, named(ALEX), NOW_TEXT), path
    activity = row(activities, records["activity"])
    assert (activity.created_by, activity.updated_by) == (ALEX.id, ALEX.id)
    assert activity.created_at == activity.updated_at == NOW


def test_the_reply_to_an_add_says_who_added_it(api):
    reply = api.post(ORGS, json={"name": "Acme"}).json()
    assert authorship(reply) == (named(ALEX), NOW_TEXT, named(ALEX), NOW_TEXT)


# Each kind of change


@pytest.mark.parametrize(
    ("path", "key", "change"),
    [
        (ORGS, "organization", {"industry": "Retail"}),
        (CONTACTS, "contact", {"job_title": "Owner"}),
        (DEALS, "deal", {"value": 2000}),
    ],
)
def test_an_edit_records_who_made_it_and_when(records, as_, path, key, change):
    reply = as_(DANA).patch(f"{path}/{records[key]}", json=change).json()
    assert authorship(reply) == (named(ALEX), NOW_TEXT, named(DANA), LATER_TEXT)
    assert authorship(as_(DANA).get(f"{path}/{records[key]}").json()) == authorship(reply)


def test_editing_an_activity_records_who_made_it(records, as_):
    as_(DANA).patch(f"{ACTIVITIES}/{records['activity']}", json={"description": "Called again"})
    activity = row(activities, records["activity"])
    assert (activity.created_by, activity.updated_by, activity.updated_at) == (ALEX.id, DANA.id, LATER)


@pytest.mark.parametrize(
    ("path", "key", "same"),
    [
        (ORGS, "organization", {"name": "Harbor & Pine", "website": None, "industry": None, "notes": None}),
        (CONTACTS, "contact", {"name": "Sam Carter", "status": "lead", "email": None}),
        (DEALS, "deal", {"name": "Annual support", "stage": "new", "value": 1000, "close_date": "2026-12-01"}),
        (
            ACTIVITIES,
            "activity",
            {"description": "Called", "occurred_at": NOW_TEXT, "follow_up_date": "2026-11-02", "follow_up_done": False},
        ),
    ],
)
def test_a_save_that_alters_nothing_isnt_a_change(records, as_, path, key, same):
    table = {ORGS: organizations, CONTACTS: contacts, DEALS: deals, ACTIVITIES: activities}[path]
    before = row(table, records[key])
    assert as_(DANA).patch(f"{path}/{records[key]}", json=same).status_code == 200
    assert row(table, records[key]) == before


def test_a_stage_change_in_the_form_records_who_made_it(records, as_):
    deal = records["deal"]
    reply = as_(DANA).patch(f"{DEALS}/{deal}", json={"stage": "proposal"}).json()
    assert authorship(reply)[2:] == (named(DANA), LATER_TEXT)
    entry = as_(DANA).get(f"{DEALS}/{deal}/timeline").json()["entries"][0]
    assert (entry["kind"], entry["created_by"]) == ("stage_change", named(DANA))


def test_a_move_on_the_board_records_who_made_it(records, as_):
    deal = records["deal"]
    moved = as_(DANA).post(f"{DEALS}/{deal}/move", json={"stage": "qualified", "before_deal_id": None})
    assert moved.status_code == 200
    assert authorship(as_(DANA).get(f"{DEALS}/{deal}").json())[2:] == (named(DANA), LATER_TEXT)
    entry = as_(DANA).get(f"{DEALS}/{deal}/timeline").json()["entries"][0]
    assert entry["created_by"] == named(DANA)


def test_a_move_within_a_column_records_who_made_it(as_, make):
    top, bottom = make.deal("Top"), make.deal("Bottom")
    if row(deals, top).position > row(deals, bottom).position:
        top, bottom = bottom, top
    as_(DANA).post(f"{DEALS}/{bottom}/move", json={"stage": "new", "before_deal_id": top})
    assert (row(deals, bottom).updated_by, row(deals, bottom).updated_at) == (DANA.id, LATER)


def test_renumbered_cards_keep_who_last_changed_them_and_when(as_, make):
    column = [make.deal(f"Card {number}", stage="proposal") for number in range(3)]
    before = {deal: row(deals, deal) for deal in column}
    moved = make.deal("Moved")

    as_(DANA).post(f"{DEALS}/{moved}/move", json={"stage": "proposal", "before_deal_id": column[1]})
    as_(DANA).post(f"{DEALS}/{column[0]}/move", json={"stage": "proposal", "before_deal_id": None})

    for deal in column[1:]:
        after = row(deals, deal)
        assert after.position != before[deal].position
        assert (after.updated_by, after.updated_at) == (before[deal].updated_by, before[deal].updated_at)


def test_dropping_a_card_where_it_already_is_isnt_a_change(as_, make):
    deal = make.deal()
    before = row(deals, deal)
    as_(DANA).post(f"{DEALS}/{deal}/move", json={"stage": "new", "before_deal_id": deal})
    assert row(deals, deal) == before


def test_ticking_and_unticking_a_follow_up_records_who_did_it(records, as_):
    activity = records["activity"]
    as_(DANA).patch(f"{ACTIVITIES}/{activity}", json={"follow_up_done": True})
    assert row(activities, activity).updated_by == DANA.id

    as_(ROBIN).patch(f"{ACTIVITIES}/{activity}", json={"follow_up_done": False})
    assert row(activities, activity).updated_by == ROBIN.id

    entry = as_(ROBIN).get(f"{DEALS}/{records['deal']}/timeline").json()["entries"][0]
    assert entry["created_by"] == named(ALEX)


@pytest.mark.parametrize("how", ["move", "form"])
def test_a_won_deals_contact_is_changed_by_whoever_won_it(records, as_, how):
    deal = records["deal"]
    client = as_(DANA)
    if how == "move":
        client.post(f"{DEALS}/{deal}/move", json={"stage": "won", "before_deal_id": None})
    else:
        client.patch(f"{DEALS}/{deal}", json={"stage": "won"})
    contact = client.get(f"{CONTACTS}/{records['contact']}").json()
    assert contact["status"] == "customer"
    assert authorship(contact) == (named(ALEX), NOW_TEXT, named(DANA), LATER_TEXT)


def test_a_deal_added_at_won_makes_its_contact_a_customer_by_whoever_added_it(records, as_):
    body = {
        "name": "Won at once",
        "organization_id": records["organization"],
        "main_contact_id": records["contact"],
        "stage": "won",
        "value": 500,
    }
    as_(DANA).post(DEALS, json=body)
    contact = as_(DANA).get(f"{CONTACTS}/{records['contact']}").json()
    assert authorship(contact)[2:] == (named(DANA), LATER_TEXT)


def test_blanked_links_keep_who_last_changed_them_and_when(records, as_):
    contact_before = row(contacts, records["contact"])
    deal_before = row(deals, records["deal"])

    as_(DANA).delete(f"{ORGS}/{records['organization']}")
    contact = row(contacts, records["contact"])
    assert contact.organization_id is None
    assert (contact.updated_by, contact.updated_at) == (contact_before.updated_by, contact_before.updated_at)

    as_(DANA).delete(f"{CONTACTS}/{records['contact']}")
    deal = row(deals, records["deal"])
    assert (deal.organization_id, deal.main_contact_id) == (None, None)
    assert (deal.updated_by, deal.updated_at) == (deal_before.updated_by, deal_before.updated_at)


# The person comes from the token, never the request


NAMING_SOMEONE = {
    "created_by": ROBIN.id,
    "updated_by": ROBIN.id,
    "created_at": "2020-01-01T00:00:00Z",
    "updated_at": "2020-01-01T00:00:00Z",
}


def test_a_body_naming_someone_changes_nothing_on_an_add(api, records):
    organization = api.post(ORGS, json={"name": "Acme", **NAMING_SOMEONE}).json()
    assert authorship(organization) == (named(ALEX), NOW_TEXT, named(ALEX), NOW_TEXT)

    activity = api.post(ACTIVITIES, json={"description": "Hi", "contact_id": records["contact"], **NAMING_SOMEONE})
    stored = row(activities, activity.json()["id"])
    assert (stored.created_by, stored.updated_by, stored.created_at) == (ALEX.id, ALEX.id, NOW)


@pytest.mark.parametrize(("path", "key"), [(ORGS, "organization"), (CONTACTS, "contact"), (DEALS, "deal")])
def test_a_body_naming_someone_changes_nothing_on_an_edit(records, as_, path, key):
    before = as_(DANA).get(f"{path}/{records[key]}").json()
    reply = as_(DANA).patch(f"{path}/{records[key]}", json=NAMING_SOMEONE)
    assert reply.status_code == 200
    assert authorship(reply.json()) == authorship(before)


def test_a_body_naming_someone_on_a_move_changes_nothing(records, as_):
    body = {"stage": "qualified", "before_deal_id": None, **NAMING_SOMEONE}
    as_(DANA).post(f"{DEALS}/{records['deal']}/move", json=body)
    assert row(deals, records["deal"]).updated_by == DANA.id


# Names in replies


def test_someone_with_no_display_name_is_named_by_their_email(records, as_):
    reply = as_(ROBIN).patch(f"{ORGS}/{records['organization']}", json={"notes": "Robin was here"}).json()
    assert reply["updated_by"] == {"id": ROBIN.id, "name": "robin@accountable.example"}


def test_a_name_changed_later_shows_on_records_already_saved(as_, records):
    with db.writing() as conn:
        users.remember(conn, ALEX.id, "Alexandra Rivera", ALEX.email)
    assert as_(DANA).get(f"{ORGS}/{records['organization']}").json()["created_by"]["name"] == "Alexandra Rivera"


def test_a_record_from_before_sign_in_has_nobody_recorded(api, make):
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    with db.writing() as conn:
        deal = insert_row(
            conn, deals, name="Old deal", stage="new", value=1, probability=5, close_date=TODAY, position=0
        )
    for path, record in ((ORGS, organization), (CONTACTS, contact), (DEALS, deal)):
        reply = api.get(f"{path}/{record}").json()
        assert (reply["created_by"], reply["updated_by"]) == (None, None), path
        assert reply["created_at"] == reply["updated_at"], path


def test_a_record_from_before_sign_in_shows_who_changed_it_since(api, make):
    organization = make.organization()
    reply = api.patch(f"{ORGS}/{organization}", json={"industry": "Retail"}).json()
    assert (reply["created_by"], reply["updated_by"]) == (None, named(ALEX))
