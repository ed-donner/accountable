"""TB41: lists and the dashboard stay within 200 ms at full size (G7)."""

import random
import time
from datetime import date, timedelta

from sqlalchemy import insert

from app.db import activities, contacts, deals, organizations, stage_changes
from app.rules import STAGES, usual_probability

TODAY = date(2026, 11, 16)
BUDGET_MS = 200


def fill(engine):
    rng = random.Random(1)
    with engine.begin() as conn:
        conn.execute(insert(organizations), [{"name": f"Org {i}"} for i in range(300)])
        conn.execute(
            insert(contacts),
            [{"name": f"Contact {i}", "status": rng.choice(["lead", "qualified", "customer"]), "organization_id": rng.randint(1, 300)} for i in range(2000)],
        )
        deal_rows = []
        for i in range(1000):
            stage = rng.choice(STAGES)
            deal_rows.append({
                "name": f"Deal {i}", "organization_id": rng.randint(1, 300), "contact_id": rng.randint(1, 2000),
                "stage": stage, "value": rng.randint(0, 200_000), "probability": usual_probability(stage),
                "close_date": TODAY + timedelta(days=rng.randint(-300, 120)), "position": float(i),
            })
        conn.execute(insert(deals), deal_rows)
        conn.execute(
            insert(stage_changes),
            [{"deal_id": d, "from_stage": None, "to_stage": "new", "changed_at": TODAY - timedelta(days=200)} for d in range(1, 1001)],
        )
        acts = []
        for i in range(10_000):
            on_deal = i % 2 == 0
            acts.append({
                "type": rng.choice(["note", "call", "email"]), "description": f"Activity {i}",
                "occurred_on": TODAY - timedelta(days=rng.randint(0, 365)),
                "deal_id": rng.randint(1, 1000) if on_deal else None,
                "contact_id": None if on_deal else rng.randint(1, 2000),
                "follow_up_on": TODAY + timedelta(days=rng.randint(-20, 20)) if i % 10 == 0 else None,
            })
        conn.execute(insert(activities), acts)


def timed(client, path):
    client.get(path)  # warm up
    started = time.perf_counter()
    response = client.get(path)
    elapsed = (time.perf_counter() - started) * 1000
    assert response.status_code == 200
    return elapsed


def test_full_size_within_budget(engine, client):
    fill(engine)
    for path in ["/api/organizations", "/api/contacts", "/api/contacts?status=lead", "/api/deals", "/api/dashboard",
                 "/api/contacts/5", "/api/contacts/5/timeline", "/api/deals/5/timeline", "/api/organizations/5"]:
        elapsed = timed(client, path)
        assert elapsed < BUDGET_MS, f"{path} took {elapsed:.0f} ms"
