import io
from datetime import date

import pytest
from accountable import cli, db, users
from accountable.company import documents
from accountable.company.sample_data import SAMPLE_COMPANY, SAMPLE_LOGO
from accountable.company.tables import company_logo, company_settings
from accountable.crm.tables import organizations
from accountable.invoices.tables import invoices
from accountable.quotes.tables import quote_lines, quotes
from conftest import TODAY, insert_row
from sqlalchemy import func, insert, select, update

# Every table seed and empty delete from: all but the people and the company settings.
WIPED = [table for table in db.metadata.sorted_tables if table not in cli.KEPT]


def counts() -> dict[str, int]:
    with db.reading() as conn:
        return {table.name: conn.execute(select(func.count()).select_from(table)).scalar_one() for table in WIPED}


def take_number(kind: documents.DocumentKind) -> str:
    with db.writing() as conn:
        return documents.take_number(conn, kind)


def answer(monkeypatch, text: str) -> None:
    monkeypatch.setattr("sys.stdin", io.StringIO(text))


@pytest.fixture
def with_records(make):
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    deal = make.deal(organization_id=organization, main_contact_id=contact)
    make.activity(deal_id=deal)
    product = make.product()
    make.bill(organization)
    with db.writing() as conn:
        quote = insert_row(
            conn,
            quotes,
            number=documents.take_number(conn, "quote"),
            deal_id=deal,
            quote_date=TODAY,
            valid_until=TODAY,
            subtotal_cents=4950,
        )
        insert_row(
            conn,
            quote_lines,
            quote_id=quote,
            position=1,
            product_id=product,
            name="Pro license",
            quantity=1,
            unit_price_cents=4950,
        )


EMPTY = {table.name: 0 for table in WIPED}


def test_every_table_but_the_people_and_the_settings_is_wiped():
    # The check is looking in the right place.
    assert {"stage_changes", "products", "number_counters", "quotes", "quote_lines", "bills"} <= set(EMPTY)
    assert {"invoices", "invoice_lines", "payments"} <= set(EMPTY)
    assert {"users", "company_settings", "company_logo"}.isdisjoint(EMPTY)


def test_the_wipe_sees_every_areas_tables():
    """A table is in the metadata only once its module is imported, and the wipe goes by the metadata."""
    source = (db.ROOT / "backend" / "accountable" / "cli.py").read_text()
    areas = sorted(path.parent.name for path in (db.ROOT / "backend" / "accountable").glob("*/tables.py"))
    # The check is looking in the right place.
    assert {"bills", "company", "crm", "invoices", "products", "quotes"} <= set(areas)
    for area in areas:
        assert f"from accountable.{area} import tables" in source, area


@pytest.mark.parametrize("command", ["seed", "empty"])
def test_shows_what_will_be_lost_and_needs_yes(with_records, monkeypatch, capsys, command):
    answer(monkeypatch, "yes\n")
    assert cli.main([command]) == 0
    output = capsys.readouterr().out
    assert (
        "1 organization, 1 contact, 1 deal, 1 activity, 1 product, 1 quote, 0 invoices, 0 payments, 1 bill." in output
    )
    assert "can't be undone" in output


def test_counts_read_naturally_when_there_are_several(make, monkeypatch, capsys):
    make.organization()
    make.organization()
    answer(monkeypatch, "no\n")
    cli.main(["empty"])
    output = capsys.readouterr().out
    assert (
        "2 organizations, 0 contacts, 0 deals, 0 activities, 0 products, 0 quotes, 0 invoices, 0 payments, 0 bills."
        in output
    )


def test_seed_replaces_everything_with_the_sample_data(with_records, monkeypatch):
    answer(monkeypatch, "yes\n")
    cli.main(["seed"])
    after = counts()
    assert (
        after["organizations"],
        after["contacts"],
        after["deals"],
        after["activities"],
        after["products"],
        after["quotes"],
        after["invoices"],
        after["bills"],
    ) == (30, 75, 80, 300, 12, 40, 33, 85)
    assert after["quote_lines"] > 100
    assert after["payments"] >= 30


def test_empty_removes_every_record(with_records, monkeypatch):
    answer(monkeypatch, "yes\n")
    cli.main(["empty"])
    assert counts() == EMPTY


def test_empty_starts_each_count_again_at_1(database):
    for _ in range(3):
        take_number("quote")
    take_number("invoice")

    assert cli.main(["empty", "--yes"]) == 0

    assert (take_number("quote"), take_number("invoice")) == ("QT-0001", "INV-0001")


def test_seed_starts_each_count_again_at_1_so_the_sample_documents_run_from_the_first_number(database):
    """Seed's 40 sample quotes then take QT-0001 to QT-0040, and its issued invoices INV-0001 on (M8)."""
    for _ in range(40):
        take_number("invoice")
    take_number("quote")

    assert cli.main(["seed", "--yes"]) == 0

    with db.reading() as conn:
        numbers = sorted(conn.scalars(select(invoices.c.number).where(invoices.c.number.is_not(None))))
    assert numbers == [f"INV-{number:04d}" for number in range(1, len(numbers) + 1)]
    assert (take_number("quote"), take_number("invoice")) == ("QT-0041", f"INV-{len(numbers) + 1:04d}")


@pytest.mark.parametrize("command", ["seed", "empty"])
@pytest.mark.parametrize("reply", ["no\n", "y\n", "\n", "YESS\n"])
def test_any_other_answer_wipes_nothing(with_records, monkeypatch, command, reply):
    before = counts()
    answer(monkeypatch, reply)
    assert cli.main([command]) == 1
    assert counts() == before


@pytest.mark.parametrize("command", ["seed", "empty"])
def test_nobody_at_the_keyboard_wipes_nothing(with_records, monkeypatch, capsys, command):
    before = counts()
    answer(monkeypatch, "")
    assert cli.main([command]) == 1
    assert counts() == before
    assert "nothing was changed" in capsys.readouterr().out.lower()


def test_yes_flag_skips_the_question(with_records, monkeypatch):
    def no_question(*_args):
        raise AssertionError("asked a question")

    monkeypatch.setattr("builtins.input", no_question)
    assert cli.main(["empty", "--yes"]) == 0
    assert counts() == EMPTY


@pytest.mark.parametrize("command", ["seed", "empty"])
def test_works_with_the_apps_connection_open(with_records, command):
    with db.engine().connect() as appconnection:
        appconnection.execute(select(organizations)).all()
        assert cli.main([command, "--yes"]) == 0


def test_leaves_the_file_and_tables_in_place(with_records, database):
    before = database.stat().st_ino
    cli.main(["empty", "--yes"])
    assert database.stat().st_ino == before
    assert counts() == EMPTY


def everyone() -> set[str]:
    with db.reading() as conn:
        return set(conn.scalars(select(users.users.c.id)))


@pytest.mark.parametrize("command", ["seed", "empty"])
def test_the_teammates_and_everyone_else_who_signed_in_stay(with_records, command):
    with db.writing() as conn:
        users.add_missing_teammates(conn)
        users.remember(conn, "someone-real", "Sam Real", "sam@company.example")
    before = everyone()

    assert cli.main([command, "--yes"]) == 0

    assert everyone() == before
    assert {teammate.id for teammate in users.TEAMMATES} <= before


@pytest.mark.parametrize("command", ["seed", "empty"])
@pytest.mark.parametrize("address", ["postgresql://someone@db.example/postgres", ""])
def test_refuses_with_the_shared_apps_database_set(with_records, monkeypatch, capsys, command, address):
    before = counts()
    with monkeypatch.context() as patch:
        patch.setenv("DATABASE_URL", address)
        patch.setattr("builtins.input", lambda *_args: "yes")
        assert cli.main([command]) == 2
    assert counts() == before
    assert "nothing was changed" in capsys.readouterr().err.lower()


def test_seed_before_the_first_start_builds_the_database(tmp_path, monkeypatch, capsys):
    path = tmp_path / "first.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    assert cli.main(["seed"]) == 0
    after = counts()
    assert (after["deals"], after["products"], after["quotes"], after["bills"]) == (80, 12, 40, 85)
    assert everyone() == {teammate.id for teammate in users.TEAMMATES}
    assert "Sample data added" in capsys.readouterr().out
    db.dispose()


def test_empty_before_the_first_start_leaves_an_empty_database(tmp_path, monkeypatch):
    path = tmp_path / "first.db"
    monkeypatch.setenv("ACCOUNTABLE_DB", str(path))
    db.dispose()
    assert cli.main(["empty"]) == 0
    assert path.exists()
    assert counts() == EMPTY
    assert everyone() == {teammate.id for teammate in users.TEAMMATES}
    db.dispose()


OUR_OWN = {
    "company_name": "Our Real Company",
    "tax_rate": 6000,
    "quote_prefix": "Q-",
    "opening_balance_cents": -125_000,
    "opening_balance_on": date(2026, 3, 1),
    "updated_by": "someone-real",
}
OPENING_BALANCE = ("opening_balance_cents", "opening_balance_on")


def the_settings() -> dict:
    with db.reading() as conn:
        row = conn.execute(select(company_settings)).one()._mapping
    return {name: row[name] for name in (*SAMPLE_COMPANY, *OPENING_BALANCE, "updated_by")}


@pytest.fixture
def changed_settings(with_records):
    with db.writing() as conn:
        users.remember(conn, "someone-real", "Sam Real", "sam@company.example")
        conn.execute(update(company_settings).values(**OUR_OWN))


def test_seed_puts_the_sample_company_back_over_changed_settings(changed_settings, monkeypatch):
    """Its opening balance included, as of the first day of the cash flow's first month (B12)."""
    monkeypatch.setattr(db, "local_today", lambda: date(2026, 11, 5))
    assert cli.main(["seed", "--yes"]) == 0
    assert the_settings() == {
        **SAMPLE_COMPANY,
        "opening_balance_cents": 4_000_000,
        "opening_balance_on": date(2025, 12, 1),
        "updated_by": "teammate-dana-whitfield",
    }


def test_empty_leaves_the_settings_as_they_were(changed_settings):
    before = the_settings()
    assert cli.main(["empty", "--yes"]) == 0
    assert the_settings() == before
    assert {name: before[name] for name in OUR_OWN} == OUR_OWN


def test_seed_says_the_settings_will_be_replaced_and_empty_doesnt(with_records, monkeypatch, capsys):
    answer(monkeypatch, "no\n")
    cli.main(["seed"])
    assert "The company settings will be replaced with the sample company's." in capsys.readouterr().out
    answer(monkeypatch, "no\n")
    cli.main(["empty"])
    assert "company settings" not in capsys.readouterr().out


def test_a_seed_that_isnt_confirmed_leaves_the_settings_alone(changed_settings, monkeypatch):
    before = the_settings()
    answer(monkeypatch, "no\n")
    assert cli.main(["seed"]) == 1
    assert the_settings() == before


OUR_LOGO = b"our own logo, as it was saved"
OUR_LOOK = {"invoice_design": "ledger", "accent_color": "#000000"}


def the_logo() -> bytes | None:
    with db.reading() as conn:
        return conn.scalar(select(company_logo.c.image))


@pytest.fixture
def our_look(changed_settings):
    with db.writing() as conn:
        conn.execute(update(company_settings).values(**OUR_LOOK))
        conn.execute(insert(company_logo).values(id=1, image=OUR_LOGO, media_type="image/png", width=10, height=10))


def test_empty_leaves_the_logo_the_design_and_the_accent_color(our_look):
    assert cli.main(["empty", "--yes"]) == 0
    assert the_logo() == OUR_LOGO
    with db.reading() as conn:
        row = conn.execute(select(company_settings)).one()
    assert (row.invoice_design, row.accent_color) == ("ledger", "#000000")


def test_seed_puts_the_sample_logo_design_and_accent_color_back(our_look):
    assert cli.main(["seed", "--yes"]) == 0
    assert the_logo() == SAMPLE_LOGO.read_bytes()
    assert {name: the_settings()[name] for name in OUR_LOOK} == {"invoice_design": "banner", "accent_color": "#0E6B6B"}


def test_seed_and_empty_count_invoices_and_payments_in_their_question(with_records, monkeypatch, capsys):
    answer(monkeypatch, "no\n")
    cli.main(["empty"])
    assert "1 quote, 0 invoices, 0 payments, 1 bill." in capsys.readouterr().out
