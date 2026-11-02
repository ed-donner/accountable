"""Rules every route has to keep. The routes come from the app itself, so a route
added later is held to them without anyone remembering to add it here.
"""

import pytest
from accountable import db
from accountable.crm import schemas
from accountable.crm.routers import dashboard
from accountable.main import app
from fastapi.testclient import TestClient

LOCAL = "http://localhost"
TOO_BIG = schemas.MAX_ID + 1
# What a website can send from a form or a plain fetch, with no permission asked first.
SIMPLE_TYPES = ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]
OPEN_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000", "https://evil.example", "null"]

ROUTES = sorted((method.upper(), path) for path, operations in app.openapi()["paths"].items() for method in operations)
WRITES = [(method, path) for method, path in ROUTES if method in ("POST", "PATCH")]
RECORD_ROUTES = [(method, path) for method, path in ROUTES if "{" in path]
READS = [path for method, path in ROUTES if method == "GET" and "{" not in path]
TIMELINES = [path for method, path in ROUTES if path.endswith("/timeline")]


def with_id(path: str, value: object) -> str:
    start, end = path.index("{"), path.index("}")
    return f"{path[:start]}{value}{path[end + 1 :]}"


@pytest.fixture
def client(api) -> TestClient:
    """Answers the way the real server does, so a crash shows up as a 500 reply."""
    return TestClient(app, base_url=LOCAL, raise_server_exceptions=False)


def test_the_routes_were_found():
    assert ("POST", "/api/deals/{deal_id}/move") in ROUTES
    assert len(RECORD_ROUTES) > 15


@pytest.mark.parametrize("method, path", RECORD_ROUTES)
@pytest.mark.parametrize("value", [TOO_BIG, -TOO_BIG, 10**30, 0, -1, "abc", "1.5"])
def test_an_id_that_cant_be_a_record_is_refused(client, method, path, value):
    assert client.request(method, with_id(path, value), json={"stage": "new"}).status_code == 422


@pytest.mark.parametrize("method, path", RECORD_ROUTES)
def test_the_largest_possible_id_is_simply_missing(client, method, path):
    assert client.request(method, with_id(path, schemas.MAX_ID), json={"stage": "new"}).status_code == 404


@pytest.mark.parametrize("method, path", WRITES)
@pytest.mark.parametrize("content_type", SIMPLE_TYPES)
def test_no_write_accepts_a_body_a_website_could_send_unasked(client, method, path, content_type):
    target = with_id(path, 1) if "{" in path else path
    reply = client.request(method, target, content='{"name": "Planted"}', headers={"content-type": content_type})
    assert reply.status_code == 415


@pytest.mark.parametrize("method, path", WRITES)
@pytest.mark.parametrize("body", [b"{", b"", b"[]", b"null", b'"text"', b"12"])
def test_no_write_crashes_on_a_body_that_isnt_a_record(client, method, path, body):
    target = with_id(path, 1) if "{" in path else path
    reply = client.request(method, target, content=body, headers={"content-type": "application/json"})
    assert reply.status_code in (404, 422)


@pytest.mark.parametrize("path", READS)
@pytest.mark.parametrize("origin", OPEN_ORIGINS)
def test_no_read_lets_another_origin_see_the_reply(client, path, origin):
    reply = client.get(path, headers={"origin": origin})
    assert reply.status_code == 200
    assert not [name for name in reply.headers if name.lower().startswith("access-control-")]


@pytest.mark.parametrize("method, path", ROUTES)
def test_no_route_agrees_to_a_cross_origin_request(client, method, path):
    target = with_id(path, 1) if "{" in path else path
    reply = client.options(target, headers={"origin": "http://localhost:3000", "access-control-request-method": method})
    assert reply.status_code >= 400
    assert not [name for name in reply.headers if name.lower().startswith("access-control-")]


@pytest.mark.parametrize("method, path", ROUTES)
def test_a_wrong_host_is_refused_everywhere(api, method, path):
    target = with_id(path, 1) if "{" in path else path
    reply = TestClient(app, base_url="http://evil.example").request(
        method, target, json={}, headers={"content-type": "application/json"}
    )
    assert reply.status_code == 400


@pytest.mark.parametrize("path", TIMELINES)
@pytest.mark.parametrize(
    "query",
    [
        "limit=0",
        "limit=-1",
        "limit=501",
        "limit=abc",
        "offset=-1",
        "offset=abc",
        f"offset={TOO_BIG}",
        f"limit={TOO_BIG}",
    ],
)
def test_a_bad_timeline_page_is_refused(client, make, path, query):
    make.organization()
    make.contact()
    make.deal()
    assert client.get(f"{with_id(path, 1)}?{query}").status_code == 422


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json", "/api/docs", "/api/nothing-here"])
def test_nothing_else_is_served(client, path):
    assert client.get(path).status_code == 404


def test_a_crash_answers_in_plain_json_and_gives_nothing_away(client, monkeypatch):
    def fail(*_args):
        raise RuntimeError(f"the database at {db.database_path()} fell over")

    monkeypatch.setattr(dashboard, "follow_ups", fail)
    reply = client.get("/api/dashboard")
    assert reply.status_code == 500
    assert reply.headers["content-type"].startswith("application/json")
    assert reply.json() == {"detail": "Something went wrong."}


def test_a_failed_write_changes_nothing(client, make, monkeypatch):
    deal = make.deal()

    def fail(*_args, **_values):
        raise RuntimeError("partway through")

    monkeypatch.setattr("accountable.crm.rules._make_customer", fail)
    assert client.post(f"/api/deals/{deal}/move", json={"stage": "won"}).status_code == 500
    assert client.get(f"/api/deals/{deal}").json()["stage"] == "new"
    assert client.get(f"/api/deals/{deal}/timeline").json()["total"] == 0


def test_a_write_still_works_after_one_has_failed(client, make, monkeypatch):
    """A failure must let go of the write lock, or every later save would hang."""
    deal = make.deal()
    with monkeypatch.context() as patch:

        def fail(*_args, **_values):
            raise RuntimeError("partway through")

        patch.setattr("accountable.crm.rules._make_customer", fail)
        assert client.post(f"/api/deals/{deal}/move", json={"stage": "won"}).status_code == 500
    assert client.post(f"/api/deals/{deal}/move", json={"stage": "won"}).status_code == 200
