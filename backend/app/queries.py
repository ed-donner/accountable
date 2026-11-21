"""Reads that several routers share: deals with their names, and timeline entries."""

from datetime import date

from fastapi import HTTPException
from sqlalchemy import Connection, Select, select

from backend.app import rules
from backend.app.db import activities, contacts, deals, organizations

main_contacts = contacts.alias("main_contacts")
entry_contacts = contacts.alias("entry_contacts")
entry_deals = deals.alias("entry_deals")


def deal_select() -> Select:
    """Deals with their organization's and main contact's names."""
    return (
        select(
            deals,
            organizations.c.name.label("organization_name"),
            main_contacts.c.name.label("main_contact_name"),
        )
        .join(organizations, deals.c.organization_id == organizations.c.id)
        .outerjoin(main_contacts, deals.c.main_contact_id == main_contacts.c.id)
    )


def deal_out(row, today: date) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "organization": {"id": row.organization_id, "name": row.organization_name},
        "main_contact": (
            {"id": row.main_contact_id, "name": row.main_contact_name} if row.main_contact_id is not None else None
        ),
        "stage": row.stage,
        "value": row.value,
        "probability": row.probability,
        "expected_value": rules.expected_value(row.value, row.probability),
        "close_date": row.close_date,
        "is_late": rules.is_late(row.stage, row.close_date, today),
        "position": row.position,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def get_deal(conn: Connection, deal_id: int, today: date) -> dict:
    row = conn.execute(deal_select().where(deals.c.id == deal_id)).first()
    if row is None:
        raise HTTPException(404, "Deal not found")
    return deal_out(row, today)


def entry_select() -> Select:
    """Activities, each with the name of the contact or deal it belongs to."""
    return (
        select(
            activities,
            entry_contacts.c.name.label("contact_name"),
            entry_deals.c.name.label("deal_name"),
        )
        .outerjoin(entry_contacts, activities.c.contact_id == entry_contacts.c.id)
        .outerjoin(entry_deals, activities.c.deal_id == entry_deals.c.id)
    )


def newest_first(query: Select) -> Select:
    """Newest first by when it happened; the entry added last first on a tie (ACT-2)."""
    return query.order_by(activities.c.occurred_at.desc(), activities.c.id.desc())


def entry_out(row) -> dict:
    return {
        "id": row.id,
        "type": row.type,
        "description": row.description,
        "occurred_at": row.occurred_at,
        "follow_up_date": row.follow_up_date,
        "done": row.done,
        "from_stage": row.from_stage,
        "to_stage": row.to_stage,
        "contact": {"id": row.contact_id, "name": row.contact_name} if row.contact_id is not None else None,
        "deal": {"id": row.deal_id, "name": row.deal_name} if row.deal_id is not None else None,
    }


def get_entry(conn: Connection, activity_id: int) -> dict:
    row = conn.execute(entry_select().where(activities.c.id == activity_id)).first()
    if row is None:
        raise HTTPException(404, "Activity not found")
    return entry_out(row)
