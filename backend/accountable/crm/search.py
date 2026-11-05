"""What the top bar's search looks for in the CRM: organizations, contacts and deals, by name (K1, K5)."""

from pydantic import BaseModel
from sqlalchemy import Select, select

from accountable.crm.tables import contacts, deals, organizations
from accountable.search import Kind, Matcher, blank_text


class OrganizationResult(BaseModel):
    id: int
    name: str
    industry: str | None


class ContactResult(BaseModel):
    id: int
    name: str
    organization_name: str | None


class DealResult(BaseModel):
    id: int
    name: str
    stage: str
    organization_name: str | None


def _organizations(holding: Matcher) -> Select:
    return select(
        organizations.c.id,
        organizations.c.name,
        organizations.c.industry.label("detail"),
        blank_text().label("extra"),
    ).where(holding(organizations.c.name))


def _contacts(holding: Matcher) -> Select:
    return (
        select(
            contacts.c.id,
            contacts.c.name,
            organizations.c.name.label("detail"),
            blank_text().label("extra"),
        )
        .select_from(contacts.outerjoin(organizations, contacts.c.organization_id == organizations.c.id))
        .where(holding(contacts.c.name))
    )


def _deals(holding: Matcher) -> Select:
    """The deal's stage goes in extra."""
    return (
        select(
            deals.c.id,
            deals.c.name,
            organizations.c.name.label("detail"),
            deals.c.stage.label("extra"),
        )
        .select_from(deals.outerjoin(organizations, deals.c.organization_id == organizations.c.id))
        .where(holding(deals.c.name))
    )


KINDS = [
    Kind(
        "organizations",
        _organizations,
        lambda row: OrganizationResult(id=row.id, name=row.name, industry=row.detail),
    ),
    Kind(
        "contacts",
        _contacts,
        lambda row: ContactResult(id=row.id, name=row.name, organization_name=row.detail),
    ),
    Kind(
        "deals",
        _deals,
        lambda row: DealResult(id=row.id, name=row.name, stage=row.extra, organization_name=row.detail),
    ),
]
