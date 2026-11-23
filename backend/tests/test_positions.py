"""TB07 and TB08: card positions."""

from sqlalchemy import insert, select

from app.db import deals, organizations
from app.routers.deals import place_between, position_between, top_position


def make_column(conn, stage: str, count: int) -> list[int]:
    org_id = conn.execute(insert(organizations).values(name="Org")).inserted_primary_key[0]
    ids = []
    for i in range(count):
        ids.append(
            conn.execute(
                insert(deals).values(
                    name=f"D{i}",
                    organization_id=org_id,
                    stage=stage,
                    value=1,
                    probability=10,
                    position=float(i + 1),
                )
            ).inserted_primary_key[0]
        )
    return ids


def column_order(conn, stage: str) -> list[int]:
    query = select(deals.c.id).where(deals.c.stage == stage).order_by(deals.c.position, deals.c.id)
    return list(conn.scalars(query))


# TB07
def test_position_between_two_cards():
    assert position_between(1.0, 2.0) == 1.5


def test_position_at_top_and_bottom():
    assert position_between(None, 3.0) == 2.0
    assert position_between(3.0, None) == 4.0
    assert position_between(None, None) == 1.0


def test_top_position(conn):
    make_column(conn, "new", 3)
    assert top_position(conn, "new") == 0.0
    assert top_position(conn, "won") == 1.0


# TB08
def test_too_small_gap_needs_renumbering():
    assert position_between(1.0, 1.0000005) is None


def test_order_kept_after_500_moves(conn):
    ids = make_column(conn, "new", 5)
    expected = list(ids)
    first = ids[0]
    for i in range(500):
        # Keep dropping the bottom card just under the top card: the gap halves every time.
        moving = expected[-1]
        above, below = expected[0], expected[1]
        position = place_between(conn, "new", moving, above, below)
        conn.execute(deals.update().where(deals.c.id == moving).values(position=position))
        expected = [expected[0], moving] + [d for d in expected[1:] if d != moving]
        assert column_order(conn, "new") == expected, f"after move {i + 1}"
    assert expected[0] == first
    positions = list(conn.scalars(select(deals.c.position).where(deals.c.stage == "new")))
    assert len(set(positions)) == 5
