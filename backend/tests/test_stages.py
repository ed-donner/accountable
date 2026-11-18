"""The deal rules as plain functions (R13–R18)."""

from datetime import date

from backend.app import stages

TODAY = date(2026, 11, 15)


def test_stages_in_order_with_probabilities():  # R13
    assert stages.stage_list() == [
        {"name": "New", "probability": 10, "open": True},
        {"name": "Qualified", "probability": 25, "open": True},
        {"name": "Proposal", "probability": 50, "open": True},
        {"name": "Negotiation", "probability": 75, "open": True},
        {"name": "Won", "probability": 100, "open": False},
        {"name": "Lost", "probability": 0, "open": False},
    ]


def test_new_deal_takes_stage_probability_unless_given():  # R14
    assert stages.probability_for_new_deal("Proposal", None) == 50
    assert stages.probability_for_new_deal("Proposal", 65) == 65
    assert stages.probability_for_new_deal("New", 0) == 0


def test_stage_change_replaces_probability_but_same_stage_keeps_it():  # R15
    assert stages.probability_after_change("Proposal", "Negotiation", 33) == 75
    assert stages.probability_after_change("Proposal", "Proposal", 33) == 33


def test_close_date_becomes_today_only_when_moving_into_won_or_lost():  # R16
    old = date(2026, 12, 31)
    assert stages.close_date_after_change("Negotiation", "Won", old, TODAY) == TODAY
    assert stages.close_date_after_change("Negotiation", "Lost", old, TODAY) == TODAY
    assert stages.close_date_after_change("Won", "Negotiation", old, TODAY) == old
    assert stages.close_date_after_change("New", "Qualified", old, TODAY) == old
    assert stages.close_date_after_change("Won", "Won", old, TODAY) == old


def test_late_means_open_and_past_close_date():  # R17
    yesterday, tomorrow = date(2026, 11, 14), date(2026, 11, 16)
    assert stages.is_late("Proposal", yesterday, TODAY)
    assert not stages.is_late("Proposal", TODAY, TODAY)
    assert not stages.is_late("Proposal", tomorrow, TODAY)
    assert not stages.is_late("Won", yesterday, TODAY)
    assert not stages.is_late("Lost", yesterday, TODAY)


def test_expected_revenue_rounds_half_up_to_cents():  # R18
    assert stages.expected_cents(1_000_000, 25) == 250_000
    assert stages.expected_cents(1, 50) == 1  # 0.5 cents rounds up
    assert stages.expected_cents(1, 49) == 0
    assert stages.expected_cents(333, 75) == 250  # 249.75 → 250
    assert stages.expected_cents(0, 75) == 0
