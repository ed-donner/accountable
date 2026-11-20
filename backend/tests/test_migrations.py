from datetime import date, datetime, timezone

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import insert, inspect, select
from sqlalchemy.exc import IntegrityError

from backend.app.db import activities, contacts, deals, make_engine, metadata, organizations
from backend.app.main import run_migrations

NOW = datetime(2026, 11, 19, 15, 0, tzinfo=timezone.utc)
TIMES = {"created_at": NOW, "updated_at": NOW}


@pytest.fixture
def migrated(tmp_path):
    engine = make_engine(tmp_path / "migrated.db")
    run_migrations(engine)
    yield engine
    engine.dispose()


def test_upgrade_head_creates_the_four_tables(migrated):
    names = set(inspect(migrated).get_table_names())
    assert {"organizations", "contacts", "deals", "activities"} <= names


# SQLite can't reflect the lower(name) index, so compare_metadata skips it;
# test_organization_names_are_unique_ignoring_capitals proves it instead.
@pytest.mark.filterwarnings("ignore:.*expression-based index")
def test_migrations_build_the_same_tables_as_db_py(migrated):
    with migrated.connect() as conn:
        differences = compare_metadata(MigrationContext.configure(conn), metadata)
    assert differences == []


def test_foreign_keys_are_on_and_wal_is_set(migrated):
    with migrated.connect() as conn:
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        assert conn.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"
        assert conn.exec_driver_sql("PRAGMA busy_timeout").scalar() == 5000


def test_running_the_migrations_twice_changes_nothing(migrated):
    run_migrations(migrated)
    assert {"organizations", "contacts", "deals", "activities"} <= set(inspect(migrated).get_table_names())


# The database checks the same rules as the API, as a backstop (plan, decision 4).


def _org(conn, name="Bluefin Logistics"):
    return conn.execute(insert(organizations).values(name=name, **TIMES)).inserted_primary_key[0]


def _contact(conn, **values):
    row = {"name": "Sarah Chen", "status": "lead", **TIMES, **values}
    return conn.execute(insert(contacts).values(**row)).inserted_primary_key[0]


def _deal(conn, org_id, **values):
    row = {
        "name": "Website redesign",
        "organization_id": org_id,
        "stage": "proposal",
        "value": 48500,
        "probability": 50,
        "close_date": date(2026, 12, 12),
        "position": 0,
        **TIMES,
        **values,
    }
    return conn.execute(insert(deals).values(**row)).inserted_primary_key[0]


def _note(conn, description, **link):
    conn.execute(insert(activities).values(type="note", description=description, occurred_at=NOW, **link, **TIMES))


def test_organization_names_are_unique_ignoring_capitals(migrated):
    with pytest.raises(IntegrityError), migrated.begin() as conn:
        _org(conn, "Bluefin Logistics")
        _org(conn, "BLUEFIN logistics")


@pytest.mark.parametrize(
    "values",
    [{"stage": "maybe"}, {"value": -1}, {"probability": 101}, {"probability": -1}],
    ids=["stage", "value", "probability-high", "probability-low"],
)
def test_deal_checks(migrated, values):
    with pytest.raises(IntegrityError), migrated.begin() as conn:
        _deal(conn, _org(conn), **values)


def test_contact_status_check(migrated):
    with pytest.raises(IntegrityError), migrated.begin() as conn:
        _contact(conn, status="friend")


def test_activity_type_check(migrated):
    with pytest.raises(IntegrityError), migrated.begin() as conn:
        conn.execute(
            insert(activities).values(
                type="meeting", description="Hello", occurred_at=NOW, contact_id=_contact(conn), **TIMES
            )
        )


@pytest.mark.parametrize("links", ["both", "neither"])
def test_an_activity_has_exactly_one_link(migrated, links):
    with pytest.raises(IntegrityError), migrated.begin() as conn:
        contact_id = _contact(conn)
        deal_id = _deal(conn, _org(conn))
        link = {"contact_id": contact_id, "deal_id": deal_id} if links == "both" else {}
        _note(conn, "Hello", **link)


def test_an_organization_with_deals_cant_be_deleted(migrated):
    with migrated.begin() as conn:
        org_id = _org(conn)
        _deal(conn, org_id)
    with pytest.raises(IntegrityError), migrated.begin() as conn:
        conn.execute(organizations.delete().where(organizations.c.id == org_id))


def test_deleting_unlinks_and_cascades_by_foreign_key(migrated):
    with migrated.begin() as conn:
        org_id = _org(conn)
        contact_id = _contact(conn, organization_id=org_id)
        deal_id = _deal(conn, _org(conn, "Other Co"), main_contact_id=contact_id)
        _note(conn, "On the contact", contact_id=contact_id)
        _note(conn, "On the deal", deal_id=deal_id)

        conn.execute(organizations.delete().where(organizations.c.id == org_id))
        assert conn.execute(select(contacts.c.organization_id)).scalar_one() is None

        conn.execute(contacts.delete().where(contacts.c.id == contact_id))
        assert conn.execute(select(deals.c.main_contact_id)).scalar_one() is None
        assert conn.execute(select(activities.c.description)).scalars().all() == ["On the deal"]

        conn.execute(deals.delete().where(deals.c.id == deal_id))
        assert conn.execute(select(activities.c.id)).first() is None


def test_date_times_come_back_in_utc(migrated):
    with migrated.begin() as conn:
        org_id = _org(conn)
        stored = conn.execute(select(organizations.c.created_at).where(organizations.c.id == org_id)).scalar_one()
    assert stored == NOW
    assert stored.tzinfo == timezone.utc
