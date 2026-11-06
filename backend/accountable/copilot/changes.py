"""What the Copilot can change (Z11, Z13, Z15): each change goes through the route the app's
own form or board uses, as the person, and only once they've pressed its card's button.

A change's card reads the record through the same calls, so it says what would really happen,
whatever the model said. Its run gives the done step's words and a link to the record.

A change's arguments are the form's fields, by the API's names, with the shared field types
from api.py where the API has them, so a card never shows a name, an email or a website the
form would refuse, and shows them as they'd be saved. The rules that need the records, such
as a link to a record that's gone or a won deal's close date, are the API's alone, and a run
it refuses gives its words (Z15).
"""

from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import date
from typing import Annotated, Any, Literal, Self

from pydantic import MISSING, Field, StrictInt, model_validator

from accountable import api
from accountable.copilot.calls import Caller, Route
from accountable.copilot.schemas import CardField, FieldKind
from accountable.copilot.tools import (
    STAGE_NAMES,
    Arguments,
    Card,
    Done,
    RecordId,
    Refused,
    Stage,
    Tool,
    day,
    dollars,
    percent,
)

DEAL = "/api/deals/{deal_id}"
CONTACT = "/api/contacts/{contact_id}"
ORGANIZATION = "/api/organizations/{organization_id}"
ACTIVITIES = "/api/activities"
ACTIVITY = "/api/activities/{activity_id}"
DASHBOARD = "/api/dashboard"
META = "/api/meta"

# Moving a deal to another stage


class MoveArguments(Arguments):
    id: RecordId = Field(description="The deal's id")
    stage: Stage


async def _move_card(caller: Caller, arguments: MoveArguments) -> Card | Refused:
    reply = await caller.get(Caller.path(DEAL, arguments.id))
    if not reply.ok:
        return Refused.from_reply(reply)
    deal = reply.data
    after = STAGE_NAMES[arguments.stage]
    if deal["stage"] == arguments.stage:
        return Refused(f"{deal['name']} is already in {after}.")
    probability = await _new_probability(caller, deal, arguments.stage)
    if isinstance(probability, Refused):
        return probability
    stage = CardField(name="Stage", now=STAGE_NAMES[deal["stage"]], after=after, kind="text")
    return Card(
        title=f"Move {deal['name']} to {after}?",
        fields=[stage] if probability is None else [stage, probability],
        note=await _what_else_changes(caller, deal, arguments.stage),
    )


async def _new_probability(caller: Caller, deal: dict[str, Any], stage: str) -> CardField | Refused | None:
    """A move gives the deal the new stage's usual probability, replacing one set by hand (S1, P10),
    so the card shows it when it changes, as the board's card does once it lands."""
    usual = await _usual_probability(caller, stage)
    if isinstance(usual, Refused):
        return usual
    if usual == deal["probability"]:
        return None
    return CardField(name="Probability", now=percent(deal["probability"]), after=percent(usual), kind="percent")


async def _what_else_changes(caller: Caller, deal: dict[str, Any], stage: str) -> str | None:
    """S1's extras for a move to Won or Lost, which the board's message says too (P8)."""
    if stage not in ("won", "lost"):
        return None
    customer = await _new_customer(caller, deal) if stage == "won" else None
    if customer is None:
        return "The close date becomes today."
    return f"The close date becomes today, and {customer} becomes a customer."


async def _new_customer(caller: Caller, deal: dict[str, Any]) -> str | None:
    """The main contact's name, if winning the deal makes them a customer."""
    if deal["main_contact_id"] is None:
        return None
    reply = await caller.get(Caller.path(CONTACT, deal["main_contact_id"]))
    if not reply.ok or reply.data["status"] == "customer":
        return None
    return reply.data["name"]


async def _move(caller: Caller, arguments: MoveArguments) -> Done | Refused:
    """The stage alone, through the deal form's route, which puts the deal at the top of its new column (S9)."""
    reply = await caller.patch(Caller.path(DEAL, arguments.id), {"stage": arguments.stage})
    if not reply.ok:
        return Refused.from_reply(reply)
    deal = reply.data
    return Done(
        data=deal,
        words=f"Moved {deal['name']} to {STAGE_NAMES[deal['stage']]}.",
        link=f"/deals/{deal['id']}",
    )


MOVE_DEAL = Tool(
    name="move_deal",
    description=(
        "Move a deal to another stage. Its probability becomes the new stage's usual one. "
        "Moving to won or lost also sets its close date to today."
    ),
    arguments=MoveArguments,
    kind="change",
    routes=(Route("GET", DEAL), Route("GET", CONTACT), Route("GET", META), Route("PATCH", DEAL)),
    running=lambda arguments: f"Moving the deal to {STAGE_NAMES[arguments.stage]}",
    run=_move,
    button="Move deal",
    card=_move_card,
)

# What a card shows of a record's fields

NONE = "None"
"""A blank field, as the app's tables and forms show it."""
STATUS_NAMES = {"lead": "Lead", "qualified": "Qualified", "customer": "Customer"}
TYPE_NAMES = {"note": "Note", "call": "Call", "email": "Email"}


def _text(value: Any) -> str:
    return str(value).strip() or NONE


@dataclass(frozen=True)
class Shown:
    """A field a change can set, as its card shows it, such as "Value: from $40,000 to $48,000"."""

    key: str
    """The API's name for it, such as close_date."""
    name: str
    """The card's, such as Close date."""
    kind: FieldKind = "text"
    words: Callable[[Any], str] = _text
    link: str | None = None
    """For an id, the route that reads the record it links to, whose name the card shows in its place."""

    def now(self, record: dict[str, Any]) -> str:
        """What the record holds now. A link's name is in the record beside its id, such as organization_name."""
        if self.link is None:
            return self.shown(record[self.key])
        return self.shown(record[self.key.removesuffix("_id") + "_name"])

    async def after(self, caller: Caller, value: Any) -> str | Refused:
        """What it will be, with a linked record's name read through the API, or the API's refusal if it's gone."""
        if self.link is None or value is None:
            return self.shown(value)
        reply = await caller.get(Caller.path(self.link, value))
        return self.shown(reply.data["name"]) if reply.ok else Refused.from_reply(reply)

    def shown(self, value: Any) -> str:
        return NONE if value is None else self.words(value)


async def _card_fields(
    caller: Caller, shown: tuple[Shown, ...], given: dict[str, Any], record: dict[str, Any] | None = None
) -> dict[str, CardField] | Refused:
    """A card's field for each value given, keyed by the API's name, in the form's order,
    with what the record holds now, or None for a new record."""
    fields: dict[str, CardField] = {}
    for field in shown:
        if field.key not in given:
            continue
        after = await field.after(caller, given[field.key])
        if isinstance(after, Refused):
            return after
        now = None if record is None else field.now(record)
        fields[field.key] = CardField(name=field.name, now=now, after=after, kind=field.kind)
    return fields


def _new_values(arguments: Arguments) -> dict[str, Any]:
    """A new record's values as the API takes them, leaving out the optional ones not given."""
    return {key: value for key, value in arguments.model_dump(mode="json").items() if value is not None}


def _edited_values(arguments: Arguments) -> dict[str, Any]:
    """An edit's values as the API takes them: only those given, where null clears an optional field."""
    return arguments.model_dump(mode="json", exclude={"id"})


# Adding and editing organizations, contacts and deals, through their forms' routes


@dataclass(frozen=True)
class Form:
    """A record's form, as the Copilot fills it in: the routes it saves through and the fields its cards show."""

    word: str
    """As the cards' titles say it, such as organization."""
    adds: str
    """The route that adds one, such as /api/organizations."""
    edits: str
    """The route that reads and edits one."""
    fields: tuple[Shown, ...]
    """In the form's order, as records.md lists them."""

    def page(self, record_id: int) -> str:
        return f"/{self.word}s/{record_id}"


async def _new_card(caller: Caller, form: Form, given: dict[str, Any]) -> Card | Refused:
    fields = await _card_fields(caller, form.fields, given)
    if isinstance(fields, Refused):
        return fields
    return Card(title=f"Add the {form.word} {given['name']}?", fields=list(fields.values()))


async def _edit_card(caller: Caller, form: Form, record_id: int, given: dict[str, Any]) -> Card | Refused:
    """Only the fields the edit alters, from what they are now, as the API has them."""
    reply = await caller.get(Caller.path(form.edits, record_id))
    if not reply.ok:
        return Refused.from_reply(reply)
    record = reply.data
    altered = {key: value for key, value in given.items() if record[key] != value}
    if not altered:
        return Refused(f"That changes nothing on {record['name']}.")
    fields = await _card_fields(caller, form.fields, altered, record)
    if isinstance(fields, Refused):
        return fields
    return Card(title=f"Save changes to {record['name']}?", fields=list(fields.values()))


async def _add(caller: Caller, form: Form, arguments: Arguments) -> Done | Refused:
    reply = await caller.post(form.adds, arguments.model_dump(mode="json"))
    if not reply.ok:
        return Refused.from_reply(reply)
    added = reply.data
    return Done(data=added, words=f"Added {added['name']}.", link=form.page(added["id"]))


async def _save(caller: Caller, form: Form, record_id: int, given: dict[str, Any]) -> Done | Refused:
    reply = await caller.patch(Caller.path(form.edits, record_id), given)
    if not reply.ok:
        return Refused.from_reply(reply)
    saved = reply.data
    return Done(data=saved, words=f"Saved changes to {saved['name']}.", link=form.page(saved["id"]))


NAME = Shown("name", "Name")
ORGANIZATION_LINK = Shown("organization_id", "Organization", link=ORGANIZATION)
CONTACT_LINK = Shown("contact_id", "Contact", link=CONTACT)
DEAL_LINK = Shown("deal_id", "Deal", link=DEAL)

ORGANIZATION_FORM = Form(
    word="organization",
    adds="/api/organizations",
    edits=ORGANIZATION,
    fields=(NAME, Shown("website", "Website"), Shown("industry", "Industry"), Shown("notes", "Notes")),
)
CONTACT_FORM = Form(
    word="contact",
    adds="/api/contacts",
    edits=CONTACT,
    fields=(
        NAME,
        ORGANIZATION_LINK,
        Shown("email", "Email"),
        Shown("phone", "Phone"),
        Shown("job_title", "Job title"),
        Shown("status", "Status", words=STATUS_NAMES.__getitem__),
    ),
)
DEAL_FORM = Form(
    word="deal",
    adds="/api/deals",
    edits=DEAL,
    fields=(
        NAME,
        ORGANIZATION_LINK,
        Shown("main_contact_id", "Main contact", link=CONTACT),
        Shown("stage", "Stage", words=STAGE_NAMES.__getitem__),
        Shown("value", "Value", "money", dollars),
        Shown("probability", "Probability", "percent", percent),
        Shown("close_date", "Close date", "date", day),
    ),
)

Status = Literal["lead", "qualified", "customer"]
Probability = Annotated[StrictInt, Field(ge=0, le=100, description="A whole percent, from 0 to 100")]


class AddOrganizationArguments(Arguments):
    name: api.Name
    website: api.Website = None
    industry: api.OptionalText = None
    notes: api.OptionalText = None


class EditOrganizationArguments(Arguments):
    id: RecordId = Field(description="The organization's id")
    name: api.Name | MISSING = MISSING
    website: api.Website | MISSING = MISSING
    industry: api.OptionalText | MISSING = MISSING
    notes: api.OptionalText | MISSING = MISSING


class AddContactArguments(Arguments):
    name: api.Name
    organization_id: RecordId = Field(description="The id of the organization they work for")
    email: api.Email = None
    phone: api.OptionalText = None
    job_title: api.OptionalText = None
    status: Status = "lead"


class EditContactArguments(Arguments):
    id: RecordId = Field(description="The contact's id")
    name: api.Name | MISSING = MISSING
    organization_id: RecordId | MISSING = MISSING
    email: api.Email | MISSING = MISSING
    phone: api.OptionalText | MISSING = MISSING
    job_title: api.OptionalText | MISSING = MISSING
    status: Status | MISSING = MISSING


class AddDealArguments(Arguments):
    name: api.Name
    organization_id: RecordId
    main_contact_id: RecordId
    stage: Stage = "new"
    value: api.Dollars = Field(description="Whole dollars")
    probability: Probability | None = None
    close_date: date


# Every field of the deal's but its stage, which only move_deal changes (Z11). A docstring here would reach the model.
class EditDealArguments(Arguments):
    id: RecordId = Field(description="The deal's id")
    name: api.Name | MISSING = MISSING
    organization_id: RecordId | MISSING = MISSING
    main_contact_id: RecordId | MISSING = MISSING
    value: api.Dollars | MISSING = MISSING
    probability: Probability | MISSING = MISSING
    close_date: date | MISSING = MISSING


async def _new_deal_card(caller: Caller, arguments: AddDealArguments) -> Card | Refused:
    """With the probability the deal will get, and S8's new customer for a deal added at Won."""
    given = _new_values(arguments)
    if arguments.probability is None:
        usual = await _usual_probability(caller, arguments.stage)
        if isinstance(usual, Refused):
            return usual
        given["probability"] = usual
    card = await _new_card(caller, DEAL_FORM, given)
    if isinstance(card, Refused) or arguments.stage != "won":
        return card
    customer = await _new_customer(caller, given)
    return card if customer is None else replace(card, note=f"{customer} becomes a customer.")


async def _usual_probability(caller: Caller, stage: str) -> int | Refused:
    """The stage's usual probability, which a new deal gets unless it's given one."""
    reply = await caller.get(META)
    if not reply.ok:
        return Refused.from_reply(reply)
    return next(each["probability"] for each in reply.data["stages"] if each["key"] == stage)


ADD_ORGANIZATION = Tool(
    name="add_organization",
    description="Add an organization. Only its name is needed.",
    arguments=AddOrganizationArguments,
    kind="change",
    routes=(Route("POST", ORGANIZATION_FORM.adds),),
    running=lambda arguments: "Adding the organization",
    run=lambda caller, arguments: _add(caller, ORGANIZATION_FORM, arguments),
    button="Add organization",
    card=lambda caller, arguments: _new_card(caller, ORGANIZATION_FORM, _new_values(arguments)),
)

EDIT_ORGANIZATION = Tool(
    name="edit_organization",
    description=(
        "Change an organization's details. Give only the fields to change. Null clears a website, industry or notes."
    ),
    arguments=EditOrganizationArguments,
    kind="change",
    routes=(Route("GET", ORGANIZATION), Route("PATCH", ORGANIZATION)),
    running=lambda arguments: "Saving the organization",
    run=lambda caller, arguments: _save(caller, ORGANIZATION_FORM, arguments.id, _edited_values(arguments)),
    button="Save organization",
    card=lambda caller, arguments: _edit_card(caller, ORGANIZATION_FORM, arguments.id, _edited_values(arguments)),
)

ADD_CONTACT = Tool(
    name="add_contact",
    description="Add a contact at an organization. Their status is lead unless it's given.",
    arguments=AddContactArguments,
    kind="change",
    routes=(Route("GET", ORGANIZATION), Route("POST", CONTACT_FORM.adds)),
    running=lambda arguments: "Adding the contact",
    run=lambda caller, arguments: _add(caller, CONTACT_FORM, arguments),
    button="Add contact",
    card=lambda caller, arguments: _new_card(caller, CONTACT_FORM, _new_values(arguments)),
)

EDIT_CONTACT = Tool(
    name="edit_contact",
    description=(
        "Change a contact's details. Give only the fields to change. Null clears an email, phone or job title. "
        "Their organization can be changed but not cleared."
    ),
    arguments=EditContactArguments,
    kind="change",
    routes=(Route("GET", CONTACT), Route("GET", ORGANIZATION), Route("PATCH", CONTACT)),
    running=lambda arguments: "Saving the contact",
    run=lambda caller, arguments: _save(caller, CONTACT_FORM, arguments.id, _edited_values(arguments)),
    button="Save contact",
    card=lambda caller, arguments: _edit_card(caller, CONTACT_FORM, arguments.id, _edited_values(arguments)),
)

ADD_DEAL = Tool(
    name="add_deal",
    description=(
        "Add a deal for an organization, with its main contact, at a stage, new unless it's given. "
        "Its probability is the stage's usual one unless it's given."
    ),
    arguments=AddDealArguments,
    kind="change",
    routes=(
        Route("GET", ORGANIZATION),
        Route("GET", CONTACT),
        Route("GET", META),
        Route("POST", DEAL_FORM.adds),
    ),
    running=lambda arguments: "Adding the deal",
    run=lambda caller, arguments: _add(caller, DEAL_FORM, arguments),
    button="Add deal",
    card=_new_deal_card,
)

EDIT_DEAL = Tool(
    name="edit_deal",
    description="Change a deal's details, but not its stage, which move_deal changes. Give only the fields to change.",
    arguments=EditDealArguments,
    kind="change",
    routes=(Route("GET", DEAL), Route("GET", ORGANIZATION), Route("GET", CONTACT), Route("PATCH", DEAL)),
    running=lambda arguments: "Saving the deal",
    run=lambda caller, arguments: _save(caller, DEAL_FORM, arguments.id, _edited_values(arguments)),
    button="Save deal",
    card=lambda caller, arguments: _edit_card(caller, DEAL_FORM, arguments.id, _edited_values(arguments)),
)

# Adding an activity, on one contact or one deal (A1)

ActivityType = Literal["note", "call", "email"]
A_TYPE = {"note": "a note", "call": "a call", "email": "an email"}
ON_ONE_RECORD = "Give contact_id or deal_id, not both"
ACTIVITY_FIELDS = (
    Shown("type", "Type", words=TYPE_NAMES.__getitem__),
    CONTACT_LINK,
    DEAL_LINK,
    Shown("description", "Description"),
    Shown("follow_up_date", "Follow-up date", "date", day),
)


class AddActivityArguments(Arguments):
    contact_id: RecordId | None = Field(None, description="The contact it's on, for an activity not on a deal")
    deal_id: RecordId | None = Field(None, description="The deal it's on, for an activity not on a contact")
    type: ActivityType = "note"
    description: api.Description
    follow_up_date: date | None = Field(None, description="When something needs doing next, if anything does")

    @model_validator(mode="after")
    def _on_one_record(self) -> Self:
        if (self.contact_id is None) == (self.deal_id is None):
            raise ValueError(ON_ONE_RECORD)
        return self

    @property
    def on(self) -> tuple[Shown, int]:
        """The field linking to the record it's on, and that record's id."""
        if self.contact_id is not None:
            return CONTACT_LINK, self.contact_id
        if self.deal_id is not None:
            return DEAL_LINK, self.deal_id
        raise ValueError(ON_ONE_RECORD)


async def _activity_card(caller: Caller, arguments: AddActivityArguments) -> Card | Refused:
    fields = await _card_fields(caller, ACTIVITY_FIELDS, _new_values(arguments))
    if isinstance(fields, Refused):
        return fields
    link, _ = arguments.on
    on = fields[link.key].after
    return Card(title=f"Add {A_TYPE[arguments.type]} on {on}?", fields=list(fields.values()))


async def _add_activity(caller: Caller, arguments: AddActivityArguments) -> Done | Refused:
    """Reads the name of the record it's on first, so one that's gone is refused before anything is written."""
    link, record_id = arguments.on
    on = await link.after(caller, record_id)
    if isinstance(on, Refused):
        return on
    reply = await caller.post(ACTIVITIES, arguments.model_dump(mode="json"))
    if not reply.ok:
        return Refused.from_reply(reply)
    return Done(data=reply.data, words=f"Added {A_TYPE[arguments.type]} on {on}.", link=_page_of(reply.data))


ADD_ACTIVITY = Tool(
    name="add_activity",
    description="Log a note, call or email on one contact or one deal, with a follow-up date if something needs doing.",
    arguments=AddActivityArguments,
    kind="change",
    routes=(Route("GET", CONTACT), Route("GET", DEAL), Route("POST", ACTIVITIES)),
    running=lambda arguments: f"Adding {A_TYPE[arguments.type]}",
    run=_add_activity,
    button="Add activity",
    card=_activity_card,
)

# Marking a follow-up done (A3)

NOT_WAITING = "There's no follow-up waiting to be done with that id. It may be done already."


class MarkDoneArguments(Arguments):
    id: RecordId = Field(description="The activity's id, as the dashboard's follow-ups and the timelines give it")


async def _waiting(caller: Caller, activity_id: int) -> dict[str, Any] | Refused:
    """The follow-up as the dashboard lists it, which lists every one not yet done (H6)."""
    reply = await caller.get(DASHBOARD)
    if not reply.ok:
        return Refused.from_reply(reply)
    found = [item for item in reply.data["follow_ups"]["items"] if item["id"] == activity_id]
    return found[0] if found else Refused(NOT_WAITING)


async def _mark_done_card(caller: Caller, arguments: MarkDoneArguments) -> Card | Refused:
    follow_up = await _waiting(caller, arguments.id)
    if isinstance(follow_up, Refused):
        return follow_up
    due = f"Due {day(follow_up['follow_up_date'])}"
    return Card(
        title=f'Mark "{follow_up["description"]}" done?',
        fields=[CardField(name="Follow-up", now=due, after="Done", kind="text")],
    )


async def _mark_done(caller: Caller, arguments: MarkDoneArguments) -> Done | Refused:
    """Done alone, as the tick box sends it, so nothing else about the activity changes (A3)."""
    reply = await caller.patch(Caller.path(ACTIVITY, arguments.id), {"follow_up_done": True})
    if not reply.ok:
        return Refused.from_reply(reply)
    activity = reply.data
    return Done(data=activity, words=f'Marked "{activity["description"]}" done.', link=_page_of(activity))


def _page_of(activity: dict[str, Any]) -> str | None:
    """The page of the deal or contact an activity is on, since an activity has no page of its own."""
    if activity["deal_id"] is not None:
        return f"/deals/{activity['deal_id']}"
    if activity["contact_id"] is not None:
        return f"/contacts/{activity['contact_id']}"
    return None


MARK_FOLLOW_UP_DONE = Tool(
    name="mark_follow_up_done",
    description="Mark a follow-up done, by its activity's id.",
    arguments=MarkDoneArguments,
    kind="change",
    routes=(Route("GET", DASHBOARD), Route("PATCH", ACTIVITY)),
    running=lambda arguments: "Marking the follow-up done",
    run=_mark_done,
    button="Mark done",
    card=_mark_done_card,
)

CHANGES: list[Tool[Any]] = [
    MOVE_DEAL,
    ADD_ORGANIZATION,
    EDIT_ORGANIZATION,
    ADD_CONTACT,
    EDIT_CONTACT,
    ADD_DEAL,
    EDIT_DEAL,
    ADD_ACTIVITY,
    MARK_FOLLOW_UP_DONE,
]
