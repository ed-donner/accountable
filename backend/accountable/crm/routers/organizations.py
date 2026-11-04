from fastapi import APIRouter, HTTPException
from sqlalchemy import (
    BigInteger,
    Date,
    Subquery,
    Text,
    cast,
    delete,
    func,
    insert,
    literal,
    null,
    select,
    true,
    union_all,
    update,
)

from accountable import db
from accountable.auth import CurrentUser
from accountable.crm import rules, schemas, timeline, who
from accountable.crm.tables import contacts, deals, organizations

router = APIRouter(prefix="/organizations")

_with_names = who.with_names(select(organizations), organizations)


def _get(conn, organization_id: int):
    row = conn.execute(_with_names.where(organizations.c.id == organization_id)).one_or_none()
    if row is None:
        raise HTTPException(404, "Organization not found")
    return row


def _linked(organization_id: int) -> Subquery:
    """Its contacts and its deals as one list, each kind in its own order, so the page takes one query.

    A union lines its columns up by place, so both kinds name every column, with nothing in the other kind's.
    """
    linked_contacts = select(
        literal("contact").label("kind"),
        func.row_number().over(order_by=(contacts.c.name, contacts.c.id)).label("place"),
        contacts.c.id,
        contacts.c.name,
        contacts.c.job_title,
        contacts.c.status,
        cast(null(), Text).label("stage"),
        cast(null(), BigInteger).label("value"),
        cast(null(), Date).label("close_date"),
    ).where(contacts.c.organization_id == organization_id)
    linked_deals = select(
        literal("deal").label("kind"),
        func.row_number().over(order_by=(deals.c.close_date.desc(), deals.c.id.desc())).label("place"),
        deals.c.id,
        deals.c.name,
        cast(null(), Text).label("job_title"),
        cast(null(), Text).label("status"),
        deals.c.stage,
        deals.c.value,
        deals.c.close_date,
    ).where(deals.c.organization_id == organization_id)
    return union_all(linked_contacts, linked_deals).subquery()


def _linked_contact(row) -> schemas.LinkedContact:
    return schemas.LinkedContact(
        id=row.linked_id, name=row.linked_name, job_title=row.linked_job_title, status=row.linked_status
    )


def _linked_deal(row) -> schemas.LinkedDeal:
    return schemas.LinkedDeal(
        id=row.linked_id,
        name=row.linked_name,
        stage=row.linked_stage,
        value=row.linked_value,
        close_date=row.linked_close_date,
    )


def _detail(conn, organization_id: int) -> schemas.OrganizationDetail:
    linked = _linked(organization_id)
    rows = conn.execute(
        _with_names.add_columns(*(column.label(f"linked_{column.name}") for column in linked.c))
        .outerjoin(linked, true())
        .where(organizations.c.id == organization_id)
        .order_by(linked.c.kind, linked.c.place)
    ).all()
    if not rows:
        raise HTTPException(404, "Organization not found")
    return schemas.OrganizationDetail(
        **{**rows[0]._mapping, **who.authorship(rows[0])},
        contacts=[_linked_contact(row) for row in rows if row.linked_kind == "contact"],
        deals=[_linked_deal(row) for row in rows if row.linked_kind == "deal"],
    )


def _rows():
    """Every organization with its figures, in one query."""
    contact_counts = (
        select(contacts.c.organization_id, func.count().label("count")).group_by(contacts.c.organization_id).subquery()
    )
    open_deals = (
        select(deals.c.organization_id, func.count().label("count"), func.sum(deals.c.value).label("value"))
        .where(deals.c.stage.in_(rules.OPEN_STAGES))
        .group_by(deals.c.organization_id)
        .subquery()
    )
    last = timeline.organization_last()
    return (
        select(
            organizations,
            func.coalesce(contact_counts.c.count, 0).label("contact_count"),
            func.coalesce(open_deals.c.count, 0).label("open_deal_count"),
            func.coalesce(open_deals.c.value, 0).label("open_value"),
            last.c.at.label("last_activity"),
        )
        .outerjoin(contact_counts, contact_counts.c.organization_id == organizations.c.id)
        .outerjoin(open_deals, open_deals.c.organization_id == organizations.c.id)
        .outerjoin(last, last.c.organization_id == organizations.c.id)
        .order_by(organizations.c.name, organizations.c.id)
    )


@router.get("")
def list_organizations() -> list[schemas.OrganizationRow]:
    with db.reading() as conn:
        rows = conn.execute(_rows()).all()
    return [schemas.OrganizationRow(**row._mapping) for row in rows]


@router.post("", status_code=201)
def add_organization(
    body: schemas.OrganizationCreate, user: CurrentUser, now: schemas.Now
) -> schemas.OrganizationDetail:
    with db.writing() as conn:
        new_id = conn.execute(
            insert(organizations).values(**body.model_dump(), **who.added(user, now)).returning(organizations.c.id)
        ).scalar_one()
        return _detail(conn, new_id)


@router.get("/{organization_id}")
def get_organization(organization_id: schemas.PathId) -> schemas.OrganizationDetail:
    with db.reading() as conn:
        return _detail(conn, organization_id)


@router.patch("/{organization_id}")
def edit_organization(
    organization_id: schemas.PathId, body: schemas.OrganizationUpdate, user: CurrentUser, now: schemas.Now
) -> schemas.OrganizationDetail:
    fields = body.model_dump(exclude_unset=True)
    with db.writing() as conn:
        altered = who.alterations(fields, _get(conn, organization_id))
        if altered:
            conn.execute(
                update(organizations)
                .where(organizations.c.id == organization_id)
                .values(**altered, **who.changed(user, now))
            )
        return _detail(conn, organization_id)


@router.delete("/{organization_id}", status_code=204)
def delete_organization(organization_id: schemas.PathId) -> None:
    with db.writing() as conn:
        _get(conn, organization_id)
        conn.execute(delete(organizations).where(organizations.c.id == organization_id))


@router.get("/{organization_id}/delete-impact")
def organization_impact(organization_id: schemas.PathId) -> schemas.OrganizationImpact:
    with db.reading() as conn:
        _get(conn, organization_id)
        return schemas.OrganizationImpact(
            contacts=conn.execute(
                select(func.count()).select_from(contacts).where(contacts.c.organization_id == organization_id)
            ).scalar_one(),
            deals=conn.execute(
                select(func.count()).select_from(deals).where(deals.c.organization_id == organization_id)
            ).scalar_one(),
        )


@router.get("/{organization_id}/timeline")
def organization_timeline(
    organization_id: schemas.PathId,
    limit: schemas.PageLimit = timeline.DEFAULT_LIMIT,
    offset: schemas.PageOffset = 0,
) -> schemas.Timeline:
    with db.reading() as conn:
        page = timeline.for_organization(conn, organization_id, limit, offset)
    if page is None:
        raise HTTPException(404, "Organization not found")
    return page
