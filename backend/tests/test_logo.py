"""The logo's check (B21): only a real PNG or JPEG of up to 1 MB and 2,000 pixels a side is kept."""

import io
import struct
import zlib

import pytest
from accountable import api
from accountable.company import logo
from PIL import Image

NOT_AN_IMAGE = "Choose a PNG or JPEG image"
TOO_BIG = "Choose an image of 1 MB or less"
TOO_MANY_PIXELS = "Choose an image no more than 2,000 pixels wide or tall"


def picture(size: tuple[int, int] = (600, 200), kind: str = "PNG", mode: str = "RGB") -> bytes:
    made = io.BytesIO()
    Image.new(mode, size, "#0E6B6B").save(made, kind)
    return made.getvalue()


def claiming(width: int, height: int) -> bytes:
    """A small, real PNG whose header says it's this size, as a decompression bomb's would."""
    real = picture((1, 1))
    header = struct.pack(">II", width, height) + real[24:29]
    chunk = b"IHDR" + header
    return real[:12] + chunk + struct.pack(">I", zlib.crc32(chunk)) + real[33:]


def refusal(data: bytes) -> str:
    with pytest.raises(api.FieldError) as refused:
        logo.check(data)
    return refused.value.fields["logo"]


@pytest.mark.parametrize(
    ("data", "media_type", "size"),
    [
        (picture(), "image/png", (600, 200)),
        (picture((300, 120), "JPEG"), "image/jpeg", (300, 120)),
        (picture((40, 40), "PNG", "RGBA"), "image/png", (40, 40)),
        (picture((2000, 2000)), "image/png", (2000, 2000)),
        (picture((1, 2000), "JPEG", "L"), "image/jpeg", (1, 2000)),
    ],
)
def test_a_png_and_a_jpeg_are_kept_with_what_pillow_found(data, media_type, size):
    assert logo.check(data) == logo.Logo(media_type=media_type, width=size[0], height=size[1])


def test_a_text_file_named_logo_png_is_refused():
    assert refusal(b"This is not a picture, whatever its name says.\n") == NOT_AN_IMAGE


def test_an_svg_is_refused():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'
    assert refusal(svg) == NOT_AN_IMAGE


@pytest.mark.parametrize("kind", ["GIF", "WEBP", "BMP", "TIFF"])
def test_other_image_formats_are_refused(kind):
    assert refusal(picture((20, 20), kind)) == NOT_AN_IMAGE


def test_a_file_of_1_mb_and_a_byte_is_refused():
    assert refusal(b"\x89PNG" + b"\x00" * (logo.MAX_BYTES - 3)) == TOO_BIG


def test_a_png_wider_or_taller_than_2000_pixels_is_refused():
    assert refusal(picture((2001, 1))) == TOO_MANY_PIXELS
    assert refusal(picture((1, 2001), "JPEG")) == TOO_MANY_PIXELS


def test_a_small_png_claiming_20000_by_20000_is_refused_before_its_unpacked():
    bomb = claiming(20_000, 20_000)
    assert len(bomb) < 100
    assert refusal(bomb) == TOO_MANY_PIXELS


def test_a_small_png_claiming_2001_wide_is_refused_from_its_header():
    assert refusal(claiming(2001, 1)) == TOO_MANY_PIXELS


@pytest.mark.parametrize("kind", ["PNG", "JPEG"])
def test_a_truncated_file_is_refused(kind):
    whole = picture((300, 300), kind)
    assert refusal(whole[: len(whole) // 2]) == NOT_AN_IMAGE


def test_an_empty_file_is_refused():
    assert refusal(b"") == NOT_AN_IMAGE
