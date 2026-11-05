"""The layout rules in docs/specs/architecture.md, checked so they can't slip unnoticed."""

import re
from pathlib import Path

import pytest

PACKAGE = Path(__file__).resolve().parents[1] / "accountable"
# Each business area's folder, found by its tables, so a later area is held to the rules too.
AREAS = sorted(path.parent.name for path in PACKAGE.glob("*/tables.py"))
# Where the app is put together. Everything else, every area's folder included, gets
# what it needs from the top level.
MAY_NAME_AN_AREA = {"main.py", "cli.py", "migrations/env.py"}
# The one area other areas may import: later ones, such as quotes and invoices, read the company's details.
OTHERS_MAY_IMPORT = {"company"}


def sources() -> list[Path]:
    return [path for path in PACKAGE.rglob("*.py") if "__pycache__" not in path.parts]


def area_of(path: Path) -> str | None:
    first = path.relative_to(PACKAGE).parts[0]
    return first if first in AREAS else None


def names(path: Path, area: str) -> bool:
    return bool(re.search(rf"accountable\.{area}\b|import {area}\b", path.read_text()))


def test_the_areas_are_found():
    assert AREAS == ["company", "crm", "products"]


@pytest.mark.parametrize("area", sorted(set(AREAS) - OTHERS_MAY_IMPORT))
def test_no_area_imports_another(area):
    others = [path for path in sources() if area_of(path) not in (None, area)]
    assert others  # The check is looking in the right place.
    assert [path.relative_to(PACKAGE).as_posix() for path in others if names(path, area)] == []


@pytest.mark.parametrize("area", AREAS)
def test_only_main_cli_and_the_migrations_name_an_area(area):
    found = {path.relative_to(PACKAGE).as_posix() for path in sources() if area_of(path) is None and names(path, area)}
    assert found <= MAY_NAME_AN_AREA
    assert "main.py" in found  # The check is looking in the right place.


@pytest.mark.parametrize("area", AREAS)
@pytest.mark.parametrize("module", ["db.py", "search.py"])
def test_db_and_search_never_name_an_area(module, area):
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
