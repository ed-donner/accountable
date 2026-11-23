"""Shared fixtures. Every test gets its own database file, so tests never touch
data/accountable.db (R13), and today is fixed (R4)."""

import os
from datetime import date

os.environ["ACCOUNTABLE_TESTING"] = "1"
os.environ["ACCOUNTABLE_TODAY"] = "2026-11-16"
os.environ.setdefault(
    "ACCOUNTABLE_DB",
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "pytest-unused.db"),
)

import pytest
from fastapi.testclient import TestClient

from app.db import engine_for, migrate
from app.main import app

TODAY = date(2026, 11, 16)


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    yield path
    engine_for(path.resolve()).dispose()


@pytest.fixture
def engine(db_path):
    engine = engine_for(db_path.resolve())
    migrate(engine)
    return engine


@pytest.fixture
def conn(engine):
    with engine.connect() as connection:
        yield connection


@pytest.fixture
def activity_exists(engine):
    """Whether an activity is still in the database (there's no endpoint to read one)."""
    from sqlalchemy import select

    from app.db import activities

    def check(activity_id: int) -> bool:
        with engine.connect() as connection:
            return (
                connection.scalar(select(activities.c.id).where(activities.c.id == activity_id))
                is not None
            )

    return check


@pytest.fixture
def client(engine):
    return TestClient(app, raise_server_exceptions=False)


class Api:
    """Small helpers for building test data through the API."""

    def __init__(self, client: TestClient):
        self.client = client

    def ok(self, method: str, url: str, status: int = 200, **kwargs):
        response = self.client.request(method, url, **kwargs)
        assert response.status_code == status, response.text
        return response.json() if response.content else None

    def org(self, name="Acme Ltd", **fields):
        return self.ok("POST", "/api/organizations", 201, json={"name": name, **fields})

    def contact(self, name="Ada Park", **fields):
        return self.ok("POST", "/api/contacts", 201, json={"name": name, **fields})

    def deal(self, organization_id, name="Big deal", value=1000, **fields):
        body = {
            "name": name,
            "organization_id": organization_id,
            "value": value,
            **fields,
        }
        return self.ok("POST", "/api/deals", 201, json=body)

    def activity(self, description="Called them", type="call", occurred_on="2026-11-10", **fields):
        body = {
            "type": type,
            "description": description,
            "occurred_on": occurred_on,
            **fields,
        }
        return self.ok("POST", "/api/activities", 201, json=body)

    def move(self, deal_id, stage, before_id=None, after_id=None):
        body = {"stage": stage, "before_id": before_id, "after_id": after_id}
        return self.ok("POST", f"/api/deals/{deal_id}/move", json=body)


@pytest.fixture
def api(client):
    return Api(client)
