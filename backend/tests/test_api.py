"""The errors shown beside a field (F2), for flat bodies and for fields inside a list (V8)."""

from accountable import api

MESSAGES = {"name": "Enter a name", "quantity": "Enter a whole number from 1 to 1,000,000", "lines": "Add a line"}


def error(*loc, kind: str = "int_type", message: str | None = None) -> dict:
    found = {"loc": loc, "type": kind}
    if message is not None:
        found["ctx"] = {"error": ValueError(message)}
    return found


def test_a_flat_bodys_keys_are_its_fields():
    errors = [error("body", "name", kind="string_type"), error("query", "q", kind="value_error", message="Too long")]
    assert api.field_messages(errors, MESSAGES) == {"name": "Enter a name", "q": "Too long"}


def test_a_field_in_a_list_is_keyed_by_its_whole_place_and_takes_its_own_names_message():
    errors = [error("body", "lines", 2, "quantity"), error("body", "lines", 0, "description", kind="string_type")]
    assert api.field_messages(errors, MESSAGES) == {
        "lines.2.quantity": "Enter a whole number from 1 to 1,000,000",
        "lines.0.description": "Check this field",
    }


def test_a_list_item_thats_not_a_record_takes_the_lists_message():
    assert api.field_messages([error("body", "lines", 1, kind="model_type")], MESSAGES) == {"lines.1": "Add a line"}


def test_a_check_of_its_own_gives_its_own_message_inside_a_list_too():
    errors = [error("body", "lines", 3, "description", kind="value_error", message="Keep it short")]
    assert api.field_messages(errors, MESSAGES) == {"lines.3.description": "Keep it short"}


def test_a_bad_body_as_a_whole_is_keyed_body():
    assert api.field_messages([error("body", kind="model_attributes_type")], MESSAGES) == {"body": "Check this field"}


def test_the_first_message_for_a_field_wins():
    errors = [error("body", "name", kind="string_type"), error("body", "name", kind="value_error", message="Other")]
    assert api.field_messages(errors, MESSAGES) == {"name": "Enter a name"}
