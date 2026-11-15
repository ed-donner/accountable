"""Organizations: routes, request models, queries and the delete rule (R8, R26, R27, R31)."""

from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, StringConstraints
from sqlalchemy import Connection, func, insert, select, update

from . import db, deals
from .db import contacts, organizations
from .stages import OPEN_STAGES

router = APIRouter(prefix="/organizations", tags=["organizations"])

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Text = Annotated[str, StringConstraints(strip_whitespace=True)]


class OrganizationIn(BaseModel):
    name: Name
    website: Text | None = None
    industry: Text | None = None
    notes: Text | None = None


class OrganizationPatch(BaseModel):
    # A required field may be left out of a PATCH, but not sent as null: null fails validation (422).
    name: Name = None  # type: ignore[assignment]
    website: Text | None = None
    industry: Text | None = None
    notes: Text | None = None


def _counts():
    contact_count = (
        select(func.count()).where(contacts.c.organization_id == organizations.c.id).scalar_subquery()
    )
    deal_count = select(func.count()).where(db.deals.c.organization_id == organizations.c.id).scalar_subquery()
    open_value = (
        select(func.coalesce(func.sum(db.deals.c.value_cents), 0))
        .where(db.deals.c.organization_id == organizations.c.id, db.deals.c.stage.in_(OPEN_STAGES))
        .scalar_subquery()
    )
    return [
        contact_count.label("contact_count"),
        deal_count.label("deal_count"),
        open_value.label("open_deal_value_cents"),
    ]


def get_or_404(conn: Connection, org_id: int) -> dict:
    row = conn.execute(select(organizations, *_counts()).where(organizations.c.id == org_id)).mappings().first()
    if row is None:
        raise HTTPException(404, "Organization not found")
    return dict(row)


@router.get("")
def list_organizations() -> list[dict]:
    with db.transaction() as conn:
        rows = conn.execute(select(organizations, *_counts()).order_by(organizations.c.name)).mappings()
        return [dict(r) for r in rows]


@router.post("", status_code=201)
def create_organization(body: OrganizationIn) -> dict:
    now = db.now_iso()
    with db.transaction() as conn:
        org_id = conn.execute(
            insert(organizations).values(**body.model_dump(), created_at=now, updated_at=now)
        ).inserted_primary_key[0]
        return get_or_404(conn, org_id)


@router.get("/{org_id}")
def get_organization(org_id: int) -> dict:
    """R31: details, its contacts and deals, and the total value of its open deals."""
    with db.transaction() as conn:
        org = get_or_404(conn, org_id)
        org["contacts"] = [
            dict(r)
            for r in conn.execute(
                select(contacts).where(contacts.c.organization_id == org_id).order_by(contacts.c.name)
            ).mappings()
        ]
        org["deals"] = deals.deal_rows(conn, db.deals.c.organization_id == org_id)
        return org


@router.patch("/{org_id}")
def update_organization(org_id: int, body: OrganizationPatch) -> dict:
    changes = body.model_dump(exclude_unset=True)
    with db.transaction() as conn:
        get_or_404(conn, org_id)
        if changes:
            conn.execute(
                update(organizations).where(organizations.c.id == org_id).values(**changes, updated_at=db.now_iso())
            )
        return get_or_404(conn, org_id)


def _delete_preview(conn: Connection, org: dict) -> dict:
    name, n_deals, n_contacts = org["name"], org["deal_count"], org["contact_count"]
    if n_deals:
        deal_word = "deal" if n_deals == 1 else "deals"
        return {
            "blocked": True,
            "deal_count": n_deals,
            "contact_count": n_contacts,
            "message": f"{name} has {n_deals} {deal_word}. Move them to another organization or delete them first.",
        }
    if n_contacts:
        contact_words = "contact will stay" if n_contacts == 1 else "contacts will stay"
        message = f"Delete {name}? Its {n_contacts} {contact_words}, with no organization."
    else:
        message = f"Delete {name}? It has no contacts or deals."
    return {"blocked": False, "deal_count": 0, "contact_count": n_contacts, "message": message}


@router.get("/{org_id}/delete-preview")
def delete_preview(org_id: int) -> dict:
    """R26, R27: what deleting will do, or why it can't be deleted."""
    with db.transaction() as conn:
        return _delete_preview(conn, get_or_404(conn, org_id))


@router.delete("/{org_id}", status_code=204)
def delete_organization(org_id: int) -> None:
    """R27: contacts stay with no organization; blocked (409) while it still has deals."""
    with db.transaction() as conn:
        preview = _delete_preview(conn, get_or_404(conn, org_id))
        if preview["blocked"]:
            raise HTTPException(409, preview["message"])
        conn.execute(update(contacts).where(contacts.c.organization_id == org_id).values(organization_id=None))
        conn.execute(organizations.delete().where(organizations.c.id == org_id))
