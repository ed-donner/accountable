from fastapi import APIRouter
from sqlalchemy import Connection, Row, select, update

from accountable import api, db, who
from accountable.auth import CurrentUser
from accountable.company import schemas
from accountable.company.tables import company_settings
from accountable.users import person, users

# The rate can come as a JSON number, which has to keep every digit for its checks (B7).
router = APIRouter(prefix="/settings", route_class=api.ExactNumbersRoute)

# The one row there is, added by the migration (B13).
_the_row = company_settings.c.id == 1


def _read(conn: Connection) -> Row:
    return conn.execute(
        select(company_settings, users.c.name.label("updated_by_name"), users.c.email.label("updated_by_email"))
        .outerjoin(users, company_settings.c.updated_by == users.c.id)
        .where(_the_row)
    ).one()


def _reply(row: Row) -> schemas.CompanySettings:
    return schemas.CompanySettings.model_validate(
        {
            **row._mapping,
            "tax_rate": schemas.rate_text(row.tax_rate),
            "updated_by": person(row.updated_by, row.updated_by_name, row.updated_by_email),
        }
    )


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
    # Read, checked and written under the write lock, so two quick saves can't each pass against the old values.
    with db.writing() as conn:
        saved = _read(conn)
        _refuse_what_breaks_the_rules(saved, sent)
        altered = who.alterations(sent, saved)
        if altered:
            conn.execute(update(company_settings).where(_the_row).values(**altered, **who.changed(user, now)))
            saved = _read(conn)
        return _reply(saved)
