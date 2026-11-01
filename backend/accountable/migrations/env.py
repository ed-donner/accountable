from alembic import context

from accountable.crm import tables  # noqa: F401  (registers the tables on the metadata)
from accountable.db import metadata

# db.py hands over an open connection and owns its transaction. Batch mode is on
# because SQLite can only make most table changes by rebuilding the table.
context.configure(
    connection=context.config.attributes["connection"],
    target_metadata=metadata,
    render_as_batch=True,
)
with context.begin_transaction():
    context.run_migrations()
