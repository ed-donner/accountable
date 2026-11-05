"""The company settings through GET and PATCH /api/settings (B1 to B14)."""

import base64
import io
import json
import re
from datetime import datetime
from pathlib import Path

import pytest
from accountable import db
from accountable.company import documents, schemas
from accountable.company.tables import company_logo, company_settings
from accountable.users import TEAMMATES
from conftest import SUPABASE_PERSON
from PIL import Image
from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError

SETTINGS = "/api/settings"
CASES = json.loads((Path(__file__).resolve().parents[2] / "shared" / "settings-cases.json").read_text())
ALEX, DANA = TEAMMATES[0], TEAMMATES[1]
SAVED_AT = "2026-10-31T15:00:00Z"  # conftest's NOW, as replies write it

RATE_MESSAGES = {"range": "Enter a rate from 0 to 100%", "decimals": "Use at most three decimal places"}
TERMS_MESSAGE = "Enter a whole number of days from 0 to 365"
CLASH_MESSAGE = "Clashes with the quote prefix. Neither can start with the other, ignoring capitals"
PREFIX_MESSAGES = {
    "quote_prefix": {"blank": "Enter a prefix, such as QT-", "characters": "Use up to 10 letters, digits and hyphens"},
    "invoice_prefix": {
        "blank": "Enter a prefix, such as INV-",
        "characters": "Use up to 10 letters, digits and hyphens",
    },
}

EVERY_FIELD = {
    "company_name": "Plainsong Systems",
    "address": "48 Orchard Row, Suite 210\nBrooklyn, NY 11201",
    "email": "accounts@plainsong.example",
    "phone": "(718) 555-0142",
    "tax_label": "VAT",
    "tax_rate": "7.25",
    "payment_terms_days": 14,
    "quote_prefix": "EST-",
    "invoice_prefix": "BILL-",
    "invoice_design": "ledger",
    "accent_color": "#0E6B6B",
}

# What JSON can send as the rate that isn't text, and what each gets.
NUMBERS_ACCEPTED = [(8.875, 8875), (8.5, 8500), (0, 0), (100, 100000), (100.0, 100000), (0.001, 1), (7.25, 7250)]
NUMBERS_REFUSED = [
    (150, "range"),
    (100.001, "range"),
    (-1, "range"),
    (-0.001, "range"),
    (1e300, "range"),
    (10**30, "range"),
    (True, "range"),
    (False, "range"),
    (None, "range"),
    ([8], "range"),
    ({"value": 8}, "range"),
    (8.8751, "decimals"),
    (1e-05, "decimals"),
]
JSON_NUMBER = re.compile(r"-?(0|[1-9][0-9]*)(\.[0-9]+)?")
RATES_JSON_CAN_SEND_AS_NUMBERS = [
    (typed.strip(), thousandths)
    for typed, thousandths, _shown in CASES["tax_rates"]["accepted"]
    if JSON_NUMBER.fullmatch(typed.strip())
]


def error_fields(reply) -> dict[str, str]:
    assert reply.status_code == 422, reply.text
    assert reply.json()["detail"] == "Check the form."
    return reply.json()["fields"]


def saved(reply) -> dict:
    assert reply.status_code == 200, reply.text
    return reply.json()


def stored() -> dict:
    with db.reading() as conn:
        return dict(conn.execute(select(company_settings)).one()._mapping)


@pytest.fixture
def named(api):
    """The settings once someone has saved a company name, which every later save needs."""
    saved(api.patch(SETTINGS, json={"company_name": "Plainsong Systems"}))
    return api


# Starting values and reading


def test_a_database_nobody_has_saved_has_the_defaults_and_no_one_recorded(api):
    settings = saved(api.get(SETTINGS))
    assert settings.pop("updated_at").endswith("Z")
    assert settings == {
        "company_name": None,
        "address": None,
        "email": None,
        "phone": None,
        "tax_label": "Sales tax",
        "tax_rate": "0",
        "payment_terms_days": 30,
        "quote_prefix": "QT-",
        "invoice_prefix": "INV-",
        "invoice_design": "classic",
        "accent_color": "#073B4C",
        "logo": None,
        "updated_by": None,
    }


def test_a_save_keeps_every_field_and_says_who_saved_it_and_when(api):
    settings = saved(api.patch(SETTINGS, json=EVERY_FIELD))
    assert settings == {
        **EVERY_FIELD,
        "logo": None,
        "updated_at": SAVED_AT,
        "updated_by": {"id": ALEX.id, "name": ALEX.name},
    }
    assert saved(api.get(SETTINGS)) == settings


def test_every_teammate_sees_the_same_settings(api, sign_in_as):
    by_alex = saved(api.patch(SETTINGS, json=EVERY_FIELD))
    assert saved(sign_in_as(DANA.id).get(SETTINGS)) == by_alex


def test_the_shared_app_saves_them_for_whoever_signed_in(shared_api):
    settings = saved(shared_api.patch(SETTINGS, json=EVERY_FIELD))
    assert settings["updated_by"] == {"id": SUPABASE_PERSON["id"], "name": SUPABASE_PERSON["name"]}
    assert saved(shared_api.get(SETTINGS)) == settings


# The company name (B4, B5, B14)


def test_while_no_name_is_saved_a_save_without_one_is_refused(api):
    assert error_fields(api.patch(SETTINGS, json={"tax_rate": "5"})) == {"company_name": "Enter the company name"}
    assert stored()["tax_rate"] == 0


def test_once_a_name_is_saved_a_save_of_the_rate_alone_works(named):
    assert saved(named.patch(SETTINGS, json={"tax_rate": "5"}))["tax_rate"] == "5"
    assert stored()["company_name"] == "Plainsong Systems"


@pytest.mark.parametrize("name", ["", "   ", None, 7])
def test_the_name_cant_be_cleared(named, name):
    assert error_fields(named.patch(SETTINGS, json={"company_name": name})) == {
        "company_name": "Enter the company name"
    }
    assert stored()["company_name"] == "Plainsong Systems"


# The tax rate (B4, B7)


@pytest.mark.parametrize("typed, thousandths, shown", CASES["tax_rates"]["accepted"])
def test_each_accepted_rate_is_kept_exactly(named, typed, thousandths, shown):
    assert saved(named.patch(SETTINGS, json={"tax_rate": typed}))["tax_rate"] == shown
    assert stored()["tax_rate"] == thousandths
    assert saved(named.get(SETTINGS))["tax_rate"] == shown


@pytest.mark.parametrize("typed, thousandths", RATES_JSON_CAN_SEND_AS_NUMBERS)
def test_each_accepted_rate_sent_as_a_number_is_kept_the_same(named, typed, thousandths):
    saved(named.patch(SETTINGS, json={"tax_rate": json.loads(typed)}))
    assert stored()["tax_rate"] == thousandths


@pytest.mark.parametrize("typed, message", CASES["tax_rates"]["refused"])
def test_each_refused_rate_gets_its_message(named, typed, message):
    assert error_fields(named.patch(SETTINGS, json={"tax_rate": typed})) == {"tax_rate": RATE_MESSAGES[message]}
    assert stored()["tax_rate"] == 0


@pytest.mark.parametrize("number, message", NUMBERS_REFUSED, ids=str)
def test_each_refused_rate_sent_as_something_other_than_text_gets_its_message(named, number, message):
    assert error_fields(named.patch(SETTINGS, json={"tax_rate": number})) == {"tax_rate": RATE_MESSAGES[message]}


@pytest.mark.parametrize("word", ["NaN", "Infinity", "-Infinity"])
def test_the_words_python_reads_as_numbers_are_refused(named, word):
    """Python's JSON reader takes these as numbers, though JSON has no such thing."""
    body = f'{{"tax_rate": {word}}}'
    reply = named.patch(SETTINGS, content=body, headers={"content-type": "application/json"})
    assert error_fields(reply) == {"tax_rate": RATE_MESSAGES["range"]}


def send_raw(client, body: str):
    """Sends the body's JSON text as it is. A Python float would lose these numbers' digits before the request went."""
    return client.patch(SETTINGS, content=body, headers={"content-type": "application/json"})


@pytest.mark.parametrize(
    "number, message",
    [
        ("8.8750000000000001", "decimals"),
        ("8.875" + "0" * 30 + "1", "decimals"),
        ("1e-999999999", "decimals"),
        ("100.000000000000001", "range"),
        ("1e999999999", "range"),
        ("-0.0", "range"),
    ],
)
def test_a_number_is_checked_from_every_digit_sent(named, number, message):
    assert error_fields(send_raw(named, f'{{"tax_rate": {number}}}')) == {"tax_rate": RATE_MESSAGES[message]}
    assert stored()["tax_rate"] == 0


@pytest.mark.parametrize(
    "number, thousandths",
    [("8.8750", 8875), ("8.875e0", 8875), ("1E2", 100000), ("100.0", 100000), ("0.0", 0), ("0e999999999", 0)],
)
def test_a_number_written_any_way_json_allows_is_read_exactly(named, number, thousandths):
    saved(named.patch(SETTINGS, json={"tax_rate": "5"}))
    saved(send_raw(named, f'{{"tax_rate": {number}}}'))
    assert stored()["tax_rate"] == thousandths


@pytest.mark.parametrize("number, thousandths", NUMBERS_ACCEPTED, ids=str)
def test_each_rate_sent_as_a_number_is_read_from_its_digits(named, number, thousandths):
    saved(named.patch(SETTINGS, json={"tax_rate": number}))
    assert stored()["tax_rate"] == thousandths


def test_a_rate_with_more_than_three_places_is_refused_not_rounded(named):
    saved(named.patch(SETTINGS, json={"tax_rate": "8.875"}))
    assert error_fields(named.patch(SETTINGS, json={"tax_rate": "8.8749"})) == {"tax_rate": RATE_MESSAGES["decimals"]}
    assert stored()["tax_rate"] == 8875


@pytest.mark.parametrize("thousandths, text", [(8875, "8.875"), (8500, "8.5"), (0, "0"), (100000, "100"), (1, "0.001")])
def test_a_rate_is_written_out_with_no_trailing_zeros(thousandths, text):
    assert schemas.rate_text(thousandths) == text


# Payment terms


@pytest.mark.parametrize("days", [0, 365])
def test_payment_terms_at_either_limit_are_saved(named, days):
    assert saved(named.patch(SETTINGS, json={"payment_terms_days": days}))["payment_terms_days"] == days


@pytest.mark.parametrize("days", [-1, 366, 400, 30.5, 30.0, "30", True, None])
def test_payment_terms_past_the_limits_or_not_whole_days_are_refused(named, days):
    assert error_fields(named.patch(SETTINGS, json={"payment_terms_days": days})) == {
        "payment_terms_days": TERMS_MESSAGE
    }
    assert stored()["payment_terms_days"] == 30


# Prefixes (B4, B6)


@pytest.mark.parametrize("field", ["quote_prefix", "invoice_prefix"])
@pytest.mark.parametrize("typed, kept", CASES["prefixes"]["accepted"])
def test_each_accepted_prefix_is_kept_as_typed(named, field, typed, kept):
    other = {"quote_prefix": "invoice_prefix", "invoice_prefix": "quote_prefix"}[field]
    sent = {field: typed, other: "9"}  # A prefix that clashes with none of the cases.
    assert saved(named.patch(SETTINGS, json=sent))[field] == kept
    assert stored()[field] == kept


@pytest.mark.parametrize("field", ["quote_prefix", "invoice_prefix"])
@pytest.mark.parametrize("typed, message", CASES["prefixes"]["refused"])
def test_each_refused_prefix_gets_its_message(named, field, typed, message):
    assert error_fields(named.patch(SETTINGS, json={field: typed})) == {field: PREFIX_MESSAGES[field][message]}


@pytest.mark.parametrize("field", ["quote_prefix", "invoice_prefix"])
def test_a_prefix_sent_as_null_is_blank(named, field):
    assert error_fields(named.patch(SETTINGS, json={field: None})) == {field: PREFIX_MESSAGES[field]["blank"]}


@pytest.mark.parametrize("quote, invoice, clash", CASES["clashes"])
def test_prefixes_that_could_share_a_number_are_refused_either_way_round(named, quote, invoice, clash):
    for sent in (
        {"quote_prefix": quote, "invoice_prefix": invoice},
        {"quote_prefix": invoice, "invoice_prefix": quote},
    ):
        reply = named.patch(SETTINGS, json=sent)
        if clash:
            assert error_fields(reply) == {"invoice_prefix": CLASH_MESSAGE}, sent
        else:
            assert saved(reply)["quote_prefix"] == sent["quote_prefix"], sent


def test_a_prefix_sent_alone_is_checked_against_the_saved_one(named):
    assert error_fields(named.patch(SETTINGS, json={"quote_prefix": "inv-"})) == {"invoice_prefix": CLASH_MESSAGE}
    assert error_fields(named.patch(SETTINGS, json={"invoice_prefix": "Q"})) == {"invoice_prefix": CLASH_MESSAGE}
    assert (stored()["quote_prefix"], stored()["invoice_prefix"]) == ("QT-", "INV-")


def test_a_missing_name_and_a_clash_are_both_reported(api):
    assert error_fields(api.patch(SETTINGS, json={"invoice_prefix": "qt-"})) == {
        "company_name": "Enter the company name",
        "invoice_prefix": CLASH_MESSAGE,
    }


# The optional fields (B4)


def test_spaces_at_the_ends_are_dropped_and_the_address_keeps_its_lines(named):
    settings = saved(
        named.patch(
            SETTINGS,
            json={
                "company_name": "  Plainsong Systems ",
                "address": "\n 48 Orchard Row\nSuite 210\n\nBrooklyn \n",
                "phone": " (718) 555-0142 ",
                "tax_label": " VAT ",
            },
        )
    )
    assert settings["company_name"] == "Plainsong Systems"
    assert settings["address"] == "48 Orchard Row\nSuite 210\n\nBrooklyn"
    assert (settings["phone"], settings["tax_label"]) == ("(718) 555-0142", "VAT")


@pytest.mark.parametrize("blank", ["", "   ", None])
def test_an_optional_field_left_blank_is_saved_blank(named, blank):
    saved(
        named.patch(
            SETTINGS, json={"address": "48 Orchard Row", "email": "a@b.example", "phone": "1", "tax_label": "VAT"}
        )
    )
    sent = {"address": blank, "email": blank, "phone": blank, "tax_label": blank}
    assert {name: saved(named.patch(SETTINGS, json=sent))[name] for name in sent} == dict.fromkeys(sent)
    assert {name: stored()[name] for name in sent} == dict.fromkeys(sent)


@pytest.mark.parametrize("email", ["accounts", "accounts@plainsong", "two words@plainsong.example"])
def test_an_email_that_doesnt_look_like_one_is_refused(named, email):
    assert error_fields(named.patch(SETTINGS, json={"email": email})) == {"email": "Enter a valid email address"}


def test_every_bad_field_gets_its_own_message(named):
    assert error_fields(
        named.patch(
            SETTINGS, json={"email": "accounts", "tax_rate": "150", "payment_terms_days": 400, "quote_prefix": "QT_"}
        )
    ) == {
        "email": "Enter a valid email address",
        "tax_rate": RATE_MESSAGES["range"],
        "payment_terms_days": TERMS_MESSAGE,
        "quote_prefix": PREFIX_MESSAGES["quote_prefix"]["characters"],
    }


# Who last changed them (B8, B9, U7, U10)


def test_a_save_that_changes_nothing_leaves_who_and_when_alone(api, sign_in_as, local_app):
    saved(api.patch(SETTINGS, json=EVERY_FIELD))
    local_app.dependency_overrides[db.utc_now] = lambda: datetime(2026, 11, 2, 9, 30)

    unchanged = saved(sign_in_as(DANA.id).patch(SETTINGS, json={**EVERY_FIELD, "tax_rate": "7.250"}))

    assert unchanged["updated_by"]["name"] == ALEX.name
    assert unchanged["updated_at"] == SAVED_AT


def test_a_save_that_changes_one_field_records_who_made_it(named, sign_in_as):
    settings = saved(sign_in_as(DANA.id).patch(SETTINGS, json={"phone": "(718) 555-0199"}))
    assert settings["updated_by"] == {"id": DANA.id, "name": DANA.name}


def test_who_saved_comes_from_the_token_never_the_body(api):
    sent = {**EVERY_FIELD, "updated_by": DANA.id, "updated_at": "2020-01-01T00:00:00Z", "id": 2}
    settings = saved(api.patch(SETTINGS, json=sent))
    assert settings["updated_by"]["id"] == ALEX.id
    assert settings["updated_at"] == SAVED_AT
    assert stored()["id"] == 1


# The one row


@pytest.mark.parametrize("values", [{"id": 2}, {}], ids=["with an id", "without"])
def test_a_second_row_cant_be_added(database, values):
    with pytest.raises(IntegrityError), db.writing() as conn:
        conn.execute(insert(company_settings).values(company_name="Another", **values))
    with db.reading() as conn:
        assert len(conn.execute(select(company_settings)).all()) == 1


# How invoices look: the design, the accent color and the logo (B18 to B22)

ACCENT_CASES = json.loads((Path(__file__).resolve().parents[2] / "shared" / "accent-cases.json").read_text())
ACCENT_MESSAGES = {
    "format": "Enter a color as # and six hex digits, such as #0E6B6B",
    "light": "Too light to read on white. Choose a darker color",
}


def test_the_accent_colors_messages_are_the_shared_ones_the_page_shows():
    assert ACCENT_CASES["messages"] == ACCENT_MESSAGES
    assert (schemas.ACCENT_FORMAT_MESSAGE, schemas.ACCENT_LIGHT_MESSAGE) == (
        ACCENT_MESSAGES["format"],
        ACCENT_MESSAGES["light"],
    )


def png(size: tuple[int, int] = (600, 200)) -> bytes:
    made = io.BytesIO()
    Image.new("RGB", size, "#0E6B6B").save(made, "PNG")
    return made.getvalue()


def sent(data: bytes) -> str:
    return base64.b64encode(data).decode()


@pytest.mark.parametrize("design", ["classic", "banner", "ledger"])
def test_each_design_is_saved(named, design):
    assert saved(named.patch(SETTINGS, json={"invoice_design": design}))["invoice_design"] == design


@pytest.mark.parametrize("design", ["Classic", "modern", "", None, 1])
def test_any_other_design_is_refused(named, design):
    assert error_fields(named.patch(SETTINGS, json={"invoice_design": design})) == {"invoice_design": "Choose a design"}


@pytest.mark.parametrize(("typed", "kept"), ACCENT_CASES["accepted"])
def test_each_accepted_accent_color_is_kept_in_capitals(named, typed, kept):
    assert saved(named.patch(SETTINGS, json={"accent_color": typed}))["accent_color"] == kept
    assert stored()["accent_color"] == kept


@pytest.mark.parametrize(("typed", "message"), ACCENT_CASES["refused"])
def test_each_refused_accent_color_gets_its_message(named, typed, message):
    reply = named.patch(SETTINGS, json={"accent_color": typed})
    assert error_fields(reply) == {"accent_color": ACCENT_MESSAGES[message]}
    assert stored()["accent_color"] == "#073B4C"


@pytest.mark.parametrize("color", [None, 7, ["#073B4C"]])
def test_an_accent_color_that_isnt_text_is_refused(named, color):
    assert error_fields(named.patch(SETTINGS, json={"accent_color": color})) == {
        "accent_color": ACCENT_MESSAGES["format"]
    }


def test_the_contrast_is_wcags():
    assert round(schemas.contrast_with_white("#767676"), 2) == 4.54
    assert round(schemas.contrast_with_white("#777777"), 2) == 4.48
    assert schemas.contrast_with_white("#000000") == pytest.approx(21)


def test_a_logo_is_saved_and_read_back_with_its_type_and_size_but_never_its_bytes(named):
    settings = saved(named.patch(SETTINGS, json={"logo": sent(png())}))
    assert settings["logo"] == {"media_type": "image/png", "width": 600, "height": 200}
    assert saved(named.get(SETTINGS))["logo"] == settings["logo"]
    assert sent(png()) not in named.get(SETTINGS).text


def test_the_logos_route_sends_its_bytes_with_the_type_found_and_nosniff(named):
    data = png((30, 10))
    named.patch(SETTINGS, json={"logo": sent(data)})
    reply = named.get(f"{SETTINGS}/logo")
    assert reply.status_code == 200
    assert reply.content == data
    assert reply.headers["content-type"] == "image/png"
    assert reply.headers["x-content-type-options"] == "nosniff"


def test_with_no_logo_its_route_is_a_404(api):
    assert api.get(f"{SETTINGS}/logo").status_code == 404


def test_leaving_the_logo_out_keeps_it_and_null_removes_it(named):
    named.patch(SETTINGS, json={"logo": sent(png())})
    assert saved(named.patch(SETTINGS, json={"phone": "555-0100"}))["logo"]["width"] == 600
    assert saved(named.patch(SETTINGS, json={"logo": None}))["logo"] is None
    assert named.get(f"{SETTINGS}/logo").status_code == 404


def test_a_new_logo_replaces_the_old_one(named):
    named.patch(SETTINGS, json={"logo": sent(png())})
    assert saved(named.patch(SETTINGS, json={"logo": sent(png((50, 50)))}))["logo"]["width"] == 50
    with db.reading() as conn:
        assert len(conn.execute(select(company_logo)).all()) == 1


def test_saving_or_removing_the_logo_sets_who_last_changed_the_settings(named, sign_in_as, local_app):
    local_app.dependency_overrides[db.utc_now] = lambda: datetime(2026, 11, 2, 9, 30)
    added = saved(sign_in_as(DANA.id).patch(SETTINGS, json={"logo": sent(png())}))
    assert (added["updated_by"]["id"], added["updated_at"]) == (DANA.id, "2026-11-02T09:30:00Z")
    local_app.dependency_overrides[db.utc_now] = lambda: datetime(2026, 11, 3, 9, 30)
    same_again = saved(sign_in_as(ALEX.id).patch(SETTINGS, json={"logo": sent(png())}))
    assert same_again["updated_by"]["id"] == DANA.id
    removed = saved(named.patch(SETTINGS, json={"logo": None}))
    assert (removed["updated_by"]["id"], removed["updated_at"]) == (ALEX.id, "2026-11-03T09:30:00Z")
    nothing_to_remove = saved(sign_in_as(DANA.id).patch(SETTINGS, json={"logo": None}))
    assert nothing_to_remove["updated_by"]["id"] == ALEX.id


@pytest.mark.parametrize(
    ("logo", "message"),
    [
        ("not base64 at all!", "Choose a PNG or JPEG image"),
        (sent(b"This is not a picture.\n"), "Choose a PNG or JPEG image"),
        (sent(b"<svg xmlns='http://www.w3.org/2000/svg'/>"), "Choose a PNG or JPEG image"),
        (12, "Choose a PNG or JPEG image"),
        (sent(png((2001, 10))), "Choose an image no more than 2,000 pixels wide or tall"),
        (sent(b"\x00" * (1024 * 1024 + 1)), "Choose an image of 1 MB or less"),
    ],
)
def test_a_logo_that_isnt_a_small_png_or_jpeg_is_refused_and_nothing_changes(named, logo, message):
    named.patch(SETTINGS, json={"logo": sent(png())})
    reply = named.patch(SETTINGS, json={"logo": logo, "phone": "555-0100"})
    assert error_fields(reply) == {"logo": message}
    assert saved(named.get(SETTINGS))["logo"]["width"] == 600
    assert stored()["phone"] is None


def test_the_design_and_color_are_in_the_settings_documents_read(named):
    named.patch(SETTINGS, json={"invoice_design": "banner", "accent_color": "#0e6b6b", "logo": sent(png())})
    with db.reading() as conn:
        settings = documents.current_settings(conn)
        current = documents.current_logo(conn)
    assert (settings.invoice_design, settings.accent_color) == ("banner", "#0E6B6B")
    assert current is not None
    assert (current.image, current.media_type, current.width, current.height) == (png(), "image/png", 600, 200)


def test_with_no_logo_documents_read_none(database):
    with db.reading() as conn:
        assert documents.current_logo(conn) is None
