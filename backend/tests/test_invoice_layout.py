"""The layout (V24, V26 to V28): the shared cases, and what every layout keeps to."""

import json

import pytest
from accountable import db
from accountable.invoices import layout

CASES = json.loads((db.ROOT / "shared" / "invoice-layout-cases.json").read_text())["cases"]
PAGE = layout.DESIGNS["page"]
BY_NAME = {case["name"]: case for case in CASES}


def texts(pages: list[layout.Page]) -> list[list[str]]:
    return [[item["text"] for item in page if item["kind"] == "text"] for page in pages]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_each_case_gives_its_lines_on_its_pages(case):
    assert texts(layout.lay_out(case["invoice"])) == case["pages"]


def horizontal_extent(item: layout.Item) -> tuple[float, float]:
    if item["kind"] != "text":
        return item["x"], item["x"] + item["width"]
    width = layout.width_of(item["text"], item["font"], item["size"])
    start = {"start": item["x"], "end": item["x"] - width, "middle": item["x"] - width / 2}[item["anchor"]]
    return start, start + width


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_every_item_stays_inside_the_pages_margins(case):
    footer = PAGE["footer"]
    for page in layout.lay_out(case["invoice"]):
        for item in page:
            left, right = horizontal_extent(item)
            if item["kind"] == "block":
                # A block may run to the paper's edge, as Banner's does.
                assert 0 <= left and right <= PAGE["width"] and item["y"] + item["height"] <= PAGE["bottom"], item
            elif "angle" not in item:
                assert PAGE["left"] <= left and right <= PAGE["right"] + 1e-9, item
                assert item["y"] <= PAGE["bottom"] or item["y"] == footer["y"], item


def test_the_void_mark_is_on_every_page():
    invoice = {**BY_NAME["100 lines over several pages"]["invoice"], "mark": "void"}
    pages = layout.lay_out(invoice)
    assert len(pages) > 1
    for page in pages:
        [mark] = [item for item in page if item.get("angle")]
        assert (mark["text"], mark["opacity"], mark["anchor"]) == ("VOID", 0.14, "middle")


def test_100_lines_carry_on_with_their_headings_and_the_page_at_the_foot():
    pages = texts(layout.lay_out(BY_NAME["100 lines over several pages"]["invoice"]))
    assert len(pages) == 5
    for number, page in enumerate(pages, start=1):
        assert page[-1] == f"INV-0042, page {number} of 5"
        start = page.index("Description")
        assert page[start : start + 4] == ["Description", "Qty", "Unit price", "Amount"]
    assert "Subtotal" in pages[-1] and "Subtotal" not in pages[-2]


@pytest.mark.parametrize("design", ["Classic", "Banner", "Ledger"])
def test_a_line_taller_than_a_page_carries_on_with_its_figures_beside_its_first_part(design):
    """A description of up to 1,000 characters can run past a page, so it carries on to the next (V8, V26)."""
    first, second = texts(layout.lay_out(BY_NAME[f"a line taller than a page, in {design}"]["invoice"]))
    assert first[first.index("Hardware bundle") + 1] == "Item 01"
    assert [text for text in first + second if text.startswith("Item ")] == [f"Item {n:02d}" for n in range(1, 61)]
    assert second[:4] == ["Description", "Qty", "Unit price", "Amount"]
    assert second[4].startswith("Item ")
    assert [page.count("$2,500.00") for page in (first, second)] == [1, 0]
    assert second[second.index("Item 60") + 1] == "Subtotal"


def test_totals_that_dont_fit_move_together_to_a_new_page_with_no_headings():
    last = texts(layout.lay_out(BY_NAME["totals that don't fit after the last line move to a new page"]["invoice"]))[-1]
    assert last[:2] == ["Subtotal", "$452.85"]
    assert "Description" not in last


@pytest.mark.parametrize("design", ["classic", "banner", "ledger"])
@pytest.mark.parametrize(
    "logo", [{"width": 600, "height": 200}, {"width": 100, "height": 400}, {"width": 2000, "height": 1}]
)
def test_each_design_fits_the_logo_inside_2_by_0_75_inches_keeping_its_shape(design, logo):
    invoice = {**BY_NAME["a short invoice in Classic"]["invoice"], "design": design, "logo": logo}
    [placed] = [item for item in layout.lay_out(invoice)[0] if item["kind"] == "logo"]
    assert placed["width"] <= 144 and placed["height"] <= 54
    assert max(placed["width"] / 144, placed["height"] / 54) == pytest.approx(1)
    assert placed["width"] / placed["height"] == pytest.approx(logo["width"] / logo["height"])


@pytest.mark.parametrize("design", ["classic", "banner", "ledger"])
def test_with_no_logo_its_space_is_left_out(design):
    invoice = BY_NAME["a short invoice in Classic"]["invoice"]
    with_logo = layout.lay_out({**invoice, "design": design})[0]
    without = layout.lay_out({**invoice, "design": design, "logo": None})[0]
    assert not [item for item in without if item["kind"] == "logo"]

    def top_of(page: layout.Page, text: str) -> float:
        return next(item["y"] for item in page if item.get("text") == text)

    assert top_of(without, "Plainsong Systems") <= top_of(with_logo, "Plainsong Systems")
    if design != "ledger":
        # The company's name stands where the logo was.
        [logo] = [item for item in with_logo if item["kind"] == "logo"]
        assert top_of(without, "Plainsong Systems") < logo["y"] + logo["height"]


def test_a_paid_overdue_or_void_invoice_has_its_mark_in_its_own_color():
    invoice = BY_NAME["a short invoice in Classic"]["invoice"]
    for mark, color in [("paid", "#047A5B"), ("overdue", "#D23E62"), ("void", "#5B6970"), ("draft", "#5B6970")]:
        page = layout.lay_out({**invoice, "mark": mark})[0]
        [shown] = [item for item in page if item.get("text") == mark.upper() and "angle" not in item]
        assert shown["color"] == color
    assert not [item for item in layout.lay_out(invoice)[0] if item.get("text") in ("PAID", "OVERDUE", "VOID")]


@pytest.mark.parametrize("design", ["classic", "banner", "ledger"])
def test_the_accent_color_is_used_and_every_color_reads_on_white(design):
    from accountable.company.schemas import contrast_with_white

    invoice = {**BY_NAME["a short invoice in Classic"]["invoice"], "design": design, "accent": "#767676"}
    colors = {item["color"] for item in layout.lay_out(invoice)[0] if item["kind"] == "text"}
    assert "#767676" in colors
    for color in colors - {"#FFFFFF"}:
        assert contrast_with_white(color) >= 4.5, color


@pytest.mark.parametrize(
    ("text", "width", "lines"),
    [
        ("one two three", 1000, ["one two three"]),
        # JetBrains Mono at 10pt is 6pt a character, so 42pt holds seven and 41.9 six.
        ("one two three", 42, ["one two", "three"]),
        ("one two three", 41.9, ["one", "two", "three"]),
        ("one   two", 1000, ["one   two"]),
        ("   indented", 1000, ["   indented"]),
        ("trailing   ", 1000, ["trailing"]),
        ("a\n\nb", 1000, ["a", "", "b"]),
        ("abcdefghij", 24, ["abcd", "efgh", "ij"]),
        ("ab abcdefghij", 24, ["ab", "abcd", "efgh", "ij"]),
        ("W", 1, ["W"]),
        ("", 100, [""]),
    ],
)
def test_lines_break_at_spaces_and_a_long_word_between_characters(text, width, lines):
    assert layout.wrap(text, "mono", 10, width) == lines


def test_figures_and_dates_are_written_as_invoices_write_them():
    assert [layout.money(cents) for cents in (0, 5, 4950, 125000, 10**14)] == [
        "$0.00",
        "$0.05",
        "$49.50",
        "$1,250.00",
        "$1,000,000,000,000.00",
    ]
    assert (layout.quantity(1000000), layout.day("2026-01-05"), layout.tax_text(None, "8.875")) == (
        "1,000,000",
        "Jan 5, 2026",
        "Tax (8.875%)",
    )
