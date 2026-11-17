"""Alembic environment. Runs against the connection the backend hands over,
or against ACCOUNTABLE_DB when run from the command line."""

from alembic import context

from app import config
from app.db import engine_for, metadata

target_metadata = metadata


def run_migrations() -> None:
    connection = context.config.attributes.get("connection")
    if connection is not None:
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
        return
    with engine_for(config.db_path()).connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()


run_migrations()
