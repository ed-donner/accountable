from datetime import date, timedelta

import pytest
from accountable import db, users
from accountable.crm import rules
from accountable.crm.tables import stage_changes
from conftest import NOW, TODAY
from sqlalchemy import select

DANA = users.TEAMMATES[1].id


def move(deal_id: int, stage: str, *, by: str | None = None, **given):
    with db.writing() as conn:
        return rules.change_stage(conn, deal_id, stage, today=TODAY, now=NOW, user_id=by, **given)


@pytest.fixture
def teammates(database):
    with db.writing() as conn:
        users.add_missing_teammates(conn)


def history(deal_id: int) -> list[tuple[str, str]]:
    with db.reading() as conn:
        rows = conn.execute(
            select(stage_changes).where(stage_changes.c.deal_id == deal_id).order_by(stage_changes.c.id)
        )
        return [(row.from_stage, row.to_stage) for row in rows]


EXPECTED_CLOSE = date(2026, 12, 1)


@pytest.mark.parametrize(
    ("stage", "probability"),
    [("qualified", 20), ("proposal", 40), ("negotiation", 70)],
)
def test_to_an_open_stage(make, deal_row, contact_row, stage, probability):
    contact = make.contact(status="lead")
    deal = make.deal(main_contact_id=contact, close_date=EXPECTED_CLOSE)

    move(deal, stage)

    row = deal_row(deal)
    assert (row.stage, row.probability, row.close_date) == (stage, probability, EXPECTED_CLOSE)
    assert contact_row(contact).status == "lead"
    assert history(deal) == [("new", stage)]


def test_to_won(make, deal_row, contact_row):
    contact = make.contact(status="lead")
    deal = make.deal(stage="negotiation", main_contact_id=contact)

    result = move(deal, "won")

    row = deal_row(deal)
    assert (row.stage, row.probability, row.close_date) == ("won", 100, TODAY)
    assert contact_row(contact).status == "customer"
    assert history(deal) == [("negotiation", "won")]
    assert result.new_customer == "Sam Carter"
    assert result.close_date == TODAY


def test_to_lost(make, deal_row, contact_row):
    contact = make.contact(status="qualified")
    deal = make.deal(stage="proposal", main_contact_id=contact)

    move(deal, "lost")

    row = deal_row(deal)
    assert (row.stage, row.probability, row.close_date) == ("lost", 0, TODAY)
    assert contact_row(contact).status == "qualified"
    assert history(deal) == [("proposal", "lost")]


@pytest.mark.parametrize("closed", ["won", "lost"])
def test_from_closed_back_to_an_open_stage(make, deal_row, contact_row, closed):
    contact = make.contact(status="customer")
    deal = make.deal(stage=closed, main_contact_id=contact, close_date=date(2026, 9, 1))

    move(deal, "proposal")

    row = deal_row(deal)
    assert (row.stage, row.probability, row.close_date) == ("proposal", 40, date(2026, 9, 1))
    assert contact_row(contact).status == "customer"
    assert history(deal) == [(closed, "proposal")]


def test_a_probability_given_in_the_request_is_kept(make, deal_row):
    deal = make.deal()
    move(deal, "proposal", probability=55)
    assert deal_row(deal).probability == 55


def test_a_close_date_given_in_the_request_is_kept(make, deal_row):
    deal = make.deal()
    move(deal, "won", close_date=date(2026, 10, 20))
    assert deal_row(deal).close_date == date(2026, 10, 20)


def test_a_value_given_is_set_on_the_deal(make, deal_row):
    """As accepting a quote passes the quote's value (Q22)."""
    deal = make.deal(stage="proposal", value=24000)
    move(deal, "won", value=48001)
    assert (deal_row(deal).stage, deal_row(deal).value) == ("won", 48001)


def test_without_a_value_the_deals_value_stays(make, deal_row):
    deal = make.deal(stage="proposal", value=24000)
    move(deal, "won")
    assert deal_row(deal).value == 24000


def test_a_hand_set_probability_goes_when_the_stage_changes(make, deal_row):
    deal = make.deal(probability=33)
    assert deal_row(deal).probability == 33
    move(deal, "qualified")
    assert deal_row(deal).probability == 20


def test_naming_the_current_stage_changes_nothing(make, deal_row):
    deal = make.deal(stage="proposal", probability=33, close_date=EXPECTED_CLOSE)
    before = deal_row(deal)

    result = move(deal, "proposal")

    assert result.changed is False
    assert deal_row(deal) == before
    assert history(deal) == []


def test_a_won_deal_with_no_main_contact(make, deal_row):
    deal = make.deal(stage="negotiation")
    result = move(deal, "won")
    assert deal_row(deal).stage == "won"
    assert result.new_customer is None


def test_winning_with_a_contact_who_is_already_a_customer_reports_no_change(make):
    contact = make.contact(status="customer")
    deal = make.deal(main_contact_id=contact)
    assert move(deal, "won").new_customer is None


def test_a_reopened_deal_leaves_its_contact_a_customer(make, contact_row):
    contact = make.contact(status="lead")
    deal = make.deal(main_contact_id=contact)
    move(deal, "won")
    move(deal, "qualified")
    assert contact_row(contact).status == "customer"


def test_moving_to_qualified_leaves_the_contacts_status_alone(make, contact_row):
    contact = make.contact(status="lead")
    deal = make.deal(main_contact_id=contact)
    move(deal, "qualified")
    assert contact_row(contact).status == "lead"


def test_a_deal_added_at_won_makes_its_contact_a_customer_with_no_stage_change(make, contact_row, deal_row):
    contact = make.contact(status="lead")
    deal = make.deal(stage="won", main_contact_id=contact, close_date=TODAY)
    assert contact_row(contact).status == "customer"
    assert history(deal) == []
    assert deal_row(deal).probability == 100


def test_a_failure_partway_leaves_nothing_changed(make, deal_row, contact_row):
    contact = make.contact(status="lead")
    deal = make.deal(stage="negotiation", main_contact_id=contact)
    before = deal_row(deal)

    with pytest.raises(RuntimeError), db.writing() as conn:
        rules.change_stage(conn, deal, "won", today=TODAY, now=NOW, user_id=None)
        raise RuntimeError("the power went out")

    assert deal_row(deal) == before
    assert contact_row(contact).status == "lead"
    assert history(deal) == []


def test_a_stage_change_puts_the_deal_at_the_top_of_its_new_column(make, deal_row):
    first = make.deal(stage="proposal")
    second = make.deal(stage="proposal")
    moved = make.deal(stage="new")
    move(moved, "proposal")
    tops = sorted([first, second, moved], key=lambda deal: deal_row(deal).position)
    assert tops[0] == moved


def test_a_stage_change_records_who_made_it_on_the_change_the_deal_and_the_new_customer(
    make, teammates, deal_row, contact_row
):
    contact = make.contact(status="lead")
    deal = make.deal(stage="negotiation", main_contact_id=contact)

    move(deal, "won", by=DANA)

    with db.reading() as conn:
        change = conn.execute(select(stage_changes).where(stage_changes.c.deal_id == deal)).one()
    assert change.created_by == DANA
    assert (deal_row(deal).updated_by, deal_row(deal).updated_at) == (DANA, NOW)
    assert (contact_row(contact).updated_by, contact_row(contact).updated_at) == (DANA, NOW)


def test_winning_with_a_contact_who_is_already_a_customer_isnt_a_change_to_them(make, contact_row):
    contact = make.contact(status="customer")
    before = contact_row(contact)
    move(make.deal(main_contact_id=contact), "won")
    assert contact_row(contact) == before


def test_naming_the_current_stage_records_nobody(make, teammates, deal_row):
    deal = make.deal(stage="proposal")
    before = deal_row(deal).updated_by
    move(deal, "proposal", by=DANA)
    assert deal_row(deal).updated_by == before


def test_a_deal_added_at_won_makes_its_contact_a_customer_by_whoever_added_it(make, teammates, contact_row):
    contact = make.contact(status="lead")
    with db.writing() as conn:
        rules.add_deal(
            conn,
            {"name": "Won at once", "stage": "won", "value": 100, "main_contact_id": contact},
            today=TODAY,
            now=NOW,
            user_id=DANA,
        )
    assert (contact_row(contact).updated_by, contact_row(contact).updated_at) == (DANA, NOW)


def test_late_means_open_and_before_today():
    yesterday = TODAY - timedelta(days=1)
    assert rules.is_late("proposal", yesterday, TODAY) is True
    assert rules.is_late("proposal", TODAY, TODAY) is False
    assert rules.is_late("won", yesterday, TODAY) is False
    assert rules.is_late("lost", yesterday, TODAY) is False


def test_usual_probabilities_are_the_intents():
    assert rules.USUAL_PROBABILITY == {
        "new": 5,
        "qualified": 20,
        "proposal": 40,
        "negotiation": 70,
        "won": 100,
        "lost": 0,
    }
