"""The price list through the API: adding, editing, archiving and restoring, unique
names and whole-cent prices (G1 to G12)."""

import sys
from datetime import timedelta

import pytest
from accountable import db, users
from accountable.api import MAX_CENTS
from accountable.products import router
from accountable.products.schemas import MAX_NAME_LENGTH
from accountable.products.tables import INDEXED_KEY_BYTES, name_key, products
from conftest import NOW
from sqlalchemy import func, select

PRODUCTS = "/api/products"
ALEX, DANA, THEO, _ROBIN = users.TEAMMATES
LATER = NOW + timedelta(hours=2)
NOW_TEXT = "2026-10-31T15:00:00Z"
LATER_TEXT = "2026-10-31T17:00:00Z"

PRICE_MESSAGE = "Enter a price in dollars and cents, such as 49.50"
TAKEN = "A product with this name already exists"
ARCHIVED_TAKEN = "An archived product has this name. Restore it or choose another."
TOO_LONG = "Keep the name to 200 characters or fewer"


def named(teammate) -> dict:
    return {"id": teammate.id, "name": teammate.name or teammate.email}


def add(api, name: str = "Pro license", **values) -> dict:
    reply = api.post(PRODUCTS, json={"name": name, "unit_price_cents": 4950, **values})
    assert reply.status_code == 201, reply.text
    return reply.json()


def error_fields(reply) -> dict[str, str]:
    assert reply.status_code == 422, reply.text
    return reply.json()["fields"]


def who_and_when(reply: dict) -> tuple:
    return reply["created_by"], reply["created_at"], reply["updated_by"], reply["updated_at"]


def how_many() -> int:
    with db.reading() as conn:
        return conn.execute(select(func.count()).select_from(products)).scalar_one()


@pytest.fixture
def later_as(api, sign_in_as):
    """Makes the next requests as this teammate, two hours after the api's own, which are Alex's."""

    def switch(teammate):
        api.app.dependency_overrides[db.utc_now] = lambda: LATER
        return sign_in_as(teammate.id)

    return switch


# Adding, reading and editing


def test_an_add_gives_the_product_active_with_who_added_it(api):
    added = add(api, description="Per user, per year")
    assert added == {
        "id": added["id"],
        "name": "Pro license",
        "description": "Per user, per year",
        "unit_price_cents": 4950,
        "active": True,
        "created_at": NOW_TEXT,
        "created_by": named(ALEX),
        "updated_at": NOW_TEXT,
        "updated_by": named(ALEX),
    }
    assert api.get(f"{PRODUCTS}/{added['id']}").json() == added


def test_a_description_is_optional_and_blank_is_none(api):
    assert add(api, "Pro license")["description"] is None
    assert add(api, "Team license", description="   ")["description"] is None


def test_an_edit_changes_only_the_fields_sent_and_records_who_made_it(api, later_as):
    product = add(api, description="Per user, per year")
    edited = later_as(DANA).patch(f"{PRODUCTS}/{product['id']}", json={"unit_price_cents": 5000}).json()
    assert (edited["name"], edited["description"], edited["unit_price_cents"]) == (
        "Pro license",
        "Per user, per year",
        5000,
    )
    assert who_and_when(edited) == (named(ALEX), NOW_TEXT, named(DANA), LATER_TEXT)
    assert who_and_when(api.get(f"{PRODUCTS}/{product['id']}").json()) == who_and_when(edited)


def test_a_description_can_be_cleared(api):
    product = add(api, description="Per user, per year")
    assert api.patch(f"{PRODUCTS}/{product['id']}", json={"description": None}).json()["description"] is None


def test_archiving_and_restoring_are_changes_by_whoever_made_them(api, later_as):
    product = add(api)
    archived = later_as(DANA).patch(f"{PRODUCTS}/{product['id']}", json={"active": False}).json()
    assert archived["active"] is False
    assert who_and_when(archived) == (named(ALEX), NOW_TEXT, named(DANA), LATER_TEXT)

    restored = later_as(THEO).patch(f"{PRODUCTS}/{product['id']}", json={"active": True}).json()
    assert restored["active"] is True
    assert who_and_when(restored) == (named(ALEX), NOW_TEXT, named(THEO), LATER_TEXT)


def test_an_archived_product_keeps_its_details_and_can_still_be_edited(api):
    product = add(api, description="Per user, per year")
    api.patch(f"{PRODUCTS}/{product['id']}", json={"active": False})
    edited = api.patch(f"{PRODUCTS}/{product['id']}", json={"unit_price_cents": 6000}).json()
    assert (edited["name"], edited["description"], edited["unit_price_cents"], edited["active"]) == (
        "Pro license",
        "Per user, per year",
        6000,
        False,
    )


def test_a_save_that_alters_nothing_isnt_a_change(api, later_as):
    product = add(api, description="Per user, per year")
    same = {"name": "Pro license", "description": "Per user, per year", "unit_price_cents": 4950, "active": True}
    reply = later_as(DANA).patch(f"{PRODUCTS}/{product['id']}", json=same).json()
    assert who_and_when(reply) == (named(ALEX), NOW_TEXT, named(ALEX), NOW_TEXT)


def test_the_list_holds_every_product_archived_ones_included_by_name(api, make):
    training = make.product("Training day", unit_price_cents=125000)
    support = make.product("Annual support", unit_price_cents=360000, description="Weekdays", active=False)
    assert api.get(PRODUCTS).json() == [
        {
            "id": support,
            "name": "Annual support",
            "description": "Weekdays",
            "unit_price_cents": 360000,
            "active": False,
        },
        {"id": training, "name": "Training day", "description": None, "unit_price_cents": 125000, "active": True},
    ]


def test_a_missing_product_is_a_404(api):
    assert api.get(f"{PRODUCTS}/999").status_code == 404
    assert api.patch(f"{PRODUCTS}/999", json={"active": False}).status_code == 404


def test_a_product_cant_be_deleted(api, make):
    product = make.product()
    assert api.delete(f"{PRODUCTS}/{product}").status_code == 405
    assert api.get(f"{PRODUCTS}/{product}").status_code == 200


def test_a_body_naming_someone_or_a_key_changes_nothing(api):
    planted = {"created_by": DANA.id, "updated_by": DANA.id, "created_at": "2020-01-01T00:00:00Z", "name_key": "x"}
    added = add(api, **planted)
    assert who_and_when(added) == (named(ALEX), NOW_TEXT, named(ALEX), NOW_TEXT)
    edited = api.patch(f"{PRODUCTS}/{added['id']}", json={"unit_price_cents": 1, **planted}).json()
    assert edited["updated_by"] == named(ALEX)
    assert add(api, "X")["name"] == "X"


# Names (G2, G8)


@pytest.mark.parametrize(
    ("held", "sent"),
    [
        ("Pro license", "PRO LICENSE"),
        ("émile", "ÉMILE"),
        ("Straße", "STRASSE"),
        ("Café", "Café"),  # é as one character, then as e and an accent
        ("Café", "CAFÉ"),
    ],
)
def test_a_name_taken_in_any_case_is_refused(api, held, sent):
    add(api, held)
    reply = api.post(PRODUCTS, json={"name": sent, "unit_price_cents": 1})
    assert (reply.status_code, reply.json()) == (422, {"detail": "Check the form.", "fields": {"name": TAKEN}})
    assert how_many() == 1


def test_spaces_at_the_ends_are_dropped_before_the_check(api):
    add(api)
    assert error_fields(api.post(PRODUCTS, json={"name": "  Pro license  ", "unit_price_cents": 1})) == {"name": TAKEN}
    assert add(api, "  Training day  ")["name"] == "Training day"


def test_a_name_has_200_characters_at_most_not_counting_spaces_at_the_ends(api):
    assert add(api, "  " + "x" * 200 + "  ")["name"] == "x" * 200
    assert error_fields(api.post(PRODUCTS, json={"name": "y" * 201, "unit_price_cents": 1})) == {"name": TOO_LONG}
    product = add(api, "Training day")
    assert error_fields(api.patch(f"{PRODUCTS}/{product['id']}", json={"name": "y" * 201})) == {"name": TOO_LONG}
    assert api.get(f"{PRODUCTS}/{product['id']}").json()["name"] == "Training day"
    assert how_many() == 2


def test_the_longest_name_fits_the_postgres_index_whatever_its_characters(api):
    """Taking out the case and normalizing can make a character's key longer, such as
    the eighth note, which becomes three characters. Postgres can't index a key past
    INDEXED_KEY_BYTES, and refused one with a 500, which SQLite can't show. So 200 of
    the character whose key is longest must still fit."""
    widest = max(
        (chr(code) for code in range(sys.maxunicode + 1) if not 0xD800 <= code <= 0xDFFF),
        key=lambda character: len(name_key(character).encode()),
    )
    longest = add(api, widest * MAX_NAME_LENGTH)
    assert len(name_key(longest["name"]).encode()) <= INDEXED_KEY_BYTES


def test_a_name_an_archived_product_has_says_so(api, make):
    make.product("Pro license", active=False)
    assert error_fields(api.post(PRODUCTS, json={"name": "pro license", "unit_price_cents": 1})) == {
        "name": ARCHIVED_TAKEN
    }


def test_a_rename_to_a_taken_name_is_refused(api, make):
    make.product("Pro license")
    make.product("Old license", active=False)
    training = make.product("Training day")
    assert error_fields(api.patch(f"{PRODUCTS}/{training}", json={"name": "PRO LICENSE"})) == {"name": TAKEN}
    assert error_fields(api.patch(f"{PRODUCTS}/{training}", json={"name": "old LICENSE"})) == {"name": ARCHIVED_TAKEN}
    assert api.get(f"{PRODUCTS}/{training}").json()["name"] == "Training day"


def test_a_product_can_change_the_case_of_its_own_name(api):
    product = add(api)
    reply = api.patch(f"{PRODUCTS}/{product['id']}", json={"name": "PRO License"})
    assert reply.status_code == 200
    assert reply.json()["name"] == "PRO License"
    assert error_fields(api.post(PRODUCTS, json={"name": "pro license", "unit_price_cents": 1})) == {"name": TAKEN}


def test_a_renamed_product_frees_its_old_name(api):
    product = add(api)
    api.patch(f"{PRODUCTS}/{product['id']}", json={"name": "Team license"})
    assert add(api, "Pro license")["name"] == "Pro license"
    assert error_fields(api.post(PRODUCTS, json={"name": "TEAM license", "unit_price_cents": 1})) == {"name": TAKEN}


@pytest.fixture
def without_the_check(monkeypatch):
    """The check inside the write lock taken out, as if a second save got past it, leaving the unique index."""
    monkeypatch.setattr(router, "_check_name", lambda *_args: None)


@pytest.mark.parametrize(("active", "message"), [(True, TAKEN), (False, ARCHIVED_TAKEN)])
def test_the_database_refuses_an_add_that_gets_past_the_check(api, make, without_the_check, active, message):
    make.product("Pro license", active=active)
    assert error_fields(api.post(PRODUCTS, json={"name": "PRO LICENSE", "unit_price_cents": 1})) == {"name": message}
    assert how_many() == 1


def test_the_database_refuses_a_rename_that_gets_past_the_check(api, make, without_the_check):
    make.product("Pro license")
    training = make.product("Training day")
    assert error_fields(api.patch(f"{PRODUCTS}/{training}", json={"name": "pro LICENSE"})) == {"name": TAKEN}
    assert api.get(f"{PRODUCTS}/{training}").json()["name"] == "Training day"
    assert api.patch(f"{PRODUCTS}/{training}", json={"name": "Training days"}).status_code == 200


# Prices (G3)


@pytest.mark.parametrize("cents", [0, 1, MAX_CENTS])
def test_a_price_from_nothing_to_a_trillion_dollars_is_kept_to_the_cent(api, cents):
    product = add(api, unit_price_cents=cents)
    assert api.get(f"{PRODUCTS}/{product['id']}").json()["unit_price_cents"] == cents


@pytest.mark.parametrize("price", [-1, MAX_CENTS + 1, 49.5, 4950.0, "4950", True, None])
def test_anything_but_whole_cents_in_range_is_refused(api, price):
    expected = {"unit_price_cents": PRICE_MESSAGE}
    assert error_fields(api.post(PRODUCTS, json={"name": "Pro license", "unit_price_cents": price})) == expected
    product = add(api, "Training day")
    assert error_fields(api.patch(f"{PRODUCTS}/{product['id']}", json={"unit_price_cents": price})) == expected
    assert api.get(f"{PRODUCTS}/{product['id']}").json()["unit_price_cents"] == 4950


def test_a_product_needs_a_name_and_a_price(api):
    assert error_fields(api.post(PRODUCTS, json={})) == {"name": "Enter a name", "unit_price_cents": PRICE_MESSAGE}
    assert error_fields(api.post(PRODUCTS, json={"name": "  ", "unit_price_cents": 1})) == {"name": "Enter a name"}


def test_a_bad_description_gets_this_areas_message_not_the_crms(api):
    """The CRM's activities need a description, and say "Enter a description". A product's is optional."""
    body = {"name": "Pro license", "unit_price_cents": 1, "description": 12}
    assert error_fields(api.post(PRODUCTS, json=body)) == {"description": "Check this field"}
    product = add(api)
    assert error_fields(api.patch(f"{PRODUCTS}/{product['id']}", json={"description": ["x"]})) == {
        "description": "Check this field"
    }


@pytest.mark.parametrize("active", ["false", 0, None])
def test_active_is_true_or_false(api, active):
    product = add(api)
    assert error_fields(api.patch(f"{PRODUCTS}/{product['id']}", json={"active": active})) == {
        "active": "Choose whether the product is active"
    }
