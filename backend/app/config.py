"""Settings read from environment variables.

ACCOUNTABLE_DB       path to the SQLite file (default: data/accountable.db)
ACCOUNTABLE_TODAY    fix "today" as YYYY-MM-DD, used by the tests
ACCOUNTABLE_TESTING  "1" while tests run: seeding then refuses the default database
"""

import os
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "data" / "accountable.db"


def db_path() -> Path:
    raw = os.environ.get("ACCOUNTABLE_DB")
    path = Path(raw) if raw else DEFAULT_DB
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


def fixed_today() -> date | None:
    raw = os.environ.get("ACCOUNTABLE_TODAY")
    return date.fromisoformat(raw) if raw else None


def server_today() -> date:
    return fixed_today() or date.today()


def testing() -> bool:
    return os.environ.get("ACCOUNTABLE_TESTING") == "1"


def is_default_db(path: Path) -> bool:
    return path.resolve() == DEFAULT_DB.resolve()
