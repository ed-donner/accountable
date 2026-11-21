"""Pydantic models for every request and answer.

Field messages match the browser's Zod schemas (frontend/src/components/forms/schemas.ts),
so a problem reads the same whichever side finds it.
"""

import re
from datetime import UTC, date, datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, BeforeValidator, ConfigDict, PlainSerializer, model_validator
from pydantic_core import PydanticCustomError

Stage = Literal["new", "qualified", "proposal", "negotiation", "won", "lost"]
Status = Literal["lead", "qualified", "customer"]
LoggableType = Literal["note", "call", "email"]
ActivityType = Literal["note", "call", "email", "stage_change"]

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
EMAIL_MESSAGE = "Enter an email address, such as sarah@bluefin.example"
MAX_VALUE = 100_000_000


def _utc_text(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


# A UTC date-time that is always written with a Z, such as 2026-11-10T15:15:00Z.
UtcDateTime = Annotated[datetime, PlainSerializer(_utc_text, return_type=str)]


def _error(message: str):
    return PydanticCustomError("value_error", "{message}", {"message": message})


def _refuse_null(value):
    if value is None:
        raise _error("This can't be empty.")
    return value


# In an update, a field that's left out keeps its value, so it reads as None
# here. A field that can't be empty still refuses a null that's sent.
type Change[T] = Annotated[T | None, BeforeValidator(_refuse_null)]


def _required_text(max_length: int, missing: str):
    def check(value):
        if value is None:
            raise _error(missing)
        if not isinstance(value, str):
            raise _error("Enter text.")
        value = value.strip()
        if not value:
            raise _error(missing)
        if len(value) > max_length:
            raise _error(f"Use {max_length:,} characters or fewer.")
        return value

    return BeforeValidator(check)


def _optional_text(max_length: int):
    def check(value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise _error("Enter text.")
        value = value.strip()
        if not value:
            return None
        if len(value) > max_length:
            raise _error(f"Use {max_length:,} characters or fewer.")
        return value

    return BeforeValidator(check)


def _optional_email(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise _error(EMAIL_MESSAGE)
    value = value.strip()
    if not value:
        return None
    if not EMAIL_PATTERN.match(value):
        raise _error(EMAIL_MESSAGE)
    return value


def _value(value):
    if isinstance(value, bool) or not isinstance(value, int) and not (isinstance(value, float) and value.is_integer()):
        raise _error("Enter a whole number of dollars from $0 to $100,000,000.")
    value = int(value)
    if value < 0 or value > MAX_VALUE:
        raise _error("Enter a whole number of dollars from $0 to $100,000,000.")
    return value


def _probability(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) and not (isinstance(value, float) and value.is_integer()):
        raise _error("Enter a whole percent from 0 to 100.")
    value = int(value)
    if value < 0 or value > 100:
        raise _error("Enter a whole percent from 0 to 100.")
    return value


Name = Annotated[str, _required_text(120, "Enter a name.")]
Website = Annotated[str | None, _optional_text(200)]
Industry = Annotated[str | None, _optional_text(60)]
LongText = Annotated[str | None, _optional_text(5000)]
Phone = Annotated[str | None, _optional_text(40)]
JobTitle = Annotated[str | None, _optional_text(120)]
Email = Annotated[str | None, BeforeValidator(_optional_email)]
Description = Annotated[str, _required_text(5000, "Enter a description.")]
Value = Annotated[int, BeforeValidator(_value)]
Probability = Annotated[int | None, BeforeValidator(_probability)]


class Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


# Organizations


class OrganizationCreate(Request):
    name: Name
    website: Website = None
    industry: Industry = None
    notes: LongText = None


class OrganizationUpdate(Request):
    name: Change[Name] = None
    website: Website = None
    industry: Industry = None
    notes: LongText = None


# Contacts


class ContactCreate(Request):
    name: Name
    email: Email = None
    phone: Phone = None
    job_title: JobTitle = None
    organization_id: int | None = None
    status: Status = "lead"


class ContactUpdate(Request):
    name: Change[Name] = None
    email: Email = None
    phone: Phone = None
    job_title: JobTitle = None
    organization_id: int | None = None
    status: Change[Status] = None


# Deals


class DealCreate(Request):
    name: Name
    organization_id: int
    main_contact_id: int | None = None
    stage: Stage
    value: Value
    probability: Probability = None
    close_date: date | None = None


class DealUpdate(Request):
    name: Change[Name] = None
    organization_id: Change[int] = None
    main_contact_id: int | None = None
    stage: Change[Stage] = None
    value: Change[Value] = None
    probability: Probability = None
    close_date: Change[date] = None


class DealMove(Request):
    stage: Stage
    before_id: int | None = None


# Activities


class ActivityCreate(Request):
    type: LoggableType
    contact_id: int | None = None
    deal_id: int | None = None
    description: Description
    occurred_at: AwareDatetime
    follow_up_date: date | None = None

    @model_validator(mode="after")
    def one_link(self):
        if (self.contact_id is None) == (self.deal_id is None):
            raise _error("Log the activity on one contact or one deal.")
        return self


class ActivityUpdate(Request):
    type: Change[LoggableType] = None
    description: Change[Description] = None
    occurred_at: Change[AwareDatetime] = None
    follow_up_date: date | None = None
    done: Change[bool] = None


# Answers


class Ref(BaseModel):
    id: int
    name: str


class Deal(BaseModel):
    id: int
    name: str
    organization: Ref
    main_contact: Ref | None
    stage: Stage
    value: int
    probability: int
    expected_value: int
    close_date: date
    is_late: bool
    position: int
    created_at: UtcDateTime
    updated_at: UtcDateTime


class DealSummary(BaseModel):
    id: int
    name: str
    stage: Stage
    value: int


class OrganizationRow(BaseModel):
    id: int
    name: str
    website: str | None
    industry: str | None
    notes: str | None
    contact_count: int
    open_deal_count: int
    open_pipeline: int
    created_at: UtcDateTime
    updated_at: UtcDateTime


class OrganizationContact(BaseModel):
    id: int
    name: str
    status: Status
    job_title: str | None


class OrganizationDetail(OrganizationRow):
    revenue_won: int
    contacts: list[OrganizationContact]
    deals: list[Deal]


class Contact(BaseModel):
    id: int
    name: str
    email: str | None
    phone: str | None
    job_title: str | None
    status: Status
    organization: Ref | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class ContactDetail(Contact):
    deals: list[Deal]


class ContactSaved(BaseModel):
    contact: Contact
    unlinked_deals: list[Ref]


class TimelineEntry(BaseModel):
    id: int
    type: ActivityType
    description: str
    occurred_at: UtcDateTime
    follow_up_date: date | None
    done: bool
    from_stage: Stage | None
    to_stage: Stage | None
    contact: Ref | None
    deal: Ref | None


class FollowUp(TimelineEntry):
    days_late: int


class OrganizationImpact(BaseModel):
    contacts: int
    deals: list[DealSummary]


class ContactImpact(BaseModel):
    activities: int
    deals: list[Ref]


class DealImpact(BaseModel):
    activities: int
    stage_changes: int


class PipelineColumn(BaseModel):
    stage: Stage
    deals: list[Deal]


class Pipeline(BaseModel):
    columns: list[PipelineColumn]


class Meta(BaseModel):
    today: date


class FunnelStep(BaseModel):
    stage: Stage
    count: int
    value: int


class StageFigures(BaseModel):
    stage: Stage
    count: int
    value: int
    expected: int


class MonthFigures(BaseModel):
    month: str
    revenue: int
    deals: int


class CountAndValue(BaseModel):
    value: int
    count: int


class WonThisMonth(CountAndValue):
    last_month_value: int


class FollowUpCounts(BaseModel):
    overdue: int
    due_soon: int


class Dashboard(BaseModel):
    today: date
    open_pipeline: CountAndValue
    expected_revenue: int
    won_this_month: WonThisMonth
    follow_up_counts: FollowUpCounts
    months: list[MonthFigures]
    funnel: list[FunnelStep]
    open_by_stage: list[StageFigures]
    follow_ups: list[FollowUp]
    recent: list[TimelineEntry]


def bad_field(field: str, message: str, value=None):
    """A 422 in FastAPI's own shape, so the form shows it under the field."""
    from fastapi.exceptions import RequestValidationError

    return RequestValidationError([{"type": "value_error", "loc": ("body", field), "msg": message, "input": value}])
