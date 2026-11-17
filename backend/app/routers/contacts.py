"""Contacts: endpoints and queries (C1 to C4, C6)."""

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import Connection, delete, func, insert, select, union_all, update

from app.db import activities, contacts, deals, organizations
from app.deps import Conn, Today
from app.routers.deals import deal_rows
from app.rules import Status
from app.schemas import (
    Contact,
    ContactCreate,
    ContactDetail,
    ContactImpact,
    ContactList,
    ContactRow,
    ContactUpdate,
    FieldErrors,
    NotFound,
    Ref,
    StatusCounts,
)

router = APIRouter(prefix="/contacts", tags=["contacts"])


def _last_activity():
    """Each contact's latest activity: their own, plus those on deals where they're the main contact."""
    own = select(activities.c.contact_id.label("contact_id"), activities.c.occurred_on).where(
        activities.c.contact_id.is_not(None)
    )
    on_deals = (
        select(deals.c.contact_id.label("contact_id"), activities.c.occurred_on)
        .select_from(activities.join(deals, deals.c.id == activities.c.deal_id))
        .where(deals.c.contact_id.is_not(None))
    )
    both = union_all(own, on_deals).subquery()
    return (
        select(both.c.contact_id, func.max(both.c.occurred_on).label("last_activity_on"))
        .group_by(both.c.contact_id)
        .subquery()
    )


def contact_rows(conn: Connection, *where, limit: int | None = None, offset: int = 0) -> list[dict]:
    last = _last_activity()
    query = (
        select(
            contacts,
            organizations.c.name.label("organization_name"),
            last.c.last_activity_on,
        )
        .select_from(
            contacts.outerjoin(organizations, organizations.c.id == contacts.c.organization_id).outerjoin(
                last, last.c.contact_id == contacts.c.id
            )
        )
        .where(*where)
        .order_by(contacts.c.name, contacts.c.id)
        .offset(offset)
    )
    if limit:
        query = query.limit(limit)
    return [dict(row) for row in conn.execute(query).mappings()]


def get_contact(conn: Connection, contact_id: int) -> dict:
    row = conn.execute(select(contacts).where(contacts.c.id == contact_id)).mappings().first()
    if row is None:
        raise NotFound("contact")
    return dict(row)


def _check_organization(conn: Connection, organization_id: int | None) -> None:
    if organization_id is not None and not conn.scalar(
        select(organizations.c.id).where(organizations.c.id == organization_id)
    ):
        raise FieldErrors({"organization_id": "That organization no longer exists. Choose another."})


@router.get("")
def list_contacts(
    conn: Conn,
    status: Status | None = None,
    limit: Annotated[int | None, Query(ge=1)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ContactList:
    where = [contacts.c.status == status] if status else []
    items = contact_rows(conn, *where, limit=limit, offset=offset)
    counts = dict(conn.execute(select(contacts.c.status, func.count()).group_by(contacts.c.status)).all())
    status_counts = StatusCounts(
        all=sum(counts.values()),
        lead=counts.get("lead", 0),
        qualified=counts.get("qualified", 0),
        customer=counts.get("customer", 0),
    )
    total = status_counts.all if not status else getattr(status_counts, status)
    return ContactList(items=[ContactRow(**row) for row in items], total=total, status_counts=status_counts)


@router.post("", status_code=201)
def create_contact(body: ContactCreate, conn: Conn) -> Contact:
    _check_organization(conn, body.organization_id)
    contact_id = conn.execute(insert(contacts).values(**body.model_dump())).inserted_primary_key[0]
    conn.commit()
    return Contact(**get_contact(conn, contact_id))


@router.get("/{contact_id}")
def read_contact(contact_id: int, conn: Conn, today: Today) -> ContactDetail:
    contact = get_contact(conn, contact_id)
    organization = None
    if contact["organization_id"] is not None:
        name = conn.scalar(select(organizations.c.name).where(organizations.c.id == contact["organization_id"]))
        organization = Ref(id=contact["organization_id"], name=name)
    return ContactDetail(
        **contact,
        organization=organization,
        deals=deal_rows(conn, today, deals.c.contact_id == contact_id),
    )


@router.patch("/{contact_id}")
def update_contact(contact_id: int, body: ContactUpdate, conn: Conn) -> Contact:
    get_contact(conn, contact_id)
    values = body.model_dump(exclude_unset=True)
    _check_organization(conn, values.get("organization_id"))
    if values:
        conn.execute(update(contacts).where(contacts.c.id == contact_id).values(**values))
        conn.commit()
    return Contact(**get_contact(conn, contact_id))


@router.get("/{contact_id}/delete-impact")
def contact_delete_impact(contact_id: int, conn: Conn) -> ContactImpact:
    contact = get_contact(conn, contact_id)
    return ContactImpact(
        name=contact["name"],
        deals=conn.scalar(select(func.count()).where(deals.c.contact_id == contact_id)),
        activities=conn.scalar(select(func.count()).where(activities.c.contact_id == contact_id)),
    )


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: int, conn: Conn) -> None:
    """C6: deals stay with no main contact; the contact's own activities go."""
    get_contact(conn, contact_id)
    conn.execute(delete(contacts).where(contacts.c.id == contact_id))
    conn.commit()
