"""The FastAPI app. Each module brings its own router; startup creates and seeds a new database (R3)."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import activities, contacts, dashboard, db, deals, organizations, seed, settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not settings.db_path().exists():
        seed.reset()
    else:
        db.create_schema()
    yield


app = FastAPI(title="Accountable", lifespan=lifespan)

for module in (organizations, contacts, deals, activities, dashboard):
    app.include_router(module.router, prefix="/api")


def _field_message(error: dict) -> str:
    kind, ctx = error.get("type", ""), error.get("ctx") or {}
    if kind in ("missing", "string_too_short"):
        return "This is required"
    if kind == "greater_than_equal":
        return f"Must be {ctx.get('ge')} or more"
    if kind == "less_than_equal":
        return f"Must be {ctx.get('le')} or less"
    if kind in ("literal_error", "enum"):
        return "Choose one of the options"
    if kind.startswith("date") or kind.startswith("datetime"):
        return "Enter a valid date"
    if kind.startswith("int"):
        return "Enter a whole number"
    if kind == "value_error":
        return str(error.get("msg", "")).removeprefix("Value error, ")
    return str(error.get("msg", "Check this value"))


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 with one plain message per field, so forms can show it next to the field (R58)."""
    fields: dict[str, str] = {}
    for error in exc.errors():
        loc = [str(part) for part in error.get("loc", []) if part not in ("body", "query", "path")]
        fields.setdefault(loc[-1] if loc else "form", _field_message(error))
    return JSONResponse(status_code=422, content={"detail": "Check the highlighted fields", "fields": fields})
