"""The sample data loader, and the npm run seed command (RUN-3).

uv run python -m backend.app.seed         asks first
uv run python -m backend.app.seed --yes   doesn't ask, for the tests
"""

import argparse
import calendar
import sys
from collections import Counter
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import Connection, delete, insert

from backend.app import clock, rules
from backend.app.db import activities, contacts, deals, organizations
from backend.app.seed_data import DEALS, LOGGED, ORGANIZATIONS, PEOPLE, DaysFromToday, MonthsAgo

STEP_TIMES = ["11:20", "14:05", "10:42", "16:10"]


def resolve_close(spec: DaysFromToday | MonthsAgo, today: date) -> date:
    if isinstance(spec, DaysFromToday):
        return today + timedelta(days=spec.days)
    year, month = today.year, today.month - spec.months
    while month <= 0:
        year, month = year - 1, month + 12
    day = date(year, month, min(spec.day, calendar.monthrange(year, month)[1]))
    # Never after today, and kept out of the board's 30-day Won and Lost columns.
    return min(day, today - timedelta(days=rules.CLOSED_WINDOW_DAYS + 1))


def at(day: date, hhmm: str, now: datetime) -> datetime:
    """A local time on a day, in UTC. A time later than now moves to just before
    now, keeping the order of the day's times."""
    hours, minutes = (int(part) for part in hhmm.split(":"))
    moment = clock.local_time(day, time(hours, minutes)).astimezone(UTC)
    if moment > now:
        minutes_left_in_day = 24 * 60 - (hours * 60 + minutes)
        moment = now - timedelta(minutes=1 + minutes_left_in_day / 10)
    return moment.replace(microsecond=0)


def load_sample_data(conn: Connection, today: date, now: datetime) -> dict[str, int]:
    """Empty every table, then load the sample data, in the caller's transaction."""
    for table in (activities, deals, contacts, organizations):
        conn.execute(delete(table))

    org_ids: dict[str, int] = {}
    domains: dict[str, str] = {}
    for index, org in enumerate(ORGANIZATIONS):
        created = at(today - timedelta(days=600 - 20 * index), "09:00", now)
        org_ids[org.key] = conn.execute(
            insert(organizations)
            .values(
                name=org.name,
                website=org.domain,
                industry=org.industry,
                notes=org.notes,
                created_at=created,
                updated_at=created,
            )
            .returning(organizations.c.id)
        ).scalar_one()
        domains[org.key] = org.domain

    contact_ids: dict[str, int] = {}
    for index, person in enumerate(PEOPLE):
        created = at(today - timedelta(days=420 - 7 * index), "10:00", now)
        local_part = person.name.lower().replace(" ", ".")
        domain = domains[person.org] if person.org else "mail.example"
        contact_ids[person.key] = conn.execute(
            insert(contacts)
            .values(
                name=person.name,
                email=f"{local_part}@{domain}",
                phone=person.phone,
                job_title=person.job_title,
                organization_id=org_ids[person.org] if person.org else None,
                status=person.status,
                created_at=created,
                updated_at=created,
            )
            .returning(contacts.c.id)
        ).scalar_one()

    deal_ids: dict[str, int] = {}
    close_dates: dict[str, date] = {}
    positions: Counter = Counter()
    stage_change_count = 0
    for deal in DEALS:
        stage = deal.path[-1]
        close = resolve_close(deal.close, today)
        end = min(close, today)
        created = at(end + timedelta(days=deal.age), "09:00", now)
        changes = list(zip(deal.path, deal.path[1:]))
        assert len(changes) == len(deal.steps), deal.key
        deal_ids[deal.key] = deal_id = conn.execute(
            insert(deals)
            .values(
                name=deal.name,
                organization_id=org_ids[deal.org],
                main_contact_id=contact_ids[deal.contact] if deal.contact else None,
                stage=stage,
                value=deal.value,
                probability=rules.USUAL_PROBABILITY[stage],
                close_date=close,
                position=positions[stage],
                created_at=created,
                updated_at=created,
            )
            .returning(deals.c.id)
        ).scalar_one()
        positions[stage] += 1
        close_dates[deal.key] = close
        for index, ((from_stage, to_stage), offset) in enumerate(zip(changes, deal.steps)):
            occurred = at(end + timedelta(days=offset), STEP_TIMES[index % len(STEP_TIMES)], now)
            conn.execute(
                insert(activities).values(
                    type="stage_change",
                    deal_id=deal_id,
                    description=rules.stage_change_description(from_stage, to_stage),
                    occurred_at=occurred,
                    done=False,
                    from_stage=from_stage,
                    to_stage=to_stage,
                    created_at=occurred,
                    updated_at=occurred,
                )
            )
            stage_change_count += 1

    for entry in LOGGED:
        kind, key = entry.on.split(":")
        if entry.when[0] == "close":
            _, days, hhmm = entry.when
            day = close_dates[key] + timedelta(days=days)
        else:
            days, hhmm = entry.when
            day = today + timedelta(days=days)
        occurred = at(min(day, today), hhmm, now)
        follow_up = today + timedelta(days=entry.follow_up) if entry.follow_up is not None else None
        conn.execute(
            insert(activities).values(
                type=entry.type,
                contact_id=contact_ids[key] if kind == "contact" else None,
                deal_id=deal_ids[key] if kind == "deal" else None,
                description=entry.description,
                occurred_at=occurred,
                follow_up_date=follow_up,
                done=entry.done,
                created_at=occurred,
                updated_at=occurred,
            )
        )

    return {
        "organizations": len(ORGANIZATIONS),
        "contacts": len(PEOPLE),
        "deals": len(DEALS),
        "activities": len(LOGGED),
        "stage_changes": stage_change_count,
    }


def summary(counts: dict[str, int]) -> str:
    return (
        f"Sample data loaded: {counts['organizations']} organizations, {counts['contacts']} contacts, "
        f"{counts['deals']} deals, {counts['activities']} activities "
        f"(plus {counts['stage_changes']} stage changes)."
    )


def main(argv: list[str] | None = None) -> int:
    from backend.app.config import Settings
    from backend.app.db import make_engine
    from backend.app.main import run_migrations

    parser = argparse.ArgumentParser(description="Reset Accountable's data to the sample data.")
    parser.add_argument("--yes", action="store_true", help="don't ask first")
    args = parser.parse_args(argv)

    # Ask before touching anything. Running the migrations first would create
    # an empty database on a new install, and the app would then never load the
    # sample data into it (DATA-1).
    if not args.yes:
        try:
            answer = input("This replaces all your data with the sample data. Type yes to continue: ")
        except EOFError:
            answer = ""
        if answer.strip().lower() != "yes":
            print("Nothing changed.")
            return 0

    settings = Settings.from_env()
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = make_engine(settings.db_path)
    try:
        run_migrations(engine)
        # One transaction, so a running app keeps working (RUN-3).
        with engine.connect() as conn:
            conn.info["write"] = True
            with conn.begin():
                counts = load_sample_data(conn, clock.today(), clock.now())
        print(summary(counts))
        return 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
