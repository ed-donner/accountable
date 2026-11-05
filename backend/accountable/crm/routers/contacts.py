from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, func, insert, select, update

from accountable import api, db, who
from accountable.auth import CurrentUser
from accountable.crm import schemas, timeline
from accountable.crm.tables import activities, contacts, deals, organizations

router = APIRouter(prefix="/contacts")

_with_organization = select(contacts, organizations.c.name.label("organization_name")).select_from(
    contacts.outerjoin(organizations)
)
_with_names = who.with_names(_with_organization, contacts)


def _get(conn, contact_id: int):
    row = conn.execute(_with_names.where(contacts.c.id == contact_id)).one_or_none()
    if row is None:
        raise HTTPException(404, "Contact not found")
    return row


# The contact with the deals where they're the main contact, a row for each, so
# the page takes one query.
_with_deals = (
    _with_names.add_columns(
        deals.c.id.label("deal_id"),
        deals.c.name.label("deal_name"),
        deals.c.stage.label("deal_stage"),
        deals.c.value.label("deal_value"),
        deals.c.close_date.label("deal_close_date"),
    )
    .outerjoin(deals, deals.c.main_contact_id == contacts.c.id)
    .order_by(deals.c.close_date.desc(), deals.c.id.desc())
)


def _detail(conn, contact_id: int) -> schemas.ContactDetail:
    rows = conn.execute(_with_deals.where(contacts.c.id == contact_id)).all()
    if not rows:
        raise HTTPException(404, "Contact not found")
    linked = [
        schemas.LinkedDeal(
            id=row.deal_id,
            name=row.deal_name,
            stage=row.deal_stage,
            value=row.deal_value,
            close_date=row.deal_close_date,
        )
        for row in rows
        if row.deal_id is not None
    ]
    return schemas.ContactDetail(**{**rows[0]._mapping, **who.authorship(rows[0])}, deals=linked)


def _check_organization(conn, organization_id: int) -> None:
    found = conn.scalar(select(organizations.c.id).where(organizations.c.id == organization_id))
    if found is None:
        raise api.FieldError({"organization_id": schemas.FIELD_MESSAGES["organization_id"]})


@router.get("")
def list_contacts() -> list[schemas.ContactRow]:
    last = timeline.contact_last()
    query = (
        _with_organization.add_columns(last.c.at.label("last_activity"))
        .outerjoin(last, last.c.contact_id == contacts.c.id)
        .order_by(contacts.c.name, contacts.c.id)
    )
    with db.reading() as conn:
        rows = conn.execute(query).all()
    return [schemas.ContactRow(**row._mapping) for row in rows]


@router.post("", status_code=201)
def add_contact(body: schemas.ContactCreate, user: CurrentUser, now: api.Now) -> schemas.ContactDetail:
    with db.writing() as conn:
        _check_organization(conn, body.organization_id)
        new_id = conn.execute(
            insert(contacts).values(**body.model_dump(), **who.added(user, now)).returning(contacts.c.id)
        ).scalar_one()
        return _detail(conn, new_id)


@router.get("/{contact_id}")
def get_contact(contact_id: api.PathId) -> schemas.ContactDetail:
    with db.reading() as conn:
        return _detail(conn, contact_id)


@router.patch("/{contact_id}")
def edit_contact(
    contact_id: api.PathId, body: schemas.ContactUpdate, user: CurrentUser, now: api.Now
) -> schemas.ContactDetail:
    fields = body.model_dump(exclude_unset=True)
    with db.writing() as conn:
        current = _get(conn, contact_id)
        if "organization_id" in fields:
            chosen = fields["organization_id"]
            if chosen is not None:
                _check_organization(conn, chosen)
            elif current.organization_id is not None:
                raise api.FieldError({"organization_id": schemas.FIELD_MESSAGES["organization_id"]})
        altered = who.alterations(fields, current)
        if altered:
            conn.execute(
                update(contacts).where(contacts.c.id == contact_id).values(**altered, **who.changed(user, now))
            )
        return _detail(conn, contact_id)


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: api.PathId) -> None:
    with db.writing() as conn:
        _get(conn, contact_id)
        conn.execute(delete(contacts).where(contacts.c.id == contact_id))


@router.get("/{contact_id}/delete-impact")
def contact_impact(contact_id: api.PathId) -> schemas.ContactImpact:
    with db.reading() as conn:
        _get(conn, contact_id)
        return schemas.ContactImpact(
            deals=conn.execute(
                select(func.count()).select_from(deals).where(deals.c.main_contact_id == contact_id)
            ).scalar_one(),
            activities=conn.execute(
                select(func.count()).select_from(activities).where(activities.c.contact_id == contact_id)
            ).scalar_one(),
        )


@router.get("/{contact_id}/timeline")
def contact_timeline(
    contact_id: api.PathId,
    limit: api.PageLimit = timeline.DEFAULT_LIMIT,
    offset: api.PageOffset = 0,
) -> schemas.Timeline:
    with db.reading() as conn:
        page = timeline.for_contact(conn, contact_id, limit, offset)
    if page is None:
        raise HTTPException(404, "Contact not found")
    return page
