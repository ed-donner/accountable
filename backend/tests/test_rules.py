from datetime import date

import pytest

from backend.app import rules
from backend.app.rules import FunnelDeal
from backend.tests.conftest import RULE_CASES

TODAY = date.fromisoformat(RULE_CASES["today"])


@pytest.mark.parametrize("case", RULE_CASES["expected_value"], ids=lambda c: f"{c['value']}x{c['probability']}")
def test_expected_value(case):
    assert rules.expected_value(case["value"], case["probability"]) == case["expected"]


@pytest.mark.parametrize("case", RULE_CASES["late"], ids=lambda c: f"{c['stage']}-{c['close_date']}")
def test_late(case):
    assert rules.is_late(case["stage"], date.fromisoformat(case["close_date"]), TODAY) is case["late"]


@pytest.mark.parametrize("case", RULE_CASES["closed_window"], ids=lambda c: c["close_date"])
def test_closed_window(case):
    assert rules.in_closed_window(date.fromisoformat(case["close_date"]), TODAY) is case["in"]


def test_usual_probabilities():
    assert rules.USUAL_PROBABILITY == RULE_CASES["usual_probability"]
    assert list(rules.USUAL_PROBABILITY) == list(rules.STAGES)


@pytest.mark.parametrize("case", RULE_CASES["furthest_stage"], ids=lambda c: c["name"])
def test_furthest_stage(case):
    changes = [tuple(change) for change in case["changes"]]
    assert rules.furthest_stage(case["current"], changes) == case["expected"]


@pytest.mark.parametrize("case", RULE_CASES["months"], ids=lambda c: c["today"])
def test_months(case):
    months = rules.months(date.fromisoformat(case["today"]))
    assert len(months) == 12
    assert months[0] == case["first"]
    assert months[-1] == case["last"]
    assert months == sorted(months)


def test_open_and_closed_stages():
    assert [rules.is_open(stage) for stage in rules.STAGES] == [True, True, True, True, False, False]


def test_stage_change_description():
    assert rules.stage_change_description("proposal", "negotiation") == "Moved from Proposal to Negotiation"


def _funnel(deals):
    return {step["stage"]: (step["count"], step["value"]) for step in rules.funnel(deals, TODAY)}


def test_funnel_counts_each_deal_up_to_its_furthest_stage():
    deals = [
        # Still at New.
        FunnelDeal(date(2026, 10, 1), "new", 1000),
        # Lost from Proposal: counts at New, Qualified and Proposal.
        FunnelDeal(
            date(2026, 6, 1), "lost", 2000, [("new", "qualified"), ("qualified", "proposal"), ("proposal", "lost")]
        ),
        # Lost with no changes: New only.
        FunnelDeal(date(2026, 7, 1), "lost", 4000),
        # Won through every stage.
        FunnelDeal(
            date(2026, 3, 1),
            "won",
            8000,
            [("new", "qualified"), ("qualified", "proposal"), ("proposal", "negotiation"), ("negotiation", "won")],
        ),
        # Skipped from New straight to Negotiation: counts at every stage up to it.
        FunnelDeal(date(2026, 9, 1), "negotiation", 16000, [("new", "negotiation")]),
    ]
    assert _funnel(deals) == {
        "new": (5, 31000),
        "qualified": (3, 26000),
        "proposal": (3, 26000),
        "negotiation": (2, 24000),
        "won": (1, 8000),
    }


def test_funnel_leaves_out_deals_created_before_the_12_months():
    deals = [
        # 13 months ago: before the first of the 12 months (Dec 2025).
        FunnelDeal(date(2025, 10, 19), "won", 5000, [("new", "won")]),
        FunnelDeal(date(2025, 11, 30), "new", 7000),
        # The first day of the first month counts.
        FunnelDeal(date(2025, 12, 1), "new", 3000),
    ]
    assert _funnel(deals)["new"] == (1, 3000)
    assert _funnel(deals)["won"] == (0, 0)


def test_funnel_counts_a_reopened_won_deal_as_won():
    deals = [FunnelDeal(date(2026, 5, 1), "proposal", 9000, [("new", "won"), ("won", "proposal")])]
    assert _funnel(deals)["won"] == (1, 9000)


def test_funnel_has_the_five_steps_in_order_when_empty():
    assert [step["stage"] for step in rules.funnel([], TODAY)] == list(rules.FUNNEL_STAGES)
