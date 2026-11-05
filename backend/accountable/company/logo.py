"""The logo's check (B21): a real PNG or JPEG of up to 1 MB and 2,000 pixels a side, whatever
its name says or the type the browser gave it.

The size comes from the file's header, before anything is decoded, so a small file that
claims to be enormous is refused before Pillow unpacks it. Only then is the whole file read,
so a truncated or damaged one is refused too. SVG, which can carry a script, isn't a format
Pillow opens here, nor are GIF and WebP.
"""

import io
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

from accountable import api

MAX_BYTES = 1024 * 1024
MAX_SIDE = 2000

NOT_AN_IMAGE = "Choose a PNG or JPEG image"
TOO_BIG = "Choose an image of 1 MB or less"
TOO_MANY_PIXELS = "Choose an image no more than 2,000 pixels wide or tall"

# Pillow's own guard against an image that unpacks into billions of pixels, set to the most a
# logo can have, so nothing elsewhere can loosen it. A logo is the only image the app reads.
Image.MAX_IMAGE_PIXELS = MAX_SIDE * MAX_SIDE

# What Pillow calls each format it may find, and the type the logo is sent with. A camera's
# JPEG with a second picture in it opens as MPO, and is a JPEG all the same.
_MEDIA_TYPES = {"PNG": "image/png", "JPEG": "image/jpeg", "MPO": "image/jpeg"}


@dataclass(frozen=True)
class Logo:
    media_type: str
    width: int
    height: int


def _refused(message: str) -> api.FieldError:
    return api.FieldError({"logo": message})


def _header(data: bytes) -> Logo:
    """The format and size the header gives, without decoding the picture."""
    with Image.open(io.BytesIO(data), formats=["PNG", "JPEG"]) as image:
        media_type = _MEDIA_TYPES.get(image.format or "")
        width, height = image.size
    if media_type is None:
        raise _refused(NOT_AN_IMAGE)
    if not (1 <= width <= MAX_SIDE and 1 <= height <= MAX_SIDE):
        raise _refused(TOO_MANY_PIXELS)
    return Logo(media_type=media_type, width=width, height=height)


def _read_through(data: bytes) -> None:
    """verify() checks a PNG's chunks but not a JPEG's, so the picture is decoded too, now its size is known to be small."""
    with Image.open(io.BytesIO(data), formats=["PNG", "JPEG"]) as image:
        image.verify()
    with Image.open(io.BytesIO(data), formats=["PNG", "JPEG"]) as image:
        image.load()


def check(data: bytes) -> Logo:
    """The logo's type and size, or a FieldError with B21's message beside Logo."""
    if len(data) > MAX_BYTES:
        raise _refused(TOO_BIG)
    try:
        logo = _header(data)
        _read_through(data)
    except Image.DecompressionBombError as error:
        raise _refused(TOO_MANY_PIXELS) from error
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError) as error:
        raise _refused(NOT_AN_IMAGE) from error
    return logo
