"""TB43: every input the API takes is checked, with a plain answer and never a server error.

Covers the review findings RV1 (numbers out of range), RV10 (Host header, text and
page size caps) and RV11 (record ids and offsets beyond SQLite's 64-bit range), across
every endpoint and field of the same kind, not only the one where each was found.
"""

import pytest

from app.schemas import MAX_ID

TOO_BIG = MAX_ID + 1  # One past SQLite's largest whole number.
HUGE = 2**70
NOT_FOUND = "We couldn't find that record. It may have been deleted."
VALUE_MESSAGE = "Enter a value from 0 to 1,000,000,000, in whole dollars."
PROBABILITY_MESSAGE = "Enter a probability from 0 to 100."


@pytest.fixture
def records(api):
    """One of everything, so every endpoint has something real to point at."""
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    deal = api.deal(org["id"], contact_id=contact["id"])
    activity = api.activity(contact_id=contact["id"])
    return {"organization": org, "contact": contact, "deal": deal, "activity": activity}


# --- Record ids in the URL (RV11) --------------------------------------------

PATH_ENDPOINTS = [
    ("GET", "/api/organizations/{id}"),
    ("PATCH", "/api/organizations/{id}"),
    ("GET", "/api/organizations/{id}/delete-impact"),
    ("DELETE", "/api/organizations/{id}"),
    ("GET", "/api/contacts/{id}"),
    ("PATCH", "/api/contacts/{id}"),
    ("GET", "/api/contacts/{id}/delete-impact"),
    ("DELETE", "/api/contacts/{id}"),
    ("GET", "/api/contacts/{id}/timeline"),
    ("GET", "/api/deals/{id}"),
    ("PATCH", "/api/deals/{id}"),
    ("POST", "/api/deals/{id}/move"),
    ("GET", "/api/deals/{id}/delete-impact"),
    ("DELETE", "/api/deals/{id}"),
    ("GET", "/api/deals/{id}/timeline"),
    ("PATCH", "/api/activities/{id}"),
    ("DELETE", "/api/activities/{id}"),
]


def _body_for(path: str) -> dict | None:
    if path.endswith("/move"):
        return {"stage": "new", "after_id": None, "before_id": None}
    return {}


@pytest.mark.parametrize(("method", "path"), PATH_ENDPOINTS)
@pytest.mark.parametrize("record_id", [9999, MAX_ID, TOO_BIG, HUGE, "abc"])
def test_an_id_that_cant_exist_is_not_found(client, method, path, record_id):
    body = _body_for(path) if method in ("PATCH", "POST") else None
    response = client.request(method, path.format(id=record_id), json=body)
    assert response.status_code == 404, response.text
    if record_id in (TOO_BIG, HUGE, "abc"):
        assert response.json() == {"message": NOT_FOUND, "fields": {}}


# --- Links to other records in a request body (RV11) ---------------------------


def _link_cases(records):
    org, contact, deal = (
        records["organization"]["id"],
        records["contact"]["id"],
        records["deal"]["id"],
    )
    new_deal = {"name": "D", "organization_id": org, "value": 1}
    new_activity = {"type": "call", "description": "x", "occurred_on": "2026-11-10"}
    return [
        (
            "POST",
            "/api/contacts",
            {"name": "C"},
            "organization_id",
            "Choose an organization.",
        ),
        (
            "PATCH",
            f"/api/contacts/{contact}",
            {},
            "organization_id",
            "Choose an organization.",
        ),
        (
            "POST",
            "/api/deals",
            {**new_deal},
            "organization_id",
            "Choose an organization.",
        ),
        ("POST", "/api/deals", {**new_deal}, "contact_id", "Choose a contact."),
        (
            "PATCH",
            f"/api/deals/{deal}",
            {},
            "organization_id",
            "Choose an organization.",
        ),
        ("PATCH", f"/api/deals/{deal}", {}, "contact_id", "Choose a contact."),
        (
            "POST",
            f"/api/deals/{deal}/move",
            {"stage": "new"},
            "after_id",
            "Choose where to put the deal.",
        ),
        (
            "POST",
            f"/api/deals/{deal}/move",
            {"stage": "new"},
            "before_id",
            "Choose where to put the deal.",
        ),
        (
            "POST",
            "/api/activities",
            {**new_activity},
            "contact_id",
            "Choose a contact.",
        ),
        ("POST", "/api/activities", {**new_activity}, "deal_id", "Choose a deal."),
    ]


@pytest.mark.parametrize("too_big", [TOO_BIG, HUGE])
def test_a_link_beyond_any_record_is_a_field_error(client, records, too_big):
    for method, url, body, field, message in _link_cases(records):
        response = client.request(method, url, json={**body, field: too_big})
        assert response.status_code == 400, (method, url, field, response.text)
        assert response.json()["fields"] == {field: message}, (method, url, field)


def test_a_link_to_a_missing_record_in_range_is_still_explained(client, records):
    """The cap doesn't change what happens to an id that's in range but gone."""
    org = records["organization"]["id"]
    response = client.post(
        "/api/deals",
        json={"name": "D", "organization_id": org, "value": 1, "contact_id": MAX_ID},
    )
    assert response.status_code == 400
    assert response.json()["fields"] == {
        "contact_id": "That contact no longer exists. Choose another."
    }


# --- Paging (RV10, RV11) -------------------------------------------------------

LISTS = ["/api/organizations", "/api/contacts", "/api/deals"]


@pytest.mark.parametrize("path", LISTS)
def test_paging_limits(client, records, path):
    assert client.get(f"{path}?limit=1000").status_code == 200
    assert client.get(f"{path}?offset={MAX_ID}").json()["items"] == []
    for bad in (
        "limit=0",
        "limit=1001",
        "offset=-1",
        f"offset={TOO_BIG}",
        f"offset={HUGE}",
        "limit=abc",
    ):
        response = client.get(f"{path}?{bad}")
        assert response.status_code == 400, (path, bad, response.text)
        assert set(response.json()["fields"]) <= {"limit", "offset"}


# --- Deal value and probability (RV1) ------------------------------------------

GOOD_VALUES = [
    (0, 0),
    (1_000_000_000, 1_000_000_000),
    ("1,000,000,000", 1_000_000_000),
    ("$48,200", 48200),
    ("7.0", 7),
]
BAD_VALUES = [
    -1,
    10.5,
    "lots",
    1_000_000_001,
    "1,000,000,001",
    HUGE,
    "99999999999999999999",
    "inf",
    "-inf",
    "Infinity",
    "nan",
    "NaN",
    "1e400",
    True,
    [],
    {},
]
GOOD_PROBABILITIES = [(0, 0), (100, 100), ("55", 55)]
BAD_PROBABILITIES = [-1, 101, 50.5, HUGE, "inf", "nan", "1e400", "half"]


@pytest.mark.parametrize(("sent", "stored"), GOOD_VALUES)
def test_good_values_on_add_and_edit(api, records, sent, stored):
    org = records["organization"]["id"]
    assert api.deal(org, value=sent)["value"] == stored
    assert (
        api.ok("PATCH", f"/api/deals/{records['deal']['id']}", json={"value": sent})["value"]
        == stored
    )


@pytest.mark.parametrize("bad", BAD_VALUES)
def test_bad_values_on_add_and_edit(client, records, bad):
    org, deal = records["organization"]["id"], records["deal"]["id"]
    for method, url, body in (
        ("POST", "/api/deals", {"name": "D", "organization_id": org, "value": bad}),
        ("PATCH", f"/api/deals/{deal}", {"value": bad}),
    ):
        response = client.request(method, url, json=body)
        assert response.status_code == 400, (method, bad, response.text)
        assert response.json()["fields"] == {"value": VALUE_MESSAGE}


@pytest.mark.parametrize(("sent", "stored"), GOOD_PROBABILITIES)
def test_good_probabilities_on_add_and_edit(api, records, sent, stored):
    org = records["organization"]["id"]
    assert api.deal(org, probability=sent)["probability"] == stored
    assert (
        api.ok("PATCH", f"/api/deals/{records['deal']['id']}", json={"probability": sent})[
            "probability"
        ]
        == stored
    )


@pytest.mark.parametrize("bad", BAD_PROBABILITIES)
def test_bad_probabilities_on_add_and_edit(client, records, bad):
    org, deal = records["organization"]["id"], records["deal"]["id"]
    for method, url, body in (
        (
            "POST",
            "/api/deals",
            {"name": "D", "organization_id": org, "value": 1, "probability": bad},
        ),
        ("PATCH", f"/api/deals/{deal}", {"probability": bad}),
    ):
        response = client.request(method, url, json=body)
        assert response.status_code == 400, (method, bad, response.text)
        assert response.json()["fields"] == {"probability": PROBABILITY_MESSAGE}


# --- Text size caps (RV10) -----------------------------------------------------

NAME = 200
TEXT = 10_000


def _email(length: int) -> str:
    return "a" * (length - len("@b.com")) + "@b.com"


def _website(length: int) -> str:
    return "https://" + "a" * (length - len("https://.com")) + ".com"


# (kind, field, limit, a value of a given length that's otherwise valid)
TEXT_FIELDS = [
    ("organization", "name", NAME, lambda n: "N" * n),
    ("organization", "website", NAME, _website),
    ("organization", "industry", TEXT, lambda n: "i" * n),
    ("organization", "notes", TEXT, lambda n: "n" * n),
    ("contact", "name", NAME, lambda n: "N" * n),
    ("contact", "email", NAME, _email),
    ("contact", "phone", TEXT, lambda n: "1" * n),
    ("contact", "job_title", TEXT, lambda n: "j" * n),
    ("deal", "name", NAME, lambda n: "N" * n),
    ("activity", "description", TEXT, lambda n: "d" * n),
]


def _create(kind: str, records: dict, field: str, value: str) -> tuple[str, dict]:
    org, contact = records["organization"]["id"], records["contact"]["id"]
    bodies = {
        "organization": ("/api/organizations", {"name": "Org"}),
        "contact": ("/api/contacts", {"name": "Person"}),
        "deal": ("/api/deals", {"name": "Deal", "organization_id": org, "value": 1}),
        "activity": (
            "/api/activities",
            {
                "type": "note",
                "description": "x",
                "occurred_on": "2026-11-10",
                "contact_id": contact,
            },
        ),
    }
    url, body = bodies[kind]
    return url, {**body, field: value}


@pytest.mark.parametrize(
    ("kind", "field", "limit", "make"),
    TEXT_FIELDS,
    ids=[f"{k}.{f}" for k, f, _, _ in TEXT_FIELDS],
)
def test_text_at_its_limit_saves_and_one_more_is_refused(client, records, kind, field, limit, make):
    message = f"Keep this to {limit:,} characters or fewer."
    url, body = _create(kind, records, field, make(limit))
    assert client.post(url, json=body).status_code == 201, field
    url, body = _create(kind, records, field, make(limit + 1))
    response = client.post(url, json=body)
    assert response.status_code == 400
    assert response.json()["fields"] == {field: message}

    record_url = f"{url}/{records[kind]['id']}"
    assert client.patch(record_url, json={field: make(limit)}).status_code == 200
    response = client.patch(record_url, json={field: make(limit + 1)})
    assert response.status_code == 400
    assert response.json()["fields"] == {field: message}


# --- Host header (RV10) --------------------------------------------------------


@pytest.mark.parametrize("host", ["127.0.0.1", "127.0.0.1:8000", "localhost", "localhost:5173"])
def test_local_hosts_are_answered(client, host):
    assert client.get("/api/deals", headers={"Host": host}).status_code == 200


@pytest.mark.parametrize(
    "host",
    [
        "evil.example.com",
        "127.0.0.1.evil.example.com",
        "localhost.evil.example.com",
        "192.168.1.20:8000",
        "0.0.0.0:8000",
    ],
)
def test_other_hosts_can_neither_read_nor_change_anything(client, api, records, host):
    org_id = records["organization"]["id"]
    headers = {"Host": host}
    assert client.get("/api/contacts", headers=headers).status_code == 400
    assert client.get(f"/api/organizations/{org_id}", headers=headers).status_code == 400
    assert (
        client.post("/api/organizations", json={"name": "Planted"}, headers=headers).status_code
        == 400
    )
    assert (
        client.patch(
            f"/api/organizations/{org_id}", json={"name": "Renamed"}, headers=headers
        ).status_code
        == 400
    )
    assert client.delete(f"/api/organizations/{org_id}", headers=headers).status_code == 400
    # Nothing changed.
    names = [o["name"] for o in api.ok("GET", "/api/organizations")["items"]]
    assert names == [records["organization"]["name"]]


# --- Today's date from the browser (second review) -----------------------------


@pytest.mark.parametrize("sent", ["0001-01-01", "1899-12-31", "3000-01-01", "9999-12-31"])
def test_a_date_outside_the_normal_range_falls_back_to_the_server_date(client, api, sent):
    contact = api.contact()
    api.activity(contact_id=contact["id"], follow_up_on="2026-11-20")
    headers = {"X-Local-Date": sent}
    assert client.get("/api/dashboard", headers=headers).status_code == 200
    timeline = client.get(f"/api/contacts/{contact['id']}/timeline", headers=headers)
    assert timeline.status_code == 200
    # Judged against the server's today (16 Nov 2026), the follow-up is upcoming.
    assert timeline.json()["items"][0]["follow_up_status"] == "upcoming"


def test_a_normal_date_from_the_browser_is_still_used(client, api):
    contact = api.contact()
    api.activity(contact_id=contact["id"], follow_up_on="2026-11-20")
    timeline = client.get(
        f"/api/contacts/{contact['id']}/timeline",
        headers={"X-Local-Date": "2026-11-25"},
    )
    assert timeline.json()["items"][0]["follow_up_status"] == "overdue"


# --- Email check speed (second review) ------------------------------------------


def test_a_long_crafted_email_is_refused_quickly(client):
    import time

    started = time.perf_counter()
    response = client.post("/api/contacts", json={"name": "X", "email": "a@" + "a." * 40_000 + "@"})
    assert time.perf_counter() - started < 1
    assert response.status_code == 400
    assert response.json()["fields"] == {"email": "Keep this to 200 characters or fewer."}


@pytest.mark.parametrize(
    ("email", "ok"),
    [
        ("name@company.com", True),
        ("a.b+c@mail.example.co.uk", True),
        ("a@b.c", True),
        ("no-at-sign.com", False),
        ("a@b", False),
        ("a@b..c", False),
        ("a@.b.c", False),
        ("a@b.c.", False),
        ("a b@c.com", False),
        ("a@b@c.com", False),
    ],
)
def test_email_format(client, email, ok):
    response = client.post("/api/contacts", json={"name": "X", "email": email})
    assert (response.status_code == 201) is ok, response.text
