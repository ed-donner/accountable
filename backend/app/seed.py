"""Sample data (S1 to S4), generated relative to today with a fixed random seed.

Run `npm run seed` (or `uv run python -m app.seed`) to delete everything and load it again.
"""

import random
from datetime import date, datetime, time, timedelta
from pathlib import Path

from faker import Faker
from sqlalchemy import Engine, delete, insert

from app import config
from app.db import activities, contacts, deals, engine_for, migrate, organizations, stage_changes
from app.rules import OPEN_STAGES, usual_probability

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
OPEN_MIX = {"new": 3, "qualified": 4, "proposal": 4, "negotiation": 3}
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


def _clear(conn) -> None:
    for table in (activities, stage_changes, deals, contacts, organizations):
        conn.execute(delete(table))


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

        # Organizations, across every industry.
        org_ids: list[int] = []
        org_names: dict[int, str] = {}
        org_short: dict[int, str] = {}
        org_domains: dict[int, str] = {}
        industries = list(INDUSTRIES)
        for i in range(N_ORGS):
            industry = industries[i % len(industries)]
            short = fake.unique.last_name()
            name = f"{short} {rng.choice(INDUSTRIES[industry])}"
            domain = "".join(ch for ch in name.lower() if ch.isalnum()) + ".example.com"
            created = _at(year_ago + timedelta(days=rng.randint(0, 60)), rng)
            org_id = conn.execute(
                insert(organizations).values(
                    name=name,
                    website=f"https://{domain}",
                    industry=industry,
                    notes=rng.choice(NOTES),
                    created_at=created,
                    updated_at=created,
                )
            ).inserted_primary_key[0]
            org_ids.append(org_id)
            org_names[org_id] = name
            org_short[org_id] = short
            org_domains[org_id] = domain

        # Contacts, mostly at an organization.
        contact_rows: list[dict] = []
        for i in range(N_CONTACTS):
            first, last = fake.unique.first_name(), fake.last_name()
            org_id = org_ids[i % N_ORGS] if i < N_CONTACTS - 3 else None
            domain = org_domains[org_id] if org_id else "example.net"
            created = _at(year_ago + timedelta(days=rng.randint(0, 200)), rng)
            contact_rows.append(
                {
                    "name": f"{first} {last}",
                    "email": f"{first.lower()}.{last.lower()}@{domain}",
                    "phone": fake.numerify("(###) 555-####"),
                    "job_title": rng.choice(JOB_TITLES),
                    "organization_id": org_id,
                    "status": rng.choice(["lead", "lead", "qualified"]),
                    "created_at": created,
                    "updated_at": created,
                }
            )
        contact_ids = [
            conn.execute(insert(contacts).values(**row)).inserted_primary_key[0] for row in contact_rows
        ]
        contacts_by_org: dict[int, list[int]] = {}
        for cid, row in zip(contact_ids, contact_rows, strict=True):
            if row["organization_id"]:
                contacts_by_org.setdefault(row["organization_id"], []).append(cid)

        # Deals: closed ones over the past year, open ones ahead, a few running late.
        plans: list[dict] = []
        for months_ago in WON_MONTHS_AGO:
            plans.append({"stage": "won", "close": _day_in_month(rng, today, months_ago)})
        for months_ago in LOST_MONTHS_AGO:
            plans.append({"stage": "lost", "close": _day_in_month(rng, today, months_ago)})
        for stage, count in OPEN_MIX.items():
            for n in range(count):
                if n < LATE_PER_STAGE.get(stage, 0):
                    close = today - timedelta(days=rng.randint(3, 40))
                else:
                    close = today + timedelta(days=rng.randint(10, 120))
                plans.append({"stage": stage, "close": close})

        customer_ids: set[int] = set()
        positions: dict[str, float] = {}
        deal_spans: list[tuple[int, date, date]] = []
        for i, plan in enumerate(plans):
            stage = plan["stage"]
            org_id = org_ids[(i * 5) % N_ORGS]
            options = contacts_by_org.get(org_id, [])
            contact_id = rng.choice(options) if options else None
            value = rng.randrange(4_000, 120_000, 500)
            closed = stage in ("won", "lost")
            if closed:
                created_on = max(year_ago, plan["close"] - timedelta(days=rng.randint(25, 110)))
                ends_on = plan["close"]
            else:
                created_on = max(year_ago, today - timedelta(days=rng.randint(10, 200)))
                ends_on = today - timedelta(days=1)
            # Stage history leading to the current stage (S3).
            if stage == "lost":
                reached = rng.randint(0, 3)
                path = OPEN_STAGES[: reached + 1] + ["lost"]
            elif stage == "won":
                path = OPEN_STAGES + ["won"]
            else:
                path = OPEN_STAGES[: OPEN_STAGES.index(stage) + 1]
            probability = usual_probability(stage)
            if stage in ("proposal", "negotiation") and rng.random() < 0.25:
                probability = min(95, probability + 10)  # set by hand
            positions[stage] = positions.get(stage, 0.0) + 1.0
            created_at = _at(created_on, rng)
            deal_id = conn.execute(
                insert(deals).values(
                    name=f"{org_short[org_id]} {DEAL_NAMES[(i + i // len(DEAL_NAMES)) % len(DEAL_NAMES)]}",
                    organization_id=org_id,
                    contact_id=contact_id,
                    stage=stage,
                    value=value,
                    probability=probability,
                    close_date=plan["close"],
                    position=positions[stage],
                    created_at=created_at,
                    updated_at=created_at,
                )
            ).inserted_primary_key[0]
            span = max(1, (ends_on - created_on).days)
            for step, to_stage in enumerate(path):
                if step == 0:
                    when = created_at
                elif step == len(path) - 1 and closed:
                    when = _at(plan["close"], rng)
                else:
                    when = _at(created_on + timedelta(days=round(span * step / len(path))), rng)
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
            if stage == "won" and contact_id:
                customer_ids.add(contact_id)
            deal_spans.append((deal_id, created_on, ends_on if not closed else plan["close"]))

        # Every status is present: main contacts of won deals are customers (D5), plus a few more.
        extra = [cid for cid in contact_ids if cid not in customer_ids]
        customer_ids.update(rng.sample(extra, 3))
        for cid in customer_ids:
            conn.execute(contacts.update().where(contacts.c.id == cid).values(status="customer"))

        # Activities: spread over the year, with follow-ups overdue, due soon, later and done.
        follow_ups = (
            [("overdue", today - timedelta(days=d)) for d in (1, 3, 6, 12)]
            + [("upcoming", today + timedelta(days=d)) for d in (0, 1, 3, 5, 7)]
            + [("later", today + timedelta(days=d)) for d in (14, 30)]
        )
        for i in range(N_ACTIVITIES):
            kind = rng.choice(["call", "call", "email", "email", "note"])
            on_deal = i % 2 == 0
            if on_deal:
                deal_id, start, end = rng.choice(deal_spans)
                end = min(end, today)
                parent = {"deal_id": deal_id, "contact_id": None}
            else:
                start, end = year_ago, today
                parent = {"deal_id": None, "contact_id": rng.choice(contact_ids)}
            follow_up_on, done = None, False
            if i < len(follow_ups):
                _, follow_up_on = follow_ups[i]
                if on_deal:  # keep follow-ups on open deals
                    deal_id, start, end = rng.choice(deal_spans[len(WON_MONTHS_AGO) + len(LOST_MONTHS_AGO) :])
                    end = min(end, today)
                    parent = {"deal_id": deal_id, "contact_id": None}
                start = max(start, follow_up_on - timedelta(days=21))
                end = min(end, follow_up_on, today)
            elif i < len(follow_ups) + 8:
                done = True
            if end < start:
                start = end
            occurred_on = start + timedelta(days=rng.randint(0, (end - start).days))
            if done:
                follow_up_on = min(today - timedelta(days=1), occurred_on + timedelta(days=rng.randint(2, 10)))
                follow_up_on = max(follow_up_on, occurred_on)
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


def main() -> None:
    path = config.db_path()
    engine = engine_for(path)
    migrate(engine)
    seed(engine, config.server_today())
    print(f"The sample data is loaded into {path}.")


if __name__ == "__main__":
    main()
