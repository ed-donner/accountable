import json
from pathlib import Path

import pytest
from conftest import TODAY

ORGS = "/api/organizations"
CONTACTS = "/api/contacts"
DEALS = "/api/deals"
ACTIVITIES = "/api/activities"

WEBSITES = json.loads((Path(__file__).resolve().parents[2] / "shared" / "website-cases.json").read_text())


def error_fields(reply) -> dict[str, str]:
    assert reply.status_code == 422, reply.text
    return reply.json()["fields"]


def new_deal(organization_id: int, contact_id: int, **values) -> dict:
    return {
        "name": "Annual support",
        "organization_id": organization_id,
        "main_contact_id": contact_id,
        "stage": "new",
        "value": 36000,
        "close_date": "2026-12-18",
        **values,
    }


@pytest.fixture
def linked(make):
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    return organization, contact


# Required fields


def test_an_organization_needs_a_name(api):
    assert error_fields(api.post(ORGS, json={})) == {"name": "Enter a name"}
    assert error_fields(api.post(ORGS, json={"name": "   "})) == {"name": "Enter a name"}


def test_a_contact_needs_a_name_and_an_organization(api):
    assert error_fields(api.post(CONTACTS, json={})) == {
        "name": "Enter a name",
        "organization_id": "Choose an organization",
    }


def test_a_deal_needs_everything_the_spec_lists(api):
    fields = error_fields(api.post(DEALS, json={}))
    assert fields["name"] == "Enter a name"
    assert fields["organization_id"] == "Choose an organization"
    assert fields["main_contact_id"] == "Choose a main contact"
    assert "value" in fields


def test_an_open_deal_needs_a_close_date(api, linked):
    body = new_deal(*linked)
    del body["close_date"]
    assert error_fields(api.post(DEALS, json=body)) == {"close_date": "Choose a close date"}


def test_a_deal_added_at_won_defaults_to_today(api, linked):
    body = new_deal(*linked, stage="won")
    del body["close_date"]
    reply = api.post(DEALS, json=body)
    assert reply.status_code == 201
    assert reply.json()["close_date"] == TODAY.isoformat()


def test_a_link_to_a_missing_record_is_refused(api, linked):
    organization, contact = linked
    assert "organization_id" in error_fields(api.post(CONTACTS, json={"name": "Sam", "organization_id": 999}))
    assert "organization_id" in error_fields(api.post(DEALS, json=new_deal(999, contact)))
    assert "main_contact_id" in error_fields(api.post(DEALS, json=new_deal(organization, 999)))


def test_a_new_contact_defaults_to_lead(api, linked):
    reply = api.post(CONTACTS, json={"name": "Sam", "organization_id": linked[0]})
    assert reply.json()["status"] == "lead"


def test_a_new_deal_gets_its_stages_usual_probability(api, linked):
    assert api.post(DEALS, json=new_deal(*linked, stage="proposal")).json()["probability"] == 40


def test_a_probability_given_on_a_new_deal_is_kept(api, linked):
    assert api.post(DEALS, json=new_deal(*linked, probability=33)).json()["probability"] == 33


# Links


def test_a_set_link_cannot_be_cleared(api, linked):
    organization, contact = linked
    deal = api.post(DEALS, json=new_deal(organization, contact)).json()["id"]

    assert "organization_id" in error_fields(api.patch(f"{DEALS}/{deal}", json={"organization_id": None}))
    assert "main_contact_id" in error_fields(api.patch(f"{DEALS}/{deal}", json={"main_contact_id": None}))
    assert "organization_id" in error_fields(api.patch(f"{CONTACTS}/{contact}", json={"organization_id": None}))


def test_a_set_link_can_be_changed(api, linked, make):
    organization, contact = linked
    deal = api.post(DEALS, json=new_deal(organization, contact)).json()["id"]
    other = make.organization("Lantern Hotels")
    reply = api.patch(f"{DEALS}/{deal}", json={"organization_id": other})
    assert reply.json()["organization_name"] == "Lantern Hotels"


def test_a_blank_link_can_stay_blank_while_editing_something_else(api, make):
    contact = make.contact()
    deal = make.deal()

    reply = api.patch(f"{CONTACTS}/{contact}", json={"name": "Sam C", "organization_id": None})
    assert reply.status_code == 200
    assert reply.json()["organization_id"] is None

    reply = api.patch(f"{DEALS}/{deal}", json={"name": "New name", "organization_id": None, "main_contact_id": None})
    assert reply.status_code == 200
    assert reply.json()["name"] == "New name"


# Field rules


@pytest.mark.parametrize("email", ["sam", "sam@", "@example.com", "sam@example", "sam smith@example.com"])
def test_a_bad_email_is_refused(api, linked, email):
    fields = error_fields(api.post(CONTACTS, json={"name": "Sam", "organization_id": linked[0], "email": email}))
    assert fields == {"email": "Enter a valid email address"}


def test_a_good_email_is_kept_and_a_blank_one_stored_as_nothing(api, linked):
    body = {"name": "Sam", "organization_id": linked[0]}
    assert api.post(CONTACTS, json={**body, "email": "sam@example.com"}).json()["email"] == "sam@example.com"
    assert api.post(CONTACTS, json={**body, "email": "  "}).json()["email"] is None


@pytest.mark.parametrize(
    ("given", "stored"),
    [
        ("example.com", "https://example.com"),
        ("www.example.com/about", "https://www.example.com/about"),
        ("http://example.com", "http://example.com"),
        ("https://example.com", "https://example.com"),
        ("example.com:8080", "https://example.com:8080"),
        ("HTTPS://example.com", "HTTPS://example.com"),
    ],
)
def test_websites_gain_https_if_left_off(api, given, stored):
    assert api.post(ORGS, json={"name": "Acme", "website": given}).json()["website"] == stored


@pytest.mark.parametrize(
    "website", ["ftp://example.com", "mailto:sam@example.com", "javascript:alert(1)", "https://", "two words"]
)
def test_other_website_schemes_are_refused(api, website):
    assert "website" in error_fields(api.post(ORGS, json={"name": "Acme", "website": website}))


@pytest.mark.parametrize("website", WEBSITES["accepted"])
def test_a_website_the_browser_accepts_is_accepted_here_too(api, website):
    assert api.post(ORGS, json={"name": "Acme", "website": website}).status_code == 201


@pytest.mark.parametrize("website", WEBSITES["refused"])
def test_a_website_the_browser_refuses_is_refused_here_too(api, website):
    fields = error_fields(api.post(ORGS, json={"name": "Acme", "website": website}))
    assert fields["website"] == "Enter a website address, such as https://example.com"


def test_a_blank_website_is_fine(api):
    assert api.post(ORGS, json={"name": "Acme", "website": ""}).json()["website"] is None


@pytest.mark.parametrize("value", [-1, 12.5, "lots", None])
def test_a_bad_value_is_refused(api, linked, value):
    assert "value" in error_fields(api.post(DEALS, json=new_deal(*linked, value=value)))


def test_zero_is_an_allowed_value(api, linked):
    assert api.post(DEALS, json=new_deal(*linked, value=0)).status_code == 201


@pytest.mark.parametrize("probability", [-1, 101, 12.5, "high"])
def test_a_bad_probability_is_refused(api, linked, probability):
    fields = error_fields(api.post(DEALS, json=new_deal(*linked, probability=probability)))
    assert fields == {"probability": "Enter a whole number from 0 to 100"}


def test_a_bad_status_is_refused(api, linked):
    assert "status" in error_fields(
        api.post(CONTACTS, json={"name": "Sam", "organization_id": linked[0], "status": "vip"})
    )


def test_a_bad_stage_is_refused(api, linked):
    assert "stage" in error_fields(api.post(DEALS, json=new_deal(*linked, stage="maybe")))


# Close dates on closed deals


def test_a_future_close_date_is_refused_when_adding_a_won_deal(api, linked):
    fields = error_fields(api.post(DEALS, json=new_deal(*linked, stage="won", close_date="2026-11-01")))
    assert fields == {"close_date": "A won or lost deal can't have a close date in the future"}


@pytest.mark.parametrize("stage", ["won", "lost"])
def test_a_future_close_date_is_refused_when_editing_a_closed_deal(api, make, stage):
    deal = make.deal(stage=stage, close_date=TODAY)
    assert "close_date" in error_fields(api.patch(f"{DEALS}/{deal}", json={"close_date": "2026-11-01"}))


def test_a_closed_deals_close_date_can_be_moved_into_the_past(api, make):
    deal = make.deal(stage="won", close_date=TODAY)
    assert api.patch(f"{DEALS}/{deal}", json={"close_date": "2026-10-20"}).json()["close_date"] == "2026-10-20"


def test_a_future_close_date_given_with_a_move_to_won_is_refused(api, make):
    deal = make.deal()
    reply = api.patch(f"{DEALS}/{deal}", json={"stage": "won", "close_date": "2026-11-01"})
    assert "close_date" in error_fields(reply)
    assert api.get(f"{DEALS}/{deal}").json()["stage"] == "new"


def test_winning_a_deal_due_in_the_future_replaces_the_date(api, make):
    deal = make.deal(close_date=TODAY.replace(year=2027))
    assert api.patch(f"{DEALS}/{deal}", json={"stage": "won"}).json()["close_date"] == TODAY.isoformat()


def test_an_open_deal_can_have_any_close_date(api, linked):
    assert api.post(DEALS, json=new_deal(*linked, close_date="2020-01-01")).status_code == 201
    assert api.post(DEALS, json=new_deal(*linked, close_date="2040-01-01")).status_code == 201


# Editing through the form's route


def test_the_form_saves_what_it_showed(api, make):
    deal = make.deal(stage="new")
    reply = api.patch(f"{DEALS}/{deal}", json={"stage": "proposal", "probability": 55, "close_date": "2026-12-25"})
    body = reply.json()
    assert (body["stage"], body["probability"], body["close_date"]) == ("proposal", 55, "2026-12-25")


def test_a_hand_set_probability_survives_other_edits(api, make):
    deal = make.deal()
    api.patch(f"{DEALS}/{deal}", json={"probability": 33})
    assert api.patch(f"{DEALS}/{deal}", json={"name": "Renamed"}).json()["probability"] == 33


def test_a_stage_change_through_edit_follows_the_rules(api, make):
    contact = make.contact()
    deal = make.deal(main_contact_id=contact)
    body = api.patch(f"{DEALS}/{deal}", json={"stage": "won"}).json()
    assert (body["probability"], body["close_date"]) == (100, TODAY.isoformat())
    assert api.get(f"{CONTACTS}/{contact}").json()["status"] == "customer"


def test_winning_while_changing_the_main_contact_reaches_the_new_contact(api, make):
    first = make.contact("First")
    second = make.contact("Second")
    deal = make.deal(main_contact_id=first)
    api.patch(f"{DEALS}/{deal}", json={"stage": "won", "main_contact_id": second})
    assert api.get(f"{CONTACTS}/{first}").json()["status"] == "lead"
    assert api.get(f"{CONTACTS}/{second}").json()["status"] == "customer"


def test_a_contacts_status_can_be_edited_by_hand(api, make):
    contact = make.contact(status="customer")
    assert api.patch(f"{CONTACTS}/{contact}", json={"status": "lead"}).json()["status"] == "lead"


def test_patch_only_touches_the_fields_sent(api, make):
    organization = make.organization(website="https://example.com", industry="Retail")
    body = api.patch(f"{ORGS}/{organization}", json={"industry": "Energy"}).json()
    assert body["website"] == "https://example.com"
    assert body["industry"] == "Energy"


# Names and errors


def test_two_records_can_share_a_name(api, linked):
    organization, contact = linked
    assert api.post(ORGS, json={"name": "Same"}).status_code == 201
    assert api.post(ORGS, json={"name": "Same"}).status_code == 201
    assert api.post(CONTACTS, json={"name": "Same", "organization_id": organization}).status_code == 201
    assert api.post(CONTACTS, json={"name": "Same", "organization_id": organization}).status_code == 201
    assert api.post(DEALS, json=new_deal(organization, contact, name="Same")).status_code == 201
    assert api.post(DEALS, json=new_deal(organization, contact, name="Same")).status_code == 201


def test_errors_are_422_with_a_message_per_field(api):
    reply = api.post(ORGS, json={"name": "", "website": "ftp://x.example"})
    assert reply.status_code == 422
    assert set(reply.json()["fields"]) == {"name", "website"}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", f"{ORGS}/999"),
        ("delete", f"{ORGS}/999"),
        ("get", f"{ORGS}/999/delete-impact"),
        ("get", f"{ORGS}/999/timeline"),
        ("get", f"{CONTACTS}/999"),
        ("delete", f"{CONTACTS}/999"),
        ("get", f"{CONTACTS}/999/delete-impact"),
        ("get", f"{CONTACTS}/999/timeline"),
        ("get", f"{DEALS}/999"),
        ("delete", f"{DEALS}/999"),
        ("get", f"{DEALS}/999/delete-impact"),
        ("get", f"{DEALS}/999/timeline"),
        ("delete", f"{ACTIVITIES}/999"),
    ],
)
def test_a_missing_record_is_404(api, method, path):
    assert getattr(api, method)(path).status_code == 404


@pytest.mark.parametrize("path", [f"{ORGS}/999", f"{CONTACTS}/999", f"{DEALS}/999", f"{ACTIVITIES}/999"])
def test_editing_a_missing_record_is_404(api, path):
    assert api.patch(path, json={"name": "x"}).status_code == 404


def test_moving_a_missing_deal_is_404(api):
    assert api.post(f"{DEALS}/999/move", json={"stage": "won"}).status_code == 404


# Activities


def test_an_activity_needs_exactly_one_of_contact_and_deal(api, linked, make):
    deal = make.deal()
    _organization, contact = linked
    body = {"description": "Called"}
    assert "contact_id" in error_fields(api.post(ACTIVITIES, json=body))
    assert "contact_id" in error_fields(api.post(ACTIVITIES, json={**body, "contact_id": contact, "deal_id": deal}))
    assert api.post(ACTIVITIES, json={**body, "contact_id": contact}).status_code == 201
    assert api.post(ACTIVITIES, json={**body, "deal_id": deal}).status_code == 201


def test_an_activity_on_a_missing_record_is_refused(api):
    assert "deal_id" in error_fields(api.post(ACTIVITIES, json={"description": "Hi", "deal_id": 999}))


def test_an_activity_defaults_to_a_note_logged_now(api, make):
    reply = api.post(ACTIVITIES, json={"description": "Called", "deal_id": make.deal()})
    body = reply.json()
    assert body["type"] == "note"
    assert body["occurred_at"] == "2026-10-31T15:00:00Z"
    assert body["follow_up_done"] is False


def test_an_activity_needs_a_description(api, make):
    fields = error_fields(api.post(ACTIVITIES, json={"description": "  ", "deal_id": make.deal()}))
    assert fields == {"description": "Enter a description"}


def test_an_activitys_time_with_a_zone_is_stored_in_utc(api, make):
    reply = api.post(
        ACTIVITIES,
        json={"description": "Called", "deal_id": make.deal(), "occurred_at": "2026-10-31T09:30:00-04:00"},
    )
    assert reply.json()["occurred_at"] == "2026-10-31T13:30:00Z"


def test_an_activitys_contact_or_deal_cannot_be_changed(api, make):
    deal = make.deal()
    other = make.deal("Other")
    activity = make.activity(deal_id=deal)
    reply = api.patch(f"{ACTIVITIES}/{activity}", json={"deal_id": other, "description": "Edited"})
    body = reply.json()
    assert body["deal_id"] == deal
    assert body["description"] == "Edited"


def test_a_follow_up_can_be_marked_done_and_undone(api, make):
    activity = make.activity(deal_id=make.deal(), follow_up_date=TODAY)
    assert api.patch(f"{ACTIVITIES}/{activity}", json={"follow_up_done": True}).json()["follow_up_done"] is True
    assert api.patch(f"{ACTIVITIES}/{activity}", json={"follow_up_done": False}).json()["follow_up_done"] is False


def test_a_follow_up_date_can_be_removed(api, make):
    activity = make.activity(deal_id=make.deal(), follow_up_date=TODAY)
    assert api.patch(f"{ACTIVITIES}/{activity}", json={"follow_up_date": None}).json()["follow_up_date"] is None


# List replies


def test_organization_list_counts(api, make):
    organization = make.organization()
    empty = make.organization("Nothing Here")
    contact = make.contact(organization_id=organization)
    make.contact("Second", organization_id=organization)
    make.deal(organization_id=organization, main_contact_id=contact, value=1000, stage="new")
    make.deal("Two", organization_id=organization, value=2000, stage="proposal")
    make.deal("Three", organization_id=organization, value=5000, stage="won", close_date=TODAY)
    make.deal("Four", organization_id=organization, value=7000, stage="lost", close_date=TODAY)

    rows = {row["name"]: row for row in api.get(ORGS).json()}

    row = rows["Harbor & Pine"]
    assert row["contact_count"] == 2
    assert row["open_deal_count"] == 2
    assert row["open_value"] == 3000
    assert rows["Nothing Here"]["contact_count"] == 0
    assert rows["Nothing Here"]["open_value"] == 0
    assert rows["Nothing Here"]["last_activity"] is None
    assert empty


def test_last_activity_is_the_newest_timeline_entry(api, make):
    from datetime import datetime

    organization = make.organization()
    contact = make.contact(organization_id=organization)
    deal = make.deal(organization_id=organization, main_contact_id=contact)
    make.activity(contact_id=contact, occurred_at=datetime(2026, 10, 1, 9, 0))
    make.activity(deal_id=deal, occurred_at=datetime(2026, 10, 5, 9, 0))

    assert api.get(CONTACTS).json()[0]["last_activity"] == "2026-10-05T09:00:00Z"
    assert api.get(ORGS).json()[0]["last_activity"] == "2026-10-05T09:00:00Z"

    api.post(f"{DEALS}/{deal}/move", json={"stage": "qualified"})

    assert api.get(CONTACTS).json()[0]["last_activity"] == "2026-10-31T15:00:00Z"
    assert api.get(ORGS).json()[0]["last_activity"] == "2026-10-31T15:00:00Z"


def test_a_contact_list_row_names_its_organization(api, make):
    organization = make.organization()
    make.contact(organization_id=organization)
    make.contact("Blank Link")
    rows = {row["name"]: row for row in api.get(CONTACTS).json()}
    assert rows["Sam Carter"]["organization_name"] == "Harbor & Pine"
    assert rows["Blank Link"]["organization_name"] is None


def test_a_deal_list_row_has_names_and_expected_revenue(api, make):
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    make.deal(organization_id=organization, main_contact_id=contact, value=1010, probability=5)
    row = api.get(DEALS).json()[0]
    assert row["organization_name"] == "Harbor & Pine"
    assert row["main_contact_name"] == "Sam Carter"
    assert row["expected_revenue"] == 51


def test_record_replies_include_what_they_link_to(api, make):
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    make.deal(organization_id=organization, main_contact_id=contact)

    assert [item["name"] for item in api.get(f"{ORGS}/{organization}").json()["contacts"]] == ["Sam Carter"]
    assert [item["name"] for item in api.get(f"{ORGS}/{organization}").json()["deals"]] == ["Annual support"]
    assert [item["name"] for item in api.get(f"{CONTACTS}/{contact}").json()["deals"]] == ["Annual support"]


def test_meta_lists_stages_statuses_and_types(api):
    body = api.get("/api/meta").json()
    assert [stage["key"] for stage in body["stages"]] == ["new", "qualified", "proposal", "negotiation", "won", "lost"]
    assert [stage["probability"] for stage in body["stages"]] == [5, 20, 40, 70, 100, 0]
    assert body["statuses"] == ["lead", "qualified", "customer"]
    assert body["activity_types"] == ["note", "call", "email"]


# Input the database or the calendar can't hold


@pytest.mark.parametrize(
    "path, field",
    [
        (CONTACTS, "organization_id"),
        (DEALS, "organization_id"),
        (DEALS, "main_contact_id"),
        (ACTIVITIES, "contact_id"),
        (ACTIVITIES, "deal_id"),
    ],
)
@pytest.mark.parametrize("value", [2**63, -(2**63) - 1, 10**30])
def test_a_link_too_big_for_the_database_is_refused(api, path, field, value):
    assert field in error_fields(api.post(path, json={"name": "x", "description": "x", field: value}))


@pytest.mark.parametrize(
    "path, field", [(CONTACTS, "organization_id"), (DEALS, "organization_id"), (DEALS, "main_contact_id")]
)
def test_an_edit_with_a_link_too_big_for_the_database_is_refused(api, make, path, field):
    record = make.contact() if path == CONTACTS else make.deal()
    assert field in error_fields(api.patch(f"{path}/{record}", json={field: 2**63}))


def test_a_move_before_an_impossible_deal_is_refused(api, make):
    deal = make.deal()
    assert "before_deal_id" in error_fields(
        api.post(f"{DEALS}/{deal}/move", json={"stage": "new", "before_deal_id": 2**63})
    )


@pytest.mark.parametrize(
    "stamp",
    ["0001-01-01T00:00:00+14:00", "9999-12-31T23:59:59-14:00"],
)
def test_an_activity_time_past_the_calendars_end_is_refused(api, make, stamp):
    deal = make.deal()
    fields = error_fields(api.post(ACTIVITIES, json={"description": "Called", "deal_id": deal, "occurred_at": stamp}))
    assert fields == {"occurred_at": "Choose when it happened"}

    activity = api.post(ACTIVITIES, json={"description": "Called", "deal_id": deal}).json()["id"]
    assert "occurred_at" in error_fields(api.patch(f"{ACTIVITIES}/{activity}", json={"occurred_at": stamp}))


@pytest.mark.parametrize("close_date", ["0001-01-01", "9999-12-31"])
def test_a_deal_on_the_calendars_last_days_doesnt_upset_the_dashboard(api, linked, close_date):
    organization, contact = linked
    assert api.post(DEALS, json=new_deal(organization, contact, close_date=close_date)).status_code == 201
    assert api.get("/api/dashboard").status_code == 200
    assert api.get(DEALS).status_code == 200


def test_the_largest_value_is_allowed_and_one_more_is_not(api, linked):
    organization, contact = linked
    limit = 1_000_000_000_000
    deal = api.post(DEALS, json=new_deal(organization, contact, value=limit, probability=99))
    assert deal.json()["expected_revenue"] == 990_000_000_000
    assert "value" in error_fields(api.post(DEALS, json=new_deal(organization, contact, value=limit + 1)))
    assert api.get("/api/dashboard").json()["open_pipeline"] == limit


@pytest.mark.parametrize(
    "path, field",
    [
        (ORGS, "name"),
        (ORGS, "website"),
        (ORGS, "industry"),
        (ORGS, "notes"),
        (CONTACTS, "name"),
        (CONTACTS, "email"),
        (CONTACTS, "phone"),
        (CONTACTS, "job_title"),
        (DEALS, "name"),
        (ACTIVITIES, "description"),
    ],
)
def test_text_the_database_cant_store_is_refused(api, linked, make, path, field):
    """JSON can carry half of a two-part character, which has no valid encoding."""
    organization, contact = linked
    good = {
        ORGS: {"name": "Acme"},
        CONTACTS: {"name": "Sam", "organization_id": organization},
        DEALS: new_deal(organization, contact),
        ACTIVITIES: {"description": "Called", "deal_id": make.deal()},
    }[path]
    body = json.dumps({**good, field: "\ud800"})
    reply = api.post(path, content=body, headers={"content-type": "application/json"})
    assert field in error_fields(reply)


def test_ordinary_accents_and_emoji_are_kept(api):
    name = "Caf\u00e9 \u6771\u4eac \U0001f600"
    assert api.post(ORGS, json={"name": name}).json()["name"] == name


@pytest.mark.parametrize(
    "path, field",
    [
        (ORGS, "name"),
        (CONTACTS, "name"),
        (CONTACTS, "status"),
        (DEALS, "name"),
        (DEALS, "stage"),
        (DEALS, "value"),
        (DEALS, "probability"),
        (DEALS, "close_date"),
    ],
)
def test_a_required_field_cant_be_blanked_by_an_edit(api, linked, make, path, field):
    organization, contact = linked
    record = {ORGS: organization, CONTACTS: contact}.get(path) or make.deal()
    assert field in error_fields(api.patch(f"{path}/{record}", json={field: None}))


@pytest.mark.parametrize("field", ["type", "description", "occurred_at", "follow_up_done"])
def test_a_required_activity_field_cant_be_blanked_by_an_edit(api, make, field):
    activity = api.post(ACTIVITIES, json={"description": "Called", "deal_id": make.deal()}).json()["id"]
    assert field in error_fields(api.patch(f"{ACTIVITIES}/{activity}", json={field: None}))


def test_a_deleted_records_id_is_never_used_again(api, make):
    organization = make.organization()
    contact = api.post(CONTACTS, json={"name": "Sam Carter", "organization_id": organization}).json()["id"]
    records = [
        (ORGS, {"name": "Acme"}),
        (CONTACTS, {"name": "Alex Reed", "organization_id": organization}),
        (DEALS, new_deal(organization, contact)),
        (ACTIVITIES, {"contact_id": contact, "description": "Called them"}),
    ]
    for route, body in records:
        first = api.post(route, json=body).json()["id"]
        assert api.delete(f"{route}/{first}").status_code == 204
        assert api.post(route, json=body).json()["id"] > first, route
