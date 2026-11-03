"""Signing in: the local copy's own tokens and sign-in routes, and the shared app's check
of Supabase's tokens against a stand-in for the project's keys (U7, U13, U15, U16, Security).

What every route refuses, in both copies, is in test_every_route.py.
"""

import secrets
import shutil
import time
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

import pytest
from accountable import auth, db
from accountable.crm.sample_data import TEAMMATES, add_missing_teammates
from accountable.main import make_app
from accountable.users import users
from conftest import LOCAL, PROJECT, SUPABASE_PERSON, StandInKeys, bearer, local_token, using_database
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, select

ALEX, DANA, _THEO, ROBIN = TEAMMATES
RENDER_HOST = "accountable-team.onrender.com"
SIGNED_OUT = {"detail": "Sign in to use Accountable."}
NOT_FOUND = {"detail": "Not Found"}


def me(app: FastAPI, token: str, base_url: str = LOCAL):
    return TestClient(app, base_url=base_url).get("/api/me", headers=bearer(token))


@contextmanager
def checkouts() -> Generator[list[object]]:
    """Each connection taken from the pool while it's open. On Postgres each one costs round trips."""
    taken: list[object] = []

    def note(connection: object, *_details: object) -> None:
        taken.append(connection)

    pool = db.engine().pool
    event.listen(pool, "checkout", note)
    try:
        yield taken
    finally:
        event.remove(pool, "checkout", note)


def stored_people() -> list[tuple]:
    with db.reading() as conn:
        return [tuple(row) for row in conn.execute(select(users.c.id, users.c.name, users.c.email))]


# The local copy


def test_the_sign_in_screen_lists_the_four_teammates(local_app):
    reply = TestClient(local_app, base_url=LOCAL).get("/api/local/teammates")
    assert reply.status_code == 200
    assert reply.json() == [
        {"id": ALEX.id, "name": "Alex Rivera", "email": ALEX.email, "initials": "AR"},
        {"id": DANA.id, "name": "Dana Whitfield", "email": DANA.email, "initials": "DW"},
        {"id": TEAMMATES[2].id, "name": "Theo Brandt", "email": TEAMMATES[2].email, "initials": "TB"},
        {"id": ROBIN.id, "name": "robin@accountable.example", "email": ROBIN.email, "initials": "R"},
    ]


@pytest.mark.parametrize("base_url", ["http://localhost", "http://127.0.0.1"])
def test_choosing_a_teammate_gives_a_token_that_works(local_app, base_url):
    reply = TestClient(local_app, base_url=base_url).post("/api/local/sign-in", json={"user_id": DANA.id})
    assert reply.status_code == 200
    signed_in = me(local_app, reply.json()["token"], base_url)
    assert signed_in.status_code == 200
    assert signed_in.json() == {"id": DANA.id, "name": "Dana Whitfield", "email": DANA.email, "initials": "DW"}


@pytest.mark.parametrize("body", [{"user_id": "teammate-nobody"}, {"user_id": ""}, {}, {"user_id": None}])
def test_only_a_teammate_can_be_chosen(local_app, body):
    reply = TestClient(local_app, base_url=LOCAL).post("/api/local/sign-in", json=body)
    assert reply.status_code in (404, 422)
    assert "token" not in reply.json()


def test_a_database_from_before_sign_in_gets_the_teammates_as_the_local_copy_starts(database):
    assert stored_people() == []
    with TestClient(make_app(None), base_url=LOCAL) as starting:
        assert [teammate["id"] for teammate in starting.get("/api/local/teammates").json()] == [
            teammate.id for teammate in TEAMMATES
        ]


def test_signing_in_survives_a_restart(local_app):
    token = local_token(local_app, ALEX.id)
    restarted = make_app(None)
    assert me(restarted, token).json()["id"] == ALEX.id


def test_two_first_sign_ins_at_once_share_one_key(database, monkeypatch):
    """A new database's first two requests can both find no key. Only one may make it."""
    make_slowly = secrets.token_bytes

    def slowly(count: int) -> bytes:
        time.sleep(0.05)  # Long enough for the other request to find no key either
        return make_slowly(count)

    monkeypatch.setattr(secrets, "token_bytes", slowly)
    with ThreadPoolExecutor(max_workers=2) as pool:
        keys = list(pool.map(lambda _: auth.local_key(), range(2)))
    assert keys[0] == keys[1] == auth.local_key()


def test_each_database_has_its_own_key(local_app, tmp_path):
    token = local_token(local_app, ALEX.id)
    other = tmp_path / "other" / "accountable.db"
    other.parent.mkdir()
    shutil.copyfile(db.database_path(), other)
    with using_database(other):
        with db.writing() as conn:
            add_missing_teammates(conn)
        assert me(local_app, token).status_code == 401
        assert me(local_app, local_token(local_app, ALEX.id)).status_code == 200


@pytest.fixture
def reachable_from_render(database, monkeypatch) -> FastAPI:
    """The local copy where it should never be: answering at the shared app's address."""
    monkeypatch.setenv("RENDER_EXTERNAL_HOSTNAME", RENDER_HOST)
    with db.writing() as conn:
        add_missing_teammates(conn)
    return make_app(None)


def test_a_local_token_is_refused_at_any_other_address(reachable_from_render):
    token = local_token(reachable_from_render, ALEX.id)
    assert me(reachable_from_render, token).status_code == 200
    refused = me(reachable_from_render, token, base_url=f"https://{RENDER_HOST}")
    assert (refused.status_code, refused.json()) == (401, SIGNED_OUT)


def test_the_local_sign_in_isnt_there_at_any_other_address(reachable_from_render):
    elsewhere = TestClient(reachable_from_render, base_url=f"https://{RENDER_HOST}")
    assert elsewhere.get("/api/local/teammates").status_code == 404
    assert elsewhere.post("/api/local/sign-in", json={"user_id": ALEX.id}).status_code == 404


# The shared app


@pytest.fixture
def keys(supabase) -> StandInKeys:
    return supabase.key_set("current")


@pytest.fixture
def shared(database, keys, built_frontend) -> FastAPI:
    """A shared app of its own, so the test can count how often it fetches the keys."""
    return make_app(PROJECT, keys=keys, frontend=built_frontend)


@pytest.mark.parametrize("kid", ["current", "rsa"])
def test_a_good_token_works_and_adds_the_person(shared_app, database, supabase, kid):
    reply = me(shared_app, supabase.token(kid))
    assert reply.status_code == 200
    assert reply.json() == {**SUPABASE_PERSON, "initials": "PQ"}
    assert stored_people() == [(SUPABASE_PERSON["id"], "Pat Quinn", SUPABASE_PERSON["email"])]


def test_a_changed_name_or_email_is_taken_from_the_next_token(shared_app, database, supabase):
    me(shared_app, supabase.token())
    renamed = supabase.token(email="pat@team.example", user_metadata={"display_name": "Patricia Quinn"})
    assert me(shared_app, renamed).json()["name"] == "Patricia Quinn"
    assert stored_people() == [(SUPABASE_PERSON["id"], "Patricia Quinn", "pat@team.example")]
    assert me(shared_app, supabase.token()).json()["name"] == "Pat Quinn"
    assert stored_people() == [(SUPABASE_PERSON["id"], "Pat Quinn", SUPABASE_PERSON["email"])]


def test_someone_already_seen_costs_the_sign_in_check_no_trip_to_the_database(copy):
    client = copy.client()
    assert client.get("/api/meta").status_code == 200
    with checkouts() as taken:
        # The meta route reads nothing itself, so any connection taken would be the check's.
        assert client.get("/api/meta").status_code == 200
    assert taken == []


def test_after_a_restart_someone_already_in_the_users_table_still_gets_in(copy):
    client = copy.client()
    first = client.get("/api/me").json()
    people = stored_people()
    db.dispose()  # As a restart does: a new engine, with nobody seen yet
    assert client.get("/api/me").json() == first
    assert stored_people() == people


def test_someone_with_no_display_name_goes_by_their_email(shared_app, database, supabase):
    reply = me(shared_app, supabase.token(user_metadata={})).json()
    assert (reply["name"], reply["initials"]) == (SUPABASE_PERSON["email"], "P")


@pytest.mark.parametrize(
    "metadata, name",
    [
        ({"display_name": "Pat Quinn"}, "Pat Quinn"),
        ({"full_name": "Pat Quinn"}, "Pat Quinn"),
        ({"name": "Pat", "display_name": "Pat Quinn"}, "Pat"),
        ({"name": "  ", "displayName": " Pat Quinn "}, "Pat Quinn"),
        ({"fullName": "Pat Quinn", "avatar_url": "https://example.com/pat.png"}, "Pat Quinn"),
        ({"display_name": 42}, None),
        ({}, None),
        (None, None),
        ("Pat Quinn", None),
    ],
)
def test_the_name_is_the_one_supabases_dashboard_shows(metadata, name):
    assert auth.display_name(metadata) == name


def test_the_keys_are_fetched_once_for_many_requests(shared, keys, supabase):
    for _ in range(5):
        assert me(shared, supabase.token()).status_code == 200
    assert keys.fetches == 1


def test_the_keys_are_kept_however_long_the_app_runs(keys, supabase, monkeypatch):
    token = supabase.token()
    keys.get_signing_key_from_jwt(token)
    a_day_later = time.monotonic() + 24 * 60 * 60
    monkeypatch.setattr(time, "monotonic", lambda: a_day_later)
    keys.get_signing_key_from_jwt(token)
    assert keys.fetches == 1


def test_a_key_it_hasnt_seen_fetches_the_keys_once_more(shared, keys, supabase):
    assert me(shared, supabase.token("current")).status_code == 200
    keys.served = [supabase.public_key("current"), supabase.public_key("next")]  # Supabase rotates its keys
    for _ in range(3):
        assert me(shared, supabase.token("next")).status_code == 200
    assert keys.fetches == 2


def test_made_up_key_ids_dont_keep_it_fetching(shared, keys, supabase):
    me(shared, supabase.token())
    for number in range(5):
        assert me(shared, supabase.token(f"made-up-{number}", elsewhere=True)).status_code == 401
    assert keys.fetches <= 2


def test_keys_that_cant_be_fetched_refuse_the_request(shared, keys, supabase):
    keys.reachable = False
    reply = me(shared, supabase.token())
    assert (reply.status_code, reply.json()) == (503, {"detail": "Can't check your sign-in right now."})
    assert stored_people() == []


def test_keys_already_fetched_keep_working_while_supabase_is_down(shared, keys, supabase):
    me(shared, supabase.token())
    keys.reachable = False
    assert me(shared, supabase.token()).status_code == 200


def test_the_shared_app_has_no_local_sign_in(shared_app, database, supabase):
    """Signed out, it's refused like any address under /api. Signed in, it isn't there."""
    signed_out = TestClient(shared_app, base_url=LOCAL)
    signed_in = TestClient(shared_app, base_url=LOCAL, headers=bearer(supabase.token()))
    for client, refusal in ((signed_out, (401, SIGNED_OUT)), (signed_in, (404, NOT_FOUND))):
        for reply in (
            client.get("/api/local/teammates"),
            client.post("/api/local/sign-in", json={"user_id": ALEX.id}),
        ):
            assert (reply.status_code, reply.json()) == refusal
    assert not [route for route in shared_app.routes if "/local" in getattr(route, "path", "")]


def test_the_key_set_comes_from_the_projects_own_address():
    keys = auth.SupabaseKeys(PROJECT)
    assert keys.uri == "https://stand-in-project.supabase.co/auth/v1/.well-known/jwks.json"
