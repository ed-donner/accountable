"""The layout rules in docs/specs/architecture.md, checked so they can't slip unnoticed."""

import re
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "accountable"
# Where the app is put together. Everything else outside crm/, a later area's folder
# included, gets what it needs from the top level.
MAY_NAME_CRM = {"main.py", "cli.py", "migrations/env.py"}


def sources() -> list[Path]:
    return [path for path in PACKAGE.rglob("*.py") if "__pycache__" not in path.parts]


def test_only_main_cli_and_the_migrations_name_crm():
    found = {
        path.relative_to(PACKAGE).as_posix()
        for path in sources()
        if "crm" not in path.relative_to(PACKAGE).parts[:1]
        and re.search(r"accountable\.crm|import crm", path.read_text())
    }
    assert found <= MAY_NAME_CRM
    assert "main.py" in found  # The check is looking in the right place.


def test_db_never_imports_crm():
    assert "crm" not in (PACKAGE / "db.py").read_text()


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
