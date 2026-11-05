"""The fonts invoices are set in, and shared/invoice-fonts.json, which both sides read: each
font's advance widths, which every line break and every right edge is measured with, and the
characters invoices can show (V9, V24, V28).

The five TTF files in fonts/ are what the PDF carries. Run `uv run -m accountable.invoices.fonts`
after changing one, to write the JSON again. test_invoice_fonts.py checks the JSON is what the
files give, so neither can change alone.
"""

import json
import unicodedata
from pathlib import Path
from typing import Any

from reportlab.pdfbase.ttfonts import TTFontFile

from accountable import db

FOLDER = Path(__file__).parent / "fonts"
DESCRIBED = db.ROOT / "shared" / "invoice-fonts.json"

# Each font as the designs name it, and its file.
FILES = {
    "sans": "InstrumentSans-Regular.ttf",
    "sans_semibold": "InstrumentSans-SemiBold.ttf",
    "serif": "InstrumentSerif-Regular.ttf",
    "mono": "JetBrainsMono-Regular.ttf",
    "mono_medium": "JetBrainsMono-Medium.ttf",
}


def _drawable(code: int) -> bool:
    """Control, format and unassigned characters draw nothing, so none counts as one a font can show."""
    return not unicodedata.category(chr(code)).startswith("C")


def describe() -> dict[str, Any]:
    """What the JSON holds: the characters every font has, so a character a design can show is
    one every design can, and each font's units per em and its width for each of them."""
    read = {key: TTFontFile(str(FOLDER / name)) for key, name in FILES.items()}
    widths = {key: dict(font.charWidths or {}) for key, font in read.items()}
    shared = set.intersection(*(set(found) for found in widths.values()))
    shown = sorted(code for code in shared if _drawable(code))
    return {
        "characters": "".join(chr(code) for code in shown),
        "fonts": {
            key: {
                "file": FILES[key],
                "units_per_em": font.unitsPerEm,
                "widths": {chr(code): int(widths[key][code]) for code in shown},
            }
            for key, font in read.items()
        },
    }


def read() -> dict[str, Any]:
    return json.loads(DESCRIBED.read_text())


def main() -> None:
    DESCRIBED.write_text(json.dumps(describe(), ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {DESCRIBED.relative_to(db.ROOT)}. Run npm run format to lay it out.")


if __name__ == "__main__":
    main()
