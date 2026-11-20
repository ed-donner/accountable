from backend.tests.conftest import add_deal, add_org, move, ok


def test_six_columns_in_order_with_cards_in_position_order(client):
    org = add_org(client)
    a = add_deal(client, org["id"], "A", stage="proposal")
    b = add_deal(client, org["id"], "B", stage="proposal")
    move(client, a["id"], "proposal", before_id=b["id"])
    board = ok(client.get("/api/pipeline"))
    assert [c["stage"] for c in board["columns"]] == ["new", "qualified", "proposal", "negotiation", "won", "lost"]
    proposal = board["columns"][2]["deals"]
    assert [d["name"] for d in proposal] == ["A", "B"]
    assert {"organization", "main_contact", "expected_value", "is_late", "close_date"} <= set(proposal[0])


def test_won_and_lost_show_only_the_last_30_days(client):
    org = add_org(client)
    for stage in ("won", "lost"):
        add_deal(client, org["id"], f"{stage} on Oct 20", stage=stage, close_date="2026-10-20")
        add_deal(client, org["id"], f"{stage} on Oct 19", stage=stage, close_date="2026-10-19")
    board = {c["stage"]: [d["name"] for d in c["deals"]] for c in ok(client.get("/api/pipeline"))["columns"]}
    assert board["won"] == ["won on Oct 20"]
    assert board["lost"] == ["lost on Oct 20"]
    # The older ones are still in the Deals table.
    assert len(ok(client.get("/api/deals"))) == 4


def test_open_columns_show_every_deal_including_late_ones(client):
    org = add_org(client)
    add_deal(client, org["id"], "Long late", stage="new", close_date="2025-01-01")
    add_deal(client, org["id"], "Future", stage="new", close_date="2027-06-01")
    new = ok(client.get("/api/pipeline"))["columns"][0]["deals"]
    assert {d["name"]: d["is_late"] for d in new} == {"Long late": True, "Future": False}


def test_an_empty_board_has_six_empty_columns(client):
    columns = ok(client.get("/api/pipeline"))["columns"]
    assert len(columns) == 6 and all(c["deals"] == [] for c in columns)
