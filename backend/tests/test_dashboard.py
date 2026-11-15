"""The Overview figures (R45–R51). Today is fixed at 2026-11-15 in conftest."""

from datetime import date

from backend.app.dashboard import last_12_months

from .conftest import make_activity, make_contact, make_deal, make_org


def dash(c):
    return c.get("/api/dashboard").json()


def test_last_12_months_crosses_the_year():
    months = last_12_months(date(2026, 3, 9))
    assert months[0] == (2025, 4) and months[-1] == (2026, 3) and len(months) == 12


def test_headline_figures(empty_client):  # R45
    org = make_org(empty_client)
    make_deal(empty_client, org["id"], stage="Proposal", value_cents=1_000_000)
    make_deal(empty_client, org["id"], stage="New", value_cents=333, close_date="2026-11-01")  # late
    make_deal(empty_client, org["id"], stage="Won", value_cents=500_000, close_date="2026-11-03")
    make_deal(empty_client, org["id"], stage="Won", value_cents=200_000, close_date="2026-02-10")
    make_deal(empty_client, org["id"], stage="Won", value_cents=900_000, close_date="2025-10-31")  # outside 12 months
    make_deal(empty_client, org["id"], stage="Lost", value_cents=100_000, close_date="2026-06-01")
    d = dash(empty_client)
    assert (d["open_count"], d["open_value_cents"]) == (2, 1_000_333)
    assert d["open_expected_cents"] == 500_000 + 33  # 333 × 10% = 33.3 → 33
    assert d["late_count"] == 1
    assert (d["won_this_month"]["revenue_cents"], d["won_this_month"]["won_count"]) == (500_000, 1)
    assert (d["win_rate"], d["won_last_12"], d["closed_last_12"]) == (67, 2, 3)  # 2 ÷ (2 + 1)


def test_no_closed_deals_means_no_win_rate(empty_client):  # R45
    assert dash(empty_client)["win_rate"] is None


def test_twelve_months_of_revenue_and_counts(empty_client):  # R46, R47
    org = make_org(empty_client)
    make_deal(empty_client, org["id"], stage="Won", value_cents=100, close_date="2025-12-01")
    make_deal(empty_client, org["id"], stage="Won", value_cents=200, close_date="2026-11-15")
    make_deal(empty_client, org["id"], stage="Won", value_cents=300, close_date="2026-11-02")
    monthly = dash(empty_client)["monthly"]
    assert [m["month"] for m in monthly][:2] == ["2025-12", "2026-01"] and monthly[-1]["month"] == "2026-11"
    assert (monthly[0]["revenue_cents"], monthly[0]["won_count"]) == (100, 1)
    assert (monthly[-1]["revenue_cents"], monthly[-1]["won_count"]) == (500, 2)
    assert sum(m["won_count"] for m in monthly[1:-1]) == 0


def test_funnel_counts_reached_stages(empty_client):  # R48
    org = make_org(empty_client)
    c = empty_client
    make_deal(c, org["id"], "Fresh", value_cents=100)  # New
    created_late = make_deal(c, org["id"], "Straight to proposal", stage="Proposal", value_cents=200)
    lost = make_deal(c, org["id"], "Lost at negotiation", value_cents=400)
    for stage in ["Qualified", "Proposal", "Negotiation", "Lost"]:
        c.post(f"/api/deals/{lost['id']}/move", json={"stage": stage, "index": 0})
    never = make_deal(c, org["id"], "Lost at once", value_cents=800)
    c.post(f"/api/deals/{never['id']}/move", json={"stage": "Lost", "index": 0})
    make_deal(c, org["id"], "Won", stage="Won", value_cents=1600)
    funnel = {f["stage"]: (f["count"], f["value_cents"]) for f in dash(c)["funnel"]}
    assert funnel == {
        "New": (5, 3100),
        "Qualified": (3, 2200),
        "Proposal": (3, 2200),
        "Negotiation": (2, 2000),
        "Won": (1, 1600),
    }
    assert created_late["stage"] == "Proposal"


def test_recent_activity_and_follow_ups(empty_client):  # R49, R50
    person = make_contact(empty_client)
    for i in range(12):
        make_activity(empty_client, contact_id=person["id"], description=f"A{i}", occurred_at=f"2026-11-{i + 1:02d}T09:00:00Z")
    recent = dash(empty_client)["recent_activity"]
    assert [a["description"] for a in recent] == [f"A{i}" for i in range(11, 1, -1)]

    for day in ["2026-11-20", "2026-11-10", "2026-11-15", "2026-11-12", "2026-11-18"]:
        make_activity(empty_client, contact_id=person["id"], description=day, follow_up_date=day)
    done = make_activity(empty_client, contact_id=person["id"], description="done", follow_up_date="2026-11-01")
    empty_client.patch(f"/api/activities/{done['id']}", json={"done": True})
    groups = dash(empty_client)["follow_ups"]
    assert [a["description"] for a in groups["overdue"]] == ["2026-11-10", "2026-11-12"]
    assert [a["description"] for a in groups["today"]] == ["2026-11-15"]
    assert [a["description"] for a in groups["upcoming"]] == ["2026-11-18", "2026-11-20"]


def test_figures_follow_changes(empty_client):  # R51
    org = make_org(empty_client)
    deal = make_deal(empty_client, org["id"], stage="Negotiation", value_cents=1000)
    before = dash(empty_client)
    empty_client.post(f"/api/deals/{deal['id']}/move", json={"stage": "Won", "index": 0})
    person = make_contact(empty_client)
    make_activity(empty_client, contact_id=person["id"], follow_up_date="2026-11-16")
    after = dash(empty_client)
    assert before["open_count"] == 1 and after["open_count"] == 0
    assert after["won_this_month"]["revenue_cents"] == before["won_this_month"]["revenue_cents"] + 1000
    assert len(after["follow_ups"]["upcoming"]) == 1
    assert after["recent_activity"][0]["kind"] in ("note", "stage_change")


def test_seeded_dashboard_matches_the_mockup(client):
    d = dash(client)
    assert (d["open_count"], d["open_value_cents"], d["open_expected_cents"]) == (17, 70_630_000, 29_225_500)
    assert (d["late_count"], d["win_rate"], d["won_value_last_12_cents"]) == (4, 82, 62_000_000)
    assert all(m["won_count"] >= 1 for m in d["monthly"])
