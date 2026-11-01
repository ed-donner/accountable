from datetime import date, datetime

import pytest
from alembic import op
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import column, delete, insert, inspect, select, table

from accountable import db
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes


def live() -> dict:
    inspector = inspect(db.engine())
    return {
        name: {
            "columns": {
                column["name"]: (str(column["type"]), column["nullable"]) for column in inspector.get_columns(name)
            },
            "indexes": {
                index["name"]: tuple(index["column_names"]) for index in inspector.get_indexes(name)
            },
            "checks": {check["name"]: check["sqltext"] for check in inspector.get_check_constraints(name)},
            "foreign_keys": {
                (tuple(key["constrained_columns"]), key["referred_table"], key["options"].get("ondelete"))
                for key in inspector.get_foreign_keys(name)
            },
        }
        for name in inspector.get_table_names()
        if name != "alembic_version"
    }


def declared() -> dict:
    result = {}
    for name, table in db.metadata.tables.items():
        result[name] = {
            "columns": {column.name: (str(column.type), column.nullable) for column in table.columns},
            "indexes": {index.name: tuple(column.name for column in index.columns) for index in table.indexes},
            "checks": {
                constraint.name: str(constraint.sqltext)
                for constraint in table.constraints
                if constraint.__class__.__name__ == "CheckConstraint"
            },
            "foreign_keys": {
                (tuple(key.constraint.column_keys), key.column.table.name, key.ondelete)
                for key in table.foreign_keys
            },
        }
    return result


def test_the_automatic_comparison_finds_no_differences(database):
    with db.engine().connect() as connection:
        context = MigrationContext.configure(connection, opts={"render_as_batch": True})
        assert compare_metadata(context, db.metadata) == []


def test_every_table_column_and_nullable_matches(database):
    actual, expected = live(), declared()
    assert set(actual) == set(expected)
    for name in expected:
        assert actual[name]["columns"] == expected[name]["columns"], name


def test_indexes_match(database):
    actual, expected = live(), declared()
    for name in expected:
        assert actual[name]["indexes"] == expected[name]["indexes"], name


def test_the_spec_indexes_exist(database):
    indexes = {name: set(table["indexes"].values()) for name, table in live().items()}
    assert ("stage", "position") in indexes["deals"]
    assert ("organization_id",) in indexes["contacts"]
    assert ("organization_id",) in indexes["deals"]
    assert ("main_contact_id",) in indexes["deals"]
    assert ("contact_id",) in indexes["activities"]
    assert ("deal_id",) in indexes["activities"]
    assert ("occurred_at",) in indexes["activities"]
    assert ("follow_up_date",) in indexes["activities"]
    assert ("deal_id",) in indexes["stage_changes"]
    assert ("changed_at",) in indexes["stage_changes"]


def test_the_check_constraint_matches(database):
    actual, expected = live(), declared()
    assert actual["activities"]["checks"] == {"ck_activities_one_parent": "(contact_id IS NULL) != (deal_id IS NULL)"}
    assert list(actual["activities"]["checks"].values()) == list(expected["activities"]["checks"].values())


def test_foreign_keys_and_their_delete_rules_match(database):
    actual, expected = live(), declared()
    for name in expected:
        assert actual[name]["foreign_keys"] == expected[name]["foreign_keys"], name


def built_tables() -> dict[str, str]:
    master = table("sqlite_master", column("type"), column("name"), column("sql"))
    with db.reading() as conn:
        rows = conn.execute(select(master.c.name, master.c.sql).where(master.c.type == "table"))
        return {row.name: row.sql for row in rows}


def test_every_table_is_set_never_to_reuse_an_id(database):
    built = built_tables()
    for name, declared_table in db.metadata.tables.items():
        assert declared_table.dialect_options["sqlite"]["autoincrement"] is True, name
        assert "AUTOINCREMENT" in built[name], name


RECORDS = (organizations, contacts, deals, activities, stage_changes)
WHEN = datetime(2026, 10, 31, 12, 0)


def everything() -> dict[str, list[tuple]]:
    with db.reading() as conn:
        return {record.name: [tuple(row) for row in conn.execute(select(record).order_by(record.c.id))] for record in RECORDS}


def nothing(_conn) -> None:
    pass


@pytest.fixture
def older_database(tmp_path, monkeypatch):
    """A database from before ids were kept, with every kind of link in it."""
    path = tmp_path / "older.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    db._upgrade(path, "0001")
    with db.writing() as conn:
        organization = conn.execute(insert(organizations).values(name="Harbor & Pine")).inserted_primary_key[0]
        contact = conn.execute(
            insert(contacts).values(name="Sam Carter", status="lead", organization_id=organization)
        ).inserted_primary_key[0]
        deal = conn.execute(
            insert(deals).values(
                name="Annual support",
                organization_id=organization,
                main_contact_id=contact,
                stage="proposal",
                value=36000,
                probability=40,
                close_date=date(2026, 12, 18),
                position=0,
            )
        ).inserted_primary_key[0]
        conn.execute(insert(stage_changes).values(deal_id=deal, from_stage="new", to_stage="proposal", changed_at=WHEN))
        conn.execute(
            insert(activities),
            [
                {"type": "call", "contact_id": contact, "deal_id": None, "description": "On the contact", "occurred_at": WHEN},
                {"type": "note", "contact_id": None, "deal_id": deal, "description": "On the deal", "occurred_at": WHEN},
            ],
        )
    db.dispose()
    yield path
    db.dispose()


def test_upgrading_an_older_database_keeps_every_row_and_link(older_database):
    before = everything()
    db.dispose()

    assert db.prepare_database(nothing) is False

    assert all(before.values())
    assert everything() == before
    with db.reading() as conn:
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_an_upgraded_database_never_reuses_an_id(older_database):
    db.prepare_database(nothing)
    built = built_tables()
    assert all("AUTOINCREMENT" in built[record.name] for record in RECORDS)

    with db.writing() as conn:
        newest = conn.scalar(select(deals.c.id))
        conn.execute(delete(deals))
        added = conn.execute(
            insert(deals).values(name="Next", stage="new", value=1, probability=5, close_date=date(2026, 12, 18), position=0)
        ).inserted_primary_key[0]
    assert added > newest


def test_the_delete_rules_still_work_after_an_upgrade(older_database):
    db.prepare_database(nothing)

    with db.writing() as conn:
        conn.execute(delete(organizations))
    assert everything()["contacts"][0][5] is None  # organization_id
    assert everything()["deals"][0][2] is None  # organization_id

    with db.writing() as conn:
        conn.execute(delete(contacts))
    after = everything()
    assert after["deals"][0][3] is None  # main_contact_id
    assert [row[4] for row in after["activities"]] == ["On the deal"]

    with db.writing() as conn:
        conn.execute(delete(deals))
    after = everything()
    assert after["activities"] == [] and after["stage_changes"] == []


def test_an_upgrade_that_stops_partway_changes_nothing(older_database, monkeypatch):
    before = everything()
    db.dispose()
    real = op.batch_alter_table
    tables_reached = []

    def stops_at_the_third_table(*args, **kwargs):
        tables_reached.append(args[0])
        if len(tables_reached) == 3:
            raise RuntimeError("stopped partway")
        return real(*args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(op, "batch_alter_table", stops_at_the_third_table)
        with pytest.raises(RuntimeError):
            db.prepare_database(nothing)

    assert len(tables_reached) == 3
    assert everything() == before
    assert not [name for name in inspect(db.engine()).get_table_names() if name.startswith("_alembic")]
    assert "AUTOINCREMENT" not in built_tables()["organizations"]

    # Nothing is left in the way of the next start.
    db.dispose()
    db.prepare_database(nothing)
    assert everything() == before
    assert "AUTOINCREMENT" in built_tables()["stage_changes"]
