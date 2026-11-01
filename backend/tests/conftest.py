"""Shared pytest setup.

The guard below runs before anything else, so a wrong path stops the run before
a test can touch real data.
"""

import os
import shutil
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, select

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REAL_DATA_FOLDER = PROJECT_ROOT / "data"

TODAY = date(2026, 10, 31)
NOW = datetime(2026, 10, 31, 15, 0, 0)


def _check_database_path() -> None:
    path = os.environ.get("ACCOUNTABLE_DB")
    if not path:
        pytest.exit("ACCOUNTABLE_DB isn't set. Run the tests with npm test.", returncode=2)
    if Path(path).resolve().is_relative_to(REAL_DATA_FOLDER.resolve()):
        pytest.exit(f"Refusing to run against {path}: that's where real data lives.", returncode=2)


_check_database_path()

from accountable import db  # noqa: E402
from accountable.crm import rules  # noqa: E402
from accountable.crm.tables import activities, contacts, deals, organizations  # noqa: E402


@contextmanager
def using_database(path: Path) -> Iterator[None]:
    """Points the app at this file, for fixtures that outlive a single test."""
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("ACCOUNTABLE_DB", str(path))
        db.dispose()
        yield
        db.dispose()


@pytest.fixture(scope="session")
def migrated_file(tmp_path_factory) -> Path:
    """One database built from the migrations, which takes about 50ms. Tests copy it."""
    path = tmp_path_factory.mktemp("migrated") / "migrated.db"
    with using_database(path):
        db.prepare_database(lambda _conn: None)
    return path


@pytest.fixture
def database(migrated_file, tmp_path, monkeypatch) -> Path:
    """A fresh, empty database in a folder of its own."""
    path = tmp_path / "test.db"
    shutil.copyfile(migrated_file, path)
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    yield path
    db.dispose()


class Make:
    """Puts records straight in the database, so a test can focus on one thing."""

    def organization(self, name: str = "Harbor & Pine", **values: Any) -> int:
        with db.writing() as conn:
            return conn.execute(insert(organizations).values(name=name, **values)).inserted_primary_key[0]

    def contact(self, name: str = "Sam Carter", **values: Any) -> int:
        with db.writing() as conn:
            return conn.execute(insert(contacts).values(name=name, **values)).inserted_primary_key[0]

    def deal(self, name: str = "Annual support", **values: Any) -> int:
        row = {"stage": "new", "value": 10000, "close_date": date(2026, 12, 1), **values}
        with db.writing() as conn:
            return rules.add_deal(conn, {"name": name, **row}, today=TODAY, now=NOW)

    def activity(self, **values: Any) -> int:
        row = {"type": "note", "description": "Spoke to them", "occurred_at": NOW, **values}
        with db.writing() as conn:
            return conn.execute(insert(activities).values(**row)).inserted_primary_key[0]


@pytest.fixture
def make(database) -> Make:
    return Make()


@pytest.fixture
def deal_row(database):
    def read(deal_id: int):
        with db.reading() as conn:
            return conn.execute(select(deals).where(deals.c.id == deal_id)).one()

    return read


@pytest.fixture
def contact_row(database):
    def read(contact_id: int):
        with db.reading() as conn:
            return conn.execute(select(contacts).where(contacts.c.id == contact_id)).one()

    return read


@pytest.fixture
def api(database) -> TestClient:
    """The API on a fresh database, with today and now fixed."""
    from accountable.main import app

    app.dependency_overrides[db.local_today] = lambda: TODAY
    app.dependency_overrides[db.utc_now] = lambda: NOW
    yield TestClient(app, base_url="http://localhost")
    app.dependency_overrides.clear()
