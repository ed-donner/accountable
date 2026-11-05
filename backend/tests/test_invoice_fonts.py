"""shared/invoice-fonts.json against the font files, and the characters invoices can show (V9, V28)."""

import pytest
from accountable.invoices import characters, fonts


def test_the_json_is_what_the_font_files_give():
    """Run uv run -m accountable.invoices.fonts after changing a font, so the two never differ."""
    assert fonts.read() == fonts.describe()


def test_each_font_file_is_there_with_its_licence():
    for name in fonts.FILES.values():
        assert (fonts.FOLDER / name).is_file(), name
    for family in ("InstrumentSans", "InstrumentSerif", "JetBrainsMono"):
        assert "SIL OPEN FONT LICENSE Version 1.1" in (fonts.FOLDER / f"{family}-OFL.txt").read_text(), family


def test_every_font_has_a_width_for_every_character_shown():
    described = fonts.read()
    for key, font in described["fonts"].items():
        assert set(font["widths"]) == set(described["characters"]), key
        assert font["units_per_em"] == 1000, key
    assert {font["widths"]["0"] for key, font in described["fonts"].items() if key.startswith("mono")} == {600}


SHOWN = [*"ABCDEFGHIJKLMNOPQRSTUVWXYZ", *"abcxyz", *"0123456789", *"éÉñÑüßçøåŁłğşČž", *"$€©®™£–—“”‘’…&<>%", " "]


@pytest.mark.parametrize("character", SHOWN)
def test_letters_with_their_accents_digits_and_common_symbols_are_shown(character):
    assert characters.unprintable(character) == []


@pytest.mark.parametrize("character", ["\U0001f600", "漢", "ي", "\t", "\r", "\u200b", " ", "\x07"])
def test_emoji_other_scripts_and_controls_arent(character):
    assert characters.unprintable(character) == [character]


def test_a_line_break_is_fine():
    assert characters.unprintable("Harbor & Pine\nAttn: Sam") == []


def test_each_character_is_named_once_in_the_order_it_comes():
    found = characters.unprintable("漢 Acme 😀 漢\t ي\t")
    assert found == ["漢", "\U0001f600", "\t", "ي"]
    assert (
        characters.field_message(found)
        == 'Invoices can\'t show "漢", "\U0001f600", a tab and "ي". Take them out to save'
    )


def test_the_messages():
    assert characters.field_message(["漢"]) == 'Invoices can\'t show "漢". Take it out to save'
    assert characters.line_name_message(["漢"]) == (
        'Invoices can\'t show "漢". Remove this line, rename the product and add it again'
    )
    assert characters.company_message("address", ["漢"]) == (
        'The address in Company settings has "漢", which invoices can\'t show. Change it there before issuing.'
    )


def test_characters_no_one_can_see_get_a_name_and_one_name_for_several():
    assert characters.named(["\u200b", "‌"]) == "an invisible character"
    assert characters.named([" "]) == "an unusual space"
