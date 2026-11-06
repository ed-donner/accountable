"""The CRM's request and reply models, and the messages for its fields."""

from datetime import UTC, date, datetime
from typing import Annotated, Literal

from pydantic import MISSING, AfterValidator, BaseModel, Field, StrictBool, StrictInt

from accountable import api
from accountable.holds import Holding
from accountable.users import Person
from accountable.who import Authorship

Stage = Literal["new", "qualified", "proposal", "negotiation", "won", "lost"]
Status = Literal["lead", "qualified", "customer"]
ActivityType = Literal["note", "call", "email"]

FIELD_MESSAGES = {
    "name": api.NAME_MESSAGE,
    "organization_id": "Choose an organization",
    "main_contact_id": "Choose a main contact",
    "stage": "Choose a stage",
    "status": "Choose a status",
    "value": "Enter a whole number of dollars, zero or more",
    "probability": "Enter a whole number from 0 to 100",
    "close_date": "Choose a close date",
    "type": "Choose a type",
    "description": api.DESCRIPTION_MESSAGE,
    "occurred_at": "Choose when it happened",
    "follow_up_date": "Enter a valid date",
}


def _to_utc(value: datetime) -> datetime:
    """Stored in UTC with no zone. A time sent with no zone is read as UTC."""
    if value.tzinfo is None:
        return value
    try:
        return value.astimezone(UTC).replace(tzinfo=None)
    except OverflowError as error:  # The very first or last day there is, moved past the calendar's end.
        raise ValueError(FIELD_MESSAGES["occurred_at"]) from error


Probability = Annotated[StrictInt, Field(ge=0, le=100)]
IncomingTime = Annotated[datetime, AfterValidator(_to_utc)]


# Organizations


class OrganizationCreate(api.Request):
    name: api.Name
    website: api.Website = None
    industry: api.OptionalText = None
    notes: api.OptionalText = None


class OrganizationUpdate(api.Request):
    name: api.Name | MISSING = MISSING
    website: api.Website = None
    industry: api.OptionalText = None
    notes: api.OptionalText = None


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
    last_activity: api.UtcTime | None


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
    held_by: list[Holding]


# Contacts


class ContactCreate(api.Request):
    name: api.Name
    organization_id: api.Id
    email: api.Email = None
    phone: api.OptionalText = None
    job_title: api.OptionalText = None
    status: Status = "lead"


class ContactUpdate(api.Request):
    name: api.Name | MISSING = MISSING
    organization_id: api.Id | None = None
    email: api.Email = None
    phone: api.OptionalText = None
    job_title: api.OptionalText = None
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
    last_activity: api.UtcTime | None


class ContactDetail(Contact, Authorship):
    deals: list[LinkedDeal]


class ContactImpact(BaseModel):
    deals: int
    activities: int


# Deals


class DealCreate(api.Request):
    name: api.Name
    organization_id: api.Id
    main_contact_id: api.Id
    stage: Stage = "new"
    value: api.Dollars
    probability: Probability | None = None
    close_date: date | None = None


class DealUpdate(api.Request):
    name: api.Name | MISSING = MISSING
    organization_id: api.Id | None = None
    main_contact_id: api.Id | None = None
    stage: Stage | MISSING = MISSING
    value: api.Dollars | MISSING = MISSING
    probability: Probability | MISSING = MISSING
    close_date: date | MISSING = MISSING


class DealMove(api.Request):
    stage: Stage
    before_deal_id: api.Id | None = None


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
    held_by: list[Holding]


# Activities and timelines


class ActivityCreate(api.Request):
    type: ActivityType = "note"
    contact_id: api.Id | None = None
    deal_id: api.Id | None = None
    description: api.Description
    occurred_at: IncomingTime | None = None
    follow_up_date: date | None = None
    follow_up_done: StrictBool = False


class ActivityUpdate(api.Request):
    type: ActivityType | MISSING = MISSING
    description: api.Description | MISSING = MISSING
    occurred_at: IncomingTime | MISSING = MISSING
    follow_up_date: date | None = None
    follow_up_done: StrictBool | MISSING = MISSING


class Activity(BaseModel):
    id: int
    type: str
    contact_id: int | None
    deal_id: int | None
    description: str
    occurred_at: api.UtcTime
    follow_up_date: date | None
    follow_up_done: bool


class About(BaseModel):
    kind: Literal["contact", "deal"]
    id: int
    name: str


class TimelineEntry(BaseModel):
    kind: Literal["activity", "stage_change"]
    id: int
    at: api.UtcTime
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
