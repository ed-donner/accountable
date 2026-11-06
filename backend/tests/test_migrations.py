import io
from datetime import date, datetime, timedelta

import pytest
from accountable import db
from accountable.bills.tables import bill_number_key, bills
from accountable.books.tables import journal_entries, journal_lines
from accountable.company import documents
from accountable.company.tables import company_logo, company_settings, number_counters
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes
from accountable.invoices.tables import invoice_lines, invoices, payments
from accountable.products.tables import products
from accountable.quotes.tables import quote_lines, quotes
from accountable.users import users
from alembic import command, op
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from conftest import insert_row
from sqlalchemy import (
    Date,
    DateTime,
    Engine,
    Integer,
    Text,
    column,
    delete,
    event,
    func,
    insert,
    inspect,
    select,
    table,
    update,
)
from sqlalchemy.exc import IntegrityError
from test_books_checks import hold


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
    assert ("deal_id",) in indexes["quotes"]
    assert ("quote_id", "position") in indexes["quote_lines"]
    assert ("product_id",) in indexes["quote_lines"]
    assert ("due_date",) in indexes["bills"]
    assert ("bill_date",) in indexes["bills"]
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


def test_each_suppliers_bill_numbers_have_a_unique_index(database):
    unique = {tuple(index["column_names"]): index["unique"] for index in inspect(db.engine()).get_indexes(bills.name)}
    assert unique[("organization_id", "bill_number_key")]


def test_each_kind_of_document_has_one_counter(database):
    unique = {
        tuple(index["column_names"]): index["unique"]
        for index in inspect(db.engine()).get_indexes(number_counters.name)
    }
    assert unique[("kind",)]


def test_a_deal_has_one_accepted_quote_at_most(database):
    """Unique for accepted quotes only, so a deal can have any number of the others (Q23)."""
    [index] = [
        index
        for index in inspect(db.engine()).get_indexes(quotes.name)
        if index["name"] == "ix_quotes_one_accepted_per_deal"
    ]
    assert (index["column_names"], index["unique"]) == (["deal_id"], 1)
    assert str(index["dialect_options"]["sqlite_where"]) == "status = 'accepted'"


def test_every_foreign_key_has_an_index(database):
    for name, built in live().items():
        indexed = set(built["indexes"].values())
        for columns, _referred, _ondelete in built["foreign_keys"]:
            assert columns in indexed, (name, columns)


def test_users_and_who_added_each_record_are_built(database):
    built = live()
    assert built["users"]["columns"]["id"] == ("TEXT", False)
    assert built["users"]["columns"]["email"] == ("TEXT", False)
    for record in ("organizations", "contacts", "deals", "activities", "products", "quotes", "bills"):
        assert (("created_by",), "users", None) in built[record]["foreign_keys"], record
        assert (("updated_by",), "users", None) in built[record]["foreign_keys"], record
    assert (("created_by",), "users", None) in built["stage_changes"]["foreign_keys"]
    for record in ("invoices",):
        assert (("created_by",), "users", None) in built[record]["foreign_keys"], record
        assert (("updated_by",), "users", None) in built[record]["foreign_keys"], record
    assert (("created_by",), "users", None) in built["payments"]["foreign_keys"]
    assert built["deals"]["columns"]["value"] == ("BIGINT", False)
    assert built["products"]["columns"]["unit_price_cents"] == ("BIGINT", False)
    assert built["quotes"]["columns"]["subtotal_cents"] == ("BIGINT", False)
    assert built["quote_lines"]["columns"]["unit_price_cents"] == ("BIGINT", False)
    assert built["bills"]["columns"]["amount_cents"] == ("BIGINT", False)
    assert built["bills"]["columns"]["tax_cents"] == ("BIGINT", False)


def test_a_quote_holds_its_deal_and_its_lines_go_with_it(database):
    built = live()
    assert (("deal_id",), "deals", None) in built["quotes"]["foreign_keys"]
    assert (("quote_id",), "quotes", "CASCADE") in built["quote_lines"]["foreign_keys"]
    assert (("product_id",), "products", None) in built["quote_lines"]["foreign_keys"]


def test_the_check_constraints_match(database):
    actual, expected = live(), declared()
    assert actual["activities"]["checks"] == {"ck_activities_one_parent": "(contact_id IS NULL) != (deal_id IS NULL)"}
    assert actual["company_settings"]["checks"] == {
        "ck_company_settings_one_row": "id = 1",
        "ck_company_settings_opening_balance_together": "(opening_balance_cents IS NULL) = (opening_balance_on IS NULL)",
    }
    assert actual["quotes"]["checks"] == {"ck_quotes_status": "status IN ('draft', 'sent', 'accepted', 'declined')"}
    assert actual["bills"]["checks"] == {
        "ck_bills_category": "category IN ('software', 'contractors', 'travel', 'office', 'marketing', 'other')"
    }
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
    "opening_balance_cents": None,
    "opening_balance_on": None,
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


@pytest.fixture
def database_from_before_bills(tmp_path, monkeypatch):
    path = tmp_path / "before-bills.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    fill_at(path, "0006")
    yield path
    db.dispose()


def a_bill(organization_id: int, number: str) -> dict:
    return {
        "organization_id": organization_id,
        "bill_number": number,
        "bill_number_key": bill_number_key(number),
        "bill_date": date(2026, 10, 1),
        "due_date": date(2026, 10, 31),
        "amount_cents": 124000,
        "category": "software",
    }


def test_upgrading_from_before_bills_keeps_every_row_and_adds_an_empty_bills_table(database_from_before_bills):
    """Sample bills only go into a new database (M1), so an existing one starts with none."""
    before = everything()
    assert "bills" not in inspect(db.engine()).get_table_names()
    db.dispose()

    assert db.prepare_database(nothing) is False

    assert all(before.values())
    assert everything() == before
    with db.reading() as conn:
        assert conn.execute(select(func.count()).select_from(bills)).scalar_one() == 0
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_after_the_upgrade_the_database_keeps_bill_numbers_apart_and_holds_suppliers(database_from_before_bills):
    db.prepare_database(nothing)
    with db.writing() as conn:
        supplier = conn.execute(select(organizations.c.id)).scalar_one()
        conn.execute(insert(bills).values(**a_bill(supplier, "INV-0042")))

    with pytest.raises(IntegrityError), db.writing() as conn:
        conn.execute(insert(bills).values(**a_bill(supplier, "inv-0042")))
    with pytest.raises(IntegrityError), db.writing() as conn:
        conn.execute(delete(organizations))
    with db.reading() as conn:
        assert conn.execute(select(func.count()).select_from(organizations)).scalar_one() == 1


@pytest.fixture
def database_from_before_quotes(tmp_path, monkeypatch):
    """At 0007, with bills, as the team's database is when quotes arrive."""
    path = tmp_path / "before-quotes.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    fill_at(path, "0007")
    with db.writing() as conn:
        documents.take_number(conn, "quote")
        documents.take_number(conn, "quote")
    db.dispose()
    yield path
    db.dispose()


def test_upgrading_from_before_quotes_keeps_every_row_and_the_quotes_count(database_from_before_quotes):
    before = everything()
    assert "quotes" not in inspect(db.engine()).get_table_names()
    db.dispose()

    assert db.prepare_database(nothing) is False

    assert all(before.values())
    assert everything() == before
    with db.writing() as conn:
        for table in (quotes, quote_lines):
            assert conn.execute(select(func.count()).select_from(table)).scalar_one() == 0
        assert documents.take_number(conn, "quote") == "QT-0003"
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


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
    # The check is looking in the right place.
    assert {"bills", "company", "crm", "products", "quotes"} <= set(areas)
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


def created(postgres_sql: str, name: str) -> str:
    """The CREATE TABLE statement for one table, as Postgres gets it."""
    return postgres_sql[postgres_sql.index(f"CREATE TABLE {name} ") :].split(";")[0]


def test_on_postgres_quote_amounts_are_64_bit(postgres_sql):
    assert "subtotal_cents BIGINT NOT NULL" in created(postgres_sql, "quotes")
    assert "unit_price_cents BIGINT NOT NULL" in created(postgres_sql, "quote_lines")


def test_on_postgres_a_deal_has_one_accepted_quote_at_most(postgres_sql):
    assert (
        "CREATE UNIQUE INDEX ix_quotes_one_accepted_per_deal ON quotes (deal_id) WHERE status = 'accepted'"
        in postgres_sql
    )
    assert "CONSTRAINT ck_quotes_status CHECK (status IN ('draft', 'sent', 'accepted', 'declined'))" in created(
        postgres_sql, "quotes"
    )


def test_on_postgres_bill_amounts_are_64_bit(postgres_sql):
    """A bill's amount and tax each go up to $1 trillion in cents, as a price does (E4)."""
    assert "amount_cents BIGINT NOT NULL" in created(postgres_sql, "bills")
    assert "tax_cents BIGINT NOT NULL" in created(postgres_sql, "bills")


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
    """At 0008, with bills and quotes, as the team's database is when invoices arrive."""
    path = tmp_path / "before-invoices.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    fill_at(path, "0008")
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


@pytest.fixture
def database_from_before_the_issue_order(tmp_path, monkeypatch):
    """Three invoices issued at 0009, the third on the first one's day, and a draft."""
    path = tmp_path / "before-issue-order.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    fill_at(path, "0009")
    old_invoices = table(
        "invoices",
        column("deal_id", Integer),
        column("status", Text),
        column("number", Text),
        column("issue_date", Date),
        column("created_at", DateTime),
        column("updated_at", DateTime),
    )
    with db.writing() as conn:
        deal = conn.scalar(select(deals.c.id))
        made = {"deal_id": deal, "created_at": WHEN, "updated_at": WHEN}
        conn.execute(
            insert(old_invoices),
            [
                {**made, "status": "issued", "number": "INV-0001", "issue_date": date(2026, 10, 2)},
                {**made, "status": "issued", "number": "INV-0003", "issue_date": date(2026, 10, 5)},
                {**made, "status": "void", "number": "INV-0002", "issue_date": date(2026, 10, 2)},
                {**made, "status": "draft", "number": None, "issue_date": None},
            ],
        )
    db.dispose()
    yield path
    db.dispose()


def test_upgrading_gives_invoices_already_issued_their_order_by_issue_date_then_id(
    database_from_before_the_issue_order,
):
    """Their numbers can't say, since a prefix may end in a digit, so they go in the order the table used (V22)."""
    assert db.prepare_database(nothing) is False
    with db.reading() as conn:
        rows = conn.execute(select(invoices.c.number, invoices.c.issue_order).order_by(invoices.c.id)).all()
    assert [tuple(row) for row in rows] == [("INV-0001", 1), ("INV-0003", 3), ("INV-0002", 2), (None, None)]


@pytest.fixture
def database_from_before_the_opening_balance(tmp_path, monkeypatch):
    """At 0010, with records, an issued invoice's count and settings someone has saved, as the team's database is."""
    path = tmp_path / "before-opening-balance.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    fill_at(path, "0010")
    with db.writing() as conn:
        conn.execute(insert(users).values(id="teammate-dana", name="Dana Whitfield", email="dana@team.example"))
        conn.execute(
            update(company_settings).values(
                company_name="Our Real Company",
                tax_rate=6000,
                invoice_design="ledger",
                updated_by="teammate-dana",
                updated_at=WHEN,
            )
        )
        documents.take_number(conn, "invoice")
    db.dispose()
    yield path
    db.dispose()


def test_upgrading_from_before_the_opening_balance_keeps_the_settings_and_gives_none(
    database_from_before_the_opening_balance,
):
    """SQLite rebuilds the settings table for the check, so the row, who changed it and its ids must come through whole (B13)."""
    before = everything()
    assert "opening_balance_cents" not in live()["company_settings"]["columns"]
    with db.reading() as conn:
        old_columns = [column for column in company_settings.c if not column.name.startswith("opening_balance")]
        old_settings = dict(conn.execute(select(*old_columns)).one()._mapping)
    db.dispose()

    assert db.prepare_database(nothing) is False

    assert all(before.values())
    assert everything() == before
    [settings] = the_settings()
    assert settings == {**old_settings, "opening_balance_cents": None, "opening_balance_on": None}
    assert (settings["company_name"], settings["updated_by"], settings["updated_at"]) == (
        "Our Real Company",
        "teammate-dana",
        WHEN,
    )
    assert "AUTOINCREMENT" in built_tables()["company_settings"]
    assert live()["company_settings"]["indexes"] == {"ix_company_settings_updated_by": ("updated_by",)}
    with db.writing() as conn:
        assert documents.take_number(conn, "invoice") == "INV-0002"
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


@pytest.mark.parametrize(
    "half",
    [{"opening_balance_cents": 4_000_000}, {"opening_balance_on": date(2025, 12, 1)}],
    ids=["an amount alone", "a date alone"],
)
def test_after_the_upgrade_the_database_refuses_half_an_opening_balance(database_from_before_the_opening_balance, half):
    assert db.prepare_database(nothing) is False
    with pytest.raises(IntegrityError), db.writing() as conn:
        conn.execute(update(company_settings).values(**half))
    with db.writing() as conn:
        conn.execute(
            update(company_settings).values(opening_balance_cents=-425000, opening_balance_on=date(2025, 12, 1))
        )
    [settings] = the_settings()
    assert (settings["opening_balance_cents"], settings["opening_balance_on"]) == (-425000, date(2025, 12, 1))


def test_on_postgres_the_opening_balance_is_64_bit_and_kept_whole(postgres_sql):
    """$1 trillion in cents is far past Postgres's integer, and the check keeps the two together (B24)."""
    assert "ALTER TABLE company_settings ADD COLUMN opening_balance_cents BIGINT;" in postgres_sql
    assert "ALTER TABLE company_settings ADD COLUMN opening_balance_on DATE;" in postgres_sql
    assert (
        "ALTER TABLE company_settings ADD CONSTRAINT ck_company_settings_opening_balance_together "
        "CHECK ((opening_balance_cents IS NULL) = (opening_balance_on IS NULL));"
    ) in postgres_sql


# The books (0012)


def at_0011_with_records(path, *, count: int = 1, opening: int | None = 4_000_000) -> None:
    """A database at 0011 with `count` of each kind: an invoice issued with tax and one untaxed, a void one, a
    draft, payments, an unpaid bill and a paid one, and the opening balance."""
    fill_at(path, "0011")
    with db.writing() as conn:
        deal = conn.scalar(select(deals.c.id))
        organization = conn.scalar(select(organizations.c.id))
        issued = {"deal_id": deal, "organization_id": organization, "created_at": WHEN, "updated_at": WHEN}
        for number in range(count):
            day = date(2026, 3, 1) + timedelta(days=number)
            taxed = insert_row(
                conn,
                invoices,
                status="issued",
                issue_date=day,
                subtotal_cents=100000,
                tax_cents=8875,
                total_cents=108875,
                **issued,
            )
            untaxed = insert_row(
                conn,
                invoices,
                status="issued",
                issue_date=day,
                subtotal_cents=50000,
                tax_cents=0,
                total_cents=50000,
                **issued,
            )
            voided = insert_row(
                conn,
                invoices,
                status="void",
                issue_date=day,
                subtotal_cents=20000,
                tax_cents=1775,
                total_cents=21775,
                **issued,
            )
            insert_row(conn, invoices, status="draft", **issued)
            insert_row(conn, payments, invoice_id=taxed, paid_on=day, amount_cents=60000, method="card")
            insert_row(conn, payments, invoice_id=untaxed, paid_on=day, amount_cents=50000, method="card")
            for paid_on in (None, day):
                insert_row(
                    conn,
                    bills,
                    organization_id=organization,
                    bill_number=f"B-{number}-{paid_on}",
                    bill_number_key=f"b-{number}-{paid_on}",
                    bill_date=day,
                    due_date=day,
                    amount_cents=70000,
                    tax_cents=5000,
                    category="travel",
                    paid_on=paid_on,
                    created_at=WHEN,
                    updated_at=WHEN,
                )
            assert voided
        if opening is not None:
            conn.execute(
                update(company_settings).values(opening_balance_cents=opening, opening_balance_on=date(2026, 1, 1))
            )
    db.dispose()


@pytest.fixture
def database_from_before_the_books(tmp_path, monkeypatch):
    path = tmp_path / "before-books.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    at_0011_with_records(path)
    yield path
    db.dispose()


def posted() -> list[tuple]:
    """Each entry as (kind, source id, event, date, who, lines), in order."""
    with db.reading() as conn:
        entries = conn.execute(select(journal_entries).order_by(journal_entries.c.id)).all()
        lines = conn.execute(select(journal_lines).order_by(journal_lines.c.id)).all()
    return [
        (
            entry.kind,
            entry.source_id,
            entry.event,
            entry.entry_date,
            entry.created_by,
            sorted((line.account, line.debit_cents, line.credit_cents) for line in lines if line.entry_id == entry.id),
        )
        for entry in entries
    ]


def test_upgrading_posts_the_entries_for_every_record_that_already_exists(database_from_before_the_books):
    assert db.prepare_database(nothing) is False
    march_1 = date(2026, 3, 1)
    with db.reading() as conn:
        ids = {
            "taxed": conn.scalar(select(invoices.c.id).where(invoices.c.total_cents == 108875)),
            "untaxed": conn.scalar(select(invoices.c.id).where(invoices.c.total_cents == 50000)),
            "void": conn.scalar(select(invoices.c.id).where(invoices.c.status == "void")),
        }
    found = posted()
    taxed_lines = sorted([("receivable", 108875, 0), ("revenue", 0, 100000), ("tax_payable", 0, 8875)])
    assert ("invoice", ids["taxed"], "invoice_issued", march_1, None, taxed_lines) in found
    assert (
        "invoice",
        ids["untaxed"],
        "invoice_issued",
        march_1,
        None,
        [("receivable", 50000, 0), ("revenue", 0, 50000)],
    ) in found
    assert ("payment", 1, "payment_recorded", march_1, None, [("cash", 60000, 0), ("receivable", 0, 60000)]) in found
    assert ("bill", 1, "bill_added", march_1, None, [("expense_travel", 75000, 0), ("payable", 0, 75000)]) in found
    assert ("bill_payment", 2, "bill_paid", march_1, None, [("cash", 0, 75000), ("payable", 75000, 0)]) in found
    assert (
        "opening_balance",
        1,
        "opening_balance_set",
        date(2026, 1, 1),
        None,
        [("cash", 4_000_000, 0), ("owners_equity", 0, 4_000_000)],
    ) in found
    assert len(found) == 2 + 1 + 1 + 2 + 3 + 1 and {entry[4] for entry in found} == {None}
    hold()


def test_a_void_invoice_gets_its_issue_entry_and_a_reversal_dated_the_same_and_drafts_get_none(
    database_from_before_the_books,
):
    db.prepare_database(nothing)
    with db.reading() as conn:
        void_id = conn.scalar(select(invoices.c.id).where(invoices.c.status == "void"))
        draft_id = conn.scalar(select(invoices.c.id).where(invoices.c.status == "draft"))
        reversal = conn.execute(select(journal_entries).where(journal_entries.c.event == "invoice_voided")).one()
        original = conn.execute(select(journal_entries).where(journal_entries.c.id == reversal.reverses_id)).one()
    assert (original.source_id, original.event, reversal.source_id, reversal.entry_date) == (
        void_id,
        "invoice_issued",
        void_id,
        original.entry_date,
    )
    assert draft_id not in {entry[1] for entry in posted() if entry[0] == "invoice"}


def test_an_overdrawn_opening_balance_is_posted_with_the_sides_swapped(tmp_path, monkeypatch):
    monkeypatch.setenv("ACCOUNTABLE_DB", str(tmp_path / "overdrawn.db"))
    db.dispose()
    at_0011_with_records(tmp_path / "overdrawn.db", opening=-125000)
    db.prepare_database(nothing)
    [opening] = [entry for entry in posted() if entry[0] == "opening_balance"]
    assert opening[5] == [("cash", 0, 125000), ("owners_equity", 125000, 0)]
    hold()
    db.dispose()


def test_an_opening_balance_of_zero_gets_no_entry(tmp_path, monkeypatch):
    """J3: an event with no money in it posts no entry at all, in the migration as in the app."""
    monkeypatch.setenv("ACCOUNTABLE_DB", str(tmp_path / "zero.db"))
    db.dispose()
    at_0011_with_records(tmp_path / "zero.db", opening=0)
    db.prepare_database(nothing)
    assert [entry for entry in posted() if entry[0] == "opening_balance"] == []
    with db.reading() as conn:
        empty = conn.scalar(
            select(func.count())
            .select_from(journal_entries)
            .where(journal_entries.c.id.not_in(select(journal_lines.c.entry_id)))
        )
    assert empty == 0
    hold()
    db.dispose()


def test_a_database_with_no_records_gets_no_entries(tmp_path, monkeypatch):
    monkeypatch.setenv("ACCOUNTABLE_DB", str(tmp_path / "bare.db"))
    db.dispose()
    db._upgrade(tmp_path / "bare.db", "0011")
    db.prepare_database(nothing)
    assert posted() == []
    db.dispose()


def statements_to_upgrade(path) -> int:
    seen: list[str] = []

    def count(_conn, _cursor, statement, *_rest):
        seen.append(statement)

    event.listen(Engine, "before_cursor_execute", count)
    try:
        db.prepare_database(nothing)
    finally:
        event.remove(Engine, "before_cursor_execute", count)
        db.dispose()
    return len(seen)


def test_it_takes_the_same_number_of_queries_for_5_records_as_for_50(tmp_path, monkeypatch):
    totals = []
    for count in (5, 50):
        path = tmp_path / f"records-{count}.db"
        monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
        db.dispose()
        at_0011_with_records(path, count=count)
        totals.append(statements_to_upgrade(path))
    assert totals[0] == totals[1]


def test_the_books_tables_match_the_migrations(database):
    assert {"journal_entries", "journal_lines"} <= set(live())
    assert live()["journal_lines"]["indexes"].keys() == {"ix_journal_lines_entry_id", "ix_journal_lines_account"}
    assert live()["journal_entries"]["indexes"]["ix_journal_entries_reverses_id"] == ("reverses_id",)


def test_the_database_refuses_a_line_on_neither_side_both_sides_or_an_unknown_account(database):
    with db.writing() as conn:
        entry = insert_row(
            conn,
            journal_entries,
            entry_date=date(2026, 1, 1),
            kind="bill",
            source_id=1,
            event="x",
            link="/",
            created_at=WHEN,
        )
    line = {"entry_id": entry, "created_at": WHEN}
    for bad in (
        {"account": "cash", "debit_cents": 0, "credit_cents": 0},
        {"account": "cash", "debit_cents": 5, "credit_cents": 5},
        {"account": "cash", "debit_cents": -5, "credit_cents": 0},
        {"account": "bank", "debit_cents": 5, "credit_cents": 0},
    ):
        with pytest.raises(IntegrityError), db.writing() as conn:
            conn.execute(insert(journal_lines).values(**line, **bad))


def test_an_entry_can_be_reversed_only_once(database):
    entry = {
        "entry_date": date(2026, 1, 1),
        "kind": "bill",
        "source_id": 1,
        "event": "x",
        "link": "/",
        "created_at": WHEN,
    }
    with db.writing() as conn:
        first = insert_row(conn, journal_entries, **entry)
        insert_row(conn, journal_entries, reverses_id=first, **entry)
    with pytest.raises(IntegrityError), db.writing() as conn:
        insert_row(conn, journal_entries, reverses_id=first, **entry)


def test_on_postgres_the_books_tables_get_row_level_security_and_64_bit_cents_and_the_checks(postgres_sql):
    for name in ("journal_entries", "journal_lines"):
        assert f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY" in postgres_sql, name
    lines = created(postgres_sql, "journal_lines")
    assert "debit_cents BIGINT NOT NULL" in lines and "credit_cents BIGINT NOT NULL" in lines
    assert "ck_journal_lines_account CHECK (account IN ('cash'" in lines
    assert "ck_journal_lines_one_side" in lines
    assert "CREATE UNIQUE INDEX ix_journal_entries_reverses_id ON journal_entries (reverses_id)" in postgres_sql


# The quote an invoice was made from (0013)


QUOTE = {
    "number": "QT-0001",
    "status": "accepted",
    "quote_date": date(2026, 3, 1),
    "valid_until": date(2026, 3, 31),
    "subtotal_cents": 100000,
    "created_at": WHEN,
    "updated_at": WHEN,
}


@pytest.fixture
def database_from_before_invoice_quotes(tmp_path, monkeypatch):
    """At 0012 with the invoices, an accepted quote and the books' entries that came with them."""
    path = tmp_path / "before-invoice-quotes.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    at_0011_with_records(path)
    db._upgrade(path, "0012")
    with db.writing() as conn:
        insert_row(conn, quotes, deal_id=conn.scalar(select(deals.c.id)), **QUOTE)
    db.dispose()
    yield path
    db.dispose()


def invoice_rows() -> list[tuple]:
    with db.reading() as conn:
        return [
            tuple(row)
            for row in conn.execute(select(*(c for c in invoices.c if c.name != "quote_id")).order_by(invoices.c.id))
        ]


def test_0013_matches_the_invoices_table(database):
    assert live()["invoices"]["indexes"]["ix_invoices_quote_id"] == ("quote_id",)
    assert (("quote_id",), "quotes", None) in live()["invoices"]["foreign_keys"]
    [index] = [i for i in inspect(db.engine()).get_indexes(invoices.name) if i["name"] == "ix_invoices_quote_id"]
    assert index["unique"]


def test_upgrading_leaves_every_invoice_as_it_was_with_no_quote(database_from_before_invoice_quotes):
    with db.reading() as conn:
        assert "quote_id" not in {c["name"] for c in inspect(conn).get_columns("invoices")}
    before = invoice_rows()
    db.dispose()

    assert db.prepare_database(nothing) is False

    assert before
    assert invoice_rows() == before
    with db.reading() as conn:
        assert conn.scalars(select(invoices.c.quote_id)).all() == [None] * len(before)
        assert conn.scalar(select(func.count()).select_from(quotes)) == 1
        assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_after_the_upgrade_the_database_gives_a_quote_one_invoice(database_from_before_invoice_quotes):
    db.prepare_database(nothing)
    with db.writing() as conn:
        quote, deal = conn.execute(select(quotes.c.id, quotes.c.deal_id)).one()
        insert_row(conn, invoices, deal_id=deal, quote_id=quote, created_at=WHEN, updated_at=WHEN)
        insert_row(conn, invoices, deal_id=deal, created_at=WHEN, updated_at=WHEN)
        insert_row(conn, invoices, deal_id=deal, created_at=WHEN, updated_at=WHEN)
    with pytest.raises(IntegrityError), db.writing() as conn:
        insert_row(conn, invoices, deal_id=deal, quote_id=quote, created_at=WHEN, updated_at=WHEN)
    with pytest.raises(IntegrityError), db.writing() as conn:
        insert_row(conn, invoices, deal_id=deal, quote_id=9999, created_at=WHEN, updated_at=WHEN)


def test_downgrading_takes_the_column_and_its_index_and_keeps_the_invoices(database_from_before_invoice_quotes):
    db.prepare_database(nothing)
    before = invoice_rows()
    db.dispose()
    engine = db._sqlite_engine(
        db._sqlite_url(database_from_before_invoice_quotes), foreign_keys=False, autocommit=False
    )
    config = Config()
    config.set_main_option("script_location", str(db.MIGRATIONS).replace("%", "%%"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0012")
    engine.dispose()

    with db.reading() as conn:
        assert "quote_id" not in {c["name"] for c in inspect(conn).get_columns("invoices")}
        assert "ix_invoices_quote_id" not in {i["name"] for i in inspect(conn).get_indexes("invoices")}
    assert invoice_rows() == before


def test_on_postgres_an_invoice_has_a_quote_with_a_unique_index(postgres_sql):
    assert "ADD COLUMN quote_id INTEGER" in postgres_sql
    assert "FOREIGN KEY(quote_id) REFERENCES quotes (id)" in postgres_sql
    assert "CREATE UNIQUE INDEX ix_invoices_quote_id ON invoices (quote_id)" in postgres_sql
