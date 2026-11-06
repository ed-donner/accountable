"""The layout rules in docs/specs/architecture.md, checked so they can't slip unnoticed."""

import ast
import re
from pathlib import Path

import pytest
from accountable.main import AREAS as APP_AREAS

PACKAGE = Path(__file__).resolve().parents[1] / "accountable"
# Each business area's folder, found as a package, so a later area is held to the rules too,
# the cash flow included, which keeps no tables.
AREAS = sorted(path.parent.name for path in PACKAGE.glob("*/__init__.py"))
# Where the app is put together. Everything else, every area's folder included, gets
# what it needs from the top level.
MAY_NAME_AN_AREA = {"main.py", "cli.py", "migrations/env.py"}
# The areas every other may import: later ones, such as quotes and invoices, read the company's details,
# and every area may post to the books, through books/post alone.
OTHERS_MAY_IMPORT = {"company", "books"}
# The areas that import no other area but company/ and books/. books/ imports none at all, and company/ only books/post.
FIRST_AREAS = {"books", "company", "crm", "products"}
# What a later area, such as invoices, may import from the first ones: their tables, for
# foreign keys and reads, and the CRM's rules, so a deal changes stage the one way however
# it's asked for. Later areas never import each other, and the first ones never import them.
BUILT_ON = {"crm": {"tables", "rules"}, "products": {"tables"}, "books": {"post"}}
# The one exception to later areas never importing each other, in one direction: invoices read the quotes' table,
# for invoices.quote_id and to make an invoice from an accepted quote (V33). Quotes import nothing of invoices'.
INVOICES_ALSO = {"quotes": {"tables"}}


def sources() -> list[Path]:
    return [path for path in PACKAGE.rglob("*.py") if "__pycache__" not in path.parts]


def area_of(path: Path) -> str | None:
    first = path.relative_to(PACKAGE).parts[0]
    return first if first in AREAS else None


def names(path: Path, area: str) -> bool:
    return bool(re.search(rf"accountable\.{area}\b|import {area}\b", path.read_text()))


def test_the_areas_are_found():
    assert AREAS == ["bills", "books", "cashflow", "company", "crm", "invoices", "products", "quotes"]


def imported_areas(source: str) -> set[tuple[str, str]]:
    """Each area a file's code imports, with the module, such as ("crm", "tables"), or "" for the area itself."""
    found: set[tuple[str, str]] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.ImportFrom) and node.module:
            found |= _from_import(node.module.split("."), [alias.name for alias in node.names])
        elif isinstance(node, ast.Import):
            found |= {module for alias in node.names if (module := _area_module(alias.name.split("."))) is not None}
    return found


def _area_module(parts: list[str]) -> tuple[str, str] | None:
    if parts[:1] != ["accountable"] or len(parts) < 2 or parts[1] not in AREAS:
        return None
    return parts[1], parts[2] if len(parts) > 2 else ""


def _from_import(parts: list[str], names: list[str]) -> set[tuple[str, str]]:
    if parts == ["accountable"]:
        return {(name, "") for name in names if name in AREAS}
    found = _area_module(parts)
    if found is None:
        return set()
    area, module = found
    return {(area, module)} if module else {(area, name) for name in names}


def later_area_may_import(area: str, module: str, importer: str = "") -> bool:
    extra = INVOICES_ALSO if importer == "invoices" else {}
    return area == "company" or module in {**BUILT_ON, **extra}.get(area, set())


@pytest.mark.parametrize(
    ("source", "found"),
    [
        ("from accountable.crm.tables import deals", {("crm", "tables")}),
        ("from accountable.crm import rules, tables", {("crm", "rules"), ("crm", "tables")}),
        ("import accountable.crm.rules", {("crm", "rules")}),
        ("from accountable import crm, db", {("crm", "")}),
        ("from accountable.crm.routers import deals", {("crm", "routers")}),
        ("from accountable.products.tables import products", {("products", "tables")}),
        ("from accountable import api, db, who", set()),
    ],
)
def test_every_way_of_importing_an_area_is_seen(source, found):
    assert imported_areas(source) == found


@pytest.mark.parametrize(
    ("area", "module", "allowed"),
    [
        ("crm", "tables", True),
        ("crm", "rules", True),
        ("products", "tables", True),
        ("company", "documents", True),
        ("crm", "routers", False),
        ("crm", "", False),
        ("products", "router", False),
        ("invoices", "tables", False),
        ("books", "post", True),
        ("books", "router", False),
        ("books", "tables", False),
        ("quotes", "tables", False),
    ],
)
def test_a_later_area_may_import_only_what_it_builds_on(area, module, allowed):
    assert later_area_may_import(area, module) is allowed


@pytest.mark.parametrize(
    ("importer", "area", "module", "allowed"),
    [
        ("invoices", "quotes", "tables", True),
        ("invoices", "quotes", "router", False),
        ("invoices", "quotes", "document", False),
        ("invoices", "bills", "tables", False),
        ("bills", "quotes", "tables", False),
        ("quotes", "invoices", "tables", False),
        ("quotes", "crm", "tables", True),
    ],
)
def test_only_invoices_may_import_the_quotes_tables(importer, area, module, allowed):
    assert later_area_may_import(area, module, importer) is allowed


def test_the_first_areas_import_no_other_area_but_company_and_the_books():
    for path in sources():
        own = area_of(path)
        if own in FIRST_AREAS:
            others = {area for area, _ in imported_areas(path.read_text())} - {own}
            assert others <= (set() if own == "books" else OTHERS_MAY_IMPORT), path
    # The check is looking in the right place.
    assert ("crm", "rules") in imported_areas((PACKAGE / "crm" / "routers" / "deals.py").read_text())


def test_books_import_no_area_at_all():
    found = {area for path in sources() if area_of(path) == "books" for area, _ in imported_areas(path.read_text())}
    assert found <= {"books"}


def test_company_imports_only_books_post():
    """So the opening balance can be posted from the settings' own save (B25)."""
    found = {
        (area, module)
        for path in sources()
        if area_of(path) == "company"
        for area, module in imported_areas(path.read_text())
        if area != "company"
    }
    assert found == {("books", "post")}


def test_every_area_imports_the_books_through_post_alone():
    found = {
        module
        for path in sources()
        if area_of(path) not in (None, "books")
        for area, module in imported_areas(path.read_text())
        if area == "books"
    }
    assert found == {"post"}


def test_a_later_area_imports_only_the_first_areas_tables_and_the_crms_rules():
    """Quotes, invoices and bills are the later areas so far."""
    for path in sources():
        own = area_of(path)
        if own is not None and own not in FIRST_AREAS:
            for area, module in imported_areas(path.read_text()):
                assert area == own or later_area_may_import(area, module, own), (path, area, module)
    # The check is looking in the right place.
    assert ("crm", "rules") in imported_areas((PACKAGE / "quotes" / "router.py").read_text())
    assert ("products", "tables") in imported_areas((PACKAGE / "quotes" / "tables.py").read_text())
    assert ("crm", "tables") in imported_areas((PACKAGE / "bills" / "router.py").read_text())
    assert ("crm", "tables") in imported_areas((PACKAGE / "invoices" / "tables.py").read_text())
    assert ("quotes", "tables") in imported_areas((PACKAGE / "invoices" / "tables.py").read_text())


def test_the_cash_flow_imports_no_area_but_company():
    """It reads every area's money from the app, in the terms of the top-level cash.py, never from the areas."""
    found = set()
    for path in sources():
        if area_of(path) == "cashflow":
            found |= {area for area, _ in imported_areas(path.read_text())} - {"cashflow"}
    assert found == {"company"}


def test_quotes_routes_start_with_quotes_alone():
    [quotes] = [area for area in APP_AREAS if any("quotes" in router.prefix for router in area.routers)]
    assert quotes.route_starts == {"quotes"}


def test_each_area_has_routes_of_its_own_words():
    """main.py gives a request's field errors the messages of the area its route starts with,
    so no two areas' routes may start with the same word."""
    starts = [area.route_starts for area in APP_AREAS]
    assert "products" in starts[1]  # The check is looking in the right place.
    for one, area in enumerate(starts):
        for other in starts[one + 1 :]:
            assert area.isdisjoint(other)


@pytest.mark.parametrize("area", AREAS)
def test_only_main_cli_and_the_migrations_name_an_area(area):
    found = {path.relative_to(PACKAGE).as_posix() for path in sources() if area_of(path) is None and names(path, area)}
    assert found <= MAY_NAME_AN_AREA
    assert "main.py" in found  # The check is looking in the right place.


@pytest.mark.parametrize("area", AREAS)
@pytest.mark.parametrize("module", ["db.py", "search.py", "holds.py", "months.py", "cash.py"])
def test_db_search_holds_months_and_cash_never_name_an_area(module, area):
    assert not names(PACKAGE / module, area)


def test_there_is_no_raw_sql():
    for path in sources():
        text = path.read_text()
        assert "exec_driver_sql" not in text, path
        assert not re.search(r"\bfrom sqlalchemy import [^\n]*\b(text|literal_column)\b", text), path
        assert not re.search(r"\b(sa|sqlalchemy)\.(text|literal_column)\(", text), path
        assert not re.search(r"""CheckConstraint\(\s*['"]""", text), path


# Turning on row-level security is the one thing SQLAlchemy can't say, so it's the one raw SQL allowed.
SQL_IN_A_STRING = re.compile(r"""\w+\.execute\(\s*f?['"][^\n]*""")
TURNS_ON_ROW_LEVEL_SECURITY = re.compile(r"""op\.execute\(f?"ALTER TABLE (\w+|\{\w+\}) ENABLE ROW LEVEL SECURITY"\)$""")


def test_the_only_sql_in_a_string_turns_on_row_level_security_in_a_migration():
    found = {path: SQL_IN_A_STRING.findall(path.read_text()) for path in sources()}
    for path, calls in found.items():
        if calls:
            assert path.is_relative_to(PACKAGE / "migrations" / "versions"), path
        for call in calls:
            assert TURNS_ON_ROW_LEVEL_SECURITY.search(call), (path, call)
    assert any(found.values())  # The check is looking in the right place.


def test_sqlite_specific_code_stays_in_db():
    for path in sources():
        if path.name != "db.py":
            assert "sqlite3" not in path.read_text(), path


def test_quotes_import_nothing_of_invoices():
    for path in sources():
        if area_of(path) == "quotes":
            assert "invoices" not in {area for area, _ in imported_areas(path.read_text())}, path


def test_invoices_import_only_the_quotes_tables_of_quotes():
    found = {
        module
        for path in sources()
        if area_of(path) == "invoices"
        for area, module in imported_areas(path.read_text())
        if area == "quotes"
    }
    assert found == {"tables"}


def test_the_invoice_from_a_quote_route_starts_with_invoices_alone():
    [invoices] = [area for area in APP_AREAS if any("invoices" in router.prefix for router in area.routers)]
    assert invoices.route_starts == {"invoices"}
