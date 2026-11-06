"""Rules every route has to keep, in the local copy and in the shared app. The routes
come from the app itself, so a route added later is held to them without anyone
remembering to add it here.
"""

import io
import json
import re
from typing import Any
from urllib.parse import urlencode

import pytest
from accountable import db, main
from accountable.api import MAX_ID
from accountable.company.tables import company_logo
from accountable.crm.routers import dashboard
from accountable.main import app
from conftest import LOCAL, THIS_COMPUTER
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import insert

SIGNED_OUT = {"detail": "Sign in to use Accountable."}
TOO_BIG = MAX_ID + 1
# What a website can send from a form or a plain fetch, with no permission asked first.
SIMPLE_TYPES = ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]
OPEN_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000", "https://evil.example", "null"]
NOT_RECORDS = [b"{", b"", b"[]", b"null", b'"text"', b"12"]
JSON = {"content-type": "application/json"}


def routes(of: FastAPI) -> list[tuple[str, str]]:
    return sorted((method.upper(), path) for path, operations in of.openapi()["paths"].items() for method in operations)


# The local copy's own sign-in, the only routes that need no token, and that the shared app doesn't have.
LOCAL_SIGN_IN = [(method, path) for method, path in routes(app) if path.startswith("/api/local/")]
# Every route that needs a token, the same in both copies.
ROUTES = [route for route in routes(app) if route not in LOCAL_SIGN_IN]
WRITES = [(method, path) for method, path in ROUTES if method in ("POST", "PATCH")]
RECORD_ROUTES = [(method, path) for method, path in ROUTES if "{" in path]
READS = [(method, path) for method, path in ROUTES if method == "GET" and "{" not in path]
TIMELINES = [path for method, path in ROUTES if path.endswith("/timeline")]


def with_id(path: str, value: object) -> str:
    """The path with this value for every id in it, such as a payment's and its invoice's."""
    return re.sub(r"\{[^}]+\}", str(value), path)


# A body each route can read, so a test of its id or its record reaches the route's own
# checks rather than stopping at a field the body needs. The rest take {}.
SAMPLE_BODIES: dict[tuple[str, str], dict[str, Any]] = {
    ("POST", "/api/deals/{deal_id}/move"): {"stage": "new"},
    ("POST", "/api/invoices"): {"deal_id": 1},
    ("POST", "/api/invoices/from-quote/{quote_id}"): {},
    ("POST", "/api/invoices/{invoice_id}/payments"): {"paid_on": "2026-10-01", "amount_cents": 100, "method": "card"},
}


def sample_body(method: str, path: str) -> dict[str, Any]:
    return SAMPLE_BODIES.get((method, path), {})


DESCRIBED = app.openapi()
# A made-up value for each type of query parameter a route can require, such as search's q.
SAMPLE_QUERY_VALUES = {"string": "harbor", "integer": "1"}
# A value a route's own check takes, where it needs one. The fixed today is Oct 31, 2026,
# so November is a forecast month.
SAMPLE_QUERIES = {("GET", "/api/cash-flow/expected"): {"month": "2026-11"}}
# Text JSON can carry that a database can't store: Postgres refuses a NUL character
# outright, and neither database can encode half of a two-part character.
UNSTORABLE_TEXT = {"a NUL character": "Harbor\x00Pine", "half of a two-part character": "\ud800"}


def query_parameters(method: str, path: str) -> list[dict[str, Any]]:
    parameters = DESCRIBED["paths"][path][method.lower()].get("parameters", [])
    return [parameter for parameter in parameters if parameter["in"] == "query"]


def target(method: str, path: str) -> str:
    """An address that reaches the route: id 1 for a record, and a value for each query parameter it requires."""
    samples = SAMPLE_QUERIES.get((method, path), {})
    required = {
        parameter["name"]: samples.get(parameter["name"], SAMPLE_QUERY_VALUES[parameter["schema"]["type"]])
        for parameter in query_parameters(method, path)
        if parameter.get("required")
    }
    address = with_id(path, 1) if "{" in path else path
    return f"{address}?{urlencode(required)}" if required else address


def is_text(schema: dict[str, Any]) -> bool:
    return schema.get("type") == "string" or any(is_text(choice) for choice in schema.get("anyOf", []))


def body_text_fields(method: str, path: str) -> list[str]:
    """The text fields in the route's request body, dates and choices included, as the app describes them."""
    body = DESCRIBED["paths"][path][method.lower()].get("requestBody")
    if body is None:
        return []
    name = body["content"]["application/json"]["schema"]["$ref"].rsplit("/", 1)[-1]
    fields = DESCRIBED["components"]["schemas"][name]["properties"]
    return [field for field, schema in fields.items() if is_text(schema)]


BODY_TEXT = [(method, path, field) for method, path in WRITES for field in body_text_fields(method, path)]
LOCAL_SIGN_IN_TEXT = [
    (method, path, field) for method, path in LOCAL_SIGN_IN for field in body_text_fields(method, path)
]
QUERY_TEXT = [
    (method, path, parameter["name"])
    for method, path in ROUTES
    for parameter in query_parameters(method, path)
    if is_text(parameter["schema"])
]


@pytest.fixture
def client(copy) -> TestClient:
    """Signed in, in each copy in turn, and answering as the real server does, so a crash shows as a 500."""
    return copy.client()


def test_the_routes_were_found():
    assert ("POST", "/api/deals/{deal_id}/move") in ROUTES
    assert ("GET", "/api/meta") in ROUTES
    assert ("GET", "/api/search") in ROUTES
    assert ("GET", "/api/settings") in READS
    assert ("PATCH", "/api/settings") in WRITES
    assert ("PATCH", "/api/settings", "company_name") in BODY_TEXT
    assert ("PATCH", "/api/settings", "tax_rate") in BODY_TEXT
    assert target("GET", "/api/search") == "/api/search?q=harbor"
    assert ("POST", "/api/organizations", "name") in BODY_TEXT
    assert ("PATCH", "/api/activities/{activity_id}", "description") in BODY_TEXT
    assert ("PATCH", "/api/products/{product_id}") in ROUTES
    assert ("PATCH", "/api/products/{product_id}", "description") in BODY_TEXT
    assert ("GET", "/api/invoices/money") in READS
    assert ("PATCH", "/api/invoices/{invoice_id}", "bill_to") in BODY_TEXT
    assert ("POST", "/api/invoices/{invoice_id}/issue", "bill_to") in BODY_TEXT
    assert ("POST", "/api/invoices/{invoice_id}/void") in WRITES
    assert ("POST", "/api/invoices/from-quote/{quote_id}") in WRITES
    assert ("POST", "/api/invoices/{invoice_id}/payments", "reference") in BODY_TEXT
    assert ("POST", "/api/invoices/{invoice_id}/payments", "method") in BODY_TEXT
    assert ("POST", "/api/invoices/{invoice_id}/payments", "paid_on") in BODY_TEXT
    assert ("DELETE", "/api/invoices/{invoice_id}/payments/{payment_id}") in RECORD_ROUTES
    assert ("DELETE", "/api/invoices/{invoice_id}") in RECORD_ROUTES
    assert ("GET", "/api/invoices/{invoice_id}/pdf") in RECORD_ROUTES
    assert ("GET", "/api/settings/logo") in READS
    assert ("PATCH", "/api/settings", "logo") in BODY_TEXT
    assert ("PATCH", "/api/settings", "accent_color") in BODY_TEXT
    assert with_id("/api/invoices/{invoice_id}/payments/{payment_id}", 7) == "/api/invoices/7/payments/7"
    assert not [path for method, path in ROUTES if method == "DELETE" and path.startswith("/api/products")]
    for route in [
        ("GET", "/api/quotes"),
        ("POST", "/api/quotes"),
        ("GET", "/api/quotes/new/{deal_id}"),
        ("GET", "/api/quotes/{quote_id}"),
        ("PATCH", "/api/quotes/{quote_id}"),
        ("POST", "/api/quotes/{quote_id}/send"),
        ("POST", "/api/quotes/{quote_id}/accept"),
        ("POST", "/api/quotes/{quote_id}/decline"),
        ("POST", "/api/quotes/{quote_id}/copy"),
        ("GET", "/api/quotes/{quote_id}/pdf"),
    ]:
        assert route in ROUTES, route
    assert ("POST", "/api/quotes", "valid_until") in BODY_TEXT
    assert ("PATCH", "/api/quotes/{quote_id}", "valid_until") in BODY_TEXT
    assert not [path for method, path in ROUTES if method == "DELETE" and path.startswith("/api/quotes")]
    assert ("DELETE", "/api/bills/{bill_id}") in RECORD_ROUTES
    assert ("PATCH", "/api/bills/{bill_id}", "paid_on") in BODY_TEXT
    assert ("POST", "/api/bills", "bill_number") in BODY_TEXT
    assert ("GET", "/api/bills/dashboard") in READS
    assert ("GET", "/api/cash-flow") in READS
    assert ("GET", "/api/cash-flow/expected") in READS
    assert target("GET", "/api/cash-flow/expected") == "/api/cash-flow/expected?month=2026-11"
    for route in [
        ("GET", "/api/books/balances"),
        ("GET", "/api/books/months"),
        ("GET", "/api/books/entries"),
    ]:
        assert route in READS, route
    assert QUERY_TEXT == [
        ("GET", "/api/books/balances", "on"),
        ("GET", "/api/books/entries", "account"),
        ("GET", "/api/books/entries", "from"),
        ("GET", "/api/books/entries", "to"),
        ("GET", "/api/books/months", "from"),
        ("GET", "/api/books/months", "to"),
        ("GET", "/api/cash-flow/expected", "month"),
        ("GET", "/api/search", "q"),
    ]
    assert LOCAL_SIGN_IN_TEXT == [("POST", "/api/local/sign-in", "user_id")]
    assert len(RECORD_ROUTES) > 15
    assert LOCAL_SIGN_IN == [("GET", "/api/local/teammates"), ("POST", "/api/local/sign-in")]


def test_the_shared_app_has_every_route_but_the_local_sign_in(shared_app):
    assert routes(shared_app) == ROUTES


@pytest.mark.parametrize("method, path", ROUTES)
def test_every_route_refuses_anyone_not_signed_in(copy, method, path):
    for way, headers in copy.refused().items():
        reply = copy.client(headers).request(method, target(method, path), json={})
        assert (reply.status_code, reply.json()) == (401, SIGNED_OUT), way


@pytest.mark.parametrize("method, path", WRITES)
def test_a_write_refuses_anyone_not_signed_in_whatever_its_body(copy, method, path):
    """The token is checked before the body is read, so no body can get a different answer."""
    sent = [(way, headers, b"{", "application/json") for way, headers in copy.refused().items()]
    sent += [("no token", {}, body, "application/json") for body in NOT_RECORDS]
    sent += [("no token", {}, b'{"name": "Planted"}', kind) for kind in SIMPLE_TYPES]
    for way, headers, body, kind in sent:
        reply = copy.client(headers).request(method, target(method, path), content=body, headers={"content-type": kind})
        assert (reply.status_code, reply.json()) == (401, SIGNED_OUT), (way, body, kind)


@pytest.mark.parametrize("path", ["/api", "/api/nothing-here", "/api/docs", "/api/local", "/api/meta/"])
def test_an_unknown_api_address_refuses_anyone_not_signed_in(copy, path):
    for way, headers in copy.refused().items():
        reply = copy.client(headers).get(path)
        assert (reply.status_code, reply.json()) == (401, SIGNED_OUT), way


@pytest.mark.parametrize("method, path", ROUTES)
def test_a_good_token_gets_past_the_check(copy, method, path):
    assert copy.client().request(method, target(method, path), json={}).status_code != 401


@pytest.mark.parametrize("method, path", RECORD_ROUTES)
@pytest.mark.parametrize("value", [TOO_BIG, -TOO_BIG, 10**30, 0, -1, "abc", "1.5"])
def test_an_id_that_cant_be_a_record_is_refused(client, method, path, value):
    assert client.request(method, with_id(path, value), json=sample_body(method, path)).status_code == 422


@pytest.mark.parametrize("method, path", RECORD_ROUTES)
def test_the_largest_possible_id_is_simply_missing(client, method, path):
    assert client.request(method, with_id(path, MAX_ID), json=sample_body(method, path)).status_code == 404


@pytest.mark.parametrize("method, path", WRITES)
@pytest.mark.parametrize("content_type", SIMPLE_TYPES)
def test_no_write_accepts_a_body_a_website_could_send_unasked(client, method, path, content_type):
    reply = client.request(
        method, target(method, path), content='{"name": "Planted"}', headers={"content-type": content_type}
    )
    assert reply.status_code == 415


@pytest.mark.parametrize("method, path", WRITES)
@pytest.mark.parametrize("body", NOT_RECORDS)
def test_no_write_crashes_on_a_body_that_isnt_a_record(client, method, path, body):
    reply = client.request(method, target(method, path), content=body, headers={"content-type": "application/json"})
    assert reply.status_code in (404, 422)


@pytest.mark.parametrize("method, path, field", BODY_TEXT)
@pytest.mark.parametrize("kind", UNSTORABLE_TEXT)
def test_text_the_database_cant_store_is_refused_in_every_body(client, method, path, field, kind):
    body = json.dumps({field: UNSTORABLE_TEXT[kind]})
    reply = client.request(method, target(method, path), content=body, headers={"content-type": "application/json"})
    assert reply.status_code == 422
    assert field in reply.json()["fields"]


@pytest.mark.parametrize("method, path, field", LOCAL_SIGN_IN_TEXT)
@pytest.mark.parametrize("kind", UNSTORABLE_TEXT)
def test_the_local_sign_in_refuses_text_the_database_cant_store(local_app, method, path, field, kind):
    client = TestClient(local_app, base_url=LOCAL, client=THIS_COMPUTER)
    reply = client.request(method, path, content=json.dumps({field: UNSTORABLE_TEXT[kind]}), headers=JSON)
    assert reply.status_code == 422
    assert field in reply.json()["fields"]


@pytest.mark.parametrize("method, path, name", QUERY_TEXT)
def test_a_nul_character_is_refused_in_every_query(client, method, path, name):
    address = with_id(path, 1) if "{" in path else path
    reply = client.request(method, f"{address}?{urlencode({name: UNSTORABLE_TEXT['a NUL character']})}")
    assert reply.status_code == 422
    assert name in reply.json()["fields"]


@pytest.fixture
def a_logo(database) -> None:
    """So the logo's route has a file to send, as every other read has its reply."""
    made = io.BytesIO()
    Image.new("RGB", (2, 1)).save(made, "PNG")
    with db.writing() as conn:
        conn.execute(
            insert(company_logo).values(id=1, image=made.getvalue(), media_type="image/png", width=2, height=1)
        )


@pytest.mark.parametrize("method, path", READS)
@pytest.mark.parametrize("origin", OPEN_ORIGINS)
def test_no_read_lets_another_origin_see_the_reply(client, a_logo, method, path, origin):
    reply = client.get(target(method, path), headers={"origin": origin})
    assert reply.status_code == 200
    assert not [name for name in reply.headers if name.lower().startswith("access-control-")]


@pytest.mark.parametrize("method, path", ROUTES)
def test_no_route_agrees_to_a_cross_origin_request(client, method, path):
    reply = client.options(
        target(method, path), headers={"origin": "http://localhost:3000", "access-control-request-method": method}
    )
    assert reply.status_code >= 400
    assert not [name for name in reply.headers if name.lower().startswith("access-control-")]


@pytest.mark.parametrize("method, path", ROUTES)
def test_a_wrong_host_is_refused_everywhere(copy, method, path):
    reply = copy.client(base_url="http://evil.example").request(method, target(method, path), json={})
    assert reply.status_code == 400


@pytest.mark.parametrize("method, path", WRITES)
def test_a_body_over_2_mb_is_refused_on_every_write(client, method, path):
    body = json.dumps({"bill_to": "x" * main.MAX_BODY_BYTES})
    reply = client.request(method, target(method, path), content=body, headers=JSON)
    assert (reply.status_code, reply.json()) == (413, {"detail": "That's too big to send."})


def chunks(body: bytes, size: int = 64 * 1024):
    """A body sent in pieces, with no Content-Length, as a stream is."""
    for start in range(0, len(body), size):
        yield body[start : start + size]


def test_a_body_over_2_mb_is_refused_without_a_content_length(client):
    body = json.dumps({"name": "x" * main.MAX_BODY_BYTES}).encode()
    reply = client.post("/api/organizations", content=chunks(body), headers=JSON)
    assert "content-length" not in reply.request.headers
    assert reply.status_code == 413


def test_a_body_just_under_2_mb_gets_through(client):
    padding = main.MAX_BODY_BYTES - len(json.dumps({"name": "Harbor & Pine", "notes": ""}))
    body = json.dumps({"name": "Harbor & Pine", "notes": "x" * padding}).encode()
    assert len(body) == main.MAX_BODY_BYTES
    reply = client.post("/api/organizations", content=chunks(body), headers=JSON)
    assert reply.status_code == 201
    assert len(reply.json()["notes"]) == padding


def test_a_body_over_2_mb_without_a_token_is_still_refused_for_the_token(copy):
    body = json.dumps({"name": "x" * main.MAX_BODY_BYTES})
    reply = copy.client({}).post("/api/organizations", content=body, headers=JSON)
    assert (reply.status_code, reply.json()) == (401, SIGNED_OUT)


@pytest.mark.parametrize("method, path", LOCAL_SIGN_IN)
def test_the_local_sign_in_keeps_the_same_rules(local_app, method, path):
    client = TestClient(local_app, base_url=LOCAL, client=THIS_COMPUTER)
    assert TestClient(local_app, base_url="http://evil.example").request(method, path, json={}).status_code == 400
    preflight = client.options(
        path, headers={"origin": "http://localhost:3000", "access-control-request-method": method}
    )
    assert preflight.status_code >= 400
    reply = client.request(method, path, json={}, headers={"origin": "https://evil.example"})
    assert not [name for name in [*reply.headers, *preflight.headers] if name.lower().startswith("access-control-")]
    if method == "POST":
        sent_as_a_form = client.post(path, content='{"user_id": "x"}', headers={"content-type": "text/plain"})
        assert sent_as_a_form.status_code == 415


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


@pytest.mark.parametrize("path", ["/api/docs", "/api/redoc", "/api/openapi.json", "/api/nothing-here", "/api"])
def test_nothing_else_is_served_under_api(client, path):
    reply = client.get(path)
    assert (reply.status_code, reply.json()) == (404, {"detail": "Not Found"})


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_the_api_isnt_described_anywhere(client, built_frontend, path):
    """The local copy serves nothing outside /api, and the shared app serves its page."""
    reply = client.get(path)
    assert reply.status_code == 404 or reply.text == (built_frontend / "index.html").read_text()


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
