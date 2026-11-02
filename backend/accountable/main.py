from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from accountable import cli, db
from accountable.crm import schemas
from accountable.crm.routers import activities, contacts, dashboard, deals, meta, organizations


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    db.prepare_database(cli.fill_sample)
    yield
    db.dispose()


app = FastAPI(title="Accountable", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

# There's no sign-in, so these two are what stop other websites in the same
# browser from reaching customer data. No cross-origin middleware is added.
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1"])


@app.middleware("http")
async def json_only(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type != "application/json":
            return JSONResponse({"detail": "Send JSON."}, status_code=415)
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, error: RequestValidationError):
    fields = schemas.field_messages(error.errors())
    return JSONResponse({"detail": "Check the form.", "fields": fields}, status_code=422)


@app.exception_handler(schemas.FieldError)
async def invalid_field(request: Request, error: schemas.FieldError):
    return JSONResponse({"detail": "Check the form.", "fields": error.fields}, status_code=422)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, error: Exception):
    # Always JSON, so the frontend can tell this from the proxy's empty reply
    # when the backend isn't there at all.
    return JSONResponse({"detail": "Something went wrong."}, status_code=500)


for router in (meta, organizations, contacts, deals, activities, dashboard):
    app.include_router(router.router, prefix="/api")
