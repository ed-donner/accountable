from accountable.company import tables as company_tables
from accountable.crm import tables as crm_tables
from accountable.invoices import tables as invoices_tables
from accountable.products import tables as products_tables
from alembic import context

# Every area's tables share one metadata, and importing an area's tables is what adds
# them to it. Its tables import users for their foreign keys. Batch mode is on because
# SQLite can only make most table changes by rebuilding the table.
metadata = crm_tables.metadata
assert products_tables.metadata is metadata
assert company_tables.metadata is metadata
assert invoices_tables.metadata is metadata

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
