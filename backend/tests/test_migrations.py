import io
from datetime import date, datetime

import pytest
from accountable import db
from accountable.company import documents
from accountable.company.tables import company_logo, company_settings, number_counters
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes
from accountable.invoices.tables import invoice_lines, invoices, payments
from accountable.products.tables import products
from accountable.users import users
from alembic import command, op
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from conftest import insert_row
from sqlalchemy import column, delete, func, insert, inspect, select, table, update


def live() -> dict:
    inspector = inspect(db.engine())
    return {
        name: {
            "columns": {
                column["name"]: (str(column["type"]), column["nullable"]) for column in inspector.get_columns(name)
            },
            "indexes": {index["name"]: tuple(index["column_names"]) for index in inspector.get_indexes(name)},
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
    for name, declared_table in db.metadata.tables.items():
        result[name] = {
            "columns": {column.name: (str(column.type), column.nullable) for column in declared_table.columns},
            "indexes": {index.name: tuple(column.name for column in index.columns) for index in declared_table.indexes},
            "checks": {
                constraint.name: str(constraint.sqltext.compile(compile_kwargs={"literal_binds": True}))
                for constraint in declared_table.constraints
                if constraint.__class__.__name__ == "CheckConstraint"
            },
            "foreign_keys": {
                (tuple(key.constraint.column_keys), key.column.table.name, key.ondelete)
                for key in declared_table.foreign_keys
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
    assert ("due_date",) in indexes["invoices"]
    assert ("paid_on",) in indexes["payments"]


def test_invoice_numbers_have_a_unique_index(database):
    unique = {
        tuple(index["column_names"]): index["unique"] for index in inspect(db.engine()).get_indexes(invoices.name)
    }
    assert unique[("number",)]


def test_product_names_have_a_unique_index(database):
    unique = {
        tuple(index["column_names"]): index["unique"] for index in inspect(db.engine()).get_indexes(products.name)
    }
    assert unique[("name_key",)]


def test_each_kind_of_document_has_one_counter(database):
    unique = {
        tuple(index["column_names"]): index["unique"]
        for index in inspect(db.engine()).get_indexes(number_counters.name)
    }
    assert unique[("kind",)]


def test_every_foreign_key_has_an_index(database):
    for name, built in live().items():
        indexed = set(built["indexes"].values())
        for columns, _referred, _ondelete in built["foreign_keys"]:
            assert columns in indexed, (name, columns)


def test_users_and_who_added_each_record_are_built(database):
    built = live()
    assert built["users"]["columns"]["id"] == ("TEXT", False)
    assert built["users"]["columns"]["email"] == ("TEXT", False)
    for record in ("organizations", "contacts", "deals", "activities", "products"):
        assert (("created_by",), "users", None) in built[record]["foreign_keys"], record
        assert (("updated_by",), "users", None) in built[record]["foreign_keys"], record
    assert (("created_by",), "users", None) in built["stage_changes"]["foreign_keys"]
    for record in ("invoices",):
        assert (("created_by",), "users", None) in built[record]["foreign_keys"], record
        assert (("updated_by",), "users", None) in built[record]["foreign_keys"], record
    assert (("created_by",), "users", None) in built["payments"]["foreign_keys"]
    assert built["deals"]["columns"]["value"] == ("BIGINT", False)
    assert built["products"]["columns"]["unit_price_cents"] == ("BIGINT", False)


def test_the_check_constraints_match(database):
    actual, expected = live(), declared()
    assert actual["activities"]["checks"] == {"ck_activities_one_parent": "(contact_id IS NULL) != (deal_id IS NULL)"}
    assert actual["company_settings"]["checks"] == {"ck_company_settings_one_row": "id = 1"}
    assert actual["company_logo"]["checks"] == {"ck_company_logo_one_row": "id = 1"}
    for name in expected:
        assert actual[name]["checks"] == expected[name]["checks"], name


def test_foreign_keys_and_their_delete_rules_match(database):
    actual, expected = live(), declared()
    for name in expected:
        assert actual[name]["foreign_keys"] == expected[name]["foreign_keys"], name


def built_tables() -> dict[str, str]:
    master = table("sqlite_master", column("type"), column("name"), column("sql"))
    with db.reading() as conn:
        rows = conn.execute(select(master.c.name, master.c.sql).where(master.c.type == "table"))
        return {row.name: row.sql for row in rows}


# Users keep the id Supabase gave them, so only the numbered tables need this.
NUMBERED = sorted(set(db.metadata.tables) - {"users"})


def test_every_numbered_table_is_set_never_to_reuse_an_id(database):
    built = built_tables()
    for name in NUMBERED:
        assert db.metadata.tables[name].dialect_options["sqlite"]["autoincrement"] is True, name
        assert "AUTOINCREMENT" in built[name], name


RECORDS = (organizations, contacts, deals, activities, stage_changes)
WHO = ("created_by", "updated_by")
WHEN = datetime(2026, 10, 31, 12, 0)


def everything() -> dict[str, list[tuple]]:
    """Every row, in the columns a database from before sign-in already has."""
    with db.reading() as conn:
        return {
            record.name: [
                tuple(row)
                for row in conn.execute(select(*(c for c in record.c if c.name not in WHO)).order_by(record.c.id))
            ]
            for record in RECORDS
        }


def who_added_and_changed() -> list:
    with db.reading() as conn:
        return [
            value
            for record in RECORDS
            for row in conn.execute(select(*(c for c in record.c if c.name in WHO)))
            for value in row
        ]


def nothing(_conn) -> None:
    pass


def fill_at(path, revision: str) -> None:
    """A database at an older revision, with every kind of link in it."""
    db._upgrade(path, revision)
    with db.writing() as conn:
        organization = insert_row(conn, organizations, name="Harbor & Pine")
        contact = insert_row(conn, contacts, name="Sam Carter", status="lead", organization_id=organization)
        deal = insert_row(
            conn,
            deals,
            name="Annual support",
            organization_id=organization,
            main_contact_id=contact,
            stage="proposal",
            value=36000,
            probability=40,
            close_date=date(2026, 12, 18),
            position=0,
        )
        conn.execute(insert(stage_changes).values(deal_id=deal, from_stage="new", to_stage="proposal", changed_at=WHEN))
        conn.execute(
            insert(activities),
            [
                {
                    "type": "call",
                    "contact_id": contact,
                    "deal_id": None,
                    "description": "On the contact",
                    "occurred_at": WHEN,
                },
                {
                    "type": "note",
                    "contact_id": None,
                    "deal_id": deal,
                    "description": "On the deal",
                    "occurred_at": WHEN,
                },
            ],
        )
    db.dispose()


@pytest.fixture
def older_database(tmp_path, monkeypatch):
    """A database from before ids were kept."""
    path = tmp_path / "older.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    fill_at(path, "0001")
    yield path
    db.dispose()


@pytest.fixture
def database_from_before_sign_in(tmp_path, monkeypatch):
    path = tmp_path / "before-sign-in.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    fill_at(path, "0002")
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
        newest = conn.execute(select(deals.c.id)).scalar_one()
        conn.execute(delete(deals))
        added = insert_row(
            conn, deals, name="Next", stage="new", value=1, probability=5, close_date=date(2026, 12, 18), position=0
        )
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


def test_an_upgrade_adds_the_products_table_with_no_products_in_it(older_database):
    """Sample products only go into a new database (M1), so an existing one starts with none."""
    db.prepare_database(nothing)
    assert products.name in inspect(db.engine()).get_table_names()
    with db.reading() as conn:
        assert conn.execute(select(func.count()).select_from(products)).scalar_one() == 0


def test_upgrading_from_before_sign_in_keeps_every_row_with_no_one_recorded(database_from_before_sign_in):
    before = everything()

    assert db.prepare_database(nothing) is False

    assert all(before.values())
    assert everything() == before
    assert who_added_and_changed() and set(who_added_and_changed()) == {None}
    with db.reading() as conn:
        assert conn.execute(select(func.count()).select_from(users)).scalar_one() == 0
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    assert "AUTOINCREMENT" in built_tables()["deals"]


def test_an_upgrade_to_sign_in_that_stops_partway_changes_nothing(database_from_before_sign_in, monkeypatch):
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

    assert tables_reached == ["organizations", "contacts", "deals"]
    assert "users" not in inspect(db.engine()).get_table_names()
    assert "created_by" not in [c["name"] for c in inspect(db.engine()).get_columns("organizations")]
    assert everything() == before

    db.dispose()
    db.prepare_database(nothing)
    assert everything() == before


# B13: what a database that already existed starts with, and the clearing steps put back.
BLANK_SETTINGS = {
    "id": 1,
    "company_name": None,
    "address": None,
    "email": None,
    "phone": None,
    "tax_label": "Sales tax",
    "tax_rate": 0,
    "payment_terms_days": 30,
    "quote_prefix": "QT-",
    "invoice_prefix": "INV-",
    "invoice_design": "classic",
    "accent_color": "#073B4C",
    "updated_by": None,
}


def the_settings() -> list[dict]:
    with db.reading() as conn:
        return [dict(row._mapping) for row in conn.execute(select(company_settings))]


@pytest.fixture
def database_from_before_settings(tmp_path, monkeypatch):
    path = tmp_path / "before-settings.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    fill_at(path, "0004")
    yield path
    db.dispose()


def test_upgrading_from_before_the_settings_keeps_every_row_and_adds_the_blank_settings(database_from_before_settings):
    before = everything()
    assert "company_settings" not in inspect(db.engine()).get_table_names()
    db.dispose()

    assert db.prepare_database(nothing) is False

    assert all(before.values())
    assert everything() == before
    assert set(who_added_and_changed()) == {None}
    [settings] = the_settings()
    added_at = settings.pop("created_at")
    assert settings.pop("updated_at") == added_at
    assert settings == BLANK_SETTINGS
    with db.reading() as conn:
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


@pytest.fixture
def database_from_before_the_counters(tmp_path, monkeypatch):
    path = tmp_path / "before-counters.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    fill_at(path, "0005")
    yield path
    db.dispose()


def test_upgrading_from_before_the_counters_keeps_every_row_and_starts_each_count_at_1(
    database_from_before_the_counters,
):
    before = everything()
    assert "number_counters" not in inspect(db.engine()).get_table_names()
    db.dispose()

    assert db.prepare_database(nothing) is False

    assert all(before.values())
    assert everything() == before
    with db.writing() as conn:
        assert conn.execute(select(func.count()).select_from(number_counters)).scalar_one() == 0
        assert documents.take_number(conn, "quote") == "QT-0001"


def test_a_new_database_starts_with_the_blank_settings_before_the_sample_data(database):
    [settings] = the_settings()
    assert {name: settings[name] for name in BLANK_SETTINGS} == BLANK_SETTINGS


def test_the_migrations_have_one_head():
    """Two branches each adding the next migration would leave two, and the backend wouldn't start."""
    config = Config()
    config.set_main_option("script_location", str(db.MIGRATIONS))
    assert len(ScriptDirectory.from_config(config).get_heads()) == 1


def test_the_migrations_see_every_areas_tables():
    """A table is in the metadata only once its module is imported. Without its import, autogenerate would drop it."""
    env = (db.MIGRATIONS / "env.py").read_text()
    areas = sorted(path.parent.name for path in db.MIGRATIONS.parent.glob("*/tables.py"))
    assert {"company", "crm", "products"} <= set(areas)  # The check is looking in the right place.
    for area in areas:
        assert f"from accountable.{area} import tables" in env, area


@pytest.fixture(scope="module")
def postgres_sql() -> str:
    """Every migration written out for Postgres by Alembic's offline mode, which needs no database."""
    output = io.StringIO()
    config = Config(output_buffer=output)
    config.set_main_option("script_location", str(db.MIGRATIONS))
    config.set_main_option("sqlalchemy.url", "postgresql+psycopg://")
    command.upgrade(config, "head", sql=True)
    return output.getvalue()


def test_on_postgres_the_sqlite_rebuilds_are_skipped(postgres_sql):
    assert "CREATE TABLE users" in postgres_sql
    assert "_alembic_tmp" not in postgres_sql
    assert "RENAME" not in postgres_sql.upper()


def test_on_postgres_deal_values_are_64_bit(postgres_sql):
    assert "ALTER TABLE deals ALTER COLUMN value TYPE BIGINT" in postgres_sql


def test_on_postgres_prices_are_64_bit(postgres_sql):
    """Postgres's integer stops at about $21 million in cents, far short of the $1 trillion allowed (G3)."""
    created = postgres_sql[postgres_sql.index("CREATE TABLE products") :]
    assert "unit_price_cents BIGINT NOT NULL" in created[: created.index(";")]


def test_on_postgres_every_table_gets_row_level_security(postgres_sql):
    for name in ["alembic_version", *db.metadata.tables]:
        assert f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY" in postgres_sql, name


def test_on_postgres_the_settings_table_keeps_each_default(postgres_sql):
    created = postgres_sql[postgres_sql.index("CREATE TABLE company_settings") :].split(";")[0]
    assert "tax_label TEXT DEFAULT 'Sales tax'," in created
    assert "tax_rate INTEGER DEFAULT '0' NOT NULL" in created
    assert "payment_terms_days INTEGER DEFAULT '30' NOT NULL" in created
    assert "quote_prefix TEXT DEFAULT 'QT-' NOT NULL" in created
    assert "invoice_prefix TEXT DEFAULT 'INV-' NOT NULL" in created
    assert "CONSTRAINT ck_company_settings_one_row CHECK (id = 1)" in created
    assert "FOREIGN KEY(updated_by) REFERENCES users (id)" in created
    for blank in ("company_name", "address", "email", "phone"):
        assert f"{blank} TEXT," in created, blank


def test_on_postgres_the_settings_row_is_added_with_only_its_times(postgres_sql):
    assert "INSERT INTO company_settings (id, created_at, updated_at) VALUES (1, '" in postgres_sql


@pytest.fixture
def database_from_before_invoices(tmp_path, monkeypatch):
    path = tmp_path / "before-invoices.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    fill_at(path, "0006")
    with db.writing() as conn:
        conn.execute(update(company_settings).values(company_name="Our Real Company", tax_rate=6000))
    db.dispose()
    yield path
    db.dispose()


def test_upgrading_from_before_invoices_keeps_every_row_and_adds_empty_invoices_in_classic(
    database_from_before_invoices,
):
    """An existing database gets an empty Invoices section, the Classic design in Midnight and no logo (M1, B13)."""
    before = everything()
    assert "invoices" not in inspect(db.engine()).get_table_names()
    db.dispose()

    assert db.prepare_database(nothing) is False

    assert all(before.values())
    assert everything() == before
    [settings] = the_settings()
    assert (settings["company_name"], settings["tax_rate"]) == ("Our Real Company", 6000)
    assert (settings["invoice_design"], settings["accent_color"]) == ("classic", "#073B4C")
    with db.reading() as conn:
        for empty in (company_logo, invoices, invoice_lines, payments):
            assert conn.execute(select(func.count()).select_from(empty)).scalar_one() == 0, empty.name
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_an_invoice_holds_its_deal_and_organization_in_the_database_too(database):
    """No delete rule, so the database refuses a held delete should one get past the route (D4)."""
    keys = {
        key["referred_table"]: key["options"].get("ondelete")
        for key in inspect(db.engine()).get_foreign_keys("invoices")
    }
    assert keys["deals"] is None and keys["organizations"] is None
    lines = {
        key["referred_table"]: key["options"].get("ondelete")
        for key in inspect(db.engine()).get_foreign_keys("invoice_lines")
    }
    assert lines["invoices"] == "CASCADE"


def created(postgres_sql: str, name: str) -> str:
    start = postgres_sql.index(f"CREATE TABLE {name} ")
    return postgres_sql[start : postgres_sql.index(";", start)]


def test_on_postgres_money_is_64_bit(postgres_sql):
    for money in ("subtotal_cents BIGINT", "tax_cents BIGINT", "total_cents BIGINT"):
        assert money in created(postgres_sql, "invoices"), money
    assert "unit_price_cents BIGINT NOT NULL" in created(postgres_sql, "invoice_lines")
    assert "amount_cents BIGINT NOT NULL" in created(postgres_sql, "payments")
    assert "image BYTEA NOT NULL" in created(postgres_sql, "company_logo")


def test_on_postgres_the_design_and_accent_color_keep_their_defaults_in_the_table(postgres_sql):
    assert "ALTER TABLE company_settings ADD COLUMN invoice_design TEXT DEFAULT 'classic' NOT NULL" in postgres_sql
    assert "ALTER TABLE company_settings ADD COLUMN accent_color TEXT DEFAULT '#073B4C' NOT NULL" in postgres_sql
    assert "CONSTRAINT ck_company_logo_one_row CHECK (id = 1)" in created(postgres_sql, "company_logo")


def test_on_postgres_the_new_tables_get_row_level_security(postgres_sql):
    for name in ("company_logo", "invoices", "invoice_lines", "payments"):
        assert f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY" in postgres_sql, name
