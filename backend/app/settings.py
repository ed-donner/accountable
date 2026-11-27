"""Settings read from the environment, and the one place that decides what "today" is (D9)."""

import os
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "backend" / "data" / "accountable.db"


def db_path() -> Path:
    """The SQLite file. `ACCOUNTABLE_DB` overrides it, and the tests always set it (D2, R6)."""
    return Path(os.environ.get("ACCOUNTABLE_DB") or DEFAULT_DB)


def allowed_hosts() -> list[str]:
    """Host names the API answers to. Only this computer by default, which also stops a web page
    from reaching the API through DNS rebinding. `ACCOUNTABLE_ALLOWED_HOSTS` (comma-separated) adds a deployed name."""
    extra = os.environ.get("ACCOUNTABLE_ALLOWED_HOSTS", "")
    return ["localhost", "127.0.0.1", *(h.strip() for h in extra.split(",") if h.strip())]


def today() -> date:
    """The server's local date. `ACCOUNTABLE_TODAY` (YYYY-MM-DD) pins it, for tests only."""
    pinned = os.environ.get("ACCOUNTABLE_TODAY")
    return date.fromisoformat(pinned) if pinned else date.today()
