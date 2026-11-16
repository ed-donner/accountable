"""The shared API pieces, and that every route says what it returns."""

from fastapi.testclient import TestClient

import threading

from sqlalchemy import select

from backend.app import api, db
from backend.app.main import app

from .conftest import LOCAL, make_contact, make_deal, make_org


def test_plural():
    assert api.plural(1, "deal", "deals") == "1 deal"
    assert api.plural(0, "deal", "deals") == "0 deals"
    assert api.plural(3, "activity", "activities") == "3 activities"


def test_every_route_documents_its_response():
    """Each route returns a named model (or nothing), so the OpenAPI schema is the contract the frontend relies on.

    A route that returns a bare `dict` gets a schema of "any object", which this catches.
    """
    missing = []
    for path, operations in app.openapi()["paths"].items():
        for method, op in operations.items():
            if "204" in op["responses"]:
                continue
            code = next(c for c in op["responses"] if c.startswith("2"))
            schema = op["responses"][code].get("content", {}).get("application/json", {}).get("schema", {})
            if "$ref" not in schema and "$ref" not in schema.get("items", {}):
                missing.append(f"{method.upper()} {path}")
    assert missing == []


def test_validation_errors_give_one_message_per_field(isolated_db):  # R58
    db.create_schema()
    with TestClient(app, base_url=LOCAL) as c:
        response = c.post("/api/deals", json={"name": " ", "value_cents": -1, "close_date": "soon"})
    assert response.status_code == 422
    assert response.json() == {
        "detail": "Check the highlighted fields",
        "fields": {
            "name": "This is required",
            "organization_id": "This is required",
            "value_cents": "Must be 0 or more",
            "close_date": "Enter a valid date",
        },
    }


def test_numbers_too_big_for_the_database_are_refused_not_crashed(empty_client):
    c = empty_client
    org = make_org(c)
    huge = 10**20
    assert c.get(f"/api/deals/{huge}").status_code == 404
    assert c.get(f"/api/organizations/{huge}").status_code == 404
    assert c.get(f"/api/contacts/{huge}").status_code == 404
    assert c.patch(f"/api/activities/{huge}", json={"done": True}).status_code == 404
    assert c.get(f"/api/activities?deal_id={huge}").json() == []
    r = c.post("/api/deals", json={"name": "Big", "organization_id": org["id"], "value_cents": 10**22, "close_date": "2026-12-31"})
    assert (r.status_code, r.json()["fields"]) == (422, {"value_cents": "Must be 1000000000000 or less"})
    r = c.post("/api/deals", json={"name": "Lost org", "organization_id": huge, "value_cents": 1, "close_date": "2026-12-31"})
    assert (r.status_code, r.json()["fields"]) == (422, {"organization_id": "Choose an organization"})


def test_text_has_a_length_limit(empty_client):
    c = empty_client
    r = c.post("/api/organizations", json={"name": "x" * (api.MAX_NAME + 1)})
    assert (r.status_code, r.json()["fields"]) == (422, {"name": f"Keep this to {api.MAX_NAME} characters or fewer"})
    r = c.post("/api/organizations", json={"name": "Acme", "notes": "x" * (api.MAX_TEXT + 1)})
    assert r.json()["fields"] == {"notes": f"Keep this to {api.MAX_TEXT} characters or fewer"}
    person = make_contact(c)
    long_note = "x" * api.MAX_NAME * 2  # an activity description may be longer than a name
    r = c.post("/api/activities", json={"kind": "note", "contact_id": person["id"], "description": long_note})
    assert r.status_code == 201


def test_oversized_requests_are_refused(empty_client):
    r = empty_client.post("/api/organizations", content=b"{}", headers={"content-length": str(api.MAX_BODY_BYTES + 1)})
    assert r.status_code == 413


def test_websites_are_web_links_and_emails_are_addresses(empty_client):
    c = empty_client
    assert make_org(c, "Bare", website="acme.com")["website"] == "https://acme.com"
    assert make_org(c, "Port", website="acme.com:8080")["website"] == "https://acme.com:8080"
    assert make_org(c, "Full", website="http://acme.com/about")["website"] == "http://acme.com/about"
    for bad in ["file:///etc/passwd", "javascript:alert(1)", "acme .com"]:
        r = c.post("/api/organizations", json={"name": "Bad", "website": bad})
        assert r.status_code == 422 and "website" in r.json()["fields"], bad
    assert make_contact(c, email="jane@mail.acme.com")["email"] == "jane@mail.acme.com"
    for bad in ["jane", "jane@acme", "a@b.com?bcc=x@y.com", "jane doe@acme.com"]:
        r = c.post("/api/contacts", json={"name": "Bad", "email": bad})
        assert r.json()["fields"] == {"email": "Enter an email address, such as jane@acme.com"}, bad


def test_only_this_computer_s_host_names_are_answered(empty_client):
    assert empty_client.get("/api/stages").status_code == 200
    assert empty_client.get("/api/stages", headers={"host": "127.0.0.1:8000"}).status_code == 200
    assert empty_client.get("/api/stages", headers={"host": "evil.example.com"}).status_code == 400


def test_a_transaction_holds_the_write_lock_from_its_start(empty_client):
    """Reads a change is based on can't go stale: a second writer waits until the first finishes."""
    with db.transaction() as conn:
        conn.execute(select(db.deals.c.id)).all()
        assert conn.connection.dbapi_connection.in_transaction


def test_simultaneous_moves_into_one_column_keep_distinct_positions(empty_client):  # D8
    c = empty_client
    org = make_org(c)
    ids = [make_deal(c, org["id"], f"D{i}")["id"] for i in range(8)]
    barrier = threading.Barrier(len(ids))

    def move(deal_id: int) -> None:
        barrier.wait()
        assert c.post(f"/api/deals/{deal_id}/move", json={"stage": "Proposal", "index": 0}).status_code == 200

    threads = [threading.Thread(target=move, args=(i,)) for i in ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    positions = sorted(d["position"] for d in c.get("/api/deals").json() if d["stage"] == "Proposal")
    assert positions == list(range(len(ids)))
