import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from accountable.crm import rules

CASES = json.loads((Path(__file__).resolve().parents[2] / "shared" / "expected-revenue-cases.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["why"])
def test_shared_cases(case):
    assert rules.expected_revenue(case["value"], case["probability"]) == case["expected"]


def test_only_open_deals_count_towards_the_total():
    deals = [
        SimpleNamespace(stage="new", value=1000, probability=5),
        SimpleNamespace(stage="negotiation", value=1010, probability=5),
        SimpleNamespace(stage="won", value=99999, probability=100),
        SimpleNamespace(stage="lost", value=99999, probability=0),
    ]
    assert rules.expected_total(deals) == 50 + 51
