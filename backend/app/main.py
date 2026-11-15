"""The FastAPI app. Each module brings its own router; startup creates and seeds a new database (R3)."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

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

for module in (organizations, contacts, deals, activities, dashboard):
    app.include_router(module.router, prefix="/api")
