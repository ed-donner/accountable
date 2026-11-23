"""TB37 to TB39: sample data."""

from datetime import date, timedelta
from itertools import pairwise

import pytest
from sqlalchemy import func, insert, select

from app import config
from app.db import activities, contacts, deals, engine_for, organizations, stage_changes
from app.main import start_database
from app.rules import OPEN_STAGES, STAGES, STATUSES
from app.seed import seed

TODAY = date(2026, 11, 16)


@pytest.fixture
def seeded(engine):
    seed(engine, TODAY)
    return engine


def count(conn, table, *where):
    return conn.scalar(select(func.count()).select_from(table).where(*where))


# TB37
def test_sizes(seeded):
    with seeded.connect() as conn:
        assert count(conn, organizations) == 12
        assert count(conn, contacts) == 40
        assert count(conn, deals) == 30
        assert count(conn, activities) == 120


def test_mix(seeded):
    with seeded.connect() as conn:
        assert set(conn.scalars(select(deals.c.stage))) == set(STAGES)
        assert set(conn.scalars(select(contacts.c.status))) == set(STATUSES)
        assert len(set(conn.scalars(select(organizations.c.industry)))) >= 5
        late = count(conn, deals, deals.c.stage.in_(OPEN_STAGES), deals.c.close_date < TODAY)
        assert late >= 3
        overdue = count(
            conn,
            activities,
            activities.c.done.is_(False),
            activities.c.follow_up_on < TODAY,
        )
        assert overdue >= 3
        upcoming = count(
            conn,
            activities,
            activities.c.done.is_(False),
            activities.c.follow_up_on >= TODAY,
            activities.c.follow_up_on <= TODAY + timedelta(days=7),
        )
        assert upcoming >= 3
        assert count(conn, deals, deals.c.stage.in_(OPEN_STAGES), deals.c.close_date > TODAY) >= 5
        # Won and lost deals in most of the past 12 months.
        won_months = {
            d.strftime("%Y-%m")
            for d in conn.scalars(select(deals.c.close_date).where(deals.c.stage == "won"))
        }
        assert len(won_months) >= 9
        assert count(conn, deals, deals.c.stage == "lost") >= 3


def test_names_are_invented(seeded):
    real = {
        "google",
        "microsoft",
        "apple",
        "amazon",
        "salesforce",
        "oracle",
        "ibm",
        "walmart",
    }
    with seeded.connect() as conn:
        names = " ".join(conn.scalars(select(organizations.c.name))).lower()
        websites = list(conn.scalars(select(organizations.c.website)))
    assert not any(word in names for word in real)
    assert all(site.endswith(".example.com") for site in websites)


def test_everything_happened_in_the_past_year(seeded):
    with seeded.connect() as conn:
        dates = list(conn.scalars(select(activities.c.occurred_on)))
        closed = list(
            conn.scalars(select(deals.c.close_date).where(deals.c.stage.in_(["won", "lost"])))
        )
    assert min(dates) >= TODAY - timedelta(days=365)
    assert max(dates) <= TODAY
    assert max(closed) <= TODAY


def test_deal_activities_happen_while_the_deal_exists(seeded):
    with seeded.connect() as conn:
        rows = conn.execute(
            select(activities.c.occurred_on, deals.c.created_at).join(
                deals, deals.c.id == activities.c.deal_id
            )
        ).all()
    assert all(occurred >= created.date() for occurred, created in rows)


# TB38
def test_stage_history_leads_to_current_stage(seeded):
    with seeded.connect() as conn:
        for deal_id, stage in conn.execute(select(deals.c.id, deals.c.stage)).all():
            history = conn.execute(
                select(stage_changes.c.from_stage, stage_changes.c.to_stage)
                .where(stage_changes.c.deal_id == deal_id)
                .order_by(stage_changes.c.changed_at, stage_changes.c.id)
            ).all()
            assert history[0] == (None, "new")
            assert history[-1].to_stage == stage
            for before, after in pairwise(history):
                assert after.from_stage == before.to_stage


def snapshot(engine):
    with engine.connect() as conn:
        return {
            "orgs": conn.execute(
                select(organizations.c.name, organizations.c.industry).order_by(organizations.c.id)
            ).all(),
            "contacts": conn.execute(
                select(contacts.c.name, contacts.c.status).order_by(contacts.c.id)
            ).all(),
            "deals": conn.execute(
                select(deals.c.name, deals.c.stage, deals.c.value, deals.c.close_date).order_by(
                    deals.c.id
                )
            ).all(),
            "activities": conn.execute(
                select(
                    activities.c.description,
                    activities.c.occurred_on,
                    activities.c.follow_up_on,
                ).order_by(activities.c.id)
            ).all(),
        }


def test_same_seed_gives_same_data(engine):
    seed(engine, TODAY)
    first = snapshot(engine)
    seed(engine, TODAY)
    assert snapshot(engine) == first


def test_dates_relative_to_today(engine):
    later = date(2027, 3, 2)
    seed(engine, later)
    with engine.connect() as conn:
        assert conn.scalar(select(func.max(activities.c.occurred_on))) <= later
        assert conn.scalar(select(func.min(activities.c.occurred_on))) >= later - timedelta(
            days=365
        )
        late = count(conn, deals, deals.c.stage.in_(OPEN_STAGES), deals.c.close_date < later)
        assert late >= 3


# TB39
def test_first_start_seeds_a_new_database(db_path):
    assert not db_path.exists()
    start_database()
    with engine_for(db_path.resolve()).connect() as conn:
        assert count(conn, deals) == 30


def test_restart_keeps_existing_data(db_path):
    start_database()
    engine = engine_for(db_path.resolve())
    with engine.begin() as conn:
        conn.execute(organizations.delete())
    start_database()
    with engine.connect() as conn:
        assert count(conn, organizations) == 0


def test_reseed_replaces_everything(seeded):
    with seeded.begin() as conn:
        conn.execute(insert(organizations).values(name="My own company"))
    seed(seeded, TODAY)
    with seeded.connect() as conn:
        assert count(conn, organizations) == 12
        assert count(conn, organizations, organizations.c.name == "My own company") == 0


def test_tests_cannot_reseed_the_default_database():
    assert config.testing()
    engine = engine_for(config.DEFAULT_DB)
    with pytest.raises(RuntimeError):
        seed(engine, TODAY)
