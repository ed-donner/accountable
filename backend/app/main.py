"""The FastAPI app. Each module brings its own router; startup creates and seeds a new database (R3)."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import activities, api, contacts, dashboard, db, deals, organizations, seed, settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not settings.db_path().exists():
        seed.reset()
    else:
        db.create_schema()
    yield


app = FastAPI(title="Accountable", lifespan=lifespan)
app.add_exception_handler(RequestValidationError, api.validation_error)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts())


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    """Refuse oversized requests before reading them. Field limits (api.py) cover the rest."""
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > api.MAX_BODY_BYTES):
        return JSONResponse(status_code=413, content={"detail": "That's too much to save at once."})
    return await call_next(request)


for module in (organizations, contacts, deals, activities, dashboard):
    app.include_router(module.router, prefix="/api")
