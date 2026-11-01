"""The plan's layout rules, checked so they can't slip unnoticed."""

import re
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "accountable"
MAY_NAME_CRM = {"main.py", "cli.py", "migrations/env.py"}


def sources() -> list[Path]:
    return [path for path in PACKAGE.rglob("*.py") if "__pycache__" not in path.parts]


def test_only_main_cli_and_the_migrations_name_crm():
    found = {
        path.relative_to(PACKAGE).as_posix()
        for path in sources()
        if "crm" not in path.relative_to(PACKAGE).parts[:1] and re.search(r"accountable\.crm|import crm", path.read_text())
    }
    assert found <= MAY_NAME_CRM


def test_db_never_imports_crm():
    assert "crm" not in (PACKAGE / "db.py").read_text()


def test_there_is_no_raw_sql():
    for path in sources():
        text = path.read_text()
        assert "exec_driver_sql" not in text, path
        assert not re.search(r"\bfrom sqlalchemy import [^\n]*\btext\b", text), path
        assert not re.search(r"""CheckConstraint\(\s*['"]""", text), path


def test_sqlite_specific_code_stays_in_db():
    for path in sources():
        if path.name != "db.py":
            assert "sqlite3" not in path.read_text(), path
