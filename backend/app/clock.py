"""The app's one clock (spec 2.4).

today() is the computer's local date. now() is the current time in UTC, with its
time zone. Tests fix both with freeze() and undo it with unfreeze().
"""

from datetime import date, datetime, timezone

_frozen_today: date | None = None
_frozen_now: datetime | None = None


def today() -> date:
    if _frozen_today is not None:
        return _frozen_today
    return date.today()


def now() -> datetime:
    if _frozen_now is not None:
        return _frozen_now
    return datetime.now(timezone.utc)


def freeze(today_value: date, now_value: datetime) -> None:
    global _frozen_today, _frozen_now
    if now_value.tzinfo is None:
        raise ValueError("now must carry a time zone")
    _frozen_today = today_value
    _frozen_now = now_value.astimezone(timezone.utc)


def unfreeze() -> None:
    global _frozen_today, _frozen_now
    _frozen_today = None
    _frozen_now = None
