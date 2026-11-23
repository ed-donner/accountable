"""Sample data (S1 to S4), generated relative to today with a fixed random seed.

Run `npm run seed` (or `uv run python -m app.seed`) to delete everything and load it again.
"""

import random
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any

from faker import Faker
from sqlalchemy import Connection, Engine, delete, insert

from app import config
from app.db import (
    activities,
    contacts,
    deals,
    engine_for,
    insert_row,
    migrate,
    organizations,
    stage_changes,
)
from app.rules import OPEN_STAGES, Stage, usual_probability

SEED = 2026

# Each industry with the endings its company names use.
INDUSTRIES = {
    "Software": ["Software", "Systems", "Labs"],
    "Manufacturing": ["Manufacturing", "Industries", "Fabrication"],
    "Healthcare": ["Health", "Medical", "Clinics"],
    "Retail": ["Retail", "Stores", "Outfitters"],
    "Logistics": ["Logistics", "Freight", "Transport"],
    "Financial services": ["Capital", "Financial", "Advisors"],
    "Construction": ["Construction", "Builders", "Contracting"],
}
JOB_TITLES = [
    "Operations Director",
    "Head of Procurement",
    "Chief Financial Officer",
    "IT Manager",
    "Office Manager",
    "Sales Director",
    "Founder",
    "Purchasing Lead",
    "Facilities Manager",
    "Chief Operating Officer",
    "Finance Manager",
    "Project Manager",
]
DEAL_NAMES = [
    "annual licence",
    "support renewal",
    "pilot project",
    "platform upgrade",
    "fleet rollout",
    "training package",
    "second site expansion",
    "consulting retainer",
    "hardware refresh",
    "data migration",
    "multi-year agreement",
    "onboarding bundle",
]
NOTES = [
    "Prefers email over calls.",
    "Budget is set each January.",
    "Long-standing customer, pays on time.",
    "Introduced through a trade show.",
    None,
    None,
]
ACTIVITY_TEXT = {
    "call": [
        "Discovery call about current tools and pain points",
        "Walked through pricing options",
        "Checked in on the rollout",
        "Call about the renewal timeline",
        "Answered questions from their finance team",
        "Agreed next steps for the pilot",
    ],
    "email": [
        "Sent the proposal and a short summary",
        "Shared two customer references",
        "Followed up on the open questions",
        "Sent the revised quote",
        "Emailed the onboarding checklist",
        "Confirmed the meeting agenda",
    ],
    "note": [
        "Decision maker is the operations director",
        "Competitor quote came in lower, value matters more to them",
        "Budget approved for next quarter",
        "Wants a phased start in two sites",
        "Procurement needs three weeks for paperwork",
        "Happy with support so far",
    ],
}

# Counts and mix (S1, S2).
N_ORGS = 12
N_CONTACTS = 40
N_ACTIVITIES = 120
WON_MONTHS_AGO = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
LOST_MONTHS_AGO = [1, 3, 5, 7, 9]
OPEN_MIX: dict[Stage, int] = {"new": 3, "qualified": 4, "proposal": 4, "negotiation": 3}
LATE_PER_STAGE = {"qualified": 2, "proposal": 1, "negotiation": 1}


def _month_start(today: date, months_ago: int) -> date:
    year, month = today.year, today.month - months_ago
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def _day_in_month(rng: random.Random, today: date, months_ago: int) -> date:
    start = _month_start(today, months_ago)
    end = today if months_ago == 0 else _month_start(today, months_ago - 1) - timedelta(days=1)
    return start + timedelta(days=rng.randint(0, (end - start).days))


def _at(day: date, rng: random.Random) -> datetime:
    return datetime.combine(day, time(rng.randint(8, 17), rng.randint(0, 59)))


def _clear(conn: Connection) -> None:
    for table in (activities, stage_changes, deals, contacts, organizations):
        conn.execute(delete(table))


@dataclass
class _Org:
    id: int
    short: str
    domain: str


@dataclass
class _DealSpan:
    """When a deal was open, so its activities can fall inside that time."""

    deal_id: int
    start: date
    end: date


def _add_organizations(
    conn: Connection, rng: random.Random, fake: Faker, year_ago: date
) -> list[_Org]:
    """Organizations, across every industry."""
    orgs: list[_Org] = []
    industries = list(INDUSTRIES)
    for i in range(N_ORGS):
        industry = industries[i % len(industries)]
        short = fake.unique.last_name()
        name = f"{short} {rng.choice(INDUSTRIES[industry])}"
        domain = "".join(ch for ch in name.lower() if ch.isalnum()) + ".example.com"
        created = _at(year_ago + timedelta(days=rng.randint(0, 60)), rng)
        org_id = insert_row(
            conn,
            organizations,
            name=name,
            website=f"https://{domain}",
            industry=industry,
            notes=rng.choice(NOTES),
            created_at=created,
            updated_at=created,
        )
        orgs.append(_Org(org_id, short, domain))
    return orgs


def _contact_row(
    rng: random.Random, fake: Faker, year_ago: date, org: _Org | None
) -> dict[str, Any]:
    first, last = fake.unique.first_name(), fake.last_name()
    domain = org.domain if org else "example.net"
    created = _at(year_ago + timedelta(days=rng.randint(0, 200)), rng)
    return {
        "name": f"{first} {last}",
        "email": f"{first.lower()}.{last.lower()}@{domain}",
        "phone": fake.numerify("(###) 555-####"),
        "job_title": rng.choice(JOB_TITLES),
        "organization_id": org.id if org else None,
        "status": rng.choice(["lead", "lead", "qualified"]),
        "created_at": created,
        "updated_at": created,
    }


def _add_contacts(
    conn: Connection, rng: random.Random, fake: Faker, year_ago: date, orgs: list[_Org]
) -> tuple[list[int], dict[int, list[int]]]:
    """Contacts, mostly at an organization. Returns their ids, and the ids at each organization."""
    rows = [
        _contact_row(rng, fake, year_ago, orgs[i % N_ORGS] if i < N_CONTACTS - 3 else None)
        for i in range(N_CONTACTS)
    ]
    contact_ids = [insert_row(conn, contacts, **row) for row in rows]
    contacts_by_org: dict[int, list[int]] = {}
    for contact_id, row in zip(contact_ids, rows, strict=True):
        if row["organization_id"]:
            contacts_by_org.setdefault(row["organization_id"], []).append(contact_id)
    return contact_ids, contacts_by_org


def _deal_plans(rng: random.Random, today: date) -> list[tuple[Stage, date]]:
    """Each deal's stage and close date: closed ones over the past year, open ones
    ahead, a few running late."""
    plans: list[tuple[Stage, date]] = []
    for months_ago in WON_MONTHS_AGO:
        plans.append(("won", _day_in_month(rng, today, months_ago)))
    for months_ago in LOST_MONTHS_AGO:
        plans.append(("lost", _day_in_month(rng, today, months_ago)))
    for stage, count in OPEN_MIX.items():
        for n in range(count):
            if n < LATE_PER_STAGE.get(stage, 0):
                close = today - timedelta(days=rng.randint(3, 40))
            else:
                close = today + timedelta(days=rng.randint(10, 120))
            plans.append((stage, close))
    return plans


def _stage_path(rng: random.Random, stage: Stage) -> list[Stage]:
    """The stages a deal went through to reach `stage` (S3)."""
    if stage == "lost":
        reached = rng.randint(0, 3)
        return [*OPEN_STAGES[: reached + 1], "lost"]
    if stage == "won":
        return [*OPEN_STAGES, "won"]
    return OPEN_STAGES[: OPEN_STAGES.index(stage) + 1]


def _probability(rng: random.Random, stage: Stage) -> int:
    probability = usual_probability(stage)
    if stage in ("proposal", "negotiation") and rng.random() < 0.25:
        probability = min(95, probability + 10)  # set by hand
    return probability


def _add_stage_history(
    conn: Connection,
    rng: random.Random,
    deal_id: int,
    path: list[Stage],
    created_at: datetime,
    span: _DealSpan,
    closed: bool,
) -> None:
    """One stage change per step of the path, spread across the deal's open time."""
    days = max(1, (span.end - span.start).days)
    for step, to_stage in enumerate(path):
        if step == 0:
            when = created_at
        elif step == len(path) - 1 and closed:
            when = _at(span.end, rng)
        else:
            when = _at(span.start + timedelta(days=round(days * step / len(path))), rng)
        conn.execute(
            insert(stage_changes).values(
                deal_id=deal_id,
                from_stage=path[step - 1] if step else None,
                to_stage=to_stage,
                changed_at=when,
                created_at=when,
                updated_at=when,
            )
        )


def _deal_name(org: _Org, i: int) -> str:
    return f"{org.short} {DEAL_NAMES[(i + i // len(DEAL_NAMES)) % len(DEAL_NAMES)]}"


def _add_deals(
    conn: Connection,
    rng: random.Random,
    today: date,
    year_ago: date,
    orgs: list[_Org],
    contacts_by_org: dict[int, list[int]],
) -> tuple[list[_DealSpan], set[int]]:
    """Deals with their stage history. Returns each deal's open time, and the main
    contacts of won deals."""
    positions: dict[str, float] = {}
    spans: list[_DealSpan] = []
    won_contacts: set[int] = set()
    for i, (stage, close) in enumerate(_deal_plans(rng, today)):
        org = orgs[(i * 5) % N_ORGS]
        options = contacts_by_org.get(org.id, [])
        contact_id = rng.choice(options) if options else None
        value = rng.randrange(4_000, 120_000, 500)
        closed = stage in ("won", "lost")
        if closed:
            created_on = max(year_ago, close - timedelta(days=rng.randint(25, 110)))
            ends_on = close
        else:
            created_on = max(year_ago, today - timedelta(days=rng.randint(10, 200)))
            ends_on = today - timedelta(days=1)
        path = _stage_path(rng, stage)
        probability = _probability(rng, stage)
        positions[stage] = positions.get(stage, 0.0) + 1.0
        created_at = _at(created_on, rng)
        deal_id = insert_row(
            conn,
            deals,
            name=_deal_name(org, i),
            organization_id=org.id,
            contact_id=contact_id,
            stage=stage,
            value=value,
            probability=probability,
            close_date=close,
            position=positions[stage],
            created_at=created_at,
            updated_at=created_at,
        )
        span = _DealSpan(deal_id, created_on, ends_on)
        _add_stage_history(conn, rng, deal_id, path, created_at, span, closed)
        if stage == "won" and contact_id:
            won_contacts.add(contact_id)
        spans.append(span)
    return spans, won_contacts


def _make_customers(
    conn: Connection, rng: random.Random, contact_ids: list[int], won_contacts: set[int]
) -> None:
    """Every status is present: main contacts of won deals are customers (D5), plus a few more."""
    customer_ids = set(won_contacts)
    others = [cid for cid in contact_ids if cid not in customer_ids]
    customer_ids.update(rng.sample(others, 3))
    for cid in customer_ids:
        conn.execute(contacts.update().where(contacts.c.id == cid).values(status="customer"))


def _on_deal(
    rng: random.Random, spans: list[_DealSpan], today: date
) -> tuple[dict[str, int | None], date, date]:
    """A random deal to log an activity on, and the days the activity can fall in."""
    span = rng.choice(spans)
    return {"deal_id": span.deal_id, "contact_id": None}, span.start, min(span.end, today)


def _done_follow_up(rng: random.Random, occurred_on: date, today: date) -> date:
    """A follow-up date in the past, for an activity whose follow-up is done."""
    follow_up_on = min(
        today - timedelta(days=1),
        occurred_on + timedelta(days=rng.randint(2, 10)),
    )
    return max(follow_up_on, occurred_on)


def _add_activities(
    conn: Connection,
    rng: random.Random,
    today: date,
    year_ago: date,
    contact_ids: list[int],
    spans: list[_DealSpan],
) -> None:
    """Activities spread over the year, with follow-ups overdue, due soon, later and done."""
    follow_ups = (
        [("overdue", today - timedelta(days=d)) for d in (1, 3, 6, 12)]
        + [("upcoming", today + timedelta(days=d)) for d in (0, 1, 3, 5, 7)]
        + [("later", today + timedelta(days=d)) for d in (14, 30)]
    )
    # The won and lost deals come first, so the rest are the open ones.
    open_spans = spans[len(WON_MONTHS_AGO) + len(LOST_MONTHS_AGO) :]
    for i in range(N_ACTIVITIES):
        kind = rng.choice(["call", "call", "email", "email", "note"])
        on_deal = i % 2 == 0
        if on_deal:
            parent, start, end = _on_deal(rng, spans, today)
        else:
            parent = {"deal_id": None, "contact_id": rng.choice(contact_ids)}
            start, end = year_ago, today
        follow_up_on: date | None = None
        done = False
        if i < len(follow_ups):
            _, due = follow_ups[i]
            follow_up_on = due
            if on_deal:  # keep follow-ups on open deals
                parent, start, end = _on_deal(rng, open_spans, today)
            start = max(start, due - timedelta(days=21))
            end = min(end, due, today)
        elif i < len(follow_ups) + 8:
            done = True
        start = min(start, end)
        occurred_on = start + timedelta(days=rng.randint(0, (end - start).days))
        if done:
            follow_up_on = _done_follow_up(rng, occurred_on, today)
        at = _at(occurred_on, rng)
        conn.execute(
            insert(activities).values(
                type=kind,
                description=rng.choice(ACTIVITY_TEXT[kind]),
                occurred_on=occurred_on,
                follow_up_on=follow_up_on,
                done=done,
                created_at=at,
                updated_at=at,
                **parent,
            )
        )


def seed(engine: Engine, today: date, rng_seed: int = SEED) -> None:
    """Delete all data and load the sample data, relative to `today`."""
    path = Path(engine.url.database or "")
    if config.testing() and config.is_default_db(path):
        raise RuntimeError("Tests must not reseed the default database. Set ACCOUNTABLE_DB.")

    rng = random.Random(rng_seed)
    fake = Faker("en_US")
    fake.seed_instance(rng_seed)
    year_ago = today - timedelta(days=364)

    with engine.begin() as conn:
        _clear(conn)
        orgs = _add_organizations(conn, rng, fake, year_ago)
        contact_ids, contacts_by_org = _add_contacts(conn, rng, fake, year_ago, orgs)
        spans, won_contacts = _add_deals(conn, rng, today, year_ago, orgs, contacts_by_org)
        _make_customers(conn, rng, contact_ids, won_contacts)
        _add_activities(conn, rng, today, year_ago, contact_ids, spans)


def main() -> None:
    path = config.db_path()
    engine = engine_for(path)
    migrate(engine)
    seed(engine, config.server_today())
    print(f"The sample data is loaded into {path}.")


if __name__ == "__main__":
    main()
