import re
from collections import Counter
from datetime import UTC, date, datetime, time, timedelta
from itertools import pairwise
from typing import Any

import pytest
from accountable import cli, db
from accountable.company import documents
from accountable.company import sample_data as company_samples
from accountable.company.tables import company_settings
from accountable.crm import rules, sample_data
from accountable.crm.tables import activities, contacts, deals, organizations, stage_changes
from accountable.products import sample_data as product_samples
from accountable.products.tables import name_key, products
from accountable.quotes import sample_data as quote_samples
from accountable.quotes.tables import quote_lines, quotes
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
            company_samples.fill(conn, datetime.combine(today, time(12)))
            quote_samples.fill(conn, today)
            next_number = documents.take_number(conn, "quote")
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
                "quotes": conn.execute(select(quotes).order_by(quotes.c.id)).all(),
                "quote_lines": rows_of(conn, quote_lines),
                "next_number": next_number,
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
    assert len(seeded["quotes"]) == 40


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
            [
                tuple(row)
                for row in conn.execute(
                    select(quotes.c.number, quotes.c.status, quotes.c.quote_date, quotes.c.subtotal_cents)
                )
            ],
        )

    def fill(conn) -> None:
        sample_data.fill(conn, day)
        product_samples.fill(conn, day)
        company_samples.fill(conn, datetime.combine(day, time(12)))
        quote_samples.fill(conn, day)

    day = date(2026, 10, 31)
    with db.writing() as conn:
        fill(conn)
        first = snapshot(conn)
        cli._wipe(conn)
        fill(conn)
        assert snapshot(conn) == first


def test_won_and_lost_columns_start_newest_first(seeded):
    for stage in ("won", "lost"):
        column = sorted((row for row in seeded["deals"] if row.stage == stage), key=lambda row: row.position)
        dates = [row.close_date for row in column]
        assert dates == sorted(dates, reverse=True)


TEAMMATE_IDS = {teammate.id for teammate in TEAMMATES}
RECORDS = ("organizations", "contacts", "deals", "activities", "products", "quotes")


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


@pytest.mark.parametrize("kind", ["organizations", "contacts", "deals", "products", "quotes"])
def test_some_records_were_last_changed_by_another_teammate_since(seeded, kind):
    changed = [row for row in seeded[kind] if row.updated_by != row.created_by]
    assert len(changed) >= (4 if kind == "products" else 5)
    assert all(row.updated_at > row.created_at for row in changed)


@pytest.mark.parametrize("kind", RECORDS)
def test_nothing_was_changed_before_it_was_added_or_after_today(seeded, kind):
    limit = datetime.combine(seeded["today"] + timedelta(days=1), datetime.min.time()) + timedelta(hours=14)
    for row in seeded[kind]:
        assert row.created_at <= row.updated_at < limit


@pytest.mark.parametrize("kind", ["organizations", "contacts", "deals", "products", "quotes"])
def test_records_nobody_changed_have_one_moment_for_both_times(seeded, kind):
    unchanged = [row for row in seeded[kind] if row.updated_at == row.created_at]
    assert unchanged
    assert all(row.updated_by == row.created_by for row in unchanged)


# B12, as the spec lists it.
SAMPLE_COMPANY: dict[str, Any] = {
    "company_name": "Plainsong Systems",
    "address": "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
    "email": "accounts@plainsong.example",
    "phone": "(718) 555-0142",
    "tax_label": "Sales tax",
    "tax_rate": 8875,
    "payment_terms_days": 30,
    "quote_prefix": "QT-",
    "invoice_prefix": "INV-",
}


def test_a_new_database_gets_the_sample_company_from_dana_whitfield_on_the_seeding_day(database, monkeypatch):
    seeded_at = datetime(2027, 3, 1, 14, 3)
    monkeypatch.setattr(db, "local_today", lambda: seeded_at.date())
    monkeypatch.setattr(db, "utc_now", lambda: seeded_at)
    with db.writing() as conn:
        cli.fill_sample(conn)
    with db.reading() as conn:
        [settings] = [dict(row._mapping) for row in conn.execute(select(company_settings))]
    assert {name: settings[name] for name in SAMPLE_COMPANY} == SAMPLE_COMPANY
    assert settings["updated_by"] == "teammate-dana-whitfield"
    assert settings["updated_at"] == seeded_at


def test_the_sample_company_points_at_nothing_real():
    assert SAMPLE_COMPANY["email"].endswith(".example")
    assert re.fullmatch(r"\(\d{3}\) 555-01\d\d", SAMPLE_COMPANY["phone"])  # 555-0100 to 555-0199


# The sample quotes (M3, M4, M8)


def lines_by_quote(seeded) -> dict[int, list]:
    found: dict[int, list] = {}
    for row in sorted(seeded["quote_lines"], key=lambda line: line.position):
        found.setdefault(row.quote_id, []).append(row)
    return found


def shown_status(quote, today: date) -> str:
    return "expired" if quote.status == "sent" and quote.valid_until < today else quote.status


def local_day(at: datetime) -> date:
    return at.replace(tzinfo=UTC).astimezone().date()


def first_move(seeded, deal_id: int, stage: str):
    return min(
        (row for row in seeded["stage_changes"] if row.deal_id == deal_id and row.to_stage == stage),
        key=lambda row: row.changed_at,
    )


def test_the_quotes_are_built_from_the_sample_products_with_some_prices_changed_by_hand(seeded):
    product = {row.id: row for row in seeded["products"]}
    lines = lines_by_quote(seeded)
    every_line = seeded["quote_lines"]
    assert all(line.name == product[line.product_id].name for line in every_line)
    assert all(product[line.product_id].active for line in every_line)
    assert sum(len(lines[quote.id]) >= 3 for quote in seeded["quotes"]) >= 30
    by_hand = sum(line.unit_price_cents != product[line.product_id].unit_price_cents for line in every_line)
    assert 10 <= by_hand <= len(every_line) // 2


def test_each_quotes_subtotal_adds_up_its_lines(seeded):
    lines = lines_by_quote(seeded)
    for quote in seeded["quotes"]:
        assert quote.subtotal_cents == sum(line.quantity * line.unit_price_cents for line in lines[quote.id])


def test_the_statuses_fill_the_quotes_figures(seeded):
    shown = Counter(shown_status(quote, seeded["today"]) for quote in seeded["quotes"])
    assert shown == {"draft": 8, "sent": 13, "expired": 2, "accepted": 15, "declined": 2}


def test_every_deal_in_proposal_and_negotiation_has_a_draft_or_a_sent_quote(seeded):
    waiting = {quote.deal_id for quote in seeded["quotes"] if quote.status in ("draft", "sent")}
    for deal in seeded["deals"]:
        if deal.stage in ("proposal", "negotiation"):
            assert deal.id in waiting, deal.name
        elif deal.stage != "won":
            assert all(quote.deal_id != deal.id for quote in seeded["quotes"]), deal.name


def test_a_declined_quote_has_a_newer_one_on_its_deal(seeded):
    declined = [quote for quote in seeded["quotes"] if quote.status == "declined"]
    assert declined
    for quote in declined:
        newer = [other for other in seeded["quotes"] if other.deal_id == quote.deal_id and other.id > quote.id]
        assert newer and newer[0].status in ("draft", "sent"), quote.number
        assert quote.decided_on == newer[0].quote_date


def test_every_deal_won_lately_has_one_accepted_quote_worth_its_value(seeded):
    """Won this month or in the two before, accepted on the close date by whoever moved the deal to Won (M4)."""
    today = seeded["today"]
    lately = {month for month in months_back(today, 3)}
    accepted = {quote.deal_id: quote for quote in seeded["quotes"] if quote.status == "accepted"}
    won_lately = [
        deal
        for deal in seeded["deals"]
        if deal.stage == "won" and (deal.close_date.year, deal.close_date.month) in lately
    ]
    assert set(accepted) == {deal.id for deal in won_lately}
    assert len([quote for quote in seeded["quotes"] if quote.status == "accepted"]) == len(won_lately)
    for deal in won_lately:
        quote = accepted[deal.id]
        won = first_move(seeded, deal.id, "won")
        assert quote.subtotal_cents == deal.value * 100, deal.name
        assert quote.sent_on < deal.close_date == quote.decided_on, deal.name
        assert (quote.updated_by, quote.updated_at) == (won.created_by, won.changed_at), deal.name


def test_every_quote_is_dated_after_its_deal_reached_proposal_and_never_after_today(seeded):
    today = seeded["today"]
    for quote in seeded["quotes"]:
        reached = local_day(first_move(seeded, quote.deal_id, "proposal").changed_at)
        assert reached < quote.quote_date <= today, quote.number
        assert quote.quote_date <= quote.valid_until, quote.number
        for day in (quote.sent_on, quote.decided_on):
            assert day is None or quote.quote_date <= day <= today, quote.number


def test_the_numbers_follow_the_order_the_quotes_were_made_and_the_next_carries_on(seeded):
    made = sorted(seeded["quotes"], key=lambda quote: quote.created_at)
    assert [quote.number for quote in made] == [f"QT-{number:04d}" for number in range(1, 41)]
    assert [quote.quote_date for quote in made] == sorted(quote.quote_date for quote in made)
    assert seeded["next_number"] == "QT-0041"


def test_each_quote_that_isnt_a_draft_keeps_the_sample_companys_details_and_its_deals(seeded):
    organization = {row.id: row.name for row in seeded["organizations"]}
    contact = {row.id: row for row in seeded["contacts"]}
    deal = {row.id: row for row in seeded["deals"]}
    for quote in seeded["quotes"]:
        fixed = (
            quote.company_name,
            quote.company_email,
            quote.tax_label,
            quote.tax_rate,
            quote.prepared_for_organization,
            quote.prepared_for_contact,
            quote.prepared_for_email,
        )
        if quote.status == "draft":
            assert set(fixed) == {None}, quote.number
            continue
        on = deal[quote.deal_id]
        main = contact[on.main_contact_id]
        assert fixed == (
            SAMPLE_COMPANY["company_name"],
            SAMPLE_COMPANY["email"],
            SAMPLE_COMPANY["tax_label"],
            SAMPLE_COMPANY["tax_rate"],
            organization[on.organization_id],
            main.name,
            main.email,
        ), quote.number


def test_some_organizations_have_quotes_on_more_than_one_of_their_deals(seeded):
    organization_of = {row.id: row.organization_id for row in seeded["deals"]}
    deals_quoted = Counter(organization_of[deal_id] for deal_id in {quote.deal_id for quote in seeded["quotes"]})
    assert sum(count >= 2 for count in deals_quoted.values()) >= 3


def test_a_quotes_lines_were_added_with_it(seeded):
    added = {quote.id: quote.created_at for quote in seeded["quotes"]}
    for line in seeded["quote_lines"]:
        assert line.created_at == line.updated_at == added[line.quote_id]
