"""Which characters invoices can show, and the words for those they can't (V9, V10).

A character the invoice's fonts can't draw would print as a blank box, so a draft that has
one isn't saved. The set is shared/document-fonts.json's, which company/characters.ts reads
too, so the page and the backend refuse the same ones.
"""

import unicodedata

from accountable.company import fonts

SHOWN = frozenset(fonts.read()["characters"]) | {"\n"}
"""Every character the five fonts share, and the line break, which the layout keeps."""


def unprintable(text: str | None) -> list[str]:
    """The characters in the text that invoices can't show, each once, in the order they come."""
    found: list[str] = []
    for character in text or "":
        if character not in SHOWN and character not in found:
            found.append(character)
    return found


def printable(text: str | None) -> str | None:
    """The text with each character the fonts can't draw left out, as a quote's PDF leaves it
    blank (Q31). Invoices refuse such characters before they're saved, so theirs never have any."""
    return None if text is None else "".join(character for character in text if character in SHOWN)


def _named(character: str) -> str:
    """A character as a message says it. One that can't be seen would show as empty quotes, so it
    gets a name, from its Unicode category, as characters.ts names it."""
    category = unicodedata.category(character)
    if character == "\t":
        return "a tab"
    if category.startswith("Z"):
        return "an unusual space"
    if category.startswith("C"):
        return "an invisible character"
    return f'"{character}"'


def named(characters: list[str]) -> str:
    """ "漢", "漢" and "😀", or "漢", a tab and "😀", each name once."""
    names = list(dict.fromkeys(_named(character) for character in characters))
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def field_message(characters: list[str]) -> str:
    """For the Bill to and a description, which can be changed on the draft."""
    them = "it" if len(characters) == 1 else "them"
    return f"Invoices can't show {named(characters)}. Take {them} out to save"


def line_name_message(characters: list[str]) -> str:
    """For a line's name, which was taken from its product and can't be changed on the draft."""
    return f"Invoices can't show {named(characters)}. Remove this line, rename the product and add it again"


def company_message(field: str, characters: list[str]) -> str:
    """For one of the company's details, which issuing copies and only Company settings can change."""
    return f"The {field} in Company settings has {named(characters)}, which invoices can't show. Change it there before issuing."
