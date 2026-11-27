"""The sample data (R4, R52–R55, D23)."""

from collections import Counter
from datetime import date

from sqlalchemy import select

from backend.app import db, seed, stages
from backend.app.db import activities, contacts, deals, organizations

TODAY = date(2026, 11, 15)


def rows(table):
    with db.transaction() as conn:
        return [dict(r) for r in conn.execute(select(table)).mappings()]


def test_sizes_and_spread():  # R52
    seed.reset()
    orgs, people, all_deals = rows(organizations), rows(contacts), rows(deals)
    assert len(orgs) == 15
    assert len({o["industry"] for o in orgs}) >= 5
    assert len(people) == 40
    assert set(Counter(p["status"] for p in people)) == {"lead", "qualified", "customer"}
    assert 28 <= len(all_deals) <= 36
    assert {d["stage"] for d in all_deals} == set(stages.STAGE_NAMES)
    assert sum(1 for a in rows(activities) if a["kind"] != "stage_change") == 80


def test_dates_relative_to_today():  # R53
    seed.reset()
    all_deals = rows(deals)
    won_months = {d["close_date"][:7] for d in all_deals if d["stage"] == "Won"}
    expected_months = {f"{y}-{m:02d}" for y, m in [(2025, 12)] + [(2026, m) for m in range(1, 12)]}
    assert expected_months <= won_months
    open_deals = [d for d in all_deals if stages.is_open(d["stage"])]
    late = [d for d in open_deals if d["close_date"] < TODAY.isoformat()]
    assert 3 <= len(late) <= 4
    assert any(d["close_date"] > "2027-01-01" for d in open_deals)
    for d in all_deals:
        if not stages.is_open(d["stage"]):
            assert d["close_date"] <= TODAY.isoformat()
    follow = [a for a in rows(activities) if a["follow_up_date"] and not a["done"]]
    due = Counter(
        "overdue" if a["follow_up_date"] < TODAY.isoformat() else "today" if a["follow_up_date"] == TODAY.isoformat() else "upcoming"
        for a in follow
    )
    assert due["overdue"] >= 1 and 1 <= due["today"] <= 2 and due["upcoming"] >= 1


def test_stage_history_matches_each_deals_path():  # R54
    seed.reset()
    changes = [a for a in rows(activities) if a["kind"] == "stage_change"]
    for d in rows(deals):
        path = [(a["from_stage"], a["to_stage"]) for a in sorted(changes, key=lambda a: a["occurred_at"]) if a["deal_id"] == d["id"]]
        if d["stage"] == "New":
            assert path == []
            continue
        assert path[0][0] == "New"
        assert path[-1][1] == d["stage"]
        for (_, to), (frm, _) in zip(path, path[1:], strict=False):
            assert to == frm


def test_made_up_contact_details():  # R55
    seed.reset()
    for p in rows(contacts):
        assert p["email"].endswith("@example.com")
        assert p["phone"].startswith("555-")
    for o in rows(organizations):
        assert ".example.com" in o["website"]


def test_same_data_each_time_and_reset_clears_changes():  # R4, D23
    seed.reset()
    first = [(d["name"], d["stage"], d["value_cents"]) for d in rows(deals)]
    with db.transaction() as conn:
        conn.execute(organizations.insert().values(name="Extra", created_at="x", updated_at="x"))
    seed.reset()
    assert [(d["name"], d["stage"], d["value_cents"]) for d in rows(deals)] == first
    assert "Extra" not in {o["name"] for o in rows(organizations)}


def test_reset_works_while_the_app_is_running(client):  # R4
    client.post("/api/organizations", json={"name": "Temporary"})
    seed.reset()
    names = {o["name"] for o in client.get("/api/organizations").json()}
    assert "Temporary" not in names and len(names) == 15
