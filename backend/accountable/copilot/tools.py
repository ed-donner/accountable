"""The Copilot's tools: what a tool is, the list the model is offered, checking a call before
anything runs, and what every tool's reply is made of (Z8 to Z15).

A tool is a look-up, in lookups.py, or a change, in changes.py. Each names the routes it
calls, from Z8's and Z11's tables, and its run and card are given a Caller limited to those
routes. What the model is told is JSON: {"data": ...}, with a list as {"rows", "matched"} and
long text cut, or {"refused": "the API's words"}. A change the person confirmed adds its step's
words as "done", which the turn does (Z15).
"""

import json
from collections.abc import Callable, Coroutine, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from functools import cache
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, ValidationError

from accountable.api import MAX_ID
from accountable.copilot.calls import Caller, Reply, Route
from accountable.copilot.schemas import CardField

ToolKind = Literal["look-up", "change"]
Stage = Literal["new", "qualified", "proposal", "negotiation", "won", "lost"]
"""The API's keys for the six stages, which every tool sends and reads."""
STAGE_NAMES: dict[str, str] = {
    "new": "New",
    "qualified": "Qualified",
    "proposal": "Proposal",
    "negotiation": "Negotiation",
    "won": "Won",
    "lost": "Lost",
}

MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

MOST_ROWS = 50
LONGEST_TEXT = 500
CUT = " (cut)"

RecordId = Annotated[StrictInt, Field(ge=1, le=MAX_ID)]
"""A record's id, a whole number, as the only thing an argument can put in a path."""


class Arguments(BaseModel):
    """A tool's arguments, as the model is told of them and as a call's are checked. A field the
    tool doesn't have is refused, so the model learns its mistake rather than have it ignored."""

    model_config = ConfigDict(extra="forbid")


class NoArguments(Arguments):
    """For a look-up that's asked nothing, such as the dashboard."""


# What a run or a card gives


@dataclass(frozen=True)
class Done:
    """A run that worked: what the model is told, and the done step's words and link."""

    data: Any
    """The route's reply, narrowed to what was asked. A list goes through rows()."""
    words: str
    """Written from the tool and the records, such as "Read Harbor & Pine renewal" (Z5)."""
    link: str | None = None
    """The record's page, such as /deals/12, or None."""

    @property
    def told(self) -> dict[str, Any]:
        return {"data": cut_long_text(self.data)}


@dataclass(frozen=True)
class Refused:
    """A run, a card or a call that didn't go through, in the API's words, or in the check's when nothing was sent."""

    words: str

    @property
    def told(self) -> dict[str, Any]:
        return {"refused": self.words}

    @classmethod
    def from_reply(cls, reply: Reply) -> "Refused":
        """The API's words for a refusal: each field's message, such as "Enter a name", or its detail."""
        data = reply.data if isinstance(reply.data, dict) else {}
        fields = data.get("fields")
        if isinstance(fields, dict) and fields:
            return cls(". ".join(str(message) for message in fields.values()))
        return cls(str(data.get("detail") or f"The app refused it, with a {reply.status}."))


@dataclass(frozen=True)
class Card:
    """A change card's words, written from the arguments and the records as the API gives them (Z13).
    The turn adds the change's button and pending to make the change event."""

    title: str
    """Names the change and the record, such as "Move Harbor & Pine renewal to Negotiation?"."""
    fields: list[CardField]
    note: str | None = None
    """What else changes by S1, or None."""


# A tool


@dataclass(frozen=True)
class Tool[A: Arguments]:
    name: str
    """What the model calls it, such as list_deals."""
    description: str
    """What the model is told of it. Kept short, since a small model reads every tool's."""
    arguments: type[A]
    kind: ToolKind
    routes: tuple[Route, ...]
    """Every route its run and card call, as the app lists them. Nothing else can be reached."""
    running: Callable[[A], str]
    """The running step's words, from the arguments alone, such as 'Searching for "acme"'."""
    run: Callable[[Caller, A], Coroutine[Any, Any, Done | Refused]]
    button: str | None = None
    """A change's own button, from Z11's table. None for a look-up."""
    card: Callable[[Caller, A], Coroutine[Any, Any, Card | Refused]] | None = None
    """A change's card, read through the caller. None for a look-up."""

    def __post_init__(self) -> None:
        is_change = self.kind == "change"
        if (self.button is not None, self.card is not None) != (is_change, is_change):
            raise ValueError(f"{self.name}: a change has a button and a card, and a look-up has neither")

    @property
    def offered(self) -> dict[str, Any]:
        """The tool as the model is offered it, in OpenAI's chat format."""
        parameters = self.arguments.model_json_schema()
        return {
            "type": "function",
            "function": {"name": self.name, "description": self.description, "parameters": parameters},
        }


@dataclass(frozen=True)
class Checked[A: Arguments]:
    """A call that may run: a tool on the list, with arguments its schema accepts."""

    tool: Tool[A]
    arguments: A


@cache
def every_tool() -> dict[str, Tool[Any]]:
    """Every tool, by name: the look-ups, then the changes."""
    # Imported here because both files build their tools from this one.
    from accountable.copilot import changes, lookups

    found = [*lookups.LOOKUPS, *changes.CHANGES]
    named = {tool.name: tool for tool in found}
    if len(named) != len(found):
        raise ValueError("Two tools have the same name")
    return named


def offered() -> list[dict[str, Any]]:
    """The list the model is offered with each request."""
    return [tool.offered for tool in every_tool().values()]


def check(name: str, arguments: str | Mapping[str, Any] | None) -> Checked[Any] | Refused:
    """A call as the model made it, or as a pending card holds it, checked before anything is sent.
    Arguments come as the model's JSON text or as an object, and none at all is {}."""
    tool = every_tool().get(name)
    if tool is None:
        return Refused(f"There's no tool called {cut(name)}.")
    given = _parsed(arguments)
    if given is None:
        return Refused(f"The arguments for {name} aren't a JSON object.")
    try:
        return Checked(tool=tool, arguments=tool.arguments.model_validate(given))
    except ValidationError as error:
        return Refused(f"The arguments for {name} don't fit its schema: {_problems(error)}")


def _parsed(arguments: str | Mapping[str, Any] | None) -> Mapping[str, Any] | None:
    if arguments is None or arguments == "":
        return {}
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except ValueError:
            return None
    return arguments if isinstance(arguments, Mapping) else None


def _problems(error: ValidationError) -> str:
    return "; ".join(
        f"{'.'.join(str(part) for part in problem['loc']) or 'arguments'}: {problem['msg']}"
        for problem in error.errors()
    )


# What the model is told


def rows(items: Sequence[Any], matched: int | None = None) -> dict[str, Any]:
    """A list as the model is told it: the first 50 rows, and how many matched in all (Z9).
    matched defaults to how many items there are, for a list already narrowed to what was asked."""
    return {"rows": list(items[:MOST_ROWS]), "matched": len(items) if matched is None else matched}


def cut(text: str) -> str:
    """At most 500 characters of the text, with " (cut)" after any that are left out (Z9)."""
    return text if len(text) <= LONGEST_TEXT else text[:LONGEST_TEXT] + CUT


def cut_long_text(value: Any) -> Any:
    """The value with every piece of text in it cut, however deep, as every tool's data is."""
    if isinstance(value, str):
        return cut(value)
    if isinstance(value, Mapping):
        return {key: cut_long_text(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [cut_long_text(item) for item in value]
    return value


# Words for steps and cards, the same in every tool


def dollars(value: int) -> str:
    """A deal's whole dollars, such as $48,000."""
    return f"-${-value:,}" if value < 0 else f"${value:,}"


def percent(value: int) -> str:
    return f"{value}%"


def day(value: date | str) -> str:
    """A plain date, given as a date or as the API's YYYY-MM-DD, such as Nov 30, 2026."""
    shown = _date(value)
    return f"{_month_and_day(shown)}, {shown.year}"


def days(first: date | str, last: date | str) -> str:
    """Two dates, with the year once if they share it, such as Nov 1 to Nov 30, 2026."""
    start, end = _date(first), _date(last)
    if start.year == end.year:
        return f"{_month_and_day(start)} to {day(end)}"
    return f"{day(start)} to {day(end)}"


def _date(value: date | str) -> date:
    return date.fromisoformat(value) if isinstance(value, str) else value


def _month_and_day(value: date) -> str:
    """In English whatever the computer's language, as the rest of the app's words are."""
    return f"{MONTHS[value.month - 1]} {value.day}"
