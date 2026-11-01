from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import delete, func, insert, select, update

from accountable import db
from accountable.crm import rules, schemas, timeline
from accountable.crm.tables import contacts, deals, organizations

router = APIRouter(prefix="/organizations")


def _get(conn, organization_id: int):
    row = conn.execute(select(organizations).where(organizations.c.id == organization_id)).one_or_none()
    if row is None:
        raise HTTPException(404, "Organization not found")
    return row


def _detail(conn, organization_id: int) -> dict:
    row = _get(conn, organization_id)
    linked_contacts = conn.execute(
        select(contacts.c.id, contacts.c.name, contacts.c.job_title, contacts.c.status)
        .where(contacts.c.organization_id == organization_id)
        .order_by(contacts.c.name)
    ).all()
    linked_deals = conn.execute(
        select(deals.c.id, deals.c.name, deals.c.stage, deals.c.value, deals.c.close_date)
        .where(deals.c.organization_id == organization_id)
        .order_by(deals.c.close_date.desc())
    ).all()
    return {
        **row._mapping,
        "contacts": [item._mapping for item in linked_contacts],
        "deals": [item._mapping for item in linked_deals],
    }


@router.get("")
def list_organizations() -> list[schemas.OrganizationRow]:
    with db.reading() as conn:
        last = timeline.last_by_organization(conn)
        contact_counts = dict(
            conn.execute(
                select(contacts.c.organization_id, func.count()).group_by(contacts.c.organization_id)
            ).all()
        )
        open_deals = {
            row.organization_id: row
            for row in conn.execute(
                select(
                    deals.c.organization_id,
                    func.count().label("count"),
                    func.sum(deals.c.value).label("value"),
                )
                .where(deals.c.stage.in_(rules.OPEN_STAGES))
                .group_by(deals.c.organization_id)
            )
        }
        rows = conn.execute(select(organizations).order_by(organizations.c.name)).all()

    result = []
    for row in rows:
        open_row = open_deals.get(row.id)
        result.append(
            {
                **row._mapping,
                "contact_count": contact_counts.get(row.id, 0),
                "open_deal_count": open_row.count if open_row else 0,
                "open_value": open_row.value if open_row else 0,
                "last_activity": last.get(row.id),
            }
        )
    return result


@router.post("", status_code=201)
def add_organization(body: schemas.OrganizationCreate) -> schemas.OrganizationDetail:
    with db.writing() as conn:
        new_id = conn.execute(insert(organizations).values(**body.model_dump())).inserted_primary_key[0]
        return _detail(conn, new_id)


@router.get("/{organization_id}")
def get_organization(organization_id: int) -> schemas.OrganizationDetail:
    with db.reading() as conn:
        return _detail(conn, organization_id)


@router.patch("/{organization_id}")
def edit_organization(organization_id: int, body: schemas.OrganizationUpdate) -> schemas.OrganizationDetail:
    fields = body.model_dump(exclude_unset=True)
    with db.writing() as conn:
        _get(conn, organization_id)
        if fields:
            conn.execute(update(organizations).where(organizations.c.id == organization_id).values(**fields))
        return _detail(conn, organization_id)


@router.delete("/{organization_id}", status_code=204)
def delete_organization(organization_id: int) -> None:
    with db.writing() as conn:
        _get(conn, organization_id)
        conn.execute(delete(organizations).where(organizations.c.id == organization_id))


@router.get("/{organization_id}/delete-impact")
def organization_impact(organization_id: int) -> schemas.OrganizationImpact:
    with db.reading() as conn:
        _get(conn, organization_id)
        return {
            "contacts": conn.scalar(
                select(func.count()).select_from(contacts).where(contacts.c.organization_id == organization_id)
            ),
            "deals": conn.scalar(
                select(func.count()).select_from(deals).where(deals.c.organization_id == organization_id)
            ),
        }


@router.get("/{organization_id}/timeline")
def organization_timeline(
    organization_id: int,
    limit: int = Query(timeline.DEFAULT_LIMIT, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> schemas.Timeline:
    with db.reading() as conn:
        _get(conn, organization_id)
        return timeline.for_organization(conn, organization_id, limit, offset)
