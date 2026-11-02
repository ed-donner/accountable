from datetime import date, timedelta

from conftest import NOW, TODAY


def dashboard(api) -> dict:
    reply = api.get("/api/dashboard")
    assert reply.status_code == 200
    return reply.json()


def month(body: dict, key: str) -> dict:
    return next(item for item in body["months"] if item["month"] == key)


def test_an_empty_database(api):
    body = dashboard(api)
    assert body["overdue_follow_ups"] == 0
    assert body["late_deals"] == 0
    assert body["revenue_this_month"] == 0
    assert body["revenue_last_month"] == 0
    assert body["deals_won_this_month"] == 0
    assert body["open_pipeline"] == 0
    assert body["open_deals"] == 0
    assert body["expected_revenue"] == 0
    assert body["expected_share"] == 0
    assert len(body["months"]) == 12
    assert all(item["revenue"] == 0 and item["deals"] == 0 for item in body["months"])
    assert [stage["value"] for stage in body["band"]] == [0, 0, 0, 0]
    assert [stage["value"] for stage in body["funnel"]] == [0, 0, 0, 0, 0]
    assert [stage["carried"] for stage in body["funnel"]] == [None, None, None, None, None]
    assert body["follow_ups"] == {"overdue": 0, "upcoming": 0, "items": []}
    assert body["recent"] == []


def test_summary_counts(api, make):
    make.deal("Late one", close_date=TODAY - timedelta(days=1))
    make.deal("Late two", stage="proposal", close_date=TODAY - timedelta(days=40))
    make.deal("Due today", close_date=TODAY)
    make.deal("Won long ago", stage="won", close_date=TODAY - timedelta(days=40))
    deal = make.deal("Plain")
    make.activity(deal_id=deal, follow_up_date=TODAY - timedelta(days=1))
    make.activity(deal_id=deal, follow_up_date=TODAY - timedelta(days=9))
    make.activity(deal_id=deal, follow_up_date=TODAY - timedelta(days=2), follow_up_done=True)
    make.activity(deal_id=deal, follow_up_date=TODAY)

    body = dashboard(api)
    assert body["overdue_follow_ups"] == 2
    assert body["late_deals"] == 2


def test_headline_figures(api, make):
    make.deal("This month", stage="won", value=30000, close_date=date(2026, 10, 2))
    make.deal("This month too", stage="won", value=12000, close_date=date(2026, 10, 30))
    make.deal("Last month", stage="won", value=7000, close_date=date(2026, 9, 30))
    make.deal("Open", stage="new", value=1000)
    make.deal("Open too", stage="negotiation", value=2000)
    make.deal("Lost", stage="lost", value=9000, close_date=date(2026, 10, 3))

    body = dashboard(api)
    assert body["revenue_this_month"] == 42000
    assert body["revenue_last_month"] == 7000
    assert body["deals_won_this_month"] == 2
    assert body["deals_won_last_month"] == 1
    assert body["open_pipeline"] == 3000
    assert body["open_deals"] == 2
    assert body["expected_revenue"] == 50 + 1400
    assert body["expected_share"] == 48


def test_the_expected_share_rounds_a_half_up(api, make):
    make.deal(value=1000, probability=25)
    make.deal(value=1000, probability=26)
    assert dashboard(api)["expected_share"] == 26


def test_the_pipeline_band(api, make):
    make.deal("One", stage="new", value=1000)
    make.deal("Two", stage="new", value=2000)
    make.deal("Three", stage="proposal", value=5000)
    make.deal("Won", stage="won", value=9000, close_date=TODAY)

    assert dashboard(api)["band"] == [
        {"stage": "new", "value": 3000, "count": 2},
        {"stage": "qualified", "value": 0, "count": 0},
        {"stage": "proposal", "value": 5000, "count": 1},
        {"stage": "negotiation", "value": 0, "count": 0},
    ]


def test_the_twelve_month_series_covers_the_current_month_with_gaps_as_zero(api, make):
    make.deal("Now", stage="won", value=10, close_date=date(2026, 10, 15))
    make.deal("Oldest kept", stage="won", value=20, close_date=date(2025, 11, 1))
    make.deal("Too old", stage="won", value=40, close_date=date(2025, 10, 31))

    body = dashboard(api)

    month_keys = [item["month"] for item in body["months"]]
    assert month_keys[0] == "2025-11"
    assert month_keys[-1] == "2026-10"
    assert [item["label"] for item in body["months"]][:3] == ["Nov", "Dec", "Jan"]
    assert month(body, "2026-10")["revenue"] == 10
    assert month(body, "2025-11")["revenue"] == 20
    assert month(body, "2026-05") == {"month": "2026-05", "label": "May", "revenue": 0, "deals": 0}
    assert sum(item["revenue"] for item in body["months"]) == 30


def test_month_boundaries(api, make):
    make.deal("Last of Sep", stage="won", value=1, close_date=date(2026, 9, 30))
    make.deal("First of Oct", stage="won", value=2, close_date=date(2026, 10, 1))

    body = dashboard(api)
    assert month(body, "2026-09")["revenue"] == 1
    assert month(body, "2026-10")["revenue"] == 2


def test_an_edited_close_date_moves_the_win_to_another_month(api, make):
    deal = make.deal(stage="won", value=500, close_date=date(2026, 10, 20))
    api.patch(f"/api/deals/{deal}", json={"close_date": "2026-09-20"})

    body = dashboard(api)
    assert body["revenue_this_month"] == 0
    assert body["revenue_last_month"] == 500


def test_a_reopened_deal_leaves_the_revenue(api, make):
    deal = make.deal(stage="won", value=500, close_date=date(2026, 10, 20))
    assert dashboard(api)["revenue_this_month"] == 500

    api.post(f"/api/deals/{deal}/move", json={"stage": "proposal"})

    body = dashboard(api)
    assert body["revenue_this_month"] == 0
    assert body["open_pipeline"] == 500


def test_a_deal_marked_won_counts_this_month(api, make):
    deal = make.deal(value=800)
    api.post(f"/api/deals/{deal}/move", json={"stage": "won"})
    body = dashboard(api)
    assert body["revenue_this_month"] == 800
    assert body["deals_won_this_month"] == 1


def test_follow_up_order_overdue_oldest_first_then_upcoming(api, make):
    deal = make.deal()
    for description, days in [("Soon", 3), ("Very late", -9), ("Today", 0), ("Bit late", -1), ("Later", 8)]:
        make.activity(deal_id=deal, description=description, follow_up_date=TODAY + timedelta(days=days))

    follow_ups = dashboard(api)["follow_ups"]

    assert [item["description"] for item in follow_ups["items"]] == ["Very late", "Bit late", "Today", "Soon", "Later"]
    assert [item["overdue"] for item in follow_ups["items"]] == [True, True, False, False, False]
    assert (follow_ups["overdue"], follow_ups["upcoming"]) == (2, 3)


def test_a_done_follow_up_leaves_the_list(api, make):
    deal = make.deal()
    activity = make.activity(deal_id=deal, follow_up_date=TODAY)
    api.patch(f"/api/activities/{activity}", json={"follow_up_done": True})
    assert dashboard(api)["follow_ups"]["items"] == []


def test_follow_ups_link_to_their_contact_or_deal(api, make):
    contact = make.contact()
    deal = make.deal("Linked deal", main_contact_id=contact)
    make.activity(deal_id=deal, follow_up_date=TODAY)
    make.activity(contact_id=contact, follow_up_date=TODAY)

    about = [item["about"] for item in dashboard(api)["follow_ups"]["items"]]
    assert about == [
        {"kind": "deal", "id": deal, "name": "Linked deal"},
        {"kind": "contact", "id": contact, "name": "Sam Carter"},
    ]


def test_recent_activity_is_the_ten_newest(api, make):
    deal = make.deal()
    for hours in range(14):
        make.activity(deal_id=deal, description=f"{hours}h ago", occurred_at=NOW - timedelta(hours=hours))

    recent = dashboard(api)["recent"]
    assert [entry["description"] for entry in recent] == [f"{hours}h ago" for hours in range(10)]


def test_recent_activity_includes_stage_changes(api, make):
    deal = make.deal()
    make.activity(deal_id=deal, description="Earlier", occurred_at=NOW - timedelta(hours=1))
    api.post(f"/api/deals/{deal}/move", json={"stage": "qualified"})

    recent = dashboard(api)["recent"]
    assert [entry["description"] for entry in recent] == ["Moved from New to Qualified", "Earlier"]


def test_recent_activity_leaves_out_future_entries(api, make):
    deal = make.deal()
    make.activity(deal_id=deal, description="Tomorrow", occurred_at=NOW + timedelta(days=1))
    make.activity(deal_id=deal, description="Now", occurred_at=NOW)

    assert [entry["description"] for entry in dashboard(api)["recent"]] == ["Now"]


def test_a_new_follow_up_shows_at_once(api, make):
    deal = make.deal()
    api.post("/api/activities", json={"description": "Call back", "deal_id": deal, "follow_up_date": "2026-11-02"})
    assert [item["description"] for item in dashboard(api)["follow_ups"]["items"]] == ["Call back"]


def test_the_dashboard_uses_the_fixed_today(api):
    assert dashboard(api)["today"] == "2026-10-31"
