"""Sample data, with dates relative to the day it runs (R52–R55, D23–D25).

Run `python -m backend.app.seed --reset` (or `npm run seed`) to clear everything and reload it.
It works while the app is running, because it clears and reloads rows in one transaction
instead of deleting the database file (R4).
"""

import argparse
import random
from calendar import monthrange
from datetime import date, datetime, time, timedelta

from sqlalchemy import Connection, insert

from . import db, settings, stages
from .db import activities, contacts, deals, organizations

ORGANIZATIONS = [
    # name, industry, website
    ("Granite Build Co", "Construction", "granitebuild.example.com"),
    ("Harbor Health", "Healthcare", "harborhealth.example.com"),
    ("Northwind Logistics", "Logistics", "northwind.example.com"),
    ("Cedar & Pine Retail", "Retail", "cedarandpine.example.com"),
    ("Brightline Manufacturing", "Manufacturing", "brightline.example.com"),
    ("Ridgeway Capital", "Financial Services", "ridgeway.example.com"),
    ("Atlas Software", "Software", "atlas.example.com"),
    ("Bluefin Freight", "Logistics", "bluefin.example.com"),
    ("Summit Dental Group", "Healthcare", "summitdental.example.com"),
    ("Oakline Builders", "Construction", "oakline.example.com"),
    ("Kestrel Payments", "Financial Services", "kestrel.example.com"),
    ("Maple Street Grocers", "Retail", "maplestreet.example.com"),
    ("Ironbridge Fabrication", "Manufacturing", "ironbridge.example.com"),
    ("Lumen Cloud", "Software", "lumencloud.example.com"),
    ("Copperleaf Insurance", "Financial Services", "copperleaf.example.com"),
]

# The main contacts on the sample deals: name, organization, job title.
MAIN_CONTACTS = [
    ("Sam Becker", "Granite Build Co", "Operations Director"),
    ("Priya Raman", "Harbor Health", "Head of IT"),
    ("Tom Okafor", "Northwind Logistics", "Chief Operating Officer"),
    ("Elena Sousa", "Cedar & Pine Retail", "Head of Stores"),
    ("Omar Haddad", "Brightline Manufacturing", "Plant Manager"),
    ("Grace Liu", "Ridgeway Capital", "Chief Financial Officer"),
    ("Marcus Lee", "Ridgeway Capital", "Claims Lead"),
    ("Dana Whitfield", "Atlas Software", "VP Engineering"),
]
FIRST_NAMES = [
    "Avery", "Jordan", "Riley", "Morgan", "Casey", "Quinn", "Rowan", "Harper", "Emerson", "Finley",
    "Hayden", "Jamie", "Kendall", "Logan", "Micah", "Parker", "Reese", "Sawyer", "Skyler", "Taylor",
    "Blake", "Drew", "Elliot", "Frankie", "Kai", "Lane", "Noel", "Peyton", "Remy", "Sage", "Toby", "Wren",
]
LAST_NAMES = [
    "Alder", "Brook", "Calder", "Dunmore", "Ellison", "Fairfax", "Garland", "Hollis", "Ivers", "Jarrow",
    "Kimble", "Lowell", "Marsh", "Norwood", "Oakes", "Pember", "Quarry", "Rowntree", "Selby", "Thorne",
    "Upton", "Vale", "Whitlock", "Yardley", "Ashby", "Bexley", "Corbin", "Delane", "Easton", "Fenwick",
    "Gilmore", "Hartley",
]
JOB_TITLES = [
    "Office Manager", "Finance Manager", "IT Manager", "Procurement Lead", "Operations Manager",
    "Sales Director", "Project Manager", "Head of Purchasing", "Analyst", "Managing Director",
]

# Open deals: name, organization, main contact, stage, value in dollars, close date in days from today.
OPEN_DEALS = [
    ("Site safety app", "Granite Build Co", "Sam Becker", "New", 9800, -10),
    ("Clinic scheduling suite", "Harbor Health", "Priya Raman", "New", 27500, 33),
    ("Fleet tracking pilot", "Northwind Logistics", "Tom Okafor", "New", 18000, 66),
    ("POS rollout, 12 stores", "Cedar & Pine Retail", "Elena Sousa", "New", 64000, 76),
    ("ERP integration scoping", "Brightline Manufacturing", "Omar Haddad", "New", 42000, 87),
    ("Loyalty program", "Cedar & Pine Retail", "Elena Sousa", "Qualified", 22000, -5),
    ("Warehouse analytics", "Northwind Logistics", "Tom Okafor", "Qualified", 35000, 27),
    ("Supplier portal", "Brightline Manufacturing", "Omar Haddad", "Qualified", 14500, 35),
    ("Patient portal refresh", "Harbor Health", "Priya Raman", "Qualified", 48000, 61),
    ("Treasury dashboard", "Ridgeway Capital", "Grace Liu", "Qualified", 56000, 78),
    ("Field crew scheduling", "Granite Build Co", "Sam Becker", "Proposal", 19500, -16),
    ("Annual support renewal", "Atlas Software", "Dana Whitfield", "Proposal", 31000, 13),
    ("Claims automation", "Ridgeway Capital", "Marcus Lee", "Proposal", 88000, 30),
    ("Inventory forecasting", "Cedar & Pine Retail", "Elena Sousa", "Proposal", 41000, 54),
    ("Telehealth add-on", "Harbor Health", "Priya Raman", "Negotiation", 24000, -3),
    ("Route optimization", "Northwind Logistics", "Tom Okafor", "Negotiation", 46000, 7),
    ("Data platform license", "Atlas Software", "Dana Whitfield", "Negotiation", 120000, 20),
]
# When an open deal last changed stage, if not the default: days ago, hour, minute.
LAST_MOVE = {"Route optimization": (0, 9, 42), "Inventory forecasting": (12, 16, 45)}

# Closed deals: name, organization, main contact, stage, value, (months ago, day of month), furthest stage if Lost.
CLOSED_DEALS = [
    ("Onboarding services", "Atlas Software", "Dana Whitfield", "Won", 16000, (0, 7), None),
    ("Quality audit module", "Brightline Manufacturing", "Omar Haddad", "Won", 38000, (0, 3), None),
    ("Branch network upgrade", "Ridgeway Capital", "Marcus Lee", "Won", 72000, (1, 24), None),
    ("Store analytics", "Cedar & Pine Retail", "Elena Sousa", "Won", 21500, (1, 15), None),
    ("Data warehouse setup", "Atlas Software", "Dana Whitfield", "Won", 110000, (2, 25), None),
    ("Staff rota app", "Harbor Health", "Priya Raman", "Won", 31500, (3, 12), None),
    ("Fraud review tool", "Ridgeway Capital", "Marcus Lee", "Won", 68000, (4, 21), None),
    ("Support desk seats", "Atlas Software", "Dana Whitfield", "Won", 12000, (5, 5), None),
    ("Line monitoring sensors", "Brightline Manufacturing", "Omar Haddad", "Won", 96000, (6, 14), None),
    ("Gift card platform", "Cedar & Pine Retail", "Elena Sousa", "Won", 23500, (7, 28), None),
    ("Dock scheduling", "Northwind Logistics", "Tom Okafor", "Won", 52000, (8, 9), None),
    ("Pharmacy stock alerts", "Harbor Health", "Priya Raman", "Won", 27000, (9, 17), None),
    ("Site survey tablets", "Granite Build Co", "Sam Becker", "Won", 18500, (10, 22), None),
    ("Payroll connector", "Ridgeway Capital", "Grace Liu", "Won", 34000, (11, 11), None),
    ("Project costing tool", "Granite Build Co", "Sam Becker", "Lost", 26000, (0, -18), "Proposal"),
    ("Courier app", "Northwind Logistics", "Tom Okafor", "Lost", 12000, (0, -37), "Qualified"),
    ("Kiosk refresh", "Cedar & Pine Retail", "Elena Sousa", "Lost", 30000, (5, 18), "Negotiation"),
]

# Hand-written activities: kind, description, deal, contact, (days ago, hour, minute), follow-up in days from today.
STORY_ACTIVITIES = [
    ("call", "Call with Dana Whitfield about the license terms", "Data platform license", "Dana Whitfield", (1, 16, 15), None),
    ("email", "Sent revised pricing to Marcus Lee", "Claims automation", "Marcus Lee", (1, 11, 3), None),
    ("note", "Budget approved for Q1, waiting on procurement", "Patient portal refresh", None, (9, 10, 20), None),
    ("call", "Intro call with Grace Liu", "Treasury dashboard", "Grace Liu", (10, 15, 0), None),
    ("note", "Finance team wants a second quote before they sign", "Warehouse analytics", None, (11, 9, 10), None),
    ("email", "Sent the pilot summary to Tom Okafor", "Fleet tracking pilot", "Tom Okafor", (12, 11, 20), None),
    ("email", "Send revised quote", "Field crew scheduling", "Sam Becker", (8, 10, 0), -4),
    ("call", "Call back about budget", None, "Elena Sousa", (6, 14, 30), -2),
    ("note", "Confirm legal review", "Data platform license", None, (3, 9, 15), 0),
    ("call", "Demo for clinic managers", "Patient portal refresh", "Priya Raman", (4, 13, 0), 3),
    ("call", "Check in after the pilot", None, "Tom Okafor", (5, 15, 45), 5),
    ("note", "Prepare renewal pack", "Annual support renewal", None, (7, 11, 30), 9),
]
GENERATED_ACTIVITY_COUNT = 80 - len(STORY_ACTIVITIES)
TEMPLATES = {
    "note": [
        "Asked for a case study from a similar customer",
        "Agreed next steps: technical review",
        "Budget holder is the finance director",
        "Prefers a phased rollout",
        "Shared the security questionnaire",
    ],
    "call": [
        "Discovery call about their current tools",
        "Walked through the proposal",
        "Check-in call about timelines",
        "Call about contract terms",
    ],
    "email": [
        "Sent the product overview",
        "Sent meeting notes and next steps",
        "Sent the updated quote",
        "Followed up on the open questions",
    ],
}


def _at(day: date, hour: int, minute: int) -> str:
    """A local time on a day, stored as UTC text."""
    return db.to_iso(datetime.combine(day, time(hour, minute)).astimezone())


def _months_ago(today: date, months: int, day: int) -> date:
    year, month = today.year, today.month - months
    while month < 1:
        year, month = year - 1, month + 12
    if months == 0:
        return min(date(year, month, min(day, monthrange(year, month)[1])), today)
    return date(year, month, min(day, monthrange(year, month)[1]))


def _path(stage: str, furthest: str | None) -> list[str]:
    """D24: New → … → the deal's stage, or New → … → furthest → Lost."""
    end = furthest if stage == "Lost" else stage
    path = stages.STAGE_NAMES[: stages.stage_index(end) + 1]
    return [*path, "Lost"] if stage == "Lost" else path


def _clear(conn: Connection) -> None:
    for table in (activities, deals, contacts, organizations):
        conn.execute(table.delete())


def load(conn: Connection, today: date) -> None:
    rng = random.Random(42)  # D23: the same data every time, apart from the dates
    stamp = db.now_iso()

    org_ids = {}
    for name, industry, website in ORGANIZATIONS:
        org_ids[name] = conn.execute(
            insert(organizations).values(
                name=name, industry=industry, website=f"https://{website}", notes=None, created_at=stamp, updated_at=stamp
            )
        ).inserted_primary_key[0]

    contact_ids, contact_rows = {}, []
    for name, org, title in MAIN_CONTACTS:
        contact_rows.append((name, org_ids[org], title, "customer"))
    org_names = [o[0] for o in ORGANIZATIONS]
    statuses = ["lead", "qualified", "customer"]
    for i in range(40 - len(MAIN_CONTACTS)):
        name = f"{FIRST_NAMES[i]} {LAST_NAMES[(i * 7) % len(LAST_NAMES)]}"
        status = statuses[i % 3]
        # 7 shares no factor with 15, so the contacts spread across every organization.
        org = None if status == "lead" and i % 2 == 0 else org_ids[org_names[(i * 7 + 3) % len(org_names)]]
        contact_rows.append((name, org, JOB_TITLES[i % len(JOB_TITLES)], status))
    for i, (name, org_id, title, status) in enumerate(contact_rows):
        email = name.lower().replace(" ", ".") + "@example.com"
        contact_ids[name] = conn.execute(
            insert(contacts).values(
                name=name,
                email=email,
                phone=f"555-01{i:02d}",
                job_title=title,
                organization_id=org_id,
                status=status,
                created_at=stamp,
                updated_at=stamp,
            )
        ).inserted_primary_key[0]

    deal_ids, positions = {}, {s: 0 for s in stages.STAGE_NAMES}

    def add_deal(name, org, contact, stage, dollars, close: date, furthest, last_move: datetime | None):
        path = _path(stage, furthest)
        moves = list(zip(path, path[1:], strict=False))
        # Stage changes go back in time from the last one, about nine days apart.
        last = last_move or datetime.combine(close, time(14, 30))
        back = [len(moves) - 1 - k for k in range(len(moves))]  # steps before the last move
        move_times = [last - timedelta(days=9 * b, hours=b) for b in back]
        created = (move_times[0] if move_times else last) - timedelta(days=4)
        deal_id = conn.execute(
            insert(deals).values(
                name=name,
                organization_id=org_ids[org],
                main_contact_id=contact_ids[contact],
                stage=stage,
                value_cents=dollars * 100,
                probability=stages.PROBABILITY[stage],
                close_date=close.isoformat(),
                position=positions[stage],
                created_at=db.to_iso(created.astimezone()),
                updated_at=stamp,
            )
        ).inserted_primary_key[0]
        positions[stage] += 1
        deal_ids[name] = (deal_id, contact_ids[contact], created.date(), close)
        for (old, new), moment in zip(moves, move_times, strict=True):
            iso = db.to_iso(moment.astimezone())
            conn.execute(
                insert(activities).values(
                    kind="stage_change", deal_id=deal_id, description=f"Moved from {old} to {new}",
                    occurred_at=iso, from_stage=old, to_stage=new, done=False, created_at=iso, updated_at=iso,
                )
            )

    for i, (name, org, contact, stage, dollars, days) in enumerate(OPEN_DEALS):
        ago, hour, minute = LAST_MOVE.get(name, (3 + (i * 5) % 40, 10 + i % 6, (i * 13) % 60))
        last_move = datetime.combine(today - timedelta(days=ago), time(hour, minute))
        add_deal(name, org, contact, stage, dollars, today + timedelta(days=days), None, last_move)
    for name, org, contact, stage, dollars, (months, day), furthest in CLOSED_DEALS:
        close = today + timedelta(days=day) if day < 0 else _months_ago(today, months, day)
        add_deal(name, org, contact, stage, dollars, close, furthest, None)

    def add_activity(kind, text, deal_id, contact_id, moment: datetime, follow_up: date | None, done: bool):
        iso = db.to_iso(moment.astimezone())
        conn.execute(
            insert(activities).values(
                kind=kind, description=text, deal_id=deal_id, contact_id=contact_id, occurred_at=iso,
                follow_up_date=follow_up.isoformat() if follow_up else None, done=done, created_at=iso, updated_at=iso,
            )
        )

    for kind, text, deal, contact, (ago, hour, minute), follow_up in STORY_ACTIVITIES:
        moment = datetime.combine(today - timedelta(days=ago), time(hour, minute))
        due = today + timedelta(days=follow_up) if follow_up is not None else None
        add_activity(kind, text, deal_ids[deal][0] if deal else None, contact_ids[contact] if contact else None, moment, due, False)

    deal_names = list(deal_ids)
    contact_names = list(contact_ids)
    for _ in range(GENERATED_ACTIVITY_COUNT):
        kind = rng.choice(["note", "call", "email"])
        text = rng.choice(TEMPLATES[kind])
        if rng.random() < 0.75:
            deal_id, main_contact, created, close = deal_ids[rng.choice(deal_names)]
            contact_id = main_contact if rng.random() < 0.5 else None
            latest = min(close, today) - timedelta(days=14)
            span = max((latest - created).days, 1)
            day = created + timedelta(days=rng.randrange(span)) if latest > created else latest
        else:
            deal_id, contact_id = None, contact_ids[rng.choice(contact_names)]
            day = today - timedelta(days=rng.randrange(14, 200))
        moment = datetime.combine(day, time(rng.randrange(9, 17), rng.choice([0, 15, 30, 45])))
        # Some older activities had a follow-up that has since been done.
        follow_up = day + timedelta(days=7) if rng.random() < 0.2 else None
        add_activity(kind, text, deal_id, contact_id, moment, follow_up, follow_up is not None)


def reset() -> None:
    """Clears every table and reloads the sample data, in one transaction (R4)."""
    db.create_schema()
    with db.transaction() as conn:
        _clear(conn)
        load(conn, settings.today())


def main() -> None:
    parser = argparse.ArgumentParser(description="Load Accountable's sample data.")
    parser.add_argument("--reset", action="store_true", help="delete all data and reload the sample data")
    args = parser.parse_args()
    if not args.reset:
        parser.error("use --reset to delete all data and reload the sample data")
    reset()
    print(f"Sample data loaded into {settings.db_path()}")


if __name__ == "__main__":
    main()
