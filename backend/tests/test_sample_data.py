from collections import Counter
from datetime import date, datetime, timedelta
from itertools import pairwise

import pytest
from accountable import db
from accountable.crm import rules, sample_data
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes
from accountable.products import sample_data as product_samples
from accountable.products.tables import name_key, products
from accountable.users import TEAMMATES, users
from sqlalchemy import select

DAYS = [date(2027, 1, 1), date(2027, 3, 1), date(2028, 2, 29), date(2027, 1, 31), date(2026, 10, 31), date(2026, 7, 14)]


def rows_of(conn, table):
    return conn.execute(select(table)).all()


@pytest.fixture(scope="module")
def rows_by_day() -> dict:
    return {}


@pytest.fixture(params=DAYS, ids=str)
def seeded(request, rows_by_day, database):
    """The rows for one seeding day. The tests only read them, so each day is seeded once."""
    today = request.param
    if today not in rows_by_day:
        with db.writing() as conn:
            sample_data.fill(conn, today)
            product_samples.fill(conn, today)
        with db.reading() as conn:
            rows_by_day[today] = {
                "today": today,
                "organizations": rows_of(conn, organizations),
                "contacts": rows_of(conn, contacts),
                "deals": rows_of(conn, deals),
                "activities": rows_of(conn, activities),
                "stage_changes": rows_of(conn, stage_changes),
                "products": rows_of(conn, products),
                "users": rows_of(conn, users),
            }
    return rows_by_day[today]


def months_back(today: date, count: int) -> list[tuple[int, int]]:
    index = today.year * 12 + today.month - 1
    return [((index - back) // 12, (index - back) % 12 + 1) for back in range(count)]


def test_activity_types_are_spread_through_the_working_day(seeded):
    for kind in ("call", "email", "note"):
        hours = {row.occurred_at.hour for row in seeded["activities"] if row.type == kind}
        assert len(hours) >= 6


def test_the_amounts(seeded):
    assert len(seeded["organizations"]) == 24
    assert len(seeded["contacts"]) == 75
    assert len(seeded["deals"]) == 80
    assert len(seeded["activities"]) == 300
    assert len(seeded["products"]) == 12


def test_products_have_cents_and_archived_ones_and_fit_the_sample_deals(seeded):
    rows = seeded["products"]
    assert sum(row.unit_price_cents % 100 != 0 for row in rows) >= 3
    assert sum(not row.active for row in rows) == 2
    largest_deal = max(row.value for row in seeded["deals"])
    assert all(0 < row.unit_price_cents < largest_deal * 100 for row in rows)


def test_product_names_are_unique_and_keyed(seeded):
    rows = seeded["products"]
    assert all(row.name_key == name_key(row.name) for row in rows)
    assert len({row.name_key for row in rows}) == len(rows)


def test_one_product_description_has_two_lines_and_one_is_blank(seeded):
    descriptions = [row.description for row in seeded["products"]]
    assert sum(description is None for description in descriptions) == 1
    assert sum("\n" in description for description in descriptions if description) == 1


def test_archived_products_were_last_changed_by_another_teammate(seeded):
    for row in seeded["products"]:
        if not row.active:
            assert row.updated_by != row.created_by, row.name
            assert row.updated_at > row.created_at, row.name


def test_at_least_six_industries(seeded):
    assert len({row.industry for row in seeded["organizations"]}) >= 6


def test_every_status(seeded):
    assert {row.status for row in seeded["contacts"]} == {"lead", "qualified", "customer"}


def test_every_won_deals_main_contact_is_a_customer(seeded):
    status = {row.id: row.status for row in seeded["contacts"]}
    for deal in seeded["deals"]:
        if deal.stage == "won":
            assert status[deal.main_contact_id] == "customer"


def test_open_deals(seeded):
    today = seeded["today"]
    open_deals = [row for row in seeded["deals"] if row.stage in rules.OPEN_STAGES]
    assert len(open_deals) == 36
    assert {row.stage for row in open_deals} == set(rules.OPEN_STAGES)
    assert sum(rules.is_late(row.stage, row.close_date, today) for row in open_deals) >= 5

    index = today.year * 12 + today.month - 1
    coming = {(row.close_date.year, row.close_date.month) for row in open_deals}
    for ahead in (1, 2, 3):
        assert ((index + ahead) // 12, (index + ahead) % 12 + 1) in coming


def test_closed_deals(seeded):
    stages = Counter(row.stage for row in seeded["deals"])
    assert stages["won"] == 32
    assert stages["lost"] == 12


def test_a_win_in_every_month_with_none_in_the_future(seeded):
    today = seeded["today"]
    won = [row for row in seeded["deals"] if row.stage == "won"]
    assert all(row.close_date <= today for row in won)
    months = Counter((row.close_date.year, row.close_date.month) for row in won)
    assert all(months[month] >= 1 for month in months_back(today, 12))
    assert set(months) <= set(months_back(today, 12))


def test_lost_deals_are_never_in_the_future(seeded):
    assert all(row.close_date <= seeded["today"] for row in seeded["deals"] if row.stage == "lost")


def test_at_least_two_wins_this_month(seeded):
    today = seeded["today"]
    this_month = [
        row
        for row in seeded["deals"]
        if row.stage == "won" and (row.close_date.year, row.close_date.month) == (today.year, today.month)
    ]
    assert len(this_month) >= 2


def test_revenue_trends_upward(seeded):
    today = seeded["today"]
    revenue = Counter()
    for row in seeded["deals"]:
        if row.stage == "won":
            revenue[(row.close_date.year, row.close_date.month)] += row.value
    series = [revenue[month] for month in reversed(months_back(today, 12))]
    assert sum(series[6:]) > sum(series[:6])


def test_activities(seeded):
    today = seeded["today"]
    rows = seeded["activities"]
    assert {row.type for row in rows} == {"note", "call", "email"}
    waiting = [row for row in rows if row.follow_up_date and not row.follow_up_done]
    assert sum(row.follow_up_date < today for row in waiting) >= 6
    assert sum(row.follow_up_date >= today for row in waiting) >= 10


def test_nothing_logged_is_in_the_future(seeded):
    limit = datetime.combine(seeded["today"] + timedelta(days=1), datetime.min.time()) + timedelta(hours=14)
    assert all(row.occurred_at < limit for row in seeded["activities"])


def test_dates_follow_the_seeding_day(database):
    first = date(2026, 10, 31)
    later = date(2027, 2, 14)
    with db.writing() as conn:
        sample_data.fill(conn, first)
    with db.reading() as conn:
        early = max(row.close_date for row in rows_of(conn, deals))
    with db.writing() as conn:
        for table in (activities, stage_changes, deals, contacts, organizations):
            conn.execute(table.delete())
        sample_data.fill(conn, later)
    with db.reading() as conn:
        late = max(row.close_date for row in rows_of(conn, deals))
    assert late > early


def test_every_deal_has_a_full_stage_history(seeded):
    changes: dict[int, list] = {}
    for row in sorted(seeded["stage_changes"], key=lambda change: change.id):
        changes.setdefault(row.deal_id, []).append(row)

    for deal in seeded["deals"]:
        steps = changes.get(deal.id, [])
        if deal.stage == "new":
            assert steps == []
            continue
        assert steps, deal.name
        assert steps[0].from_stage == "new"
        assert steps[-1].to_stage == deal.stage
        for before, after in pairwise(steps):
            assert before.to_stage == after.from_stage
            assert before.changed_at < after.changed_at


def test_only_example_addresses(seeded):
    for row in seeded["contacts"]:
        assert row.email.endswith(".example")
    for row in seeded["organizations"]:
        assert row.website.endswith(".example")


def test_the_same_content_each_time(database):
    def snapshot(conn):
        return (
            [
                tuple(row)
                for row in conn.execute(select(deals.c.name, deals.c.stage, deals.c.value, deals.c.close_date))
            ],
            [tuple(row) for row in conn.execute(select(contacts.c.name, contacts.c.email))],
            [tuple(row) for row in conn.execute(select(activities.c.type, activities.c.description))],
            [
                tuple(row)
                for row in conn.execute(
                    select(products.c.name, products.c.description, products.c.unit_price_cents, products.c.active)
                )
            ],
        )

    day = date(2026, 10, 31)
    with db.writing() as conn:
        sample_data.fill(conn, day)
        product_samples.fill(conn, day)
        first = snapshot(conn)
        for table in (activities, stage_changes, deals, contacts, organizations, products):
            conn.execute(table.delete())
        sample_data.fill(conn, day)
        product_samples.fill(conn, day)
        assert snapshot(conn) == first


def test_won_and_lost_columns_start_newest_first(seeded):
    for stage in ("won", "lost"):
        column = sorted((row for row in seeded["deals"] if row.stage == stage), key=lambda row: row.position)
        dates = [row.close_date for row in column]
        assert dates == sorted(dates, reverse=True)


TEAMMATE_IDS = {teammate.id for teammate in TEAMMATES}
RECORDS = ("organizations", "contacts", "deals", "activities", "products")


def test_the_four_made_up_teammates_with_robin_having_no_name(seeded):
    assert {(row.name, row.email) for row in seeded["users"]} == {
        ("Alex Rivera", "alex.rivera@accountable.example"),
        ("Dana Whitfield", "dana.whitfield@accountable.example"),
        ("Theo Brandt", "theo.brandt@accountable.example"),
        (None, "robin@accountable.example"),
    }
    assert {row.id for row in seeded["users"]} == TEAMMATE_IDS


def test_no_teammate_shares_a_name_with_a_sample_contact(seeded):
    contact_words = {word for row in seeded["contacts"] for word in row.name.split()}
    for teammate in TEAMMATES:
        assert not set((teammate.name or "").split()) & contact_words, teammate.name


def test_every_record_and_stage_change_is_put_down_to_a_teammate(seeded):
    for kind in RECORDS:
        for row in seeded[kind]:
            assert row.created_by in TEAMMATE_IDS, kind
            assert row.updated_by in TEAMMATE_IDS, kind
    assert {row.created_by for row in seeded["stage_changes"]} == TEAMMATE_IDS


def test_each_teammate_added_some_of_each_kind(seeded):
    for kind in RECORDS:
        assert {row.created_by for row in seeded[kind]} == TEAMMATE_IDS, kind


@pytest.mark.parametrize("kind", ["organizations", "contacts", "deals", "products"])
def test_some_records_were_last_changed_by_another_teammate_since(seeded, kind):
    changed = [row for row in seeded[kind] if row.updated_by != row.created_by]
    assert len(changed) >= (4 if kind == "products" else 5)
    assert all(row.updated_at > row.created_at for row in changed)


@pytest.mark.parametrize("kind", RECORDS)
def test_nothing_was_changed_before_it_was_added_or_after_today(seeded, kind):
    limit = datetime.combine(seeded["today"] + timedelta(days=1), datetime.min.time()) + timedelta(hours=14)
    for row in seeded[kind]:
        assert row.created_at <= row.updated_at < limit


@pytest.mark.parametrize("kind", ["organizations", "contacts", "deals", "products"])
def test_records_nobody_changed_have_one_moment_for_both_times(seeded, kind):
    unchanged = [row for row in seeded[kind] if row.updated_at == row.created_at]
    assert unchanged
    assert all(row.updated_by == row.created_by for row in unchanged)
