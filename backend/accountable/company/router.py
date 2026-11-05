from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import Connection, Row, delete, insert, select, update

from accountable import api, db, who
from accountable.auth import CurrentUser
from accountable.company import logo, schemas
from accountable.company.tables import company_logo, company_settings
from accountable.users import person, users

# The rate can come as a JSON number, which has to keep every digit for its checks (B7).
router = APIRouter(prefix="/settings", route_class=api.ExactNumbersRoute)

# The one row there is, added by the migration (B13).
_the_row = company_settings.c.id == 1


def _read(conn: Connection) -> Row:
    """The settings with who last changed them, and the logo's type and size, never its bytes."""
    return conn.execute(
        select(
            company_settings,
            users.c.name.label("updated_by_name"),
            users.c.email.label("updated_by_email"),
            company_logo.c.media_type.label("logo_media_type"),
            company_logo.c.width.label("logo_width"),
            company_logo.c.height.label("logo_height"),
        )
        .outerjoin(users, company_settings.c.updated_by == users.c.id)
        .outerjoin(company_logo, company_logo.c.id == company_settings.c.id)
        .where(_the_row)
    ).one()


def _reply(row: Row) -> schemas.CompanySettings:
    shown = None
    if row.logo_media_type is not None:
        shown = schemas.Logo(media_type=row.logo_media_type, width=row.logo_width, height=row.logo_height)
    return schemas.CompanySettings.model_validate(
        {
            **row._mapping,
            "tax_rate": schemas.rate_text(row.tax_rate),
            "updated_by": person(row.updated_by, row.updated_by_name, row.updated_by_email),
            "logo": shown,
        }
    )


def _write_logo(conn: Connection, sent: dict[str, Any], checked: logo.Logo | None, now: datetime) -> bool:
    """Saves the logo sent, or removes it for None. Returns whether that changed it, which is a change to the settings (B9)."""
    if "logo" not in sent:
        return False
    data = sent["logo"]
    saved = conn.scalar(select(company_logo.c.image).where(company_logo.c.id == 1))
    if data == saved:
        return False
    conn.execute(delete(company_logo))
    if data is not None and checked is not None:
        conn.execute(
            insert(company_logo).values(
                id=1,
                image=data,
                media_type=checked.media_type,
                width=checked.width,
                height=checked.height,
                created_at=now,
                updated_at=now,
            )
        )
    return True


def _refuse_what_breaks_the_rules(saved: Row, sent: dict) -> None:
    """The checks on the settings as they'd be after the save, which no single field can make (B5, B6)."""
    after = {**saved._mapping, **sent}
    problems = {}
    if after["company_name"] is None:
        problems["company_name"] = schemas.COMPANY_NAME_MESSAGE
    if schemas.prefixes_clash(after["quote_prefix"], after["invoice_prefix"]):
        problems["invoice_prefix"] = schemas.CLASH_MESSAGE
    if problems:
        raise api.FieldError(problems)


@router.get("")
def get_settings() -> schemas.CompanySettings:
    with db.reading() as conn:
        return _reply(_read(conn))


@router.patch("")
def save_settings(body: schemas.SettingsUpdate, user: CurrentUser, now: api.Now) -> schemas.CompanySettings:
    sent = body.model_dump(exclude_unset=True)
    # Pillow reads the file before the write lock is taken, so a big logo holds up no one else's save.
    checked = logo.check(sent["logo"]) if sent.get("logo") is not None else None
    fields = {name: value for name, value in sent.items() if name != "logo"}
    # Read, checked and written under the write lock, so two quick saves can't each pass against the old values.
    with db.writing() as conn:
        saved = _read(conn)
        _refuse_what_breaks_the_rules(saved, fields)
        altered = who.alterations(fields, saved)
        if _write_logo(conn, sent, checked, now) or altered:
            conn.execute(update(company_settings).where(_the_row).values(**altered, **who.changed(user, now)))
        return _reply(_read(conn))


@router.get("/logo")
def get_logo() -> Response:
    """The bytes as they were checked, with the type the check found, never one the browser could guess (B21)."""
    with db.reading() as conn:
        found = conn.execute(select(company_logo.c.image, company_logo.c.media_type)).one_or_none()
    if found is None:
        raise HTTPException(404, "No logo")
    return Response(content=found.image, media_type=found.media_type, headers={"X-Content-Type-Options": "nosniff"})
