"""Fictional sample records, dated from a given day so a fresh copy always looks current.

Every deal is walked through rules.py with an explicit date, so its stage history
can't contradict the rules. All names, addresses and websites are made up, and
addresses use the reserved .example domain.
"""

import calendar
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import Connection, insert

from accountable import who
from accountable.crm import rules
from accountable.crm.tables import activities, contacts, organizations
from accountable.users import add_missing_teammates, teammate

# name, website slug, industry
ORGANIZATIONS = [
    ("Harbor & Pine", "harborandpine", "Hospitality", "Two restaurants and a small hotel on the waterfront."),
    ("Lantern Hotels", "lanternhotels", "Hospitality", "Regional hotel group with eleven sites."),
    ("Cobalt Ridge Roofing", "cobaltridge", "Construction", "Commercial roofing contractor."),
    ("Northlight Dental", "northlightdental", "Healthcare", "Family dental practice with four clinics."),
    ("Quarry Lane Brewing", "quarrylane", "Food and drink", "Independent brewery with a taproom."),
    ("Kestrel Freight", "kestrelfreight", "Logistics", "Mid-sized road freight company."),
    ("Fernhill Veterinary", "fernhillvet", "Healthcare", "Veterinary group with three practices."),
    ("Bluebird Bakery", "bluebirdbakery", "Food and drink", "Bakery chain, moving into online orders."),
    ("Saltmarsh Studio", "saltmarsh", "Professional services", "Small design studio."),
    ("Oakhaven Care", "oakhavencare", "Healthcare", "Care homes across the county."),
    ("Stonebridge Accounting", "stonebridge", "Professional services", "Accounting firm with 40 staff."),
    ("Tallgrass Foods", "tallgrassfoods", "Food and drink", "Food wholesaler with two warehouses."),
    ("Greyfriars Property", "greyfriars", "Real estate", "Commercial property manager."),
    ("Juniper Health", "juniperhealth", "Healthcare", "Private clinic group."),
    ("Brightwater Solar", "brightwatersolar", "Energy", "Solar installer for homes and small businesses."),
    ("Marlowe Insurance", "marlowe", "Financial services", "Specialist insurance broker."),
    ("Pennant Sports Club", "pennantsports", "Education and leisure", "Members' sports club."),
    ("Willow Creek Schools", "willowcreek", "Education and leisure", "Group of six schools."),
    ("Ironwood Joinery", "ironwoodjoinery", "Manufacturing", "Custom joinery workshop."),
    ("Foxglove Interiors", "foxglove", "Retail", "Interior design showroom."),
    ("Copperline Electric", "copperline", "Construction", "Electrical contractor."),
    ("Summit Trail Outfitters", "summittrail", "Retail", "Outdoor gear retailer with nine stores."),
    ("Alder & Finch Legal", "alderfinch", "Professional services", "Law firm focused on small businesses."),
    ("Redwood Print", "redwoodprint", "Manufacturing", "Commercial printer."),
]

# name, organization, job title, starting status. Each is the main contact on a deal.
MAIN_CONTACTS = [
    ("Sam Carter", "Harbor & Pine", "Owner", "qualified"),
    ("Elena Petrova", "Lantern Hotels", "Head of Operations", "qualified"),
    ("Owen Walsh", "Cobalt Ridge Roofing", "Managing Director", "lead"),
    ("Priya Nair", "Northlight Dental", "Practice Manager", "qualified"),
    ("Ben Adler", "Quarry Lane Brewing", "Co-founder", "lead"),
    ("Jonas Weber", "Kestrel Freight", "Operations Director", "qualified"),
    ("Marcus Bell", "Fernhill Veterinary", "Practice Owner", "lead"),
    ("Ines Moreau", "Bluebird Bakery", "Founder", "qualified"),
    ("Noah Kim", "Saltmarsh Studio", "Creative Director", "qualified"),
    ("Grace Lindqvist", "Oakhaven Care", "Finance Director", "qualified"),
    ("Aisha Rahman", "Stonebridge Accounting", "Partner", "qualified"),
    ("Tomás Reyes", "Tallgrass Foods", "Supply Chain Manager", "qualified"),
    ("Daniel Osei", "Greyfriars Property", "Portfolio Manager", "qualified"),
    ("Hannah Okafor", "Juniper Health", "Chief Operating Officer", "qualified"),
    ("Ana Costa", "Brightwater Solar", "General Manager", "qualified"),
    ("Li Wei", "Marlowe Insurance", "IT Director", "qualified"),
    ("Leo Marsh", "Pennant Sports Club", "Club Manager", "lead"),
    ("Fatima Haddad", "Willow Creek Schools", "Business Manager", "lead"),
    ("Ruth Adeyemi", "Ironwood Joinery", "Owner", "qualified"),
    ("Maya Lund", "Foxglove Interiors", "Showroom Manager", "qualified"),
    ("Carlos Vega", "Copperline Electric", "Operations Manager", "qualified"),
    ("Nora Hale", "Summit Trail Outfitters", "Head of Ecommerce", "qualified"),
    ("Yuki Tanaka", "Alder & Finch Legal", "Office Manager", "qualified"),
    ("Peter Novak", "Redwood Print", "Plant Manager", "qualified"),
]

OTHER_FIRST_NAMES = [
    "Alice",
    "Andre",
    "Beth",
    "Caleb",
    "Chloe",
    "Diego",
    "Dina",
    "Eli",
    "Emma",
    "Felix",
    "Gina",
    "Hugo",
    "Iris",
    "Ivan",
    "Jade",
    "Kofi",
    "Lara",
    "Liam",
    "Mina",
    "Milo",
    "Nadia",
    "Omar",
    "Paula",
    "Quinn",
    "Rosa",
    "Rohan",
]
OTHER_LAST_NAMES = [
    "Abbott",
    "Barros",
    "Chen",
    "Dalton",
    "Eriksen",
    "Farrow",
    "Garcia",
    "Hayes",
    "Ito",
    "Jensen",
    "Keane",
    "Lowe",
    "Mensah",
    "Nolan",
    "Ortiz",
    "Park",
    "Quigley",
    "Rossi",
    "Singh",
    "Thorne",
    "Usman",
    "Varga",
    "Wells",
    "Yates",
    "Zhou",
]
OTHER_JOB_TITLES = [
    "Office Manager",
    "Finance Manager",
    "IT Manager",
    "Marketing Lead",
    "Operations Lead",
    "Account Manager",
    "Project Manager",
    "Procurement Lead",
    "Sales Manager",
    "Administrator",
]
OTHER_STATUSES = ["lead", "lead", "qualified", "customer", "lead", "customer", "qualified"]
OTHER_CONTACTS = 51

# name, organization, main contact, value, months ahead and day of the month, or
# days late. Listed top of the column first.
OPEN_DEALS = {
    "new": [
        ("Annual support plan", "Harbor & Pine", "Sam Carter", 36000, (2, 18)),
        ("Multi-site rollout", "Lantern Hotels", "Elena Petrova", 42000, (3, 29)),
        ("Site safety audit", "Cobalt Ridge Roofing", "Owen Walsh", 28000, (2, 4)),
        ("Patient portal", "Northlight Dental", "Priya Nair", 32000, (2, 11)),
        ("Taproom tablets", "Quarry Lane Brewing", "Ben Adler", 16000, (1, 20)),
        ("Fleet tracking pilot", "Kestrel Freight", "Jonas Weber", 34000, (3, 15)),
        ("Booking system", "Fernhill Veterinary", "Marcus Bell", 24000, (2, 22)),
        ("Online ordering", "Bluebird Bakery", "Ines Moreau", 30000, (2, 2)),
        ("Brand refresh", "Saltmarsh Studio", "Noah Kim", 22000, (1, 27)),
        ("Staff training program", "Oakhaven Care", "Grace Lindqvist", 26000, (3, 8)),
        ("Document archive", "Stonebridge Accounting", "Aisha Rahman", 20000, (2, 15)),
    ],
    "qualified": [
        ("Warehouse management", "Tallgrass Foods", "Tomás Reyes", 72000, (2, 9)),
        ("Portfolio reporting", "Greyfriars Property", "Daniel Osei", 36000, 19),
        ("Group-wide license", "Juniper Health", "Hannah Okafor", 96000, (3, 22)),
        ("Install scheduling", "Brightwater Solar", "Ana Costa", 44000, (1, 24)),
        ("Claims workflow", "Marlowe Insurance", "Li Wei", 48000, (2, 3)),
        ("Member app", "Pennant Sports Club", "Leo Marsh", 22000, (1, 19)),
        ("Campus network upgrade", "Willow Creek Schools", "Fatima Haddad", 58000, (3, 12)),
        ("Job costing", "Ironwood Joinery", "Ruth Adeyemi", 16000, (1, 13)),
        ("Showroom displays", "Foxglove Interiors", "Maya Lund", 28000, (2, 17)),
    ],
    "proposal": [
        ("Network refresh", "Copperline Electric", "Carlos Vega", 84000, (2, 1)),
        ("Renewal and upgrade", "Harbor & Pine", "Sam Carter", 24000, 22),
        ("Retail stock sync", "Summit Trail Outfitters", "Nora Hale", 62000, (1, 26)),
        ("Case management", "Alder & Finch Legal", "Yuki Tanaka", 34000, (1, 17)),
        ("Press line monitoring", "Redwood Print", "Peter Novak", 46000, 9),
        ("Front desk kiosks", "Lantern Hotels", "Elena Petrova", 18000, (1, 12)),
        ("Team training", "Northlight Dental", "Priya Nair", 10000, (1, 6)),
        ("Delivery routing", "Tallgrass Foods", "Tomás Reyes", 12000, (1, 28)),
    ],
    "negotiation": [
        ("Security review", "Marlowe Insurance", "Li Wei", 32000, (1, 10)),
        ("Payroll integration", "Oakhaven Care", "Grace Lindqvist", 48000, 15),
        ("Three-year service contract", "Kestrel Freight", "Jonas Weber", 68000, (1, 14)),
        ("Online store", "Summit Trail Outfitters", "Nora Hale", 26000, (1, 5)),
        ("Data migration", "Stonebridge Accounting", "Aisha Rahman", 18000, 3),
        ("Label printing", "Quarry Lane Brewing", "Ben Adler", 8000, (1, 3)),
        ("Support add-on", "Juniper Health", "Hannah Okafor", 14000, (1, 18)),
        ("Phone system", "Fernhill Veterinary", "Marcus Bell", 6000, (1, 9)),
    ],
}

# Wins by month, oldest first, ending with the current month. Each value is one
# won deal, which gives a win in every month and an upward trend.
WINS = [
    [18000],
    [14500],
    [21000],
    [16000, 10000],
    [19500, 12000],
    [15000, 13000],
    [24000, 15000],
    [21000, 14500, 9000],
    [26000, 16000, 10000],
    [28000, 17500, 11000, 7000],
    [26000, 18000, 13000, 9000, 6000],
    [28500, 19000, 14000, 11000, 7000, 5000],
]

# value, months ago, day of the month, furthest stage reached before it was lost.
LOSSES = [
    (34000, 0, 21, "qualified"),
    (28000, 0, 2, "proposal"),
    (24000, 1, 15, "new"),
    (22000, 2, 28, "negotiation"),
    (18000, 3, 28, "proposal"),
    (16000, 3, 9, "qualified"),
    (12000, 4, 11, "negotiation"),
    (10000, 5, 19, "proposal"),
    (8000, 6, 8, "new"),
    (6000, 7, 3, "negotiation"),
    (5000, 9, 27, "new"),
    (3000, 10, 16, "qualified"),
]

CLOSED_NAMES = [
    "Onboarding package",
    "Service contract",
    "Renewal",
    "Reporting add-on",
    "Pilot program",
    "Team training",
    "Upgrade",
    "Site survey",
    "Integration",
    "Support plan",
    "Data clean-up",
]
CLOSED_CLIENTS = [
    ("Harbor & Pine", "Sam Carter"),
    ("Redwood Print", "Peter Novak"),
    ("Juniper Health", "Hannah Okafor"),
    ("Copperline Electric", "Carlos Vega"),
    ("Tallgrass Foods", "Tomás Reyes"),
    ("Bluebird Bakery", "Ines Moreau"),
    ("Alder & Finch Legal", "Yuki Tanaka"),
    ("Kestrel Freight", "Jonas Weber"),
    ("Saltmarsh Studio", "Noah Kim"),
    ("Foxglove Interiors", "Maya Lund"),
    ("Brightwater Solar", "Ana Costa"),
    ("Greyfriars Property", "Daniel Osei"),
    ("Ironwood Joinery", "Ruth Adeyemi"),
]

# description, who or what it's about, days from the seeding day, days before the
# follow-up date that it was logged.
FOLLOW_UPS = [
    ("Send revised quote", "Renewal and upgrade", -19, 6),
    ("Call about payroll sign-off", "Payroll integration", -11, 5),
    ("Chase signed order form", "Data migration", -5, 4),
    ("Book a site visit", "Owen Walsh", -4, 7),
    ("Reply to pricing question", "Peter Novak", -2, 3),
    ("Confirm the budget holder", "Portfolio reporting", -1, 4),
    ("Prepare demo notes", "Group-wide license", 0, 3),
    ("Send contract draft", "Three-year service contract", 2, 5),
    ("Introduce the account lead", "Hannah Okafor", 3, 6),
    ("Check delivery dates", "Online store", 4, 7),
    ("Call about the security review", "Security review", 5, 8),
    ("Share a case study", "Yuki Tanaka", 6, 9),
    ("Review pricing options", "Retail stock sync", 9, 11),
    ("Agree training dates", "Team training", 10, 12),
    ("Follow up on the quote", "Front desk kiosks", 12, 13),
    ("Book a renewal call", "Priya Nair", 16, 14),
]

CALLS = [
    "Called about contract terms",
    "Left a message about the site visit",
    "Talked through the rollout plan",
    "Checked in on the budget",
    "Walked through the pricing",
    "Call with the project lead",
    "Discussed the start date",
    "Went over the scope on a call",
]
EMAILS = [
    "Sent updated pricing",
    "Sent the proposal",
    "Shared two customer references",
    "Emailed the contract draft",
    "Answered their security questions",
    "Sent a summary of the meeting",
    "Sent the onboarding checklist",
    "Confirmed the meeting time",
]
NOTES = [
    "Budget confirmed for next quarter",
    "Asked for two more references",
    "Decision expected after the board meeting",
    "Comparing us with one other supplier",
    "Prefers email to phone calls",
    "New finance lead starts next month",
    "Wants a phased rollout",
    "Renewal date is in their contract",
]
ACTIVITIES_PER_DEAL = 3
CONTACTS_WITH_ACTIVITY = 44


@dataclass
class Walk:
    name: str
    organization: str
    contact: str
    value: int
    close_date: date
    stages: list[str]
    last_step: date


def add_months(day: date, months: int, day_of_month: int | None = None) -> date:
    index = day.year * 12 + day.month - 1 + months
    year, month = index // 12, index % 12 + 1
    wanted = day.day if day_of_month is None else day_of_month
    return date(year, month, min(wanted, calendar.monthrange(year, month)[1]))


def moment(day: date, number: int) -> datetime:
    """A working-hours time on a local day, in UTC with no zone, varied by number.

    The hour repeats every 8 numbers. The activity types repeat every 3, so a repeat
    of 3 or 9 here would put every note at the same time of day.
    """
    local = datetime.combine(day, time(9 + number * 5 % 8, number * 17 % 60))
    return local.astimezone(UTC).replace(tzinfo=None)


def path_to(stage: str) -> list[str]:
    return rules.OPEN_STAGES[: rules.OPEN_STAGES.index(stage) + 1]


def _open_walks(today: date) -> list[Walk]:
    walks = []
    for stage, rows in OPEN_DEALS.items():
        # Added bottom of the column first, because each goes in at the top.
        for number, (name, organization, contact, value, due) in enumerate(reversed(rows)):
            close_date = today - timedelta(days=due) if isinstance(due, int) else add_months(today, *due)
            walks.append(
                Walk(name, organization, contact, value, close_date, path_to(stage), today - timedelta(1 + number))
            )
    return walks


def _won_walks(today: date) -> list[Walk]:
    walks = []
    for months_back, values in zip(range(len(WINS) - 1, -1, -1), WINS):
        month_index = len(WINS) - 1 - months_back
        for number, value in reversed(list(enumerate(values))):
            if months_back == 0:
                close_date = today.replace(day=max(1, today.day - 1 - number * 5))
            else:
                close_date = add_months(today, -months_back, 28 - number * 5)
            organization, contact = CLOSED_CLIENTS[(month_index * 3 + number) % len(CLOSED_CLIENTS)]
            name = CLOSED_NAMES[(month_index + number * 2) % len(CLOSED_NAMES)]
            walks.append(Walk(name, organization, contact, value, close_date, [*rules.OPEN_STAGES, "won"], close_date))
    return walks


def _lost_walks(today: date) -> list[Walk]:
    walks = []
    for number, (value, months_back, day, reached) in reversed(list(enumerate(LOSSES))):
        close_date = add_months(today, -months_back, day)
        close_date = min(close_date, today)
        organization, contact = CLOSED_CLIENTS[(number * 2 + 5) % len(CLOSED_CLIENTS)]
        name = CLOSED_NAMES[(number * 3 + 1) % len(CLOSED_NAMES)]
        walks.append(Walk(name, organization, contact, value, close_date, [*path_to(reached), "lost"], close_date))
    return walks


def _who(number: int, start: datetime, today: date, every: int) -> dict[str, Any]:
    """Added by one teammate, and for one record in every few, last changed by the next one since."""
    if number % every != 1:
        return who.added(teammate(number), start)
    changed_on = today - timedelta(days=3 + number * 7 % 90)
    return {**who.added(teammate(number), start), **who.changed(teammate(number + 1), moment(changed_on, number))}


def _add_people(conn: Connection, today: date) -> tuple[dict[str, int], dict[str, int], list[int]]:
    start = moment(today - timedelta(days=400), 1)
    org_ids = {}
    for number, (name, slug, industry, notes) in enumerate(ORGANIZATIONS):
        org_ids[name] = conn.execute(
            insert(organizations)
            .values(
                name=name,
                website=f"https://www.{slug}.example",
                industry=industry,
                notes=notes,
                **_who(number, start, today, every=3),
            )
            .returning(organizations.c.id)
        ).scalar_one()

    slugs = {name: slug for name, slug, _industry, _notes in ORGANIZATIONS}
    people = list(MAIN_CONTACTS)
    org_names = [row[0] for row in ORGANIZATIONS]
    for number in range(OTHER_CONTACTS):
        first = OTHER_FIRST_NAMES[number % len(OTHER_FIRST_NAMES)]
        last = OTHER_LAST_NAMES[number * 7 % len(OTHER_LAST_NAMES)]
        people.append(
            (
                f"{first} {last}",
                org_names[number % len(org_names)],
                OTHER_JOB_TITLES[number % len(OTHER_JOB_TITLES)],
                OTHER_STATUSES[number % len(OTHER_STATUSES)],
            )
        )

    contact_ids = {}
    all_ids = []
    for number, (name, organization, job_title, status) in enumerate(people):
        address = name.lower().replace(" ", ".").replace("á", "a").replace("é", "e")
        contact_id = conn.execute(
            insert(contacts)
            .values(
                name=name,
                email=f"{address}@{slugs[organization]}.example",
                phone=f"(212) 555-01{number % 100:02d}",
                job_title=job_title,
                organization_id=org_ids[organization],
                status=status,
                **_who(number, start, today, every=4),
            )
            .returning(contacts.c.id)
        ).scalar_one()
        contact_ids[name] = contact_id
        all_ids.append(contact_id)
    return org_ids, contact_ids, all_ids


def _walk_deal(conn: Connection, walk: Walk, number: int, org_ids: dict, contact_ids: dict) -> tuple[int, date]:
    """Adds a deal at New and moves it through each stage to where it ends up.

    The teammate who added it makes most of its moves, and a colleague some of them.
    """
    gap = 6 + number % 5
    steps = len(walk.stages) - 1
    first_day = walk.last_step - timedelta(days=gap * steps)
    owner = teammate(number)
    deal_id = rules.add_deal(
        conn,
        {
            "name": walk.name,
            "organization_id": org_ids[walk.organization],
            "main_contact_id": contact_ids[walk.contact],
            "stage": "new",
            "value": walk.value,
            "close_date": walk.close_date,
        },
        today=first_day,
        now=moment(first_day, number),
        user_id=owner,
    )
    for step, stage in enumerate(walk.stages[1:], start=1):
        day = walk.last_step - timedelta(days=gap * (steps - step))
        mover = teammate(number + 1) if (number + step) % 3 == 0 else owner
        rules.change_stage(conn, deal_id, stage, today=day, now=moment(day, number + step), user_id=mover)
    return deal_id, first_day


def _activity(number: int) -> tuple[str, str]:
    kind = ("call", "email", "note")[number % 3]
    texts = {"call": CALLS, "email": EMAILS, "note": NOTES}[kind]
    return kind, texts[number // 3 % len(texts)]


def _activity_who(row: dict[str, Any], number: int, today: date) -> dict[str, Any]:
    """Logged by one teammate. A done follow-up was ticked by the next, on its date, if that's passed."""
    logged = who.added(teammate(number), row["occurred_at"])
    if not row["follow_up_done"]:
        return logged
    ticked_on = min(row["follow_up_date"], today - timedelta(days=1))
    ticked = moment(ticked_on, number + 1)
    if ticked <= row["occurred_at"]:
        return logged
    return {**logged, **who.changed(teammate(number + 1), ticked)}


def fill(conn: Connection, today: date) -> None:
    add_missing_teammates(conn)
    org_ids, contact_ids, all_contacts = _add_people(conn, today)

    deal_ids: dict[str, int] = {}
    rows: list[dict[str, Any]] = []
    number = 0
    walks = [*_open_walks(today), *_won_walks(today), *_lost_walks(today)]
    for deal_number, walk in enumerate(walks):
        deal_id, first_day = _walk_deal(conn, walk, deal_number, org_ids, contact_ids)
        if walk.stages[-1] in rules.OPEN_STAGES:
            deal_ids[walk.name] = deal_id
        span = max((walk.last_step - first_day).days, ACTIVITIES_PER_DEAL)
        for step in range(ACTIVITIES_PER_DEAL):
            kind, description = _activity(number)
            day = first_day + timedelta(days=span * step // ACTIVITIES_PER_DEAL)
            day = min(day, today - timedelta(days=1))
            rows.append(
                {
                    "type": kind,
                    "deal_id": deal_id,
                    "contact_id": None,
                    "description": description,
                    "occurred_at": moment(day, number),
                    "follow_up_date": day + timedelta(days=3) if number % 9 == 0 else None,
                    "follow_up_done": number % 9 == 0,
                }
            )
            number += 1

    for contact_id in all_contacts[:CONTACTS_WITH_ACTIVITY]:
        kind, description = _activity(number)
        day = today - timedelta(days=1 + number * 7 % 180)
        rows.append(
            {
                "type": kind,
                "deal_id": None,
                "contact_id": contact_id,
                "description": description,
                "occurred_at": moment(day, number),
                "follow_up_date": None,
                "follow_up_done": False,
            }
        )
        number += 1

    for description, about, days, logged_before in FOLLOW_UPS:
        due = today + timedelta(days=days)
        day = min(due - timedelta(days=logged_before), today - timedelta(days=1))
        kind, _unused = _activity(number)
        rows.append(
            {
                "type": kind,
                "deal_id": deal_ids.get(about),
                "contact_id": contact_ids.get(about),
                "description": description,
                "occurred_at": moment(day, number),
                "follow_up_date": due,
                "follow_up_done": False,
            }
        )
        number += 1

    for number, row in enumerate(rows):
        row.update(_activity_who(row, number, today))
    conn.execute(insert(activities), rows)
