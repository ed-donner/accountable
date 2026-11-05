"""The top bar's search (K1, K2, K4, K5)."""

import pytest
from accountable.api import MAX_CENTS

SEARCH = "/api/search"


def search(api, text: str) -> dict:
    reply = api.get(SEARCH, params={"q": text})
    assert reply.status_code == 200, reply.text
    return reply.json()


def names(api, text: str, kind: str = "organizations") -> list[str]:
    return [result["name"] for result in search(api, text)[kind]["results"]]


def test_each_kind_is_found_by_part_of_its_name_in_any_case(api, make):
    harbor = make.organization("Harbor & Pine", industry="Logistics")
    sam = make.contact("Sam Harbinger", organization_id=harbor)
    deal = make.deal("Harbor refit", organization_id=harbor, main_contact_id=sam, stage="proposal")
    survey = make.product("Harbor survey", unit_price_cents=125050)
    make.organization("Elm Street Bakery")

    assert search(api, "HARB") == {
        "organizations": {"count": 1, "results": [{"id": harbor, "name": "Harbor & Pine", "industry": "Logistics"}]},
        "contacts": {
            "count": 1,
            "results": [{"id": sam, "name": "Sam Harbinger", "organization_name": "Harbor & Pine"}],
        },
        "deals": {
            "count": 1,
            "results": [
                {"id": deal, "name": "Harbor refit", "stage": "proposal", "organization_name": "Harbor & Pine"}
            ],
        },
        "products": {"count": 1, "results": [{"id": survey, "name": "Harbor survey", "unit_price_cents": 125050}]},
    }


def test_no_match_gives_empty_groups(api, make):
    make.organization("Harbor & Pine")
    empty = {"count": 0, "results": []}
    assert search(api, "harbour") == {"organizations": empty, "contacts": empty, "deals": empty, "products": empty}


def test_only_names_are_searched_and_never_activities(api, make):
    organization = make.organization("Quiet Co", industry="Harbor services", notes="Harbor")
    contact = make.contact("Sam Carter", organization_id=organization, email="harbor@example.com")
    make.activity(contact_id=contact, description="Harbor visit")
    assert all(group["count"] == 0 for group in search(api, "harbor").values())


def test_blank_links_show_as_none(api, make):
    contact = make.contact("Orphan Contact")
    make.deal("Orphan Deal", main_contact_id=contact)
    make.organization("Orphan Org")
    found = search(api, "orphan")
    assert found["organizations"]["results"][0]["industry"] is None
    assert found["contacts"]["results"][0]["organization_name"] is None
    assert found["deals"]["results"][0]["organization_name"] is None


def test_accented_letters_match_in_any_case(api, make):
    make.organization("Émile Zola Books")
    make.organization("Ørsted Wind")
    assert names(api, "émile") == ["Émile Zola Books"]
    assert names(api, "ÉMILE") == ["Émile Zola Books"]
    assert names(api, "øRSTED") == ["Ørsted Wind"]


@pytest.mark.parametrize(
    "text, found",
    [
        ("%", ["100% Organic"]),
        ("_", ["Snake_case Ltd"]),
        ("/", ["A/B Testing"]),
        ("0%", ["100% Organic"]),
        ("e_c", ["Snake_case Ltd"]),
    ],
)
def test_wildcards_and_the_escape_character_match_only_themselves(api, make, text, found):
    for name in ["100% Organic", "Snake_case Ltd", "A/B Testing", "Plain Name", "Snakes case"]:
        make.organization(name)
    assert names(api, text) == found


def test_spaces_at_either_end_are_ignored(api, make):
    make.organization("Harbor & Pine")
    assert names(api, "  harbor  ") == ["Harbor & Pine"]
    assert names(api, "r & p") == ["Harbor & Pine"]
    assert names(api, "harbor  pine") == []


def test_names_that_start_with_the_text_come_first_then_the_rest_alphabetically(api, make):
    for name in ["Bay Harbor", "harbor east", "Old Harbor", "Harbor & Pine", "Alpha Harbor"]:
        make.organization(name)
    assert names(api, "harbor") == ["Harbor & Pine", "harbor east", "Alpha Harbor", "Bay Harbor", "Old Harbor"]


def test_accented_names_sort_among_their_plain_letters(api, make):
    for name in ["Mile End", "Émile", "Gilead"]:
        make.organization(name)
    assert names(api, "ile") == ["Émile", "Gilead", "Mile End"]


def test_each_group_shows_five_with_the_count_of_all(api, make):
    organization = make.organization("Harbor & Pine")
    for letter in "GFEDCBA":
        make.contact(f"{letter} Sam", organization_id=organization)
    found = search(api, "sam")["contacts"]
    assert found["count"] == 7
    assert [result["name"] for result in found["results"]] == ["A Sam", "B Sam", "C Sam", "D Sam", "E Sam"]


def test_the_same_name_twice_keeps_the_older_first(api, make):
    first = make.organization("Twin")
    second = make.organization("Twin")
    assert [result["id"] for result in search(api, "twin")["organizations"]["results"]] == [first, second]


@pytest.mark.parametrize("query", ["", "?q=", "?q=%20%20%20", f"?q={'a' * 101}", f"?q=%20{'a' * 101}%20"])
def test_a_blank_or_over_long_search_is_refused(api, query):
    reply = api.get(f"{SEARCH}{query}")
    assert reply.status_code == 422
    assert set(reply.json()["fields"]) == {"q"}


def test_the_longest_search_works_with_spaces_around_it(api, make):
    long_name = "a" * 100
    make.organization(long_name)
    assert names(api, f"  {long_name}  ") == [long_name]


@pytest.mark.parametrize("query", ["%00", "harb%00or", "%20%00%20"])
def test_a_search_holding_a_nul_character_is_refused(api, query):
    reply = api.get(f"{SEARCH}?q={query}")
    assert reply.status_code == 422
    assert reply.json()["fields"] == {"q": "Use plain text here"}


def test_text_with_no_valid_encoding_finds_nothing_rather_than_failing(api):
    assert api.get(f"{SEARCH}?q=%FF%FE").status_code == 200


# Products (K1, K4, K5, G10)


def test_the_groups_come_in_order_with_products_fourth(api):
    assert list(search(api, "harbor")) == ["organizations", "contacts", "deals", "products"]


def test_a_product_is_found_by_part_of_its_name_in_any_case_with_its_price_in_cents(api, make):
    survey = make.product("Rooftop survey", unit_price_cents=125050)
    make.product("Label printer", unit_price_cents=28995)
    assert search(api, "TOP SUR")["products"] == {
        "count": 1,
        "results": [{"id": survey, "name": "Rooftop survey", "unit_price_cents": 125050}],
    }


def test_the_largest_price_comes_back_exactly(api, make):
    make.product("Everything", unit_price_cents=MAX_CENTS)
    assert search(api, "everything")["products"]["results"][0]["unit_price_cents"] == MAX_CENTS


def test_archived_products_are_left_out_of_the_results_and_the_count(api, make):
    make.product("Label printer", active=False)
    kept = make.product("Label maker")
    assert search(api, "label")["products"] == {
        "count": 1,
        "results": [{"id": kept, "name": "Label maker", "unit_price_cents": 4950}],
    }


def test_a_products_description_isnt_searched(api, make):
    make.product("Training day", description="On site, at the harbor")
    assert search(api, "harbor")["products"]["count"] == 0


def test_products_show_five_with_the_count_of_all_in_order(api, make):
    for name in ["Pro seat", "Basic seat", "Seat pack", "Extra seat", "Team seat", "Annual seat"]:
        make.product(name)
    found = search(api, "seat")["products"]
    assert found["count"] == 6
    assert [result["name"] for result in found["results"]] == [
        "Seat pack",
        "Annual seat",
        "Basic seat",
        "Extra seat",
        "Pro seat",
    ]


# Bills (K1)


def test_a_bills_number_and_notes_find_nothing(api, make):
    """Bills are found from their own table's search, not the top bar's."""
    supplier = make.organization("Northwind Software")
    make.bill(supplier, "HARBOR-0042", notes="Harbor office rent")
    empty = {"count": 0, "results": []}
    assert search(api, "harbor") == {"organizations": empty, "contacts": empty, "deals": empty, "products": empty}
