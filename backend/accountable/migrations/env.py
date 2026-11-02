from accountable.crm import tables
from alembic import context

# db.py hands over an open connection and owns its transaction. Batch mode is on
# because SQLite can only make most table changes by rebuilding the table.
context.configure(
    connection=context.config.attributes["connection"],
    target_metadata=tables.metadata,  # Read through tables, since importing tables is what fills it.
    render_as_batch=True,
)
with context.begin_transaction():
    context.run_migrations()
