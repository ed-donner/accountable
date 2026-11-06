"""The sample suppliers and their bills, dated from a given day so a fresh copy always looks current (M3).

Six suppliers are added for the bills, and four of the CRM's customers send bills too, so
each of those is both. The CRM's sample data goes in first, because these point at its
organizations. Every bill is due 30 days after its bill date. One due today or later is
unpaid, and one due before today was paid a few days before its due date, apart from nine
left overdue. Those, and the two latest trips, are dated from the seeding day, which keeps
at least 6 bills due in the next 30 days and 9 overdue whatever the day. Two different
suppliers have unpaid bills in each part of the aged balances: not yet due, and 1 to 30, 31 to
60, 61 to 90 and over 90 days past due, and Wayfarer Travel has some in four of them.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import Connection, insert, select

from accountable import months, who
from accountable.bills.tables import bill_number_key, bills
from accountable.books import post as books_post
from accountable.crm.tables import organizations
from accountable.sample import moment, put_down_to
from accountable.users import add_missing_teammates, teammate

DUE_AFTER = timedelta(days=30)

# name, website slug, industry, notes. None has contacts or deals.
SUPPLIERS = [
    ("Kingsgate Properties", "kingsgate", "Real estate", "Our office landlord, at 48 Orchard Row."),
    ("Cloudline Hosting", "cloudline", "Software", "Hosting for our servers and backups, billed by use."),
    (
        "Northwind Software",
        "northwind",
        "Software",
        "The office software we use: a monthly subscription and a yearly license.",
    ),
    (
        "Fieldstone Development",
        "fieldstone",
        "Professional services",
        "Contract developers, billed monthly by the hour.",
    ),
    ("Wayfarer Travel", "wayfarer", "Travel", "Our travel agent, for trips to customers."),
    ("Signalbox Marketing", "signalbox", "Marketing", "Online ads, and our stand at the trade show."),
]

# The CRM's customers that also send us bills.
CUSTOMERS = ["Saltmarsh Studio", "Ironwood Joinery", "Marlowe Insurance", "Stonebridge Accounting"]

# Each supplier numbers its bills its own way, counting up from here.
NUMBERING = {
    "Kingsgate Properties": ("KP-{}", 2601),
    "Cloudline Hosting": ("CLH-{:06d}", 4410),
    "Northwind Software": ("NS-{}", 10471),
    "Fieldstone Development": ("FD-{:04d}", 318),
    "Wayfarer Travel": ("WT{}", 77120),
    "Signalbox Marketing": ("SB-{}", 1290),
    "Saltmarsh Studio": ("SS-{:04d}", 141),
    "Ironwood Joinery": ("IJ-{}", 5530),
    "Marlowe Insurance": ("POL-{}", 88301),
    "Stonebridge Accounting": ("SA-{}", 2210),
}

# Hosting rises with use, oldest month first.
HOSTING = [38000, 38650, 39120, 39800, 40240, 41075, 41630, 42310, 43085, 43900, 44720, 46000]
# A contractor's month of hours, oldest first.
CONTRACTOR = [712500, 680000, 745000, 798750, 820000, 765000, 884500, 920000, 836250, 790000, 857500, 903750]
# Days before the seeding day, amount and tax in cents, and where to. Most carry tax.
TRIPS = [
    (5, 48000, 4260, "Train and hotel, visit to Lantern Hotels"),
    (18, 126500, 11227, "Flights and two nights, Kestrel Freight's depot"),
    (42, 214000, 18993, "Flights and three nights, Tallgrass Foods"),
    (61, 32000, 0, "Train, visit to Northlight Dental"),
    (83, 89500, 7943, "Flights, Brightwater Solar"),
    (104, 157000, 13934, "Flights and hotel, Summit Trail Outfitters"),
    (130, 240000, 21300, "Flights and four nights, Juniper Health"),
    (152, 41250, 0, "Train, visit to Harbor & Pine"),
    (176, 98000, 8698, "Flights, Oakhaven Care"),
    (199, 132500, 11759, "Flights and hotel, Willow Creek Schools"),
    (223, 67500, 5991, "Hotel, Fernhill Veterinary"),
    (251, 185000, 16419, "Flights and three nights, Lantern Hotels"),
    (287, 54000, 0, "Train and hotel, Copperline Electric"),
    (330, 112000, 9940, "Flights, Greyfriars Property"),
]
# The trips left overdue, which are due 12, 31, 74 and 100 days ago.
OVERDUE_TRIP_DAYS = {42, 61, 104, 130}
# Online ads, in 9 of the 12 months: one dated from the seeding day and left overdue, and the
# rest on the 20th, with their months back.
OVERDUE_ADS = (36, 195000)
ADS = [(11, 150000), (10, 175000), (9, 210000), (8, 185000), (6, 240000), (5, 300000), (4, 265000), (3, 225000)]


@dataclass(frozen=True)
class SampleBill:
    supplier: str
    category: str
    bill_date: date
    amount_cents: int
    tax_cents: int = 0
    notes: str | None = None
    left_overdue: bool = False


def on_day(today: date, months_back: int, day: int) -> date:
    """That day of a month before this one. Every sample day is the 28th or sooner, so every month has it."""
    index = today.year * 12 + today.month - 1 - months_back
    return date(index // 12, index % 12 + 1, day)


def last_twelve(today: date, day: int) -> list[date]:
    """The last 12 of this day of the month, oldest first, none of them after today."""
    latest = 0 if today.day >= day else 1
    return [on_day(today, back, day) for back in range(latest + 11, latest - 1, -1)]


def _monthly(today: date) -> list[SampleBill]:
    """Rent and hosting on the 1st put at least two in this month, even on the 1st."""
    return [
        *(
            SampleBill("Kingsgate Properties", "office", day, 450000, notes="Office rent, Suite 210")
            for day in last_twelve(today, 1)
        ),
        *(
            SampleBill("Cloudline Hosting", "software", day, cents)
            for day, cents in zip(last_twelve(today, 1), HOSTING)
        ),
        *(
            SampleBill("Northwind Software", "software", day, 124000, 11005, "Subscription, 25 seats")
            for day in last_twelve(today, 3)
        ),
        *(
            SampleBill(
                "Fieldstone Development", "contractors", day, cents, notes="Development work, billed by the hour"
            )
            for day, cents in zip(last_twelve(today, 28), CONTRACTOR)
        ),
    ]


def _quarterly(today: date) -> list[SampleBill]:
    return [
        *(
            SampleBill("Kingsgate Properties", "office", on_day(today, back, 15), 65000, 5769, "Quarterly deep clean")
            for back in (11, 8, 5, 2)
        ),
        *(
            SampleBill("Stonebridge Accounting", "other", on_day(today, back, 10), 180000, 15975, "Quarterly accounts")
            for back in (10, 7, 4, 1)
        ),
    ]


def _one_offs(today: date) -> list[SampleBill]:
    def days_ago(days: int) -> date:
        return today - timedelta(days=days)

    return [
        SampleBill("Marlowe Insurance", "other", days_ago(300), 640000, notes="Yearly business insurance"),
        SampleBill("Ironwood Joinery", "office", days_ago(268), 790000, 70113, "Desks and shelving for the office"),
        SampleBill("Saltmarsh Studio", "marketing", days_ago(240), 285000, notes="Brochure design"),
        SampleBill(
            "Northwind Software",
            "software",
            days_ago(212),
            960000,
            85200,
            "Yearly license renewal",
            left_overdue=True,
        ),
        SampleBill(
            "Signalbox Marketing",
            "marketing",
            days_ago(110),
            1250000,
            110938,
            "Stand at the trade show",
            left_overdue=True,
        ),
        SampleBill(
            "Saltmarsh Studio",
            "marketing",
            days_ago(75),
            285000,
            notes="Brochure design, second edition",
            left_overdue=True,
        ),
    ]


def _trips(today: date) -> list[SampleBill]:
    return [
        SampleBill(
            "Wayfarer Travel",
            "travel",
            today - timedelta(days=days),
            cents,
            tax,
            notes,
            left_overdue=days in OVERDUE_TRIP_DAYS,
        )
        for days, cents, tax, notes in TRIPS
    ]


def _ads(today: date) -> list[SampleBill]:
    days, cents = OVERDUE_ADS
    return [
        *(
            SampleBill("Signalbox Marketing", "marketing", on_day(today, back, 20), cents, notes="Online ads")
            for back, cents in ADS
        ),
        SampleBill(
            "Signalbox Marketing",
            "marketing",
            today - timedelta(days=days),
            cents,
            notes="Online ads",
            left_overdue=True,
        ),
    ]


def sample_bills(today: date) -> list[SampleBill]:
    """All 85, oldest first."""
    every = [*_monthly(today), *_quarterly(today), *_one_offs(today), *_trips(today), *_ads(today)]
    return sorted(every, key=lambda bill: bill.bill_date)


def paid_on(bill: SampleBill, number: int, today: date) -> date | None:
    """A few days before its due date, once that's passed, and never before its bill date or after today.

    Nor before the cash flow's first day, where the opening balance starts, so the sample data moves no
    cash before it and the books' Cash agrees with the cash flow's (J13).
    """
    due = bill.bill_date + DUE_AFTER
    if due >= today or bill.left_overdue:
        return None
    return max(due - timedelta(days=2 + number % 5), months.last_months(today)[0].first_day)


def _put_down_to(number: int, bill_date: date, paid: date | None, today: date) -> dict[str, Any]:
    """Added a day after its bill date, or on the seeding day if that's sooner, by the teammates
    in turn. Every third is last changed by the next teammate since, and a paid bill was last
    changed when it was marked paid. Nothing is changed before it was added."""
    added_at = moment(min(bill_date + timedelta(days=1), today), number)
    authorship = put_down_to(number, added_at, today, every=3)
    if authorship["updated_at"] < added_at:
        authorship = who.added(teammate(number), added_at)
    if paid is not None:
        authorship.update(who.changed(teammate(number + 1), moment(paid, number + 1)))
    return authorship


def _add_suppliers(conn: Connection, today: date) -> dict[str, int]:
    """Added before their first bill, by the teammates in turn."""
    added_at = moment(today - timedelta(days=380), 2)
    return {
        name: conn.execute(
            insert(organizations)
            .values(
                name=name,
                website=f"https://www.{slug}.example",
                industry=industry,
                notes=notes,
                **put_down_to(number, added_at, today, every=3),
            )
            .returning(organizations.c.id)
        ).scalar_one()
        for number, (name, slug, industry, notes) in enumerate(SUPPLIERS)
    }


def _customers(conn: Connection) -> dict[str, int]:
    rows = conn.execute(select(organizations.c.name, organizations.c.id).where(organizations.c.name.in_(CUSTOMERS)))
    return {row.name: row.id for row in rows}


def fill(conn: Connection, today: date) -> None:
    add_missing_teammates(conn)
    supplier_ids = {**_add_suppliers(conn, today), **_customers(conn)}
    counted = dict.fromkeys(NUMBERING, 0)
    rows = []
    named = sample_bills(today)
    for number, bill in enumerate(named):
        pattern, start = NUMBERING[bill.supplier]
        bill_number = pattern.format(start + counted[bill.supplier])
        counted[bill.supplier] += 1
        paid = paid_on(bill, number, today)
        rows.append(
            {
                "organization_id": supplier_ids[bill.supplier],
                "bill_number": bill_number,
                "bill_number_key": bill_number_key(bill_number),
                "bill_date": bill.bill_date,
                "due_date": bill.bill_date + DUE_AFTER,
                "amount_cents": bill.amount_cents,
                "tax_cents": bill.tax_cents,
                "category": bill.category,
                "notes": bill.notes,
                "paid_on": paid,
                **_put_down_to(number, bill.bill_date, paid, today),
            }
        )
    ids = conn.scalars(insert(bills).returning(bills.c.id, sort_by_parameter_order=True), rows)
    for bill_id, row, bill in zip(ids, rows, named, strict=True):
        _post(conn, bill_id, row, bill.supplier)


def _post(conn: Connection, bill_id: int, row: dict[str, Any], supplier: str) -> None:
    """The bill's entry, put down to who added it, and its paid entry, put down to who marked it paid."""
    total = row["amount_cents"] + row["tax_cents"]
    books_post.bill_added(
        conn,
        bill_id=bill_id,
        on=row["bill_date"],
        total_cents=total,
        category=row["category"],
        bill_number=row["bill_number"],
        supplier=supplier,
        user=row["created_by"],
        now=row["created_at"],
    )
    if row["paid_on"] is not None:
        books_post.bill_paid(
            conn,
            bill_id=bill_id,
            on=row["paid_on"],
            total_cents=total,
            bill_number=row["bill_number"],
            user=row["updated_by"],
            now=row["updated_at"],
        )
