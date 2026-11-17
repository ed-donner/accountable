"""Request and response models, field rules and their plain messages (V1, V2, V4).

The frontend's copies of these messages live in frontend/src/shared/validation.ts.
"""

import re
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict

from app.rules import ActivityType, Stage, Status

# --- Field messages -------------------------------------------------------

MESSAGES = {
    "name": "Enter a name.",
    "email": "Enter an email address like name@company.com.",
    "website": "Enter a website like company.com.",
    "organization_id": "Choose an organization.",
    "contact_id": "Choose a contact.",
    "deal_id": "Choose a deal.",
    "stage": "Choose a stage.",
    "status": "Choose lead, qualified or customer.",
    "value": "Enter a value of 0 or more, in whole dollars.",
    "probability": "Enter a probability from 0 to 100.",
    "close_date": "Enter a close date.",
    "type": "Choose note, call or email.",
    "description": "Enter a description.",
    "occurred_on": "Enter the date it happened.",
    "follow_up_on": "Enter a follow-up date.",
    "done": "Only a follow-up can be marked done.",
    "before_id": "Choose where to put the deal.",
    "after_id": "Choose where to put the deal.",
}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
WEBSITE_RE = re.compile(r"^https?://[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(/\S*)?$", re.IGNORECASE)


class FieldErrors(Exception):
    """A 400 with a message per field."""

    def __init__(self, fields: dict[str, str], message: str = "Check the highlighted fields and try again."):
        super().__init__(message)
        self.fields = fields
        self.message = message


class NotFound(Exception):
    """A 404 naming the kind of record."""

    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


# --- Field types ----------------------------------------------------------


def _required(field: str):
    def check(v: Any) -> Any:
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError(MESSAGES[field])
        return v.strip() if isinstance(v, str) else v

    return check


def _blank_to_none(v: Any) -> Any:
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def _email(v: Any) -> Any:
    v = _blank_to_none(v)
    if v is not None and not EMAIL_RE.match(str(v)):
        raise ValueError(MESSAGES["email"])
    return v


def normalize_website(v: Any) -> Any:
    v = _blank_to_none(v)
    if v is None:
        return None
    v = str(v)
    if not re.match(r"^https?://", v, re.IGNORECASE):
        v = "https://" + v
    if not WEBSITE_RE.match(v):
        raise ValueError(MESSAGES["website"])
    return v


def _whole_number(field: str, low: int, high: int | None = None):
    def check(v: Any) -> Any:
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError(MESSAGES[field])
        try:
            number = float(str(v).replace(",", "").replace("$", "").strip())
        except ValueError:
            raise ValueError(MESSAGES[field]) from None
        if number != int(number) or number < low or (high is not None and number > high):
            raise ValueError(MESSAGES[field])
        return int(number)

    return check


def _blank_date(v: Any) -> Any:
    return _blank_to_none(v)


Name = Annotated[str, BeforeValidator(_required("name"))]
OptionalText = Annotated[str | None, BeforeValidator(_blank_to_none)]
Email = Annotated[str | None, BeforeValidator(_email)]
Website = Annotated[str | None, BeforeValidator(normalize_website)]
OptionalDate = Annotated[date | None, BeforeValidator(_blank_date)]
Value = Annotated[int, BeforeValidator(_whole_number("value", 0))]
Probability = Annotated[int, BeforeValidator(_whole_number("probability", 0, 100))]
RequiredStage = Annotated[Stage, BeforeValidator(_required("stage"))]
RequiredStatus = Annotated[Status, BeforeValidator(_required("status"))]
RequiredType = Annotated[ActivityType, BeforeValidator(_required("type"))]
Description = Annotated[str, BeforeValidator(_required("description"))]
OccurredOn = Annotated[date, BeforeValidator(_required("occurred_on"))]
OrganizationRequired = Annotated[int, BeforeValidator(_required("organization_id"))]


class In(BaseModel):
    model_config = ConfigDict(extra="ignore")


# --- Shared ---------------------------------------------------------------


class Health(BaseModel):
    status: str


class Ref(BaseModel):
    id: int
    name: str


class ErrorBody(BaseModel):
    message: str
    fields: dict[str, str] = {}


# --- Organizations --------------------------------------------------------


class OrganizationCreate(In):
    name: Name
    website: Website = None
    industry: OptionalText = None
    notes: OptionalText = None


class OrganizationUpdate(In):
    name: Name = None  # type: ignore[assignment]
    website: Website = None
    industry: OptionalText = None
    notes: OptionalText = None


class Organization(BaseModel):
    id: int
    name: str
    website: str | None
    industry: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class OrganizationRow(Organization):
    contact_count: int
    open_deal_count: int
    open_value: int


class OrganizationList(BaseModel):
    items: list[OrganizationRow]
    total: int


class OrganizationImpact(BaseModel):
    name: str
    contacts: int
    deals: int


# --- Contacts -------------------------------------------------------------


class ContactCreate(In):
    name: Name
    email: Email = None
    phone: OptionalText = None
    job_title: OptionalText = None
    organization_id: int | None = None
    status: RequiredStatus = "lead"


class ContactUpdate(In):
    name: Name = None  # type: ignore[assignment]
    email: Email = None
    phone: OptionalText = None
    job_title: OptionalText = None
    organization_id: int | None = None
    status: RequiredStatus = None  # type: ignore[assignment]


class Contact(BaseModel):
    id: int
    name: str
    email: str | None
    phone: str | None
    job_title: str | None
    organization_id: int | None
    status: Status
    created_at: datetime
    updated_at: datetime


class ContactRow(Contact):
    organization_name: str | None
    last_activity_on: date | None


class StatusCounts(BaseModel):
    all: int
    lead: int
    qualified: int
    customer: int


class ContactList(BaseModel):
    items: list[ContactRow]
    total: int
    status_counts: StatusCounts


class ContactImpact(BaseModel):
    name: str
    deals: int
    activities: int


# --- Deals ----------------------------------------------------------------


class DealCreate(In):
    name: Name
    organization_id: OrganizationRequired
    contact_id: int | None = None
    stage: RequiredStage = "new"
    value: Value
    probability: Probability | None = None
    close_date: OptionalDate = None


class DealUpdate(In):
    name: Name = None  # type: ignore[assignment]
    organization_id: int | None = None
    contact_id: int | None = None
    stage: RequiredStage = None  # type: ignore[assignment]
    value: Value = None  # type: ignore[assignment]
    probability: Probability = None  # type: ignore[assignment]
    close_date: OptionalDate = None


class Deal(BaseModel):
    id: int
    name: str
    organization_id: int | None
    contact_id: int | None
    stage: Stage
    value: int
    probability: int
    close_date: date | None
    position: float
    expected_revenue: int
    is_late: bool
    created_at: datetime
    updated_at: datetime


class DealRow(Deal):
    organization_name: str | None
    contact_name: str | None


class DealList(BaseModel):
    items: list[DealRow]
    total: int


class DealImpact(BaseModel):
    name: str
    activities: int
    stage_changes: int


class DealMove(In):
    stage: RequiredStage
    before_id: int | None = None
    after_id: int | None = None


# --- Organization and contact pages ---------------------------------------


class OrganizationDetail(Organization):
    contacts: list[ContactRow]
    deals: list[DealRow]


class ContactDetail(Contact):
    organization: Ref | None
    deals: list[DealRow]


# --- Activities and timelines ---------------------------------------------

FollowUpStatus = Literal["overdue", "upcoming", "later", "done"]


class ActivityCreate(In):
    type: RequiredType
    description: Description
    occurred_on: OccurredOn
    contact_id: int | None = None
    deal_id: int | None = None
    follow_up_on: OptionalDate = None
    done: bool = False


class ActivityUpdate(In):
    type: RequiredType = None  # type: ignore[assignment]
    description: Description = None  # type: ignore[assignment]
    occurred_on: OccurredOn = None  # type: ignore[assignment]
    follow_up_on: OptionalDate = None
    done: bool = None  # type: ignore[assignment]


class Activity(BaseModel):
    id: int
    type: ActivityType
    description: str
    occurred_on: date
    contact_id: int | None
    deal_id: int | None
    follow_up_on: date | None
    done: bool
    follow_up_status: FollowUpStatus | None
    created_at: datetime
    updated_at: datetime


class TimelineEntry(BaseModel):
    kind: Literal["activity", "stage_change"]
    id: int
    on: date
    at: datetime
    text: str
    type: ActivityType | None = None
    description: str | None = None
    occurred_on: date | None = None
    follow_up_on: date | None = None
    done: bool = False
    follow_up_status: FollowUpStatus | None = None
    from_stage: Stage | None = None
    to_stage: Stage | None = None
    contact_id: int | None = None
    deal: Ref | None = None


class Timeline(BaseModel):
    items: list[TimelineEntry]


# --- Dashboard ------------------------------------------------------------


class Headline(BaseModel):
    open_value: int
    open_count: int
    expected_revenue: int
    won_this_month_value: int
    won_this_month_count: int
    follow_ups_due: int
    follow_ups_overdue: int


class MonthFigure(BaseModel):
    month: str
    won_value: int
    won_count: int
    lost_count: int


class StageFigure(BaseModel):
    stage: Stage
    count: int
    value: int
    expected_revenue: int


class FunnelStep(BaseModel):
    stage: Stage
    count: int
    value: int
    share_of_previous: float | None


class RecentItem(BaseModel):
    kind: Literal["activity", "stage_change"]
    id: int
    on: date
    at: datetime
    text: str
    type: ActivityType | None
    contact: Ref | None
    deal: Ref | None


class FollowUp(BaseModel):
    id: int
    type: ActivityType
    description: str
    follow_up_on: date
    status: Literal["overdue", "upcoming"]
    contact: Ref | None
    deal: Ref | None


class Dashboard(BaseModel):
    today: date
    headline: Headline
    months: list[MonthFigure]
    pipeline: list[StageFigure]
    funnel: list[FunnelStep]
    recent: list[RecentItem]
    follow_ups: list[FollowUp]
