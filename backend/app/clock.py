"""The app's one clock (spec 2.4).

today() is the computer's local date. now() is the current time in UTC, with its
time zone. local_date() and local_time() use the same local calendar as today(),
for times stored in UTC.

Tests fix all of this with freeze() and undo it with unfreeze(). A frozen clock
also fixes the time zone, UTC unless one is given, so the tests give the same
answers on any computer.
"""

from datetime import date, datetime, time, timezone, tzinfo

_frozen_today: date | None = None
_frozen_now: datetime | None = None
_frozen_zone: tzinfo | None = None


def today() -> date:
    if _frozen_today is not None:
        return _frozen_today
    return date.today()


def now() -> datetime:
    if _frozen_now is not None:
        return _frozen_now
    return datetime.now(timezone.utc)


def local_date(moment: datetime) -> date:
    """The local date at a moment, on the same calendar as today()."""
    # astimezone(None) means the computer's own time zone.
    return moment.astimezone(_frozen_zone).date()


def local_time(day: date, at: time) -> datetime:
    """A local time on a day, with its time zone."""
    if _frozen_zone is not None:
        return datetime.combine(day, at, tzinfo=_frozen_zone)
    return datetime.combine(day, at).astimezone()


def freeze(today_value: date, now_value: datetime, zone: tzinfo = timezone.utc) -> None:
    global _frozen_today, _frozen_now, _frozen_zone
    if now_value.tzinfo is None:
        raise ValueError("now must carry a time zone")
    _frozen_today = today_value
    _frozen_now = now_value.astimezone(timezone.utc)
    _frozen_zone = zone


def unfreeze() -> None:
    global _frozen_today, _frozen_now, _frozen_zone
    _frozen_today = None
    _frozen_now = None
    _frozen_zone = None
