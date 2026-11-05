"""What every area's sample data shares: the time a sample record was put down at, and
which made-up teammate added it and last changed it (U13, U14)."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from accountable import who
from accountable.users import teammate


def moment(day: date, number: int) -> datetime:
    """A working-hours time on a local day, in UTC with no zone, varied by number.

    The hour repeats every 8 numbers. The activity types repeat every 3, so a repeat
    of 3 or 9 here would put every note at the same time of day.
    """
    local = datetime.combine(day, time(9 + number * 5 % 8, number * 17 % 60))
    return local.astimezone(UTC).replace(tzinfo=None)


def put_down_to(number: int, added_at: datetime, today: date, every: int) -> dict[str, Any]:
    """Added by one teammate, and for one record in every few, last changed by the next one since."""
    if number % every != 1:
        return who.added(teammate(number), added_at)
    changed_on = today - timedelta(days=3 + number * 7 % 90)
    return {**who.added(teammate(number), added_at), **who.changed(teammate(number + 1), moment(changed_on, number))}
