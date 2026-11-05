"""Each quote's and invoice's number (B15), and the settings later areas read, from company/documents.py."""

import threading

import pytest
from accountable import db
from accountable.company import documents
from accountable.company.tables import company_settings, number_counters
from sqlalchemy import insert, update


def take(kind: documents.DocumentKind) -> str:
    with db.writing() as conn:
        return documents.take_number(conn, kind)


def change_settings(**values) -> None:
    with db.writing() as conn:
        conn.execute(update(company_settings).values(**values))


def test_each_kind_counts_from_1_on_its_own_with_its_prefix(database):
    assert [take("quote") for _ in range(3)] == ["QT-0001", "QT-0002", "QT-0003"]
    assert take("invoice") == "INV-0001"
    assert take("quote") == "QT-0004"


def test_a_number_has_the_prefix_the_settings_have_when_its_taken(database):
    take("invoice")
    change_settings(invoice_prefix="BILL-")
    assert take("invoice") == "BILL-0002"


def test_a_number_past_9999_takes_another_figure(database):
    with db.writing() as conn:
        conn.execute(insert(number_counters).values(kind="quote", last_number=9999))
    assert take("quote") == "QT-10000"


def test_a_save_that_fails_gives_its_number_back(database):
    with pytest.raises(RuntimeError), db.writing() as conn:
        documents.take_number(conn, "invoice")
        raise RuntimeError("The invoice couldn't be saved")
    assert take("invoice") == "INV-0001"


def test_numbers_taken_at_the_same_moment_have_no_gaps_or_repeats(database):
    taken: list[str] = []
    issuing = [threading.Thread(target=lambda: taken.append(take("invoice"))) for _ in range(20)]
    for thread in issuing:
        thread.start()
    for thread in issuing:
        thread.join()
    assert sorted(taken) == [f"INV-{number:04d}" for number in range(1, 21)]


def test_later_areas_read_the_settings_as_saved(database):
    change_settings(company_name="Plainsong Systems", tax_label="VAT", tax_rate=8875, payment_terms_days=14)
    with db.reading() as conn:
        saved = documents.current_settings(conn)
    assert (saved.company_name, saved.tax_label, saved.tax_rate, saved.payment_terms_days, saved.quote_prefix) == (
        "Plainsong Systems",
        "VAT",
        8875,
        14,
        "QT-",
    )
