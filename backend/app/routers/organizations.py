from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlalchemy import Connection, delete, func, insert, select, update

from backend.app import clock, rules
from backend.app.db import Conn, contacts, deals, organizations
from backend.app.queries import deal_out, deal_select
from backend.app.schemas import (
    OrganizationCreate,
    OrganizationDetail,
    OrganizationImpact,
    OrganizationRow,
    OrganizationUpdate,
    bad_field,
)

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


def _rows_query():
    """Each organization with its contact count, open deal count and open
    pipeline, from grouped subqueries in one query (ORG-1)."""
    contact_counts = (
        select(contacts.c.organization_id, func.count().label("contact_count"))
        .group_by(contacts.c.organization_id)
        .subquery()
    )
    open_deals = (
        select(
            deals.c.organization_id,
            func.count().label("open_deal_count"),
            func.sum(deals.c.value).label("open_pipeline"),
        )
        .where(deals.c.stage.in_(rules.OPEN_STAGES))
        .group_by(deals.c.organization_id)
        .subquery()
    )
    return (
        select(
            organizations,
            func.coalesce(contact_counts.c.contact_count, 0).label("contact_count"),
            func.coalesce(open_deals.c.open_deal_count, 0).label("open_deal_count"),
            func.coalesce(open_deals.c.open_pipeline, 0).label("open_pipeline"),
        )
        .outerjoin(contact_counts, contact_counts.c.organization_id == organizations.c.id)
        .outerjoin(open_deals, open_deals.c.organization_id == organizations.c.id)
    )


def _row_out(row) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "website": row.website,
        "industry": row.industry,
        "notes": row.notes,
        "contact_count": row.contact_count,
        "open_deal_count": row.open_deal_count,
        "open_pipeline": row.open_pipeline,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _check_name_free(conn: Connection, name: str, except_id: int | None = None) -> None:
    query = select(organizations.c.name).where(func.lower(organizations.c.name) == func.lower(name))
    if except_id is not None:
        query = query.where(organizations.c.id != except_id)
    existing = conn.execute(query).scalar()
    if existing is not None:
        raise bad_field("name", f"An organization called {existing} already exists.", name)


def _exists(conn: Connection, organization_id: int) -> None:
    if conn.execute(select(organizations.c.id).where(organizations.c.id == organization_id)).first() is None:
        raise HTTPException(404, "Organization not found")


def _deals_of(conn: Connection, organization_id: int) -> list[dict]:
    rows = conn.execute(
        select(deals.c.id, deals.c.name, deals.c.stage, deals.c.value)
        .where(deals.c.organization_id == organization_id)
        .order_by(deals.c.name, deals.c.id)
    )
    return [{"id": r.id, "name": r.name, "stage": r.stage, "value": r.value} for r in rows]


@router.get("", response_model=list[OrganizationRow])
def list_organizations(conn: Conn):
    rows = conn.execute(_rows_query().order_by(func.lower(organizations.c.name), organizations.c.id))
    return [_row_out(row) for row in rows]


@router.post("", response_model=OrganizationDetail, status_code=201)
def add_organization(body: OrganizationCreate, conn: Conn):
    _check_name_free(conn, body.name)
    now = clock.now()
    new_id = conn.execute(
        insert(organizations).values(**body.model_dump(), created_at=now, updated_at=now)
    ).inserted_primary_key[0]
    return get_organization(new_id, conn)


@router.get("/{organization_id}", response_model=OrganizationDetail)
def get_organization(organization_id: int, conn: Conn):
    row = conn.execute(_rows_query().where(organizations.c.id == organization_id)).first()
    if row is None:
        raise HTTPException(404, "Organization not found")
    today = clock.today()
    revenue_won = conn.execute(
        select(func.coalesce(func.sum(deals.c.value), 0)).where(
            deals.c.organization_id == organization_id, deals.c.stage == "won"
        )
    ).scalar_one()
    contact_rows = conn.execute(
        select(contacts.c.id, contacts.c.name, contacts.c.status, contacts.c.job_title)
        .where(contacts.c.organization_id == organization_id)
        .order_by(func.lower(contacts.c.name), contacts.c.id)
    )
    deal_rows = conn.execute(
        deal_select().where(deals.c.organization_id == organization_id).order_by(deals.c.close_date, deals.c.id)
    )
    return {
        **_row_out(row),
        "revenue_won": revenue_won,
        "contacts": [dict(r._mapping) for r in contact_rows],
        "deals": [deal_out(r, today) for r in deal_rows],
    }


@router.patch("/{organization_id}", response_model=OrganizationDetail)
def change_organization(organization_id: int, body: OrganizationUpdate, conn: Conn):
    _exists(conn, organization_id)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes:
        _check_name_free(conn, changes["name"], except_id=organization_id)
    if changes:
        conn.execute(
            update(organizations)
            .where(organizations.c.id == organization_id)
            .values(**changes, updated_at=clock.now())
        )
    return get_organization(organization_id, conn)


@router.get("/{organization_id}/delete-impact", response_model=OrganizationImpact)
def organization_delete_impact(organization_id: int, conn: Conn):
    _exists(conn, organization_id)
    contact_count = conn.execute(
        select(func.count()).select_from(contacts).where(contacts.c.organization_id == organization_id)
    ).scalar_one()
    return {"contacts": contact_count, "deals": _deals_of(conn, organization_id)}


@router.delete("/{organization_id}", status_code=204)
def delete_organization(organization_id: int, conn: Conn):
    _exists(conn, organization_id)
    its_deals = _deals_of(conn, organization_id)
    if its_deals:
        name = conn.execute(select(organizations.c.name).where(organizations.c.id == organization_id)).scalar_one()
        return JSONResponse(
            status_code=409,
            content={
                "detail": (
                    f"{name} can't be deleted while it has deals. Move these deals to another "
                    "organization or delete them first:"
                ),
                "deals": its_deals,
            },
        )
    # Its contacts stay, with no organization (DEL-2).
    conn.execute(
        update(contacts)
        .where(contacts.c.organization_id == organization_id)
        .values(organization_id=None, updated_at=clock.now())
    )
    conn.execute(delete(organizations).where(organizations.c.id == organization_id))
    return Response(status_code=204)
