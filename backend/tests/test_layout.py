"""The layout rules in docs/specs/architecture.md, checked so they can't slip unnoticed."""

import ast
import re
from pathlib import Path

import pytest
from accountable.main import AREAS as APP_AREAS

PACKAGE = Path(__file__).resolve().parents[1] / "accountable"
# Each business area's folder, found by its tables, so a later area is held to the rules too.
AREAS = sorted(path.parent.name for path in PACKAGE.glob("*/tables.py"))
# Where the app is put together. Everything else, every area's folder included, gets
# what it needs from the top level.
MAY_NAME_AN_AREA = {"main.py", "cli.py", "migrations/env.py"}
# The one area every other may import: later ones, such as quotes and invoices, read the company's details.
OTHERS_MAY_IMPORT = {"company"}
# The areas that import no other area but company/. company/ imports none at all.
FIRST_AREAS = {"company", "crm", "products"}
# What a later area, such as invoices, may import from the first ones: their tables, for
# foreign keys and reads, and the CRM's rules, so a deal changes stage the one way however
# it's asked for. Later areas never import each other, and the first ones never import them.
BUILT_ON = {"crm": {"tables", "rules"}, "products": {"tables"}}


def sources() -> list[Path]:
    return [path for path in PACKAGE.rglob("*.py") if "__pycache__" not in path.parts]


def area_of(path: Path) -> str | None:
    first = path.relative_to(PACKAGE).parts[0]
    return first if first in AREAS else None


def names(path: Path, area: str) -> bool:
    return bool(re.search(rf"accountable\.{area}\b|import {area}\b", path.read_text()))


def test_the_areas_are_found():
    assert AREAS == ["company", "crm", "products", "quotes"]


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


def later_area_may_import(area: str, module: str) -> bool:
    return area in OTHERS_MAY_IMPORT or module in BUILT_ON.get(area, set())


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
    ],
)
def test_a_later_area_may_import_only_what_it_builds_on(area, module, allowed):
    assert later_area_may_import(area, module) is allowed


def test_the_first_areas_import_no_other_area_but_company():
    for path in sources():
        own = area_of(path)
        if own in FIRST_AREAS:
            others = {area for area, _ in imported_areas(path.read_text())} - {own}
            assert others <= (set() if own == "company" else OTHERS_MAY_IMPORT), path
    # The check is looking in the right place.
    assert ("crm", "rules") in imported_areas((PACKAGE / "crm" / "routers" / "deals.py").read_text())


def test_a_later_area_imports_only_the_first_areas_tables_and_the_crms_rules():
    """Quotes is the first later area, and invoices and bills are held to the same rules."""
    for path in sources():
        own = area_of(path)
        if own is not None and own not in FIRST_AREAS:
            for area, module in imported_areas(path.read_text()):
                assert area == own or later_area_may_import(area, module), (path, area, module)
    # The check is looking in the right place.
    assert ("crm", "rules") in imported_areas((PACKAGE / "quotes" / "router.py").read_text())
    assert ("products", "tables") in imported_areas((PACKAGE / "quotes" / "tables.py").read_text())


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
@pytest.mark.parametrize("module", ["db.py", "search.py", "holds.py", "months.py"])
def test_db_search_holds_and_months_never_name_an_area(module, area):
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
