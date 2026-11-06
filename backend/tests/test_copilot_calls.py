"""The Copilot's calls to the app's own routes, as the person who asked (Z11, U10, Security).

Each call runs the whole app in process, so the tests run it on both copies, with the checks
every request meets, and with a stand-in app where they look at what a call sends.
"""

import asyncio
from contextlib import contextmanager
from typing import Any

import pytest
from accountable import db, users
from accountable.api import MAX_ID
from accountable.auth import SIGNED_OUT
from accountable.copilot.calls import NO_ADDRESS, Caller, NotAnId, OutOfReach, Route
from accountable.crm.tables import deals, stage_changes
from conftest import SUPABASE_PERSON, THIS_COMPUTER, TODAY, bearer
from sqlalchemy import func, select
from starlette.requests import Request

ELSEWHERE = ("203.0.113.7", 50000)


def asking(app: Any, authorization: str | None, *, host: str = "localhost:5173", client=THIS_COMPUTER) -> Request:
    """The request that asked the Copilot, as the chat route would be given it."""
    headers = [(b"host", host.encode())]
    if authorization is not None:
        headers.append((b"authorization", authorization.encode()))
    scope = {
        "type": "http",
        "app": app,
        "method": "POST",
        "scheme": "http",
        "path": "/api/copilot/chat",
        "root_path": "",
        "query_string": b"",
        "headers": headers,
        "client": client,
        "server": ("127.0.0.1", 8765),
    }
    return Request(scope)


def caller(app: Any, authorization: str | None, **asked: Any) -> Caller:
    return Caller.from_request(asking(app, authorization, **asked), TODAY)


def person_of(copy) -> str | None:
    return users.TEAMMATES[0].name if copy.name == "local copy" else SUPABASE_PERSON["name"]


# As the person, in both copies


def test_a_call_reads_as_the_person(copy):
    reply = asyncio.run(caller(copy.app, bearer(copy.sign())["Authorization"]).get("/api/me"))
    assert reply.ok
    assert reply.data["name"] == person_of(copy)


def test_a_deal_added_through_a_call_is_put_down_to_the_person(copy, make):
    organization = make.organization("Harbor & Pine")
    contact = make.contact("Sam Carter", organization_id=organization)
    body = {"name": "Harbor & Pine renewal", "organization_id": organization, "main_contact_id": contact}
    added = asyncio.run(
        caller(copy.app, bearer(copy.sign())["Authorization"]).post(
            "/api/deals", {**body, "value": 24000, "close_date": "2026-11-30"}
        )
    )
    assert added.status == 201, added.data
    assert added.data["created_by"]["name"] == person_of(copy)
    assert added.data["updated_by"]["name"] == person_of(copy)


def test_a_call_without_a_good_token_is_refused_as_the_persons_would_be(copy):
    for name, headers in copy.refused().items():
        reply = asyncio.run(caller(copy.app, headers.get("Authorization")).get("/api/me"))
        assert (reply.status, reply.data) == (401, {"detail": SIGNED_OUT}), name


def test_a_refusal_comes_back_in_the_apis_words(api):
    token = api.headers["Authorization"]
    missing = asyncio.run(caller(api.app, token).get("/api/deals/999"))
    assert (missing.ok, missing.status, missing.data) == (False, 404, {"detail": "Deal not found"})
    unnamed = asyncio.run(caller(api.app, token).post("/api/organizations", {"name": " "}))
    assert unnamed.status == 422
    assert unnamed.data["fields"] == {"name": "Enter a name"}


# Where a call comes from


def test_in_the_local_copy_a_call_from_elsewhere_doesnt_count_as_from_this_computer(api):
    token = api.headers["Authorization"]
    assert asyncio.run(caller(api.app, token).get("/api/me")).ok
    assert asyncio.run(caller(api.app, token, client=ELSEWHERE).get("/api/me")).status == 401
    assert asyncio.run(caller(api.app, token, client=None).get("/api/me")).status == 401


def test_a_call_keeps_the_host_it_was_asked_at(api):
    token = api.headers["Authorization"]
    reply = asyncio.run(caller(api.app, token, host="accountable.example").get("/api/me"))
    assert reply.status == 400


def test_a_request_with_no_client_address_seems_to_come_from_no_address():
    asked = asking("the app", "Bearer token", client=None)
    assert Caller.from_request(asked, TODAY).client == NO_ADDRESS


# Writes


def test_a_write_takes_the_write_lock_and_20_at_once_still_renumber_a_column_in_order(api, make, monkeypatch):
    """SQLite queues writes by itself, which hides a race, so the test also watches each write take the lock."""
    organization = make.organization("Harbor & Pine")
    contact = make.contact("Sam Carter", organization_id=organization)
    links = {"organization_id": organization, "main_contact_id": contact}
    column = [make.deal(f"Deal {number}", stage="proposal", **links) for number in range(10)]
    moving = [make.deal(f"Mover {number}", stage="new", **links) for number in range(20)]
    locked = []
    writing = db.writing

    @contextmanager
    def watched():
        with writing() as conn:
            locked.append(db._write_lock.locked())
            yield conn

    monkeypatch.setattr(db, "writing", watched)
    asked = caller(api.app, api.headers["Authorization"])

    async def move_every_one():
        body = {"stage": "proposal", "before_deal_id": column[5]}
        return await asyncio.gather(*(asked.post(Caller.path("/api/deals/{}/move", deal), body) for deal in moving))

    assert all(reply.ok for reply in asyncio.run(move_every_one()))
    assert locked == [True] * 20
    with db.reading() as conn:
        places = conn.execute(select(deals.c.position).where(deals.c.stage == "proposal")).scalars().all()
        moves = conn.execute(select(func.count()).select_from(stage_changes)).scalar_one()
    assert sorted(places) == list(range(30))
    assert moves == 20


# The paths a call may take


@pytest.mark.parametrize(
    "value", ["12", 12.0, 12.5, True, 0, -1, MAX_ID + 1, None, "12/../settings"], ids=lambda value: repr(value)
)
def test_a_path_takes_only_a_whole_number(value):
    with pytest.raises(NotAnId):
        Caller.path("/api/deals/{}", value)


def test_a_path_fills_each_place_in_turn():
    assert Caller.path("/api/deals/{}", 12) == "/api/deals/12"
    assert Caller.path("/api/deals/{deal_id}/timeline", MAX_ID) == f"/api/deals/{MAX_ID}/timeline"
    assert Caller.path("/api/invoices/{}/payments/{}", 7, 3) == "/api/invoices/7/payments/3"
    with pytest.raises(NotAnId):
        Caller.path("/api/deals/{}", 7, 3)
    with pytest.raises(NotAnId):
        Caller.path("/api/deals/{}")


class StandInApp:
    """Answers every request with the same reply, keeping what each one sent."""

    def __init__(self, body: bytes = b'{"found": true}', content_type: bytes = b"application/json") -> None:
        self.body = body
        self.content_type = content_type
        self.seen: list[dict[str, Any]] = []

    async def __call__(self, scope, receive, send) -> None:
        self.seen.append(scope)
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", self.content_type)]})
        await send({"type": "http.response.body", "body": self.body})


def test_a_call_sends_the_persons_header_host_and_address():
    app = StandInApp()
    reply = asyncio.run(caller(app, "Bearer the-persons-token").get("/api/search", {"q": "harbor"}))
    assert (reply.status, reply.data) == (200, {"found": True})
    [sent] = app.seen
    headers = dict(sent["headers"])
    assert (sent["method"], sent["path"], sent["query_string"]) == ("GET", "/api/search", b"q=harbor")
    assert headers[b"authorization"] == b"Bearer the-persons-token"
    assert headers[b"host"] == b"localhost:5173"
    assert tuple(sent["client"]) == THIS_COMPUTER


def test_a_call_with_no_token_sends_none():
    app = StandInApp()
    asyncio.run(caller(app, None).get("/api/me"))
    assert b"authorization" not in dict(app.seen[0]["headers"])


def test_query_values_leave_out_none_and_repeat_a_list():
    app = StandInApp()
    params = {"account": ["revenue", "software"], "from": None, "q": "rent & rates"}
    asyncio.run(caller(app, "Bearer token").get("/api/books/entries", params))
    assert app.seen[0]["query_string"] == b"account=revenue&account=software&q=rent+%26+rates"


def test_a_reply_that_isnt_json_has_no_data():
    reply = asyncio.run(caller(StandInApp(b"%PDF-1.7", b"application/pdf"), "Bearer token").get("/api/quotes/1/pdf"))
    assert (reply.ok, reply.data) == (True, None)


@pytest.mark.parametrize(
    "path",
    [
        "/settings",
        "/api",
        "/api/",
        "/api/../settings",
        "/api/deals/",
        "/api/deals?stage=won",
        "/api/deals#won",
        "/api/deals/12/../../settings",
        "//openrouter.ai/api/v1",
        "http://openrouter.ai/api/v1/chat/completions",
        "/api/deals/%2e%2e",
    ],
)
def test_nothing_outside_the_api_is_called(path):
    app = StandInApp()
    asked = caller(app, "Bearer token")
    with pytest.raises(OutOfReach):
        asyncio.run(asked.get(path))
    with pytest.raises(OutOfReach):
        asyncio.run(asked.patch(path, {"stage": "won"}))
    assert app.seen == []


def test_a_caller_limited_to_a_tools_routes_reaches_only_those():
    app = StandInApp()
    limited = caller(app, "Bearer token").limited_to(
        [Route("GET", "/api/deals/{deal_id}"), Route("PATCH", "/api/deals/{deal_id}")]
    )
    asyncio.run(limited.get("/api/deals/12"))
    asyncio.run(limited.patch("/api/deals/12", {"stage": "won"}))
    for method, path in [
        ("GET", "/api/deals"),
        ("GET", "/api/deals/12/timeline"),
        ("GET", "/api/deals/0"),
        ("GET", "/api/deals/twelve"),
        ("GET", "/api/organizations/12"),
        ("POST", "/api/deals/12"),
    ]:
        call = limited.get(path) if method == "GET" else limited.post(path, {})
        with pytest.raises(OutOfReach):
            asyncio.run(call)
    assert [(sent["method"], sent["path"]) for sent in app.seen] == [
        ("GET", "/api/deals/12"),
        ("PATCH", "/api/deals/12"),
    ]
