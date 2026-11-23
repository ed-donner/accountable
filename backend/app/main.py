"""The FastAPI app: routers, error handlers and startup."""

import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.datastructures import Headers
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import config
from app.db import engine_for, migrate
from app.routers import (
    activities,
    contacts,
    dashboard,
    deals,
    health,
    organizations,
    timeline,
)
from app.schemas import MESSAGES, FieldErrors, NotFound

log = logging.getLogger("accountable")

GENERAL_ERROR = (
    "Something went wrong in Accountable. Try again, and if it keeps happening, restart the app."
)


def start_database() -> None:
    """Migrate, then fill a brand-new database with the sample data (G4, G12)."""
    path = config.db_path()
    is_new = not path.exists()
    engine = engine_for(path)
    migrate(engine)
    if is_new:
        from app.seed import seed

        seed(engine, config.server_today())


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_database()
    yield


app = FastAPI(title="Accountable", version="0.1.0", lifespan=lifespan)

# Only answer requests addressed to this computer, so a web page that points its
# own domain name at 127.0.0.1 (DNS rebinding) can't read or change the data (RV10).
# The Vite proxy sends Host 127.0.0.1; "testserver" is FastAPI's test client.
ALLOWED_HOSTS = ["127.0.0.1", "localhost"] + (["testserver"] if config.testing() else [])
WRONG_HOST = "Accountable only answers requests made on this computer."


class LocalHostsOnly:
    """Like Starlette's TrustedHostMiddleware, but the refusal uses the API's usual
    error shape (spec: errors are {"message", "fields"})."""

    def __init__(self, app, allowed_hosts: list[str]):
        self.app = app
        self.allowed_hosts = set(allowed_hosts)

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            host = Headers(scope=scope).get("host", "").split(":")[0]
            if host not in self.allowed_hosts:
                if scope["type"] == "websocket":
                    await send({"type": "websocket.close", "code": 1008})
                else:
                    response = JSONResponse(
                        status_code=400, content={"message": WRONG_HOST, "fields": {}}
                    )
                    await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


app.add_middleware(LocalHostsOnly, allowed_hosts=ALLOWED_HOSTS)

API = "/api"
for module in (health, organizations, contacts, deals, activities, timeline, dashboard):
    app.include_router(module.router, prefix=API)

if config.testing():
    from app.routers import testing

    app.include_router(testing.router, prefix=API)


# --- Errors (G8, V4) ------------------------------------------------------


def _field_name(loc: tuple) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path", "header")]
    return parts[0] if parts else ""


@app.exception_handler(RequestValidationError)
async def on_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # A record id in the URL that can't exist (not a number, or too large) is
    # simply not found, like a deleted one (RV11).
    if exc.errors() and all(tuple(e.get("loc", ()))[:1] == ("path",) for e in exc.errors()):
        return JSONResponse(
            status_code=404,
            content={
                "message": "We couldn't find that record. It may have been deleted.",
                "fields": {},
            },
        )
    fields: dict[str, str] = {}
    for error in exc.errors():
        field = _field_name(tuple(error.get("loc", ())))
        if not field or field in fields:
            continue
        if error.get("type") == "value_error":
            message = str(error.get("ctx", {}).get("error", "")) or MESSAGES.get(
                field, "Check this field."
            )
        else:
            message = MESSAGES.get(field, "Check this field.")
        fields[field] = message
    if not fields:
        return JSONResponse(
            status_code=400,
            content={
                "message": "Accountable couldn't read that request. Try again.",
                "fields": {},
            },
        )
    return JSONResponse(
        status_code=400,
        content={
            "message": "Check the highlighted fields and try again.",
            "fields": fields,
        },
    )


@app.exception_handler(FieldErrors)
async def on_field_errors(_request: Request, exc: FieldErrors) -> JSONResponse:
    return JSONResponse(status_code=400, content={"message": exc.message, "fields": exc.fields})


@app.exception_handler(NotFound)
async def on_not_found(_request: Request, exc: NotFound) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content={
            "message": f"We couldn't find that {exc.kind}. It may have been deleted.",
            "fields": {},
        },
    )


@app.exception_handler(StarletteHTTPException)
async def on_http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if exc.status_code == 404:
        message = "We couldn't find that page in Accountable."
    elif exc.status_code == 405:
        message = "Accountable can't do that here."
    else:
        message = GENERAL_ERROR
    return JSONResponse(status_code=exc.status_code, content={"message": message, "fields": {}})


@app.exception_handler(Exception)
async def on_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unexpected error", exc_info=exc)
    return JSONResponse(status_code=500, content={"message": GENERAL_ERROR, "fields": {}})


if __name__ == "__main__":
    # `uv run python -m app.main` prints the OpenAPI schema, used by `npm run types`.
    print(json.dumps(app.openapi(), indent=2))
