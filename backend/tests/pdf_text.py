"""A PDF's text, page by page, for the backend tests and, run as a script, for the end-to-end tests.

A PDF with embedded fonts holds glyph numbers, not letters, so its bytes can't be searched for
"$8,993.08". pypdf reads the text back through each font's own map.

    uv run --no-sync python backend/tests/pdf_text.py quote.pdf

prints each page's text, with a form feed between pages.
"""

import io
import sys
from pathlib import Path

from pypdf import PdfReader

PAGE_BREAK = "\f"


def pages_text(data: bytes) -> list[str]:
    return [page.extract_text() for page in PdfReader(io.BytesIO(data)).pages]


if __name__ == "__main__":
    print(PAGE_BREAK.join(pages_text(Path(sys.argv[1]).read_bytes())))
