from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import delete, func, insert, select, update

from accountable import db
from accountable.crm import schemas, timeline
from accountable.crm.tables import activities, contacts, deals, organizations

router = APIRouter(prefix="/contacts")

_with_organization = select(contacts, organizations.c.name.label("organization_name")).select_from(
    contacts.outerjoin(organizations)
)


def _get(conn, contact_id: int):
    row = conn.execute(_with_organization.where(contacts.c.id == contact_id)).one_or_none()
    if row is None:
        raise HTTPException(404, "Contact not found")
    return row


def _detail(conn, contact_id: int) -> dict:
    row = _get(conn, contact_id)
    linked_deals = conn.execute(
        select(deals.c.id, deals.c.name, deals.c.stage, deals.c.value, deals.c.close_date)
        .where(deals.c.main_contact_id == contact_id)
        .order_by(deals.c.close_date.desc())
    ).all()
    return {**row._mapping, "deals": [item._mapping for item in linked_deals]}


def _check_organization(conn, organization_id: int) -> None:
    found = conn.scalar(select(organizations.c.id).where(organizations.c.id == organization_id))
    if found is None:
        raise schemas.FieldError({"organization_id": schemas.FIELD_MESSAGES["organization_id"]})


@router.get("")
def list_contacts() -> list[schemas.ContactRow]:
    with db.reading() as conn:
        last = timeline.last_by_contact(conn)
        rows = conn.execute(_with_organization.order_by(contacts.c.name)).all()
    return [{**row._mapping, "last_activity": last.get(row.id)} for row in rows]


@router.post("", status_code=201)
def add_contact(body: schemas.ContactCreate) -> schemas.ContactDetail:
    with db.writing() as conn:
        _check_organization(conn, body.organization_id)
        new_id = conn.execute(insert(contacts).values(**body.model_dump())).inserted_primary_key[0]
        return _detail(conn, new_id)


@router.get("/{contact_id}")
def get_contact(contact_id: schemas.PathId) -> schemas.ContactDetail:
    with db.reading() as conn:
        return _detail(conn, contact_id)


@router.patch("/{contact_id}")
def edit_contact(contact_id: schemas.PathId, body: schemas.ContactUpdate) -> schemas.ContactDetail:
    fields = body.model_dump(exclude_unset=True)
    with db.writing() as conn:
        current = _get(conn, contact_id)
        if "organization_id" in fields:
            chosen = fields["organization_id"]
            if chosen is not None:
                _check_organization(conn, chosen)
            elif current.organization_id is not None:
                raise schemas.FieldError({"organization_id": schemas.FIELD_MESSAGES["organization_id"]})
        if fields:
            conn.execute(update(contacts).where(contacts.c.id == contact_id).values(**fields))
        return _detail(conn, contact_id)


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: schemas.PathId) -> None:
    with db.writing() as conn:
        _get(conn, contact_id)
        conn.execute(delete(contacts).where(contacts.c.id == contact_id))


@router.get("/{contact_id}/delete-impact")
def contact_impact(contact_id: schemas.PathId) -> schemas.ContactImpact:
    with db.reading() as conn:
        _get(conn, contact_id)
        return {
            "deals": conn.scalar(select(func.count()).select_from(deals).where(deals.c.main_contact_id == contact_id)),
            "activities": conn.scalar(
                select(func.count()).select_from(activities).where(activities.c.contact_id == contact_id)
            ),
        }


@router.get("/{contact_id}/timeline")
def contact_timeline(
    contact_id: schemas.PathId,
    limit: int = Query(timeline.DEFAULT_LIMIT, ge=1, le=500),
    offset: int = Query(0, ge=0, le=schemas.MAX_ID),
) -> schemas.Timeline:
    with db.reading() as conn:
        _get(conn, contact_id)
        return timeline.for_contact(conn, contact_id, limit, offset)
