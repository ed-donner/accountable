"""The price list's routes and their queries (G1 to G12).

Products are archived, never deleted, so there's no delete route, and DELETE gets a 405.
"""

from collections.abc import Generator
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException
from sqlalchemy import Connection, Row, insert, select, update
from sqlalchemy.exc import IntegrityError

from accountable import api, db, who
from accountable.auth import CurrentUser
from accountable.products import schemas
from accountable.products.tables import name_key, products

router = APIRouter(prefix="/products")

_with_names = who.with_names(select(products), products)


def _get(conn: Connection, product_id: int) -> Row:
    row = conn.execute(_with_names.where(products.c.id == product_id)).one_or_none()
    if row is None:
        raise HTTPException(404, "Product not found")
    return row


def _detail(row: Row) -> schemas.ProductDetail:
    return schemas.ProductDetail(**{**row._mapping, **who.authorship(row)})


def _name_taken(conn: Connection, name: str, product_id: int | None = None) -> api.FieldError | None:
    """The error for a name another product has. Archived products count too, so
    restoring one can never make two with the same name (G2). A product's own name
    doesn't count, so it can change its case."""
    query = select(products.c.active).where(products.c.name_key == name_key(name))
    if product_id is not None:
        query = query.where(products.c.id != product_id)
    holder = conn.execute(query).first()
    if holder is None:
        return None
    return api.FieldError({"name": schemas.NAME_TAKEN if holder.active else schemas.ARCHIVED_NAME_TAKEN})


def _check_name(conn: Connection, name: str, product_id: int | None = None) -> None:
    """Every save checks first, inside the write lock, so the usual case never reaches the unique index."""
    if error := _name_taken(conn, name, product_id):
        raise error


@contextmanager
def _names_kept_unique(name: str | None, product_id: int | None = None) -> Generator[None]:
    """Gives the unique index's refusal the same message as the check (G2).

    The write lock is the app's own, so only a change from outside it, such as a
    second copy of the app, could get past the check to the index. Postgres aborts
    the transaction when the index refuses, so this reads who has the name afresh,
    once the save has rolled back. A refusal for any other reason stays a crash.
    """
    try:
        yield
    except IntegrityError as refusal:
        if name is None:
            raise
        with db.reading() as conn:
            error = _name_taken(conn, name, product_id)
        if error is None:
            raise
        raise error from refusal


@router.get("")
def list_products() -> list[schemas.ProductRow]:
    """Archived ones included, each with active, for the table to hide behind Show archived (G6)."""
    with db.reading() as conn:
        rows = conn.execute(select(products).order_by(products.c.name, products.c.id)).all()
    return [schemas.ProductRow(**row._mapping) for row in rows]


@router.post("", status_code=201)
def add_product(body: schemas.ProductCreate, user: CurrentUser, now: api.Now) -> schemas.ProductDetail:
    values = {**body.model_dump(), "name_key": name_key(body.name), **who.added(user, now)}
    with _names_kept_unique(body.name), db.writing() as conn:
        _check_name(conn, body.name)
        new_id = conn.execute(insert(products).values(**values).returning(products.c.id)).scalar_one()
        return _detail(_get(conn, new_id))


@router.get("/{product_id}")
def get_product(product_id: api.PathId) -> schemas.ProductDetail:
    with db.reading() as conn:
        return _detail(_get(conn, product_id))


@router.patch("/{product_id}")
def edit_product(
    product_id: api.PathId, body: schemas.ProductUpdate, user: CurrentUser, now: api.Now
) -> schemas.ProductDetail:
    """Archiving and restoring are changes like any other (G12), and a save that alters nothing writes nothing."""
    fields = body.model_dump(exclude_unset=True)
    with _names_kept_unique(fields.get("name"), product_id), db.writing() as conn:
        altered = who.alterations(fields, _get(conn, product_id))
        if "name" in altered:
            _check_name(conn, altered["name"], product_id)
            altered["name_key"] = name_key(altered["name"])
        if altered:
            conn.execute(
                update(products).where(products.c.id == product_id).values(**altered, **who.changed(user, now))
            )
        return _detail(_get(conn, product_id))
