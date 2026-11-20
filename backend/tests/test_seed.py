from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone

import pytest
from sqlalchemy import select

from backend.app import clock, rules, seed
from backend.app.config import Settings
from backend.app.db import activities, deals
from backend.app.main import create_app
from backend.tests.conftest import add_org, local_client, ok

SEED_DAYS = ["2026-11-19", "2026-12-31", "2027-01-01", "2027-01-31", "2027-03-01", "2028-02-29"]


def check_sample_rules(client, today: date):
    """DATA-3 to DATA-8, checked through the API."""
    orgs = ok(client.get("/api/organizations"))
    contacts = ok(client.get("/api/contacts"))
    deals_ = ok(client.get("/api/deals"))
    window_start = today - timedelta(days=30)

    assert len(orgs) == 15
    assert len({o["industry"] for o in orgs}) >= 8

    statuses = Counter(c["status"] for c in contacts)
    assert statuses == {"lead": 18, "qualified": 10, "customer": 12}
    assert sum(1 for c in contacts if c["status"] == "lead" and c["organization"] is None) == 4
    assert all(c["organization"] for c in contacts if c["status"] != "lead")

    assert len(deals_) == 35
    assert {d["stage"] for d in deals_} == set(rules.STAGES)
    assert all(5000 <= d["value"] <= 150000 for d in deals_)
    open_deals = [d for d in deals_ if rules.is_open(d["stage"])]
    assert len(open_deals) == 19
    assert sum(d["is_late"] for d in open_deals) in (3, 4)

    won = [d for d in deals_ if d["stage"] == "won"]
    lost = [d for d in deals_ if d["stage"] == "lost"]
    assert len(won) == 10 and len(lost) == 6
    won_dates = [date.fromisoformat(d["close_date"]) for d in won]
    lost_dates = [date.fromisoformat(d["close_date"]) for d in lost]
    assert all(day <= today for day in won_dates + lost_dates)
    assert any((day.year, day.month) == (today.year, today.month) for day in won_dates)
    assert sum(day >= window_start for day in won_dates) == 2
    assert sum(day >= window_start for day in lost_dates) == 2
    # Spread over the last 12 months.
    months = set(rules.months(today))
    assert all(rules.month_key(day) in months for day in won_dates)
    assert len({rules.month_key(day) for day in won_dates}) >= 7

    dashboard = ok(client.get("/api/dashboard"))
    assert dashboard["follow_up_counts"] == {"overdue": 3, "due_soon": 4}
    assert dashboard["won_this_month"]["count"] >= 1
    board = {c["stage"]: len(c["deals"]) for c in ok(client.get("/api/pipeline"))["columns"]}
    assert board["won"] == 2 and board["lost"] == 2

    # Every main contact is from the deal's organization.
    org_of = {c["id"]: (c["organization"] or {}).get("id") for c in contacts}
    for deal in deals_:
        if deal["main_contact"]:
            assert org_of[deal["main_contact"]["id"]] == deal["organization"]["id"], deal["name"]

    # Every email and website uses the reserved .example domain.
    assert all(c["email"].endswith(".example") for c in contacts if c["email"])
    assert all(o["website"].endswith(".example") for o in orgs)
    return deals_


def check_stage_paths_and_times(engine, today: date, now: datetime):
    """Each deal's stage changes join up from New to its current stage, and fall
    between its created_at and its close date (or today)."""
    with engine.connect() as conn:
        deal_rows = {row.id: row for row in conn.execute(select(deals))}
        changes = defaultdict(list)
        all_activities = conn.execute(select(activities).order_by(activities.c.occurred_at, activities.c.id)).all()
    for row in all_activities:
        assert row.occurred_at <= now, row.description
        if row.type == "stage_change":
            changes[row.deal_id].append(row)

    for deal_id, deal in deal_rows.items():
        path = changes[deal_id]
        stages = ["new"] + [change.to_stage for change in path]
        assert stages[-1] == deal.stage, deal.name
        for change, previous in zip(path, stages):
            assert change.from_stage == previous, deal.name
        end = min(deal.close_date, today)
        if path:
            assert deal.created_at < path[0].occurred_at, deal.name
            assert path[-1].occurred_at.date() <= end + timedelta(days=1), deal.name


def logged_count(engine) -> int:
    with engine.connect() as conn:
        return len(conn.execute(select(activities.c.id).where(activities.c.type != "stage_change")).all())


def test_the_sample_data_meets_the_rules(seeded_client):
    check_sample_rules(seeded_client, date(2026, 11, 19))
    engine = seeded_client.app.state.engine
    check_stage_paths_and_times(engine, date(2026, 11, 19), datetime(2026, 11, 19, 15, tzinfo=timezone.utc))
    assert logged_count(engine) == 80


@pytest.mark.parametrize("day", SEED_DAYS)
def test_the_rules_hold_on_awkward_seed_days(tmp_path, day):
    today = date.fromisoformat(day)
    now = datetime.combine(today, time(15), tzinfo=timezone.utc)
    clock.freeze(today, now)
    app = create_app(Settings(tmp_path / f"{day}.db", 8000, 5173))
    with local_client(app) as client:
        check_sample_rules(client, today)
        check_stage_paths_and_times(app.state.engine, today, now)


@pytest.mark.parametrize("hour", [0, 3, 23])
def test_times_are_never_in_the_future_at_any_hour(tmp_path, hour):
    today = date(2026, 11, 19)
    now = datetime.combine(today, time(hour, 5), tzinfo=timezone.utc)
    clock.freeze(today, now)
    app = create_app(Settings(tmp_path / "hours.db", 8000, 5173))
    with local_client(app):
        check_stage_paths_and_times(app.state.engine, today, now)


def test_two_seeds_give_the_same_content(tmp_path):
    def snapshot(path):
        app = create_app(Settings(path, 8000, 5173))
        with local_client(app) as client:
            return [
                ok(client.get(url))
                for url in ("/api/organizations", "/api/contacts", "/api/deals", "/api/dashboard", "/api/pipeline")
            ]

    assert snapshot(tmp_path / "one.db") == snapshot(tmp_path / "two.db")


def test_the_summary_line():
    counts = {"organizations": 15, "contacts": 40, "deals": 35, "activities": 80, "stage_changes": 64}
    assert seed.summary(counts) == (
        "Sample data loaded: 15 organizations, 40 contacts, 35 deals, 80 activities (plus 64 stage changes)."
    )


@pytest.fixture
def db_env(settings, monkeypatch):
    monkeypatch.setenv("ACCOUNTABLE_DB_PATH", str(settings.db_path))
    return settings


def test_the_command_with_yes_skips_the_question(db_env, monkeypatch, capsys):
    monkeypatch.setattr("builtins.input", lambda prompt: pytest.fail("asked a question"))
    assert seed.main(["--yes"]) == 0
    assert capsys.readouterr().out.startswith("Sample data loaded: 15 organizations, 40 contacts, 35 deals, 80 activities")


@pytest.mark.parametrize("answer", ["no", "", "y"])
def test_any_answer_but_yes_changes_nothing(db_env, monkeypatch, capsys, answer):
    prompts = []
    monkeypatch.setattr("builtins.input", lambda prompt: prompts.append(prompt) or answer)
    assert seed.main([]) == 0
    assert prompts == ["This replaces all your data with the sample data. Type yes to continue: "]
    assert capsys.readouterr().out.strip() == "Nothing changed."


def test_saying_no_on_a_new_install_leaves_nothing_behind(tmp_path, monkeypatch, capsys):
    path = tmp_path / "data" / "accountable.db"
    monkeypatch.setenv("ACCOUNTABLE_DB_PATH", str(path))
    monkeypatch.setattr("builtins.input", lambda prompt: "no")
    assert seed.main([]) == 0
    assert capsys.readouterr().out.strip().endswith("Nothing changed.")
    assert not path.parent.exists()
    # So the app's first start still finds no database, and loads the sample data (DATA-1).
    with local_client(create_app(Settings(path, 8000, 5173))) as client:
        assert len(ok(client.get("/api/organizations"))) == 15


def test_typing_yes_loads_the_data(db_env, monkeypatch, capsys):
    monkeypatch.setattr("builtins.input", lambda prompt: "yes")
    assert seed.main([]) == 0
    assert "Sample data loaded" in capsys.readouterr().out


def test_reseeding_works_while_the_app_is_running(db_env):
    app = create_app(db_env, seed_new=True)
    with local_client(app) as client:
        add_org(client, "Added before the reset")
        assert len(ok(client.get("/api/organizations"))) == 16
        # Another connection holds a read open while the seed runs.
        with app.state.engine.connect() as reader:
            reader.begin()
            reader.execute(select(deals.c.id)).all()
            assert seed.main(["--yes"]) == 0
        names = [o["name"] for o in ok(client.get("/api/organizations"))]
        assert len(names) == 15
        assert "Added before the reset" not in names


@pytest.mark.parametrize(
    ("today", "spec", "expected"),
    [
        # Held to the month's length: there's no Feb 30.
        ("2027-04-20", seed.MonthsAgo(2, 30), "2027-02-28"),
        ("2028-04-20", seed.MonthsAgo(2, 30), "2028-02-29"),
        # Across the year.
        ("2027-01-15", seed.MonthsAgo(3, 9), "2026-10-09"),
        # Kept out of the 30-day window, which starts on Jan 30 for Mar 1.
        ("2027-03-01", seed.MonthsAgo(2, 30), "2027-01-29"),
        ("2026-11-19", seed.DaysFromToday(-25), "2026-10-25"),
        ("2026-11-19", seed.DaysFromToday(0), "2026-11-19"),
    ],
)
def test_resolve_close(today, spec, expected):
    assert seed.resolve_close(spec, date.fromisoformat(today)) == date.fromisoformat(expected)
