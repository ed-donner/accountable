"""Shared fixtures. Each test gets a new temporary database and a frozen clock:
today is Thursday 2026-11-19, and now is 2026-11-19T15:00:00Z."""

import json
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import clock
from backend.app.config import Settings
from backend.app.main import create_app

ROOT = Path(__file__).resolve().parents[2]
TODAY = date(2026, 11, 19)
NOW = datetime(2026, 11, 19, 15, 0, 0, tzinfo=timezone.utc)
RULE_CASES = json.loads((ROOT / "frontend" / "src" / "lib" / "rules-cases.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def frozen_clock():
    clock.freeze(TODAY, NOW)
    yield
    clock.unfreeze()


def local_client(app) -> TestClient:
    """A test client that calls the app at 127.0.0.1, as the browser does. The
    app refuses any other host, including TestClient's own "testserver"."""
    return TestClient(app, base_url="http://127.0.0.1")


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(db_path=tmp_path / "test.db", api_port=8000, web_port=5173)


@pytest.fixture
def client(settings):
    """A test client for an empty database."""
    app = create_app(settings, seed_new=False)
    with local_client(app) as test_client:
        yield test_client


@pytest.fixture
def seeded_client(settings):
    """A test client for a database with the sample data."""
    app = create_app(settings, seed_new=True)
    with local_client(app) as test_client:
        yield test_client


@pytest.fixture
def engine(client):
    """The engine behind the client, for checking what's stored."""
    return client.app.state.engine


# Helpers that add records through the API, as the app does.


def ok(response, status=200):
    assert response.status_code == status, response.text
    return response.json() if response.content else None


def add_org(client, name="Bluefin Logistics", **fields) -> dict:
    return ok(client.post("/api/organizations", json={"name": name, **fields}), 201)


def add_contact(client, name="Sarah Chen", **fields) -> dict:
    return ok(client.post("/api/contacts", json={"name": name, **fields}), 201)


def add_deal(client, organization_id, name="Website redesign", stage="proposal", value=48500, **fields) -> dict:
    body = {"name": name, "organization_id": organization_id, "stage": stage, "value": value, **fields}
    if "close_date" not in body and stage not in ("won", "lost"):
        body["close_date"] = "2026-12-12"
    return ok(client.post("/api/deals", json=body), 201)


def log(client, description="Walked through the scope.", type="call", occurred_at="2026-11-10T15:15:00Z", **fields):
    body = {"type": type, "description": description, "occurred_at": occurred_at, **fields}
    return ok(client.post("/api/activities", json=body), 201)


def patch_deal(client, deal_id, **fields) -> dict:
    return ok(client.patch(f"/api/deals/{deal_id}", json=fields))


def move(client, deal_id, stage, before_id=None) -> dict:
    return ok(client.post(f"/api/deals/{deal_id}/move", json={"stage": stage, "before_id": before_id}))


def column(client, stage) -> list[tuple[int, int]]:
    """(id, position) for every deal at a stage, hidden or not, top to bottom."""
    deals = [d for d in ok(client.get("/api/deals")) if d["stage"] == stage]
    return [(d["id"], d["position"]) for d in sorted(deals, key=lambda d: (d["position"], d["id"]))]


def column_ids(client, stage) -> list[int]:
    return [deal_id for deal_id, _ in column(client, stage)]


def assert_numbered(client, *stages):
    """Each column is numbered 0 to n-1, with no gaps."""
    for stage in stages:
        positions = [position for _, position in column(client, stage)]
        assert positions == list(range(len(positions))), (stage, positions)


def field_errors(response) -> dict[str, str]:
    """A 422's messages by field, such as {"name": "Enter a name."}."""
    assert response.status_code == 422, response.text
    return {error["loc"][-1]: error["msg"] for error in response.json()["detail"]}


def stage_changes(client, deal_id) -> list[dict]:
    return [e for e in ok(client.get(f"/api/deals/{deal_id}/timeline")) if e["type"] == "stage_change"]
