import pytest

from backend.tests.conftest import (
    add_deal,
    add_org,
    assert_numbered,
    column_ids,
    field_errors,
    move,
    ok,
    stage_changes,
)


@pytest.fixture
def board(client):
    """Proposal holds C, B, A from the top; Negotiation holds Y, X."""
    org = add_org(client)
    deals = {}
    for name in ("A", "B", "C"):
        deals[name] = add_deal(client, org["id"], name, stage="proposal")["id"]
    for name in ("X", "Y"):
        deals[name] = add_deal(client, org["id"], name, stage="negotiation")["id"]
    assert column_ids(client, "proposal") == [deals["C"], deals["B"], deals["A"]]
    return deals


def names(client, stage, deals):
    by_id = {deal_id: name for name, deal_id in deals.items()}
    return [by_id[deal_id] for deal_id in column_ids(client, stage)]


def test_moving_up_within_a_column(client, board):
    move(client, board["A"], "proposal", before_id=board["C"])
    assert names(client, "proposal", board) == ["A", "C", "B"]
    assert_numbered(client, "proposal")


def test_moving_down_within_a_column(client, board):
    move(client, board["C"], "proposal", before_id=board["A"])
    assert names(client, "proposal", board) == ["B", "C", "A"]
    move(client, board["B"], "proposal", before_id=None)
    assert names(client, "proposal", board) == ["C", "A", "B"]
    assert_numbered(client, "proposal")


def test_a_move_within_a_column_records_no_stage_change(client, board):
    moved = move(client, board["A"], "proposal", before_id=board["C"])
    assert moved["stage"] == "proposal" and moved["probability"] == 50
    assert stage_changes(client, board["A"]) == []


def test_moving_across_columns_to_a_given_place(client, board):
    moved = move(client, board["B"], "negotiation", before_id=board["X"])
    assert names(client, "negotiation", board) == ["Y", "B", "X"]
    assert names(client, "proposal", board) == ["C", "A"]
    assert moved["position"] == 1
    assert_numbered(client, "proposal", "negotiation")


def test_moving_across_columns_to_the_bottom(client, board):
    move(client, board["C"], "negotiation", before_id=None)
    assert names(client, "negotiation", board) == ["Y", "X", "C"]
    assert_numbered(client, "proposal", "negotiation")


def test_moving_to_an_empty_column(client, board):
    move(client, board["A"], "qualified", before_id=None)
    assert names(client, "qualified", board) == ["A"]
    assert_numbered(client, "proposal", "qualified")


def test_a_move_across_columns_applies_the_stage_rules(client, board):
    moved = move(client, board["B"], "negotiation", before_id=None)
    assert moved["stage"] == "negotiation"
    assert moved["probability"] == 75
    assert moved["close_date"] == "2026-12-12"
    [entry] = stage_changes(client, board["B"])
    assert entry["description"] == "Moved from Proposal to Negotiation"


def test_a_move_to_won_sets_100_and_today(client, board):
    moved = move(client, board["A"], "won", before_id=None)
    assert (moved["stage"], moved["probability"], moved["close_date"]) == ("won", 100, "2026-11-19")


def test_positions_stay_numbered_after_many_moves(client, board):
    plan = [
        ("A", "negotiation", "Y"),
        ("Y", "proposal", None),
        ("C", "won", None),
        ("B", "negotiation", "A"),
        ("X", "negotiation", "B"),
        ("C", "proposal", "Y"),
    ]
    for name, stage, before in plan:
        move(client, board[name], stage, before_id=board[before] if before else None)
        assert_numbered(client, *("proposal", "negotiation", "won"))
    assert names(client, "proposal", board) == ["C", "Y"]
    assert names(client, "negotiation", board) == ["X", "B", "A"]


def test_refused_when_before_id_is_in_another_column(client, board):
    response = client.post(f"/api/deals/{board['A']}/move", json={"stage": "negotiation", "before_id": board["C"]})
    assert "before_id" in field_errors(response)
    assert names(client, "proposal", board) == ["C", "B", "A"]


def test_refused_when_before_id_is_the_deal_itself(client, board):
    response = client.post(f"/api/deals/{board['A']}/move", json={"stage": "proposal", "before_id": board["A"]})
    assert "before_id" in field_errors(response)


def test_refused_when_before_id_doesnt_exist(client, board):
    response = client.post(f"/api/deals/{board['A']}/move", json={"stage": "proposal", "before_id": 999})
    assert "before_id" in field_errors(response)


def test_an_unknown_deal_gives_404(client, board):
    response = client.post("/api/deals/999/move", json={"stage": "proposal", "before_id": None})
    assert response.status_code == 404


def test_a_refused_move_changes_nothing(client, board):
    before = ok(client.get("/api/deals"))
    client.post(f"/api/deals/{board['A']}/move", json={"stage": "negotiation", "before_id": board["C"]})
    assert ok(client.get("/api/deals")) == before
