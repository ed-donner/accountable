"""Bills through the API: adding, editing, marking paid and unpaid, deleting, unique bill
numbers, whole-cent amounts, dates and categories, and the suppliers they hold (E1 to E19)."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import get_args

import pytest
from accountable import db, holds, users
from accountable.api import MAX_CENTS
from accountable.bills import router
from accountable.bills.schemas import Category
from accountable.bills.tables import CATEGORIES, bills
from conftest import NOW
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

BILLS = "/api/bills"
ALEX, DANA, THEO, _ROBIN = users.TEAMMATES
LATER = NOW + timedelta(hours=2)
NOW_TEXT = "2026-10-31T15:00:00Z"
LATER_TEXT = "2026-10-31T17:00:00Z"

AMOUNT_MESSAGE = "Enter an amount in dollars and cents, such as 49.50"
TAKEN = "This supplier already has a bill with this number"
TOO_LONG = "Keep the bill number to 50 characters or fewer"


def named(teammate) -> dict:
    return {"id": teammate.id, "name": teammate.name or teammate.email}


def a_bill(supplier: int, **values) -> dict:
    return {
        "organization_id": supplier,
        "bill_number": "INV-0042",
        "bill_date": "2026-10-01",
        "amount_cents": 124000,
        "tax_cents": 11005,
        "category": "software",
        **values,
    }


def add(api, supplier: int, **values) -> dict:
    reply = api.post(BILLS, json=a_bill(supplier, **values))
    assert reply.status_code == 201, reply.text
    return reply.json()


def error_fields(reply) -> dict[str, str]:
    assert reply.status_code == 422, reply.text
    return reply.json()["fields"]


def who_and_when(reply: dict) -> tuple:
    return reply["created_by"], reply["created_at"], reply["updated_by"], reply["updated_at"]


def how_many() -> int:
    with db.reading() as conn:
        return conn.execute(select(func.count()).select_from(bills)).scalar_one()


@pytest.fixture
def supplier(make) -> int:
    return make.organization("Northwind Software")


@pytest.fixture
def later_as(api, sign_in_as):
    """Makes the next requests as this teammate, two hours after the api's own, which are Alex's."""

    def switch(teammate):
        api.app.dependency_overrides[db.utc_now] = lambda: LATER
        return sign_in_as(teammate.id)

    return switch


# Adding, reading, editing, paying and deleting (E1, E4, E5, E9 to E12, E17)


def test_an_add_gives_the_bill_with_its_supplier_its_total_and_who_added_it(api, supplier):
    added = add(api, supplier, due_date="2026-11-15", notes="Ten seats\nYearly")
    assert added == {
        "id": added["id"],
        "organization": {"id": supplier, "name": "Northwind Software"},
        "bill_number": "INV-0042",
        "bill_date": "2026-10-01",
        "due_date": "2026-11-15",
        "amount_cents": 124000,
        "tax_cents": 11005,
        "total_cents": 135005,
        "category": "software",
        "notes": "Ten seats\nYearly",
        "paid_on": None,
        "created_at": NOW_TEXT,
        "created_by": named(ALEX),
        "updated_at": NOW_TEXT,
        "updated_by": named(ALEX),
    }
    assert api.get(f"{BILLS}/{added['id']}").json() == added


def test_with_no_due_date_its_30_days_after_the_bill_date_and_with_no_tax_its_nothing(api, supplier):
    body = a_bill(supplier, bill_date="2026-02-10")
    del body["tax_cents"]
    added = api.post(BILLS, json=body).json()
    assert (added["due_date"], added["tax_cents"], added["total_cents"]) == ("2026-03-12", 0, 124000)
    across_a_year = add(api, supplier, bill_number="INV-0043", bill_date="2026-12-15", due_date=None)
    assert across_a_year["due_date"] == "2027-01-14"


def test_a_bill_dated_within_30_days_of_the_calendars_end_is_due_on_its_last_day(api, supplier):
    assert add(api, supplier, bill_date="9999-12-20")["due_date"] == "9999-12-31"


def test_a_bill_can_be_added_already_paid(api, supplier):
    assert add(api, supplier, paid_on="2026-10-20")["paid_on"] == "2026-10-20"


def test_an_edit_changes_only_the_fields_sent_and_records_who_made_it(api, supplier, later_as):
    bill = add(api, supplier, notes="Ten seats")
    edited = later_as(DANA).patch(f"{BILLS}/{bill['id']}", json={"due_date": "2026-11-20", "tax_cents": 0}).json()
    assert (edited["due_date"], edited["tax_cents"], edited["total_cents"], edited["notes"]) == (
        "2026-11-20",
        0,
        124000,
        "Ten seats",
    )
    assert who_and_when(edited) == (named(ALEX), NOW_TEXT, named(DANA), LATER_TEXT)
    assert who_and_when(api.get(f"{BILLS}/{bill['id']}").json()) == who_and_when(edited)


def test_notes_can_be_cleared(api, supplier):
    bill = add(api, supplier, notes="Ten seats")
    assert api.patch(f"{BILLS}/{bill['id']}", json={"notes": "  "}).json()["notes"] is None


def test_marking_paid_and_unpaid_are_changes_by_whoever_made_them(api, supplier, later_as):
    bill = add(api, supplier)
    paid = later_as(DANA).patch(f"{BILLS}/{bill['id']}", json={"paid_on": "2026-10-30"}).json()
    assert paid["paid_on"] == "2026-10-30"
    assert who_and_when(paid) == (named(ALEX), NOW_TEXT, named(DANA), LATER_TEXT)

    unpaid = later_as(THEO).patch(f"{BILLS}/{bill['id']}", json={"paid_on": None}).json()
    assert unpaid["paid_on"] is None
    assert who_and_when(unpaid) == (named(ALEX), NOW_TEXT, named(THEO), LATER_TEXT)


def test_a_save_that_alters_nothing_isnt_a_change(api, supplier, later_as):
    bill = add(api, supplier, notes="Ten seats")
    same = a_bill(supplier, notes="Ten seats", due_date="2026-10-31", paid_on=None)
    reply = later_as(DANA).patch(f"{BILLS}/{bill['id']}", json=same).json()
    assert who_and_when(reply) == (named(ALEX), NOW_TEXT, named(ALEX), NOW_TEXT)


def test_a_total_sent_in_the_body_is_ignored(api, supplier):
    added = add(api, supplier, total_cents=1)
    assert added["total_cents"] == 135005
    edited = api.patch(f"{BILLS}/{added['id']}", json={"amount_cents": 100, "total_cents": 999999}).json()
    assert edited["total_cents"] == 100 + 11005


def test_a_body_naming_someone_or_a_key_changes_nothing(api, supplier):
    planted = {
        "created_by": DANA.id,
        "updated_by": DANA.id,
        "created_at": "2020-01-01T00:00:00Z",
        "bill_number_key": "x",
    }
    added = add(api, supplier, **planted)
    assert who_and_when(added) == (named(ALEX), NOW_TEXT, named(ALEX), NOW_TEXT)
    edited = api.patch(f"{BILLS}/{added['id']}", json={"amount_cents": 1, **planted}).json()
    assert edited["updated_by"] == named(ALEX)
    # The key is still the number's own, so the number still clashes.
    assert error_fields(api.post(BILLS, json=a_bill(supplier, bill_number="inv-0042"))) == {"bill_number": TAKEN}


def test_a_delete_removes_the_bill_and_nothing_else(api, supplier):
    bill = add(api, supplier)
    kept = add(api, supplier, bill_number="INV-0043")
    assert api.delete(f"{BILLS}/{bill['id']}").status_code == 204
    assert api.get(f"{BILLS}/{bill['id']}").status_code == 404
    assert api.get(f"{BILLS}/{kept['id']}").status_code == 200
    assert api.get(f"/api/organizations/{supplier}").status_code == 200


def test_a_missing_bill_is_a_404(api):
    assert api.get(f"{BILLS}/999").status_code == 404
    assert api.patch(f"{BILLS}/999", json={"paid_on": None}).status_code == 404
    assert api.delete(f"{BILLS}/999").status_code == 404


# The list and an organization's bills (E19)


def test_the_list_is_every_bill_by_due_date_then_id_with_its_supplier_and_total(api, make):
    northwind = make.organization("Northwind Software")
    kingsgate = make.organization("Kingsgate Properties")
    rent = make.bill(kingsgate, "KP-2611", due_date=date(2026, 11, 30), amount_cents=450000, category="office")
    later = make.bill(northwind, "NS-2", due_date=date(2026, 12, 3), tax_cents=11005)
    sooner = make.bill(northwind, "NS-1", due_date=date(2026, 11, 3), paid_on=date(2026, 10, 30))
    tie = make.bill(northwind, "NS-3", due_date=date(2026, 11, 30))

    listed = api.get(BILLS).json()
    assert [row["id"] for row in listed] == [sooner, rent, tie, later]
    assert listed[1] == {
        "id": rent,
        "organization": {"id": kingsgate, "name": "Kingsgate Properties"},
        "bill_number": "KP-2611",
        "bill_date": "2026-10-31",
        "due_date": "2026-11-30",
        "amount_cents": 450000,
        "tax_cents": 0,
        "total_cents": 450000,
        "category": "office",
        "notes": None,
        "paid_on": None,
    }
    assert listed[3]["total_cents"] == 135005
    assert listed[0]["paid_on"] == "2026-10-30"


def test_an_organizations_bills_are_its_own(api, make):
    northwind = make.organization("Northwind Software")
    kingsgate = make.organization("Kingsgate Properties")
    second = make.bill(northwind, "NS-2", due_date=date(2026, 12, 3))
    first = make.bill(northwind, "NS-1", due_date=date(2026, 11, 3))
    make.bill(kingsgate, "KP-2611")
    assert [row["id"] for row in api.get(BILLS, params={"organization_id": northwind}).json()] == [first, second]
    assert api.get(BILLS, params={"organization_id": make.organization("Nobody's")}).json() == []


@pytest.mark.parametrize("value", [0, -1, "abc", 2**31])
def test_an_organization_that_cant_be_a_record_is_refused(api, value):
    assert api.get(BILLS, params={"organization_id": value}).status_code == 422


# Bill numbers (E3)


@pytest.mark.parametrize(
    ("held", "sent"),
    [
        ("INV-0042", "inv-0042"),
        ("émile-1", "ÉMILE-1"),
        ("Café-1", "Café-1"),  # é as one character, then as e and an accent
        ("STRASSE-1", "straße-1"),
    ],
)
def test_a_number_the_supplier_has_in_any_case_is_refused(api, supplier, held, sent):
    add(api, supplier, bill_number=held)
    reply = api.post(BILLS, json=a_bill(supplier, bill_number=sent))
    assert (reply.status_code, reply.json()) == (422, {"detail": "Check the form.", "fields": {"bill_number": TAKEN}})
    assert how_many() == 1


def test_another_supplier_can_use_the_same_number(api, make, supplier):
    add(api, supplier)
    other = make.organization("Kingsgate Properties")
    assert add(api, other, bill_number="inv-0042")["bill_number"] == "inv-0042"


def test_moving_a_bill_to_a_supplier_that_has_its_number_is_refused(api, make, supplier):
    other = make.organization("Kingsgate Properties")
    add(api, other, bill_number="INV-0042")
    bill = add(api, supplier, bill_number="inv-0042")
    assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={"organization_id": other})) == {"bill_number": TAKEN}
    assert api.get(f"{BILLS}/{bill['id']}").json()["organization"]["id"] == supplier


def test_a_renumbered_bill_is_checked_and_can_change_its_own_case(api, supplier):
    add(api, supplier, bill_number="INV-0041")
    bill = add(api, supplier)
    assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={"bill_number": "inv-0041"})) == {"bill_number": TAKEN}
    assert api.patch(f"{BILLS}/{bill['id']}", json={"bill_number": "inv-0042"}).json()["bill_number"] == "inv-0042"
    assert error_fields(api.post(BILLS, json=a_bill(supplier, bill_number="INV-0042"))) == {"bill_number": TAKEN}


def test_spaces_at_the_ends_are_dropped_before_the_check(api, supplier):
    add(api, supplier)
    assert error_fields(api.post(BILLS, json=a_bill(supplier, bill_number="  INV-0042 "))) == {"bill_number": TAKEN}
    assert add(api, supplier, bill_number="  INV-0043  ")["bill_number"] == "INV-0043"


def test_a_number_has_50_characters_at_most_not_counting_spaces_at_the_ends(api, supplier):
    assert add(api, supplier, bill_number="  " + "x" * 50 + "  ")["bill_number"] == "x" * 50
    assert error_fields(api.post(BILLS, json=a_bill(supplier, bill_number="y" * 51))) == {"bill_number": TOO_LONG}
    bill = add(api, supplier)
    assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={"bill_number": "y" * 51})) == {"bill_number": TOO_LONG}
    assert how_many() == 2


@pytest.mark.parametrize("number", ["", "   ", None, 42])
def test_a_bill_needs_a_number(api, supplier, number):
    assert error_fields(api.post(BILLS, json=a_bill(supplier, bill_number=number))) == {
        "bill_number": "Enter the bill number"
    }


def test_two_saves_of_one_number_at_once_give_one_bill(api, supplier):
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda _: api.post(BILLS, json=a_bill(supplier)), range(2)))
    assert sorted(reply.status_code for reply in replies) == [201, 422]
    assert how_many() == 1


@pytest.fixture
def without_the_check(monkeypatch):
    """The check inside the write lock taken out, as if a second save got past it, leaving the unique index."""
    monkeypatch.setattr(router, "_number_problems", lambda *_args: {})


def test_the_database_refuses_an_add_that_gets_past_the_check(api, make, without_the_check):
    supplier = make.organization("Northwind Software")
    make.bill(supplier, "INV-0042")
    assert error_fields(api.post(BILLS, json=a_bill(supplier, bill_number="inv-0042"))) == {"bill_number": TAKEN}
    assert how_many() == 1


def test_the_database_refuses_a_move_that_gets_past_the_check(api, make, without_the_check):
    other = make.organization("Kingsgate Properties")
    make.bill(other, "INV-0042")
    moving = make.bill(bill_number="inv-0042")
    assert error_fields(api.patch(f"{BILLS}/{moving}", json={"organization_id": other})) == {"bill_number": TAKEN}
    assert api.get(f"{BILLS}/{moving}").json()["organization"]["name"] == "Northwind Software"
    assert api.patch(f"{BILLS}/{moving}", json={"bill_number": "INV-0043"}).status_code == 200


# Amounts (E4)


@pytest.mark.parametrize("cents", [0, 1, MAX_CENTS])
def test_an_amount_and_a_tax_from_nothing_to_a_trillion_dollars_are_kept_to_the_cent(api, supplier, cents):
    bill = add(api, supplier, amount_cents=cents, tax_cents=cents)
    read = api.get(f"{BILLS}/{bill['id']}").json()
    assert (read["amount_cents"], read["tax_cents"], read["total_cents"]) == (cents, cents, cents * 2)


@pytest.mark.parametrize("field", ["amount_cents", "tax_cents"])
@pytest.mark.parametrize("cents", [-1, MAX_CENTS + 1, 49.5, 4950.0, "4950", True])
def test_anything_but_whole_cents_in_range_is_refused(api, supplier, field, cents):
    expected = {field: AMOUNT_MESSAGE}
    assert error_fields(api.post(BILLS, json=a_bill(supplier, **{field: cents}))) == expected
    bill = add(api, supplier)
    assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={field: cents})) == expected
    assert api.get(f"{BILLS}/{bill['id']}").json()[field] == a_bill(supplier)[field]


def test_the_amount_is_required_and_cant_be_cleared(api, supplier):
    body = a_bill(supplier)
    del body["amount_cents"]
    assert error_fields(api.post(BILLS, json=body)) == {"amount_cents": AMOUNT_MESSAGE}
    bill = add(api, supplier)
    assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={"amount_cents": None})) == {
        "amount_cents": AMOUNT_MESSAGE
    }


# Categories (E6)


def test_the_categories_are_the_six_in_order():
    assert CATEGORIES == ("software", "contractors", "travel", "office", "marketing", "other")
    assert get_args(Category) == CATEGORIES


@pytest.mark.parametrize("category", CATEGORIES)
def test_each_category_is_accepted(api, supplier, category):
    assert add(api, supplier, category=category)["category"] == category


@pytest.mark.parametrize("category", ["Software", "rent", "", None])
def test_anything_else_is_refused(api, supplier, category):
    assert error_fields(api.post(BILLS, json=a_bill(supplier, category=category))) == {"category": "Choose a category"}
    bill = add(api, supplier)
    assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={"category": category})) == {
        "category": "Choose a category"
    }


def test_a_bill_needs_every_required_field(api):
    assert error_fields(api.post(BILLS, json={})) == {
        "organization_id": "Choose a supplier",
        "bill_number": "Enter the bill number",
        "bill_date": "Choose a bill date",
        "amount_cents": AMOUNT_MESSAGE,
        "category": "Choose a category",
    }


# Suppliers (E2)


def test_a_supplier_that_doesnt_exist_is_refused_not_a_crash(api, supplier):
    assert error_fields(api.post(BILLS, json=a_bill(999))) == {"organization_id": "Choose a supplier"}
    bill = add(api, supplier)
    assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={"organization_id": 999})) == {
        "organization_id": "Choose a supplier"
    }
    assert how_many() == 1


def test_a_supplier_can_be_changed_but_not_cleared(api, make, supplier):
    bill = add(api, supplier)
    other = make.organization("Kingsgate Properties")
    moved = api.patch(f"{BILLS}/{bill['id']}", json={"organization_id": other}).json()
    assert moved["organization"] == {"id": other, "name": "Kingsgate Properties"}
    assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={"organization_id": None})) == {
        "organization_id": "Choose a supplier"
    }


# Dates (E5, E9, E11, E16), with today fixed at Oct 31, 2026


def test_a_due_date_before_the_bill_date_is_refused(api, supplier):
    assert error_fields(api.post(BILLS, json=a_bill(supplier, due_date="2026-09-30"))) == {
        "due_date": "The due date can't be before the bill date"
    }
    assert add(api, supplier, due_date="2026-10-01")["due_date"] == "2026-10-01"


def test_the_dates_are_required_and_cant_be_cleared(api, supplier):
    assert error_fields(api.post(BILLS, json=a_bill(supplier, bill_date=None))) == {"bill_date": "Choose a bill date"}
    bill = add(api, supplier)
    for field, message in [("bill_date", "Choose a bill date"), ("due_date", "Choose a due date")]:
        assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={field: None})) == {field: message}
        assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={field: "31/10/2026"})) == {field: message}


@pytest.mark.parametrize("paid_on", ["2026-10-31", "2026-10-01", "2026-10-15"])
def test_a_paid_date_from_the_bill_date_to_today_is_accepted(api, supplier, paid_on):
    assert add(api, supplier, paid_on=paid_on)["paid_on"] == paid_on
    bill = add(api, supplier, bill_number="INV-0043")
    assert api.patch(f"{BILLS}/{bill['id']}", json={"paid_on": paid_on}).json()["paid_on"] == paid_on


@pytest.mark.parametrize(
    ("paid_on", "message"),
    [
        ("2026-11-01", "The paid date can't be in the future"),
        ("2026-09-30", "The paid date can't be before the bill date"),
    ],
)
def test_a_paid_date_in_the_future_or_before_the_bill_date_is_refused(api, supplier, paid_on, message):
    assert error_fields(api.post(BILLS, json=a_bill(supplier, paid_on=paid_on))) == {"paid_on": message}
    bill = add(api, supplier)
    assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={"paid_on": paid_on})) == {"paid_on": message}
    assert api.get(f"{BILLS}/{bill['id']}").json()["paid_on"] is None


def test_a_bill_date_moved_past_the_paid_date_in_the_same_save_is_refused(api, supplier):
    bill = add(api, supplier, paid_on="2026-10-10")
    reply = api.patch(f"{BILLS}/{bill['id']}", json={"bill_date": "2026-10-20", "due_date": "2026-11-19"})
    assert error_fields(reply) == {"paid_on": "The paid date can't be before the bill date"}
    moved_with_it = api.patch(
        f"{BILLS}/{bill['id']}", json={"bill_date": "2026-10-20", "due_date": "2026-11-19", "paid_on": "2026-10-25"}
    )
    assert moved_with_it.json()["paid_on"] == "2026-10-25"


def test_a_bill_date_moved_past_the_due_date_is_refused(api, supplier):
    bill = add(api, supplier, due_date="2026-10-15")
    assert error_fields(api.patch(f"{BILLS}/{bill['id']}", json={"bill_date": "2026-10-20"})) == {
        "due_date": "The due date can't be before the bill date"
    }


def test_every_problem_is_said_at_once(api):
    reply = api.post(BILLS, json=a_bill(999, due_date="2026-09-01", paid_on="2026-12-01"))
    assert error_fields(reply) == {
        "organization_id": "Choose a supplier",
        "due_date": "The due date can't be before the bill date",
        "paid_on": "The paid date can't be in the future",
    }


# Holds (E2, D4)


def test_an_organization_with_bills_cant_be_deleted_until_they_are(api, supplier):
    first = add(api, supplier)
    second = add(api, supplier, bill_number="INV-0043")

    impact = api.get(f"/api/organizations/{supplier}/delete-impact").json()
    assert impact["held_by"] == [{"noun": "bill", "count": 2}]
    refused = api.delete(f"/api/organizations/{supplier}")
    assert (refused.status_code, refused.json()) == (
        409,
        {"detail": "This organization has 2 bills, so it can't be deleted."},
    )
    assert how_many() == 2

    api.delete(f"{BILLS}/{first['id']}")
    assert api.get(f"/api/organizations/{supplier}/delete-impact").json()["held_by"] == [{"noun": "bill", "count": 1}]
    api.delete(f"{BILLS}/{second['id']}")
    assert api.get(f"/api/organizations/{supplier}/delete-impact").json()["held_by"] == []
    assert api.delete(f"/api/organizations/{supplier}").status_code == 204


def no_holds() -> list[holds.Hold]:
    return []


def test_the_database_refuses_to_delete_an_organization_with_bills(api, make, supplier, local_app):
    """Should a delete ever get past the route's check, the bill still holds its supplier."""
    make.bill(supplier)
    local_app.dependency_overrides[holds.app_holds] = no_holds
    with pytest.raises(IntegrityError):
        api.delete(f"/api/organizations/{supplier}")
    assert api.get(f"/api/organizations/{supplier}").status_code == 200
    assert how_many() == 1
