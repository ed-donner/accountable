from accountable.company import tables as company_tables
from accountable.crm import tables
from alembic import context

# Read through the areas' tables, since importing them is what fills the metadata,
# and they import users for their foreign keys. Batch mode is on because SQLite can
# only make most table changes by rebuilding the table.
assert company_tables.metadata is tables.metadata
metadata = tables.metadata

if context.is_offline_mode():
    # Writes out the SQL for the database the URL names, which needs no database.
    context.configure(
        url=context.config.get_main_option("sqlalchemy.url"),
        literal_binds=True,
        target_metadata=metadata,
        render_as_batch=True,
    )
else:
    # db.py hands over an open connection and owns its transaction.
    context.configure(
        connection=context.config.attributes["connection"],
        target_metadata=metadata,
        render_as_batch=True,
    )

with context.begin_transaction():
    context.run_migrations()
