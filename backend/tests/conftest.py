"""Every test gets its own temporary database and a fixed "today", so tests never touch real data (R6)."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from backend.app import db, settings
from backend.app.main import app

TODAY = date(2026, 11, 15)
# The API answers only to this computer's names (settings.allowed_hosts).
LOCAL = "http://localhost"


@pytest.fixture(autouse=True, scope="session")
def real_database_untouched():
    """R6: after the whole run, your own database file is exactly as it was (or still absent).
    Using the app while the tests run would change it too, so don't."""

    def snapshot():
        path = settings.DEFAULT_DB
        return (path.stat().st_size, path.stat().st_mtime_ns) if path.exists() else None

    before = snapshot()
    yield
    assert snapshot() == before, f"the tests changed {settings.DEFAULT_DB}"


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    monkeypatch.setenv("ACCOUNTABLE_TODAY", TODAY.isoformat())
    assert settings.db_path() != settings.DEFAULT_DB
    yield path
    db.dispose_all()


@pytest.fixture
def client():
    """The app on a freshly seeded database (startup seeds a new file, R3)."""
    with TestClient(app, base_url=LOCAL) as c:
        yield c


@pytest.fixture
def empty_client():
    """The app on an empty database: the schema exists, so startup doesn't seed it."""
    db.create_schema()
    with TestClient(app, base_url=LOCAL) as c:
        yield c


def make_org(c: TestClient, name: str = "Acme", **extra) -> dict:
    r = c.post("/api/organizations", json={"name": name, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def make_contact(c: TestClient, name: str = "Jane Doe", **extra) -> dict:
    r = c.post("/api/contacts", json={"name": name, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def make_deal(c: TestClient, org_id: int, name: str = "Deal", **extra) -> dict:
    body = {"name": name, "organization_id": org_id, "value_cents": 100_000, "close_date": "2026-12-31", **extra}
    r = c.post("/api/deals", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def make_activity(c: TestClient, **body) -> dict:
    r = c.post("/api/activities", json={"kind": "note", "description": "Note", **body})
    assert r.status_code == 201, r.text
    return r.json()
