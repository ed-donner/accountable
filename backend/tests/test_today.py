"""TB40: today comes from the browser when it can."""

from datetime import date

from app.deps import get_today


def test_local_date_header_used_when_valid():
    assert get_today("2026-03-04") == date(2026, 3, 4)


def test_server_date_used_otherwise(monkeypatch):
    monkeypatch.setenv("ACCOUNTABLE_TODAY", "2026-11-16")
    assert get_today(None) == date(2026, 11, 16)
    assert get_today("not a date") == date(2026, 11, 16)
    assert get_today("2026-13-45") == date(2026, 11, 16)


def test_real_server_date_without_override(monkeypatch):
    monkeypatch.delenv("ACCOUNTABLE_TODAY")
    assert get_today(None) == date.today()
