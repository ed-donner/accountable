from concurrent.futures import ThreadPoolExecutor

from accountable import db
from accountable.crm.tables import deals, stage_changes
from conftest import TODAY
from sqlalchemy import select


def column(stage: str) -> list[str]:
    with db.reading() as conn:
        return list(conn.scalars(select(deals.c.name).where(deals.c.stage == stage).order_by(deals.c.position)))


def positions(stage: str) -> list[int]:
    with db.reading() as conn:
        return list(conn.scalars(select(deals.c.position).where(deals.c.stage == stage).order_by(deals.c.position)))


def stage_change_count() -> int:
    with db.reading() as conn:
        return len(conn.execute(select(stage_changes)).all())


def move(api, deal: int, stage: str, before: int | None = None):
    return api.post(f"/api/deals/{deal}/move", json={"stage": stage, "before_deal_id": before})


def make_column(make, stage: str, names: list[str]) -> dict[str, int]:
    # Each new deal goes in at the top, so add them bottom first.
    return {name: make.deal(name, stage=stage) for name in reversed(names)}


def test_a_move_to_a_chosen_place(api, make):
    target = make_column(make, "qualified", ["A", "B", "C"])
    moved = make.deal("Moved", stage="new")

    reply = move(api, moved, "qualified", target["B"])

    assert reply.status_code == 200
    assert column("qualified") == ["A", "Moved", "B", "C"]
    assert column("new") == []


def test_a_move_to_the_top(api, make):
    target = make_column(make, "qualified", ["A", "B"])
    moved = make.deal("Moved", stage="new")
    move(api, moved, "qualified", target["A"])
    assert column("qualified") == ["Moved", "A", "B"]


def test_a_move_to_the_end_of_a_column(api, make):
    make_column(make, "qualified", ["A", "B"])
    moved = make.deal("Moved", stage="new")
    move(api, moved, "qualified", None)
    assert column("qualified") == ["A", "B", "Moved"]


def test_a_move_into_an_empty_column(api, make):
    moved = make.deal("Moved", stage="new")
    reply = move(api, moved, "proposal", None)
    assert reply.status_code == 200
    assert column("proposal") == ["Moved"]


def test_a_place_in_another_column_falls_back_to_the_end(api, make):
    make_column(make, "qualified", ["A"])
    stranger = make.deal("Elsewhere", stage="lost", close_date=TODAY)
    moved = make.deal("Moved", stage="new")
    move(api, moved, "qualified", stranger)
    assert column("qualified") == ["A", "Moved"]


def test_moving_within_a_column_changes_only_the_place(api, make, deal_row):
    deals_in_column = make_column(make, "proposal", ["A", "B", "C"])
    c = deals_in_column["C"]
    before = deal_row(c)

    reply = move(api, c, "proposal", deals_in_column["A"])

    assert reply.status_code == 200
    assert column("proposal") == ["C", "A", "B"]
    after = deal_row(c)
    assert (after.stage, after.probability, after.close_date) == (before.stage, before.probability, before.close_date)
    assert stage_change_count() == 0


def test_moving_down_within_a_column(api, make):
    deals_in_column = make_column(make, "proposal", ["A", "B", "C"])
    move(api, deals_in_column["A"], "proposal", deals_in_column["C"])
    assert column("proposal") == ["B", "A", "C"]
    move(api, deals_in_column["B"], "proposal", None)
    assert column("proposal") == ["A", "C", "B"]


def test_a_hand_set_probability_stays_on_a_move_within_a_column(api, make, deal_row):
    deals_in_column = make_column(make, "proposal", ["A", "B"])
    a = deals_in_column["A"]
    api.patch(f"/api/deals/{a}", json={"probability": 33})
    move(api, a, "proposal", None)
    assert deal_row(a).probability == 33


def test_dropping_a_card_on_itself_leaves_it_there(api, make):
    deals_in_column = make_column(make, "proposal", ["A", "B", "C"])
    reply = move(api, deals_in_column["B"], "proposal", deals_in_column["B"])
    assert reply.status_code == 200
    assert column("proposal") == ["A", "B", "C"]


def test_a_card_moved_across_columns_above_itself_goes_to_the_end(api, make):
    make_column(make, "qualified", ["A", "B"])
    moved = make.deal("Moved", stage="new")

    assert move(api, moved, "qualified", moved).status_code == 200

    assert column("qualified") == ["A", "B", "Moved"]
    assert positions("qualified") == [0, 1, 2]


def test_renumbering_leaves_a_clean_column(api, make):
    deals_in_column = make_column(make, "proposal", ["A", "B", "C"])
    move(api, deals_in_column["C"], "proposal", deals_in_column["A"])
    assert positions("proposal") == [0, 1, 2]


def test_a_move_across_columns_follows_the_stage_rules_and_says_what_changed(api, make):
    contact = make.contact()
    deal = make.deal("Moved", stage="negotiation", main_contact_id=contact)

    body = move(api, deal, "won").json()

    assert body["deal"]["stage"] == "won"
    assert body["deal"]["probability"] == 100
    assert body["deal"]["close_date"] == TODAY.isoformat()
    assert body["changes"] == {"close_date": TODAY.isoformat(), "new_customer": "Sam Carter"}
    assert stage_change_count() == 1


def test_a_move_says_nothing_extra_when_nothing_else_changed(api, make):
    deal = make.deal("Moved")
    assert move(api, deal, "qualified").json()["changes"] == {"close_date": None, "new_customer": None}


def test_a_form_stage_change_and_a_new_deal_go_to_the_top(api, make):
    make_column(make, "proposal", ["A", "B"])
    edited = make.deal("Edited", stage="new")
    api.patch(f"/api/deals/{edited}", json={"stage": "proposal"})
    assert column("proposal") == ["Edited", "A", "B"]

    make.deal("Added", stage="proposal")
    assert column("proposal") == ["Added", "Edited", "A", "B"]


def test_two_moves_at_once_leave_a_clean_column(api, make):
    target = make_column(make, "proposal", [f"Deal {number}" for number in range(10)])
    movers = [make.deal(f"Mover {number}", stage="new") for number in range(10)]
    anchor = target["Deal 5"]

    with ThreadPoolExecutor(max_workers=5) as pool:
        replies = list(pool.map(lambda deal: move(api, deal, "proposal", anchor), movers))

    assert all(reply.status_code == 200 for reply in replies)
    assert positions("proposal") == list(range(20))
    assert len(set(column("proposal"))) == 20
    assert column("new") == []
