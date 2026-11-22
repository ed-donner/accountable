"""Organizations: endpoints and queries (O1 to O4)."""


from fastapi import APIRouter
from sqlalchemy import Connection, delete, func, insert, select, update

from app.db import contacts, deals, organizations
from app.deps import Conn, Today
from app.routers.contacts import contact_rows
from app.routers.deals import deal_rows
from app.rules import OPEN_STAGES
from app.schemas import (
    PageLimit,
    PageOffset,
    RecordId,
    NotFound,
    Organization,
    OrganizationCreate,
    OrganizationDetail,
    OrganizationImpact,
    OrganizationList,
    OrganizationRow,
    OrganizationUpdate,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


def get_organization(conn: Connection, organization_id: int) -> dict:
    row = conn.execute(select(organizations).where(organizations.c.id == organization_id)).mappings().first()
    if row is None:
        raise NotFound("organization")
    return dict(row)


@router.get("")
def list_organizations(
    conn: Conn,
    limit: PageLimit = None,
    offset: PageOffset = 0,
) -> OrganizationList:
    contact_counts = (
        select(contacts.c.organization_id, func.count().label("contact_count"))
        .group_by(contacts.c.organization_id)
        .subquery()
    )
    open_deals = (
        select(
            deals.c.organization_id,
            func.count().label("open_deal_count"),
            func.sum(deals.c.value).label("open_value"),
        )
        .where(deals.c.stage.in_(OPEN_STAGES))
        .group_by(deals.c.organization_id)
        .subquery()
    )
    query = (
        select(
            organizations,
            func.coalesce(contact_counts.c.contact_count, 0).label("contact_count"),
            func.coalesce(open_deals.c.open_deal_count, 0).label("open_deal_count"),
            func.coalesce(open_deals.c.open_value, 0).label("open_value"),
        )
        .select_from(
            organizations.outerjoin(contact_counts, contact_counts.c.organization_id == organizations.c.id).outerjoin(
                open_deals, open_deals.c.organization_id == organizations.c.id
            )
        )
        .order_by(organizations.c.name, organizations.c.id)
        .offset(offset)
    )
    if limit:
        query = query.limit(limit)
    items = [OrganizationRow(**row) for row in conn.execute(query).mappings()]
    total = conn.scalar(select(func.count()).select_from(organizations))
    return OrganizationList(items=items, total=total)


@router.post("", status_code=201)
def create_organization(body: OrganizationCreate, conn: Conn) -> Organization:
    organization_id = conn.execute(insert(organizations).values(**body.model_dump())).inserted_primary_key[0]
    conn.commit()
    return Organization(**get_organization(conn, organization_id))


@router.get("/{organization_id}")
def read_organization(organization_id: RecordId, conn: Conn, today: Today) -> OrganizationDetail:
    organization = get_organization(conn, organization_id)
    return OrganizationDetail(
        **organization,
        contacts=contact_rows(conn, contacts.c.organization_id == organization_id),
        deals=deal_rows(conn, today, deals.c.organization_id == organization_id),
    )


@router.patch("/{organization_id}")
def update_organization(organization_id: RecordId, body: OrganizationUpdate, conn: Conn) -> Organization:
    get_organization(conn, organization_id)
    values = body.model_dump(exclude_unset=True)
    if values:
        conn.execute(update(organizations).where(organizations.c.id == organization_id).values(**values))
        conn.commit()
    return Organization(**get_organization(conn, organization_id))


@router.get("/{organization_id}/delete-impact")
def organization_delete_impact(organization_id: RecordId, conn: Conn) -> OrganizationImpact:
    organization = get_organization(conn, organization_id)
    return OrganizationImpact(
        name=organization["name"],
        contacts=conn.scalar(select(func.count()).where(contacts.c.organization_id == organization_id)),
        deals=conn.scalar(select(func.count()).where(deals.c.organization_id == organization_id)),
    )


@router.delete("/{organization_id}", status_code=204)
def delete_organization(organization_id: RecordId, conn: Conn) -> None:
    """O4: contacts and deals stay, with no organization, and keep their activities."""
    get_organization(conn, organization_id)
    conn.execute(delete(organizations).where(organizations.c.id == organization_id))
    conn.commit()
