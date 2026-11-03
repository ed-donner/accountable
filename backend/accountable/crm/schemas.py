"""Pydantic request and reply models, the request parameters the routes share, and the plain-English messages for bad input."""

import re
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from fastapi import Depends, Path, Query
from pydantic import (
    MISSING,
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    StrictBool,
    StrictInt,
    field_validator,
)

from accountable import db
from accountable.users import Person

Stage = Literal["new", "qualified", "proposal", "negotiation", "won", "lost"]
Status = Literal["lead", "qualified", "customer"]
ActivityType = Literal["note", "call", "email"]

MAX_VALUE = 1_000_000_000_000
# The largest id both databases can hold: Postgres's integer columns stop here,
# well before SQLite's. A query given a bigger one crashes instead of finding nothing.
MAX_ID = 2**31 - 1

FIELD_MESSAGES = {
    "name": "Enter a name",
    "organization_id": "Choose an organization",
    "main_contact_id": "Choose a main contact",
    "stage": "Choose a stage",
    "status": "Choose a status",
    "value": "Enter a whole number of dollars, zero or more",
    "probability": "Enter a whole number from 0 to 100",
    "close_date": "Choose a close date",
    "type": "Choose a type",
    "description": "Enter a description",
    "occurred_at": "Choose when it happened",
    "follow_up_date": "Enter a valid date",
}


class FieldError(Exception):
    """A rule that needs the database to check, reported beside its field."""

    def __init__(self, fields: dict[str, str]):
        super().__init__("Check the form.")
        self.fields = fields


def field_messages(errors: Iterable[Mapping[str, Any]]) -> dict[str, str]:
    fields: dict[str, str] = {}
    for error in errors:
        location = error["loc"]
        field = str(location[1]) if len(location) > 1 else "body"
        if error["type"] == "value_error":
            fields.setdefault(field, str(error["ctx"]["error"]))
        else:
            fields.setdefault(field, FIELD_MESSAGES.get(field, "Check this field"))
    return fields


def _name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(FIELD_MESSAGES["name"])
    return value


def _description(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(FIELD_MESSAGES["description"])
    return value


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _email(value: str | None) -> str | None:
    value = _blank_to_none(value)
    if value is not None and not EMAIL.match(value):
        raise ValueError("Enter a valid email address")
    return value


HAS_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*:(?!\d)", re.IGNORECASE)
WEBSITE_MESSAGE = "Enter a website address, such as https://example.com"


def _website(value: str | None) -> str | None:
    value = _blank_to_none(value)
    if value is None:
        return None
    if not HAS_SCHEME.match(value):
        value = f"https://{value}"
    try:
        parts = urlsplit(value)
        port_is_fine = parts.port is None or parts.port >= 0  # Reading it is what checks it.
    except ValueError as error:
        raise ValueError(WEBSITE_MESSAGE) from error
    if (
        parts.scheme.lower() not in ("http", "https")
        or not parts.hostname
        or not port_is_fine
        or re.search(r"\s", value)
    ):
        raise ValueError(WEBSITE_MESSAGE)
    return value


def _to_utc(value: datetime) -> datetime:
    """Stored in UTC with no zone. A time sent with no zone is read as UTC."""
    if value.tzinfo is None:
        return value
    try:
        return value.astimezone(UTC).replace(tzinfo=None)
    except OverflowError as error:  # The very first or last day there is, moved past the calendar's end.
        raise ValueError(FIELD_MESSAGES["occurred_at"]) from error


def _with_z(value: datetime) -> str:
    """SQLite stores no zone, so without this the browser would read UTC as local."""
    return value.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")


Name = Annotated[str, AfterValidator(_name)]
Description = Annotated[str, AfterValidator(_description)]
OptionalText = Annotated[str | None, AfterValidator(_blank_to_none)]
Email = Annotated[str | None, AfterValidator(_email)]
Website = Annotated[str | None, AfterValidator(_website)]
Id = Annotated[int, Field(ge=1, le=MAX_ID)]
PathId = Annotated[int, Path(ge=1, le=MAX_ID)]
PageLimit = Annotated[int, Query(ge=1, le=500)]
PageOffset = Annotated[int, Query(ge=0, le=MAX_ID)]
# Asked for per request, so tests can fix them.
Today = Annotated[date, Depends(db.local_today)]
Now = Annotated[datetime, Depends(db.utc_now)]
Dollars = Annotated[StrictInt, Field(ge=0, le=MAX_VALUE)]
Probability = Annotated[StrictInt, Field(ge=0, le=100)]
IncomingTime = Annotated[datetime, AfterValidator(_to_utc)]
UtcTime = Annotated[datetime, PlainSerializer(_with_z, return_type=str)]


class Request(BaseModel):
    """What a form sends. In an update, MISSING marks a field that wasn't sent, which keeps its value.

    Who added or changed a record comes from the token, so a body naming someone
    has it ignored, like any other field a form doesn't send.
    """

    model_config = ConfigDict(extra="ignore")

    @field_validator("*")
    @classmethod
    def _storable(cls, value: Any) -> Any:
        if isinstance(value, str) and not _is_storable(value):
            raise ValueError("Use plain text here")
        return value


def _is_storable(text: str) -> bool:
    """JSON can carry text a database can't store, which would crash the save: a
    character with no valid encoding, or a NUL, which Postgres refuses in text."""
    if "\x00" in text:
        return False
    if text.isascii():
        return True
    try:
        text.encode()
    except UnicodeEncodeError:
        return False
    return True


class Authorship(BaseModel):
    """Who added the record and who last changed it, and when. Nobody, on records from before sign-in."""

    created_at: UtcTime
    created_by: Person | None
    updated_at: UtcTime
    updated_by: Person | None


# Organizations


class OrganizationCreate(Request):
    name: Name
    website: Website = None
    industry: OptionalText = None
    notes: OptionalText = None


class OrganizationUpdate(Request):
    name: Name | MISSING = MISSING
    website: Website = None
    industry: OptionalText = None
    notes: OptionalText = None


class Organization(BaseModel):
    id: int
    name: str
    website: str | None
    industry: str | None
    notes: str | None


class OrganizationRow(Organization):
    contact_count: int
    open_deal_count: int
    open_value: int
    last_activity: UtcTime | None


class LinkedContact(BaseModel):
    id: int
    name: str
    job_title: str | None
    status: str


class LinkedDeal(BaseModel):
    id: int
    name: str
    stage: str
    value: int
    close_date: date


class OrganizationDetail(Organization, Authorship):
    contacts: list[LinkedContact]
    deals: list[LinkedDeal]


class OrganizationImpact(BaseModel):
    contacts: int
    deals: int


# Contacts


class ContactCreate(Request):
    name: Name
    organization_id: Id
    email: Email = None
    phone: OptionalText = None
    job_title: OptionalText = None
    status: Status = "lead"


class ContactUpdate(Request):
    name: Name | MISSING = MISSING
    organization_id: Id | None = None
    email: Email = None
    phone: OptionalText = None
    job_title: OptionalText = None
    status: Status | MISSING = MISSING


class Contact(BaseModel):
    id: int
    name: str
    email: str | None
    phone: str | None
    job_title: str | None
    organization_id: int | None
    organization_name: str | None
    status: str


class ContactRow(Contact):
    last_activity: UtcTime | None


class ContactDetail(Contact, Authorship):
    deals: list[LinkedDeal]


class ContactImpact(BaseModel):
    deals: int
    activities: int


# Deals


class DealCreate(Request):
    name: Name
    organization_id: Id
    main_contact_id: Id
    stage: Stage = "new"
    value: Dollars
    probability: Probability | None = None
    close_date: date | None = None


class DealUpdate(Request):
    name: Name | MISSING = MISSING
    organization_id: Id | None = None
    main_contact_id: Id | None = None
    stage: Stage | MISSING = MISSING
    value: Dollars | MISSING = MISSING
    probability: Probability | MISSING = MISSING
    close_date: date | MISSING = MISSING


class DealMove(Request):
    stage: Stage
    before_deal_id: Id | None = None


class Deal(BaseModel):
    id: int
    name: str
    organization_id: int | None
    organization_name: str | None
    main_contact_id: int | None
    main_contact_name: str | None
    stage: str
    value: int
    probability: int
    expected_revenue: int
    close_date: date
    position: int


class DealDetail(Deal, Authorship):
    pass


class MoveChanges(BaseModel):
    close_date: date | None
    new_customer: str | None


class MoveResult(BaseModel):
    deal: Deal
    changes: MoveChanges


class DealImpact(BaseModel):
    activities: int
    stage_changes: int
    won: bool
    value: int


# Activities and timelines


class ActivityCreate(Request):
    type: ActivityType = "note"
    contact_id: Id | None = None
    deal_id: Id | None = None
    description: Description
    occurred_at: IncomingTime | None = None
    follow_up_date: date | None = None
    follow_up_done: StrictBool = False


class ActivityUpdate(Request):
    type: ActivityType | MISSING = MISSING
    description: Description | MISSING = MISSING
    occurred_at: IncomingTime | MISSING = MISSING
    follow_up_date: date | None = None
    follow_up_done: StrictBool | MISSING = MISSING


class Activity(BaseModel):
    id: int
    type: str
    contact_id: int | None
    deal_id: int | None
    description: str
    occurred_at: UtcTime
    follow_up_date: date | None
    follow_up_done: bool


class About(BaseModel):
    kind: Literal["contact", "deal"]
    id: int
    name: str


class TimelineEntry(BaseModel):
    kind: Literal["activity", "stage_change"]
    id: int
    at: UtcTime
    type: str | None
    description: str
    follow_up_date: date | None
    follow_up_done: bool
    about: About
    created_by: Person | None


class Timeline(BaseModel):
    entries: list[TimelineEntry]
    total: int


# Dashboard


class MonthFigures(BaseModel):
    month: str
    label: str
    revenue: int
    deals: int


class BandStage(BaseModel):
    stage: str
    value: int
    count: int


class FunnelStage(BaseModel):
    stage: str
    value: int
    carried: int | None


class FollowUp(BaseModel):
    id: int
    description: str
    follow_up_date: date
    overdue: bool
    about: About


class FollowUps(BaseModel):
    overdue: int
    upcoming: int
    items: list[FollowUp]


class Dashboard(BaseModel):
    today: date
    overdue_follow_ups: int
    late_deals: int
    revenue_this_month: int
    revenue_last_month: int
    deals_won_this_month: int
    deals_won_last_month: int
    open_pipeline: int
    open_deals: int
    expected_revenue: int
    expected_share: int
    months: list[MonthFigures]
    band: list[BandStage]
    funnel: list[FunnelStage]
    follow_ups: FollowUps
    recent: list[TimelineEntry]
