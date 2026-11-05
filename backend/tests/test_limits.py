import shutil
import statistics
import time
from pathlib import Path

import pytest
from accountable import db
from accountable.bills.tables import bills
from accountable.crm.tables import activities, contacts, deals
from accountable.products.tables import products
from accountable.quotes.tables import quote_lines, quotes
from conftest import TODAY, using_database
from limits_data import fill
from sqlalchemy import event, func, select

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
        assert conn.scalar(select(func.count()).select_from(products)) == 500
        assert conn.scalar(select(func.count()).select_from(quotes)) == 1000
        assert conn.scalar(select(func.count()).select_from(quote_lines)) == 5000
        longest = conn.scalar(select(func.max(quote_lines.c.position)))
        assert longest == 100
        assert conn.scalar(select(func.count()).select_from(bills)) == 1000


@pytest.mark.parametrize("path", ["/api/dashboard", "/api/bills/dashboard"])
def test_the_dashboard_and_its_money_section_are_quick(full, path):
    elapsed = median_ms(full, path)
    print(f"{path}: {elapsed:.1f}ms")
    assert elapsed < DASHBOARD_LIMIT_MS


@pytest.mark.parametrize(
    "path", ["/api/organizations", "/api/contacts", "/api/deals", "/api/products", "/api/quotes", "/api/bills"]
)
def test_lists_are_quick(full, path):
    elapsed = median_ms(full, path)
    print(f"{path}: {elapsed:.1f}ms")
    assert elapsed < LIST_LIMIT_MS


def test_the_longest_quote_is_quick(full):
    [longest] = [row["id"] for row in full.get("/api/quotes").json() if row["number"] == "QT-1000"]
    elapsed = median_ms(full, f"/api/quotes/{longest}")
    print(f"100-line quote: {elapsed:.1f}ms")
    assert elapsed < LIST_LIMIT_MS


def test_a_timeline_on_a_busy_organization_is_quick(full):
    organization = full.get("/api/organizations").json()[0]["id"]
    elapsed = median_ms(full, f"/api/organizations/{organization}/timeline")
    print(f"timeline: {elapsed:.1f}ms")
    assert elapsed < LIST_LIMIT_MS


# Each query is a round trip to the shared app's database, 80ms or more away, so
# every screen's reads keep to a few, however many records there are.
QUERIES = {
    "/api/dashboard": 3,
    "/api/organizations": 1,
    "/api/contacts": 1,
    "/api/deals": 1,
    "/api/organizations/{organization}": 1,
    "/api/contacts/{contact}": 1,
    "/api/deals/{deal}": 1,
    "/api/organizations/{organization}/timeline": 1,
    "/api/contacts/{contact}/timeline": 1,
    "/api/deals/{deal}/timeline": 1,
    "/api/products": 1,
    "/api/products/{product}": 1,
    "/api/bills": 1,
    "/api/bills/{bill}": 1,
    "/api/bills?organization_id={organization}": 1,
    # What's unpaid, and the 12 months' spending (E20).
    "/api/bills/dashboard": 2,
    # Every kind at once (K8).
    "/api/search?q=a": 1,
    # The tax a draft's total takes, then the quotes.
    "/api/quotes": 2,
    "/api/quotes?deal_id={deal}": 2,
    # The quote with its deal, the settings a draft follows, and its lines.
    "/api/quotes/{quote}": 3,
    "/api/quotes/new/{deal}": 2,
}


@pytest.mark.parametrize(("path", "most"), QUERIES.items())
def test_a_screen_asks_the_database_only_a_few_times(api, make, path, most):
    organization = make.organization()
    contact = make.contact(organization_id=organization)
    deal = make.deal(organization_id=organization, main_contact_id=contact)
    make.deal("Another", organization_id=organization, main_contact_id=contact)
    make.activity(deal_id=deal, follow_up_date=TODAY)
    make.activity(contact_id=contact)
    product = make.product()
    make.product("Archived", active=False)
    bill = make.bill(organization)
    make.bill(organization, "INV-0043", paid_on=TODAY)
    api.post(f"/api/deals/{deal}/move", json={"stage": "qualified"})
    lines = [{"product_id": product, "quantity": 1, "unit_price_cents": 4950}] * 3
    quote = api.post("/api/quotes", json={"deal_id": deal, "lines": lines}).json()["id"]

    statements: list[str] = []

    def count(_conn, _cursor, statement, *_rest) -> None:
        statements.append(statement)

    event.listen(db.engine(), "before_cursor_execute", count)
    try:
        address = path.format(
            organization=organization, contact=contact, deal=deal, product=product, quote=quote, bill=bill
        )
        assert api.get(address).status_code == 200
    finally:
        event.remove(db.engine(), "before_cursor_execute", count)
    assert len(statements) <= most, statements
