import shutil
import statistics
import time
from pathlib import Path

import pytest
from accountable import db
from accountable.crm.tables import activities, contacts, deals
from conftest import TODAY, using_database
from limits_data import fill
from sqlalchemy import func, select

DASHBOARD_LIMIT_MS = 200
LIST_LIMIT_MS = 400


@pytest.fixture(scope="module")
def full_file(migrated_file, tmp_path_factory) -> Path:
    """Filling a database takes about 400ms, so it's done once and each test copies it."""
    path = tmp_path_factory.mktemp("full") / "full.db"
    shutil.copyfile(migrated_file, path)
    with using_database(path), db.writing() as conn:
        fill(conn, TODAY)
    return path


@pytest.fixture
def full(api, database, full_file):
    db.dispose()
    shutil.copyfile(full_file, database)
    return api


def median_ms(api, path: str) -> float:
    readings = []
    for _ in range(5):
        started = time.perf_counter()
        reply = api.get(path)
        readings.append((time.perf_counter() - started) * 1000)
        assert reply.status_code == 200
    return statistics.median(readings)


def test_the_data_really_is_at_the_limits(full):
    with db.reading() as conn:
        assert conn.scalar(select(func.count()).select_from(contacts)) == 1000
        assert conn.scalar(select(func.count()).select_from(deals)) == 500
        assert conn.scalar(select(func.count()).select_from(activities)) == 5000


def test_the_dashboard_is_quick(full):
    elapsed = median_ms(full, "/api/dashboard")
    print(f"dashboard: {elapsed:.1f}ms")
    assert elapsed < DASHBOARD_LIMIT_MS


@pytest.mark.parametrize("path", ["/api/organizations", "/api/contacts", "/api/deals"])
def test_lists_are_quick(full, path):
    elapsed = median_ms(full, path)
    print(f"{path}: {elapsed:.1f}ms")
    assert elapsed < LIST_LIMIT_MS


def test_a_timeline_on_a_busy_organization_is_quick(full):
    organization = full.get("/api/organizations").json()[0]["id"]
    elapsed = median_ms(full, f"/api/organizations/{organization}/timeline")
    print(f"timeline: {elapsed:.1f}ms")
    assert elapsed < LIST_LIMIT_MS
