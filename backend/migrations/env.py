"""Alembic's setup.

The app passes its own connection in config.attributes["connection"]. The
alembic command has none, so it makes one from the settings and sets up
logging; doing that inside the app would silence Uvicorn's logs (plan, risk 7).
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection

from backend.app.config import Settings
from backend.app.db import make_engine, metadata

config = context.config


def run_with(connection: Connection) -> None:
    # Batch mode, because SQLite can't change most columns in place.
    context.configure(connection=connection, target_metadata=metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_offline() -> None:
    settings = Settings.from_env()
    context.configure(
        url=f"sqlite:///{settings.db_path.as_posix()}",
        target_metadata=metadata,
        render_as_batch=True,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        run_with(connection)
        return

    if config.config_file_name is not None:
        fileConfig(config.config_file_name)
    settings = Settings.from_env()
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = make_engine(settings.db_path)
    try:
        with engine.connect() as connection:
            connection.info["write"] = True
            run_with(connection)
            connection.commit()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_offline()
else:
    run_online()
