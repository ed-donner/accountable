from conftest import TODAY


def values(api) -> dict[str, int]:
    return {stage["stage"]: stage["value"] for stage in api.get("/api/dashboard").json()["funnel"]}


def carried(api) -> list[int | None]:
    return [stage["carried"] for stage in api.get("/api/dashboard").json()["funnel"]]


def move(api, deal: int, stage: str) -> None:
    assert api.post(f"/api/deals/{deal}/move", json={"stage": stage}).status_code == 200


def test_the_funnel_runs_from_new_to_won_with_no_lost_step(api):
    assert list(values(api)) == ["new", "qualified", "proposal", "negotiation", "won"]


def test_every_deal_counts_for_new(api, make):
    make.deal(value=100)
    make.deal(value=200, stage="lost", close_date=TODAY)
    assert values(api)["new"] == 300


def test_skipped_stages_count(api, make):
    deal = make.deal(value=100)
    move(api, deal, "negotiation")
    assert values(api) == {"new": 100, "qualified": 100, "proposal": 100, "negotiation": 100, "won": 0}


def test_a_deal_moved_backwards_keeps_its_furthest_stage(api, make):
    deal = make.deal(value=100)
    move(api, deal, "negotiation")
    move(api, deal, "qualified")
    assert values(api)["negotiation"] == 100


def test_a_lost_deal_counts_up_to_the_furthest_stage_before_it_was_lost(api, make):
    deal = make.deal(value=100)
    move(api, deal, "proposal")
    move(api, deal, "lost")
    assert values(api) == {"new": 100, "qualified": 100, "proposal": 100, "negotiation": 0, "won": 0}


def test_a_lost_deal_that_went_back_first_keeps_its_furthest_stage(api, make):
    deal = make.deal(value=100)
    move(api, deal, "negotiation")
    move(api, deal, "new")
    move(api, deal, "lost")
    assert values(api)["negotiation"] == 100


def test_a_deal_lost_straight_from_new_counts_for_new_only(api, make):
    deal = make.deal(value=100)
    move(api, deal, "lost")
    assert values(api) == {"new": 100, "qualified": 0, "proposal": 0, "negotiation": 0, "won": 0}


def test_a_deal_added_at_won_counts_all_the_way(api, make):
    make.deal(value=100, stage="won", close_date=TODAY)
    assert values(api) == {"new": 100, "qualified": 100, "proposal": 100, "negotiation": 100, "won": 100}


def test_a_deal_added_at_lost_counts_for_new_only(api, make):
    make.deal(value=100, stage="lost", close_date=TODAY)
    assert values(api)["qualified"] == 0


def test_a_won_deal_reopened_still_counts_for_won(api, make):
    deal = make.deal(value=100)
    move(api, deal, "won")
    move(api, deal, "proposal")
    assert values(api)["won"] == 100


def test_the_percentage_carried_forward(api, make):
    make.deal(value=300)
    make.deal(value=100, stage="negotiation")
    assert carried(api) == [None, 25, 100, 100, 0]


def test_the_percentage_after_a_stage_with_no_value(api, make):
    make.deal(value=100)
    assert carried(api) == [None, 0, None, None, None]
