"""Startup and database location (R3, R6, D2)."""

import os

from fastapi.testclient import TestClient

from backend.app import db, settings
from backend.app.main import app


def test_new_database_file_is_created_and_seeded(isolated_db):  # R3
    assert not isolated_db.exists()
    with TestClient(app) as c:
        assert isolated_db.exists()
        assert len(c.get("/api/organizations").json()) == 15


def test_existing_database_is_left_alone(isolated_db):  # R3, R5
    db.create_schema()
    with TestClient(app) as c:
        assert c.get("/api/organizations").json() == []
        c.post("/api/organizations", json={"name": "Kept"})
    with TestClient(app) as c:
        assert [o["name"] for o in c.get("/api/organizations").json()] == ["Kept"]


def test_tests_never_use_the_real_database(isolated_db):  # R6, D2
    assert settings.db_path() == isolated_db
    assert os.environ["ACCOUNTABLE_DB"] != str(settings.DEFAULT_DB)
