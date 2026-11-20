"""The FastAPI app. On start it runs the migrations, seeds a new database, and
keeps the engine on app.state."""

from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from sqlalchemy import Engine

from backend.app import clock
from backend.app.config import Settings
from backend.app.db import make_engine
from backend.app.routers import activities, contacts, dashboard, deals, meta, organizations, pipeline

ROOT = Path(__file__).resolve().parents[2]


def run_migrations(engine: Engine) -> None:
    """Bring the database up to the latest migration."""
    config = Config(str(ROOT / "alembic.ini"))
    with engine.connect() as conn:
        conn.info["write"] = True
        config.attributes["connection"] = conn
        command.upgrade(config, "head")
        conn.commit()


def prepare_database(settings: Settings, seed_new: bool) -> Engine:
    is_new = not settings.db_path.exists()
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = make_engine(settings.db_path)
    run_migrations(engine)
    if is_new and seed_new:
        from backend.app.seed import load_sample_data

        with engine.connect() as conn:
            conn.info["write"] = True
            with conn.begin():
                load_sample_data(conn, clock.today(), clock.now())
    return engine


def create_app(settings: Settings | None = None, seed_new: bool = True) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = prepare_database(settings, seed_new)
        app.state.settings = settings
        app.state.engine = engine
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="Accountable", lifespan=lifespan)
    for module in (meta, organizations, contacts, deals, activities, pipeline, dashboard):
        app.include_router(module.router)
    return app


app = create_app()
