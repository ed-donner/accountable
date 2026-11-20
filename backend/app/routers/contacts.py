from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import Connection, delete, func, insert, or_, select, update

from backend.app import clock
from backend.app.db import Conn, activities, contacts, deals, organizations
from backend.app.queries import deal_out, deal_select, entry_out, entry_select, newest_first
from backend.app.schemas import (
    Contact,
    ContactCreate,
    ContactDetail,
    ContactImpact,
    ContactSaved,
    ContactUpdate,
    TimelineEntry,
    bad_field,
)

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


def _query():
    return select(contacts, organizations.c.name.label("organization_name")).outerjoin(
        organizations, contacts.c.organization_id == organizations.c.id
    )


def _out(row) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "email": row.email,
        "phone": row.phone,
        "job_title": row.job_title,
        "status": row.status,
        "organization": (
            {"id": row.organization_id, "name": row.organization_name} if row.organization_id is not None else None
        ),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _get(conn: Connection, contact_id: int) -> dict:
    row = conn.execute(_query().where(contacts.c.id == contact_id)).first()
    if row is None:
        raise HTTPException(404, "Contact not found")
    return _out(row)


def _check_organization(conn: Connection, organization_id: int | None) -> None:
    if organization_id is None:
        return
    found = conn.execute(select(organizations.c.id).where(organizations.c.id == organization_id)).first()
    if found is None:
        raise bad_field("organization_id", "Choose an organization from the list.", organization_id)


def _main_contact_deals(conn: Connection, contact_id: int) -> list[dict]:
    rows = conn.execute(
        select(deals.c.id, deals.c.name).where(deals.c.main_contact_id == contact_id).order_by(deals.c.name, deals.c.id)
    )
    return [{"id": r.id, "name": r.name} for r in rows]


@router.get("", response_model=list[Contact])
def list_contacts(conn: Conn):
    rows = conn.execute(_query().order_by(func.lower(contacts.c.name), contacts.c.id))
    return [_out(row) for row in rows]


@router.post("", response_model=Contact, status_code=201)
def add_contact(body: ContactCreate, conn: Conn):
    _check_organization(conn, body.organization_id)
    now = clock.now()
    new_id = conn.execute(
        insert(contacts).values(**body.model_dump(), created_at=now, updated_at=now)
    ).inserted_primary_key[0]
    return _get(conn, new_id)


@router.get("/{contact_id}", response_model=ContactDetail)
def get_contact(contact_id: int, conn: Conn):
    contact = _get(conn, contact_id)
    today = clock.today()
    rows = conn.execute(
        deal_select().where(deals.c.main_contact_id == contact_id).order_by(deals.c.close_date, deals.c.id)
    )
    return {**contact, "deals": [deal_out(row, today) for row in rows]}


@router.patch("/{contact_id}", response_model=ContactSaved)
def change_contact(contact_id: int, body: ContactUpdate, conn: Conn):
    before = _get(conn, contact_id)
    changes = body.model_dump(exclude_unset=True)
    if "status" in changes and changes["status"] is None:
        raise bad_field("status", "Choose a status.", None)

    unlinked: list[dict] = []
    old_org = before["organization"]["id"] if before["organization"] else None
    if "organization_id" in changes and changes["organization_id"] != old_org:
        _check_organization(conn, changes["organization_id"])
        if old_org is not None:
            # The contact stops being the main contact on deals at the old
            # organization (CON-5, concern 4).
            at_old = (deals.c.main_contact_id == contact_id) & (deals.c.organization_id == old_org)
            unlinked = [
                {"id": r.id, "name": r.name}
                for r in conn.execute(select(deals.c.id, deals.c.name).where(at_old).order_by(deals.c.name, deals.c.id))
            ]
            conn.execute(update(deals).where(at_old).values(main_contact_id=None, updated_at=clock.now()))

    if changes:
        conn.execute(update(contacts).where(contacts.c.id == contact_id).values(**changes, updated_at=clock.now()))
    return {"contact": _get(conn, contact_id), "unlinked_deals": unlinked}


@router.get("/{contact_id}/timeline", response_model=list[TimelineEntry])
def contact_timeline(contact_id: int, conn: Conn):
    """Their own activities, plus every activity on the deals where they're the
    main contact now (ACT-3, concern 5)."""
    _get(conn, contact_id)
    their_deals = select(deals.c.id).where(deals.c.main_contact_id == contact_id)
    rows = conn.execute(
        newest_first(
            entry_select().where(or_(activities.c.contact_id == contact_id, activities.c.deal_id.in_(their_deals)))
        )
    )
    return [entry_out(row) for row in rows]


@router.get("/{contact_id}/delete-impact", response_model=ContactImpact)
def contact_delete_impact(contact_id: int, conn: Conn):
    _get(conn, contact_id)
    count = conn.execute(
        select(func.count()).select_from(activities).where(activities.c.contact_id == contact_id)
    ).scalar_one()
    return {"activities": count, "deals": _main_contact_deals(conn, contact_id)}


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: int, conn: Conn):
    """Deletes their activities, and leaves their deals with no main contact (DEL-4)."""
    _get(conn, contact_id)
    conn.execute(delete(activities).where(activities.c.contact_id == contact_id))
    conn.execute(
        update(deals).where(deals.c.main_contact_id == contact_id).values(main_contact_id=None, updated_at=clock.now())
    )
    conn.execute(delete(contacts).where(contacts.c.id == contact_id))
    return Response(status_code=204)
