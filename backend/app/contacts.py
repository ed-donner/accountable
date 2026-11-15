"""Contacts: routes, request models, queries and the delete rule (R9, R23, R26, R28, R32)."""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, StringConstraints
from sqlalchemy import Connection, and_, insert, select, update

from . import activities, db, deals
from .db import contacts, organizations

router = APIRouter(prefix="/contacts", tags=["contacts"])

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Text = Annotated[str, StringConstraints(strip_whitespace=True)]
Status = Literal["lead", "qualified", "customer"]


class ContactIn(BaseModel):
    name: Name
    email: Text | None = None
    phone: Text | None = None
    job_title: Text | None = None
    organization_id: int | None = None
    status: Status = "lead"


class ContactPatch(BaseModel):
    # Required fields may be left out of a PATCH but not sent as null.
    name: Name = None  # type: ignore[assignment]
    email: Text | None = None
    phone: Text | None = None
    job_title: Text | None = None
    organization_id: int | None = None
    status: Status = None  # type: ignore[assignment]


def _select():
    return select(contacts, organizations.c.name.label("organization_name")).select_from(
        contacts.outerjoin(organizations, contacts.c.organization_id == organizations.c.id)
    )


def get_or_404(conn: Connection, contact_id: int) -> dict:
    row = conn.execute(_select().where(contacts.c.id == contact_id)).mappings().first()
    if row is None:
        raise HTTPException(404, "Contact not found")
    return dict(row)


def _check_org(conn: Connection, organization_id: int | None) -> None:
    if organization_id is not None:
        db.require_row(conn, organizations, organization_id, "organization_id", "Choose an organization from the list")


@router.get("")
def list_contacts(status: Status | None = None) -> list[dict]:
    """R23: optionally filtered by status."""
    query = _select().order_by(contacts.c.name)
    if status:
        query = query.where(contacts.c.status == status)
    with db.transaction() as conn:
        return [dict(r) for r in conn.execute(query).mappings()]


@router.post("", status_code=201)
def create_contact(body: ContactIn) -> dict:
    now = db.now_iso()
    with db.transaction() as conn:
        _check_org(conn, body.organization_id)
        contact_id = conn.execute(
            insert(contacts).values(**body.model_dump(), created_at=now, updated_at=now)
        ).inserted_primary_key[0]
        return get_or_404(conn, contact_id)


@router.get("/{contact_id}")
def get_contact(contact_id: int) -> dict:
    """R32: details, organization, their deals as main contact, and their timeline."""
    with db.transaction() as conn:
        contact = get_or_404(conn, contact_id)
        contact["deals"] = deals.deal_rows(conn, db.deals.c.main_contact_id == contact_id)
        contact["timeline"] = activities.timeline(conn, contact_id=contact_id)
        return contact


@router.patch("/{contact_id}")
def update_contact(contact_id: int, body: ContactPatch) -> dict:
    changes = body.model_dump(exclude_unset=True)
    with db.transaction() as conn:
        get_or_404(conn, contact_id)
        _check_org(conn, changes.get("organization_id"))
        if changes:
            conn.execute(update(contacts).where(contacts.c.id == contact_id).values(**changes, updated_at=db.now_iso()))
        return get_or_404(conn, contact_id)


def _count(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


@router.get("/{contact_id}/delete-preview")
def delete_preview(contact_id: int) -> dict:
    """R26, R28: what deleting this contact will do (D22)."""
    a = db.activities
    with db.transaction() as conn:
        contact = get_or_404(conn, contact_id)
        n_deals = len(conn.execute(select(db.deals.c.id).where(db.deals.c.main_contact_id == contact_id)).all())
        links = conn.execute(select(a.c.deal_id).where(a.c.contact_id == contact_id)).all()
    deleted = sum(1 for (deal_id,) in links if deal_id is None)
    kept = len(links) - deleted
    parts = [f"Delete {contact['name']}?"]
    if n_deals:
        parts.append(f"Their {_count(n_deals, 'deal', 'deals')} will stay, with no main contact.")
    if deleted:
        parts.append(f"{_count(deleted, 'activity', 'activities')} will be deleted.")
    if kept:
        parts.append(f"{_count(kept, 'activity', 'activities')} also linked to a deal will stay on that deal.")
    return {
        "blocked": False,
        "deal_count": n_deals,
        "activities_deleted": deleted,
        "activities_kept": kept,
        "message": " ".join(parts),
    }


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: int) -> None:
    """R28: deals stay with no main contact; activities linked only to this contact are deleted."""
    a = db.activities
    with db.transaction() as conn:
        get_or_404(conn, contact_id)
        conn.execute(a.delete().where(and_(a.c.contact_id == contact_id, a.c.deal_id.is_(None))))
        conn.execute(update(db.deals).where(db.deals.c.main_contact_id == contact_id).values(main_contact_id=None))
        conn.execute(update(a).where(a.c.contact_id == contact_id).values(contact_id=None))
        conn.execute(contacts.delete().where(contacts.c.id == contact_id))
