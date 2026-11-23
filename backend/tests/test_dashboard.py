"""TB30 to TB35: dashboard figures against a small hand-made data set (today is 16 Nov 2026)."""

import pytest


@pytest.fixture
def data(api):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    api.deal(org["id"], name="D1", value=1000, stage="new")
    api.deal(org["id"], name="D2", value=2000, stage="proposal")
    api.deal(org["id"], name="D3", value=4000, stage="negotiation")
    api.deal(org["id"], name="D4", value=10000, stage="won")  # closes today
    api.deal(org["id"], name="D5", value=5000, stage="won", close_date="2026-06-10")
    d6 = api.deal(org["id"], name="D6", value=3000, stage="new")
    api.move(d6["id"], "qualified")
    api.move(d6["id"], "lost")  # reached Qualified before it was lost
    api.deal(
        org["id"], name="D7", value=7000, stage="lost", close_date="2025-11-20"
    )  # outside the 12 months
    for on, done in (
        ("2026-11-10", False),
        ("2026-11-01", True),
        ("2026-11-16", False),
        ("2026-11-23", False),
        ("2026-11-24", False),
    ):
        api.activity(
            f"Follow up {on}",
            contact_id=contact["id"],
            occurred_on="2026-10-01",
            follow_up_on=on,
            done=done,
        )
    return api.ok("GET", "/api/dashboard")


# TB30
def test_headline_figures(data):
    assert data["today"] == "2026-11-16"
    assert data["headline"] == {
        "open_value": 7000,
        "open_count": 3,
        "expected_revenue": 100 + 1000 + 3000,
        "won_this_month_value": 10000,
        "won_this_month_count": 1,
        "follow_ups_due": 2,
        "follow_ups_overdue": 1,
    }


def test_figures_follow_the_browser_date(api, data, client):
    earlier = client.get("/api/dashboard", headers={"X-Local-Date": "2026-07-02"}).json()
    assert earlier["months"][-1]["month"] == "2026-07"
    assert earlier["headline"]["won_this_month_value"] == 0


# TB31
def test_twelve_months_by_close_date(data):
    months = data["months"]
    assert [m["month"] for m in months][:2] == ["2025-12", "2026-01"]
    assert len(months) == 12
    assert months[-1] == {
        "month": "2026-11",
        "won_value": 10000,
        "won_count": 1,
        "lost_count": 1,
    }
    june = next(m for m in months if m["month"] == "2026-06")
    assert june == {
        "month": "2026-06",
        "won_value": 5000,
        "won_count": 1,
        "lost_count": 0,
    }
    assert sum(m["lost_count"] for m in months) == 1


# TB32
def test_pipeline_by_open_stage(data):
    assert data["pipeline"] == [
        {"stage": "new", "count": 1, "value": 1000, "expected_revenue": 100},
        {"stage": "qualified", "count": 0, "value": 0, "expected_revenue": 0},
        {"stage": "proposal", "count": 1, "value": 2000, "expected_revenue": 1000},
        {"stage": "negotiation", "count": 1, "value": 4000, "expected_revenue": 3000},
    ]


# TB33
def test_funnel_counts_stages_reached(data):
    funnel = [(s["stage"], s["count"], s["value"], s["share_of_previous"]) for s in data["funnel"]]
    assert funnel == [
        ("new", 6, 25000, None),
        ("qualified", 5, 24000, 0.96),
        ("proposal", 4, 21000, 0.875),
        ("negotiation", 3, 19000, round(19000 / 21000, 4)),
        ("won", 2, 15000, round(15000 / 19000, 4)),
    ]


# TB34
def test_ten_latest_activities_and_stage_changes(api):
    org = api.org()
    contact = api.contact(organization_id=org["id"])
    for day in range(1, 13):
        api.activity(f"Call {day}", contact_id=contact["id"], occurred_on=f"2026-10-{day:02d}")
    deal = api.deal(org["id"], name="Fresh")
    api.move(deal["id"], "proposal")
    recent = api.ok("GET", "/api/dashboard")["recent"]
    assert len(recent) == 10
    assert [r["text"] for r in recent[:2]] == [
        "Moved from New to Proposal",
        "Added in New",
    ]
    assert recent[0]["deal"] == {"id": deal["id"], "name": "Fresh"}
    assert [r["text"] for r in recent[2:]] == [f"Call {d}" for d in range(12, 4, -1)]
    assert recent[2]["contact"] == {"id": contact["id"], "name": "Ada Park"}


# TB35
def test_follow_ups_overdue_then_upcoming(data):
    follow_ups = [(f["follow_up_on"], f["status"]) for f in data["follow_ups"]]
    assert follow_ups == [
        ("2026-11-10", "overdue"),
        ("2026-11-16", "upcoming"),
        ("2026-11-23", "upcoming"),
    ]
    assert data["follow_ups"][0]["contact"]["name"] == "Ada Park"


def test_mark_done_leaves_the_list(api, data):
    first = data["follow_ups"][0]
    api.ok("PATCH", f"/api/activities/{first['id']}", json={"done": True})
    after = api.ok("GET", "/api/dashboard")
    assert first["id"] not in [f["id"] for f in after["follow_ups"]]
    assert after["headline"]["follow_ups_due"] == 1
