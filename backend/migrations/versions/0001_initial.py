"""The four tables (spec 2.2).

Checked by hand after autogenerate: autogenerate can't see the unique index on
lower(name), so it is added below.

Revision ID: 0001
Revises: 
Create Date: 2026-11-19 23:04:06.163040

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0001'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('organizations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('website', sa.Text(), nullable=True),
    sa.Column('industry', sa.Text(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_organizations'))
    )
    # No two organizations can share a name, ignoring capitals.
    op.create_index('ux_organizations_name_lower', 'organizations', [sa.text('lower(name)')], unique=True)
    op.create_table('contacts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('email', sa.Text(), nullable=True),
    sa.Column('phone', sa.Text(), nullable=True),
    sa.Column('job_title', sa.Text(), nullable=True),
    sa.Column('organization_id', sa.Integer(), nullable=True),
    sa.Column('status', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("status IN ('lead', 'qualified', 'customer')", name=op.f('ck_contacts_status')),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_contacts_organization_id_organizations'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_contacts'))
    )
    with op.batch_alter_table('contacts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_contacts_organization_id'), ['organization_id'], unique=False)

    op.create_table('deals',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('main_contact_id', sa.Integer(), nullable=True),
    sa.Column('stage', sa.Text(), nullable=False),
    sa.Column('value', sa.Integer(), nullable=False),
    sa.Column('probability', sa.Integer(), nullable=False),
    sa.Column('close_date', sa.Date(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("stage IN ('new', 'qualified', 'proposal', 'negotiation', 'won', 'lost')", name=op.f('ck_deals_stage')),
    sa.CheckConstraint('probability BETWEEN 0 AND 100', name=op.f('ck_deals_probability')),
    sa.CheckConstraint('value >= 0', name=op.f('ck_deals_value')),
    sa.ForeignKeyConstraint(['main_contact_id'], ['contacts.id'], name=op.f('fk_deals_main_contact_id_contacts'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_deals_organization_id_organizations'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_deals'))
    )
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_deals_main_contact_id'), ['main_contact_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_deals_organization_id'), ['organization_id'], unique=False)
        batch_op.create_index('ix_deals_stage_position', ['stage', 'position'], unique=False)

    op.create_table('activities',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('type', sa.Text(), nullable=False),
    sa.Column('contact_id', sa.Integer(), nullable=True),
    sa.Column('deal_id', sa.Integer(), nullable=True),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('occurred_at', sa.DateTime(), nullable=False),
    sa.Column('follow_up_date', sa.Date(), nullable=True),
    sa.Column('done', sa.Boolean(), server_default=sa.text('0'), nullable=False),
    sa.Column('from_stage', sa.Text(), nullable=True),
    sa.Column('to_stage', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("type IN ('note', 'call', 'email', 'stage_change')", name=op.f('ck_activities_type')),
    sa.CheckConstraint('contact_id IS NOT NULL AND deal_id IS NULL OR contact_id IS NULL AND deal_id IS NOT NULL', name=op.f('ck_activities_one_link')),
    sa.ForeignKeyConstraint(['contact_id'], ['contacts.id'], name=op.f('fk_activities_contact_id_contacts'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], name=op.f('fk_activities_deal_id_deals'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_activities'))
    )
    with op.batch_alter_table('activities', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_activities_contact_id'), ['contact_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_activities_deal_id'), ['deal_id'], unique=False)
        batch_op.create_index('ix_activities_follow_up_date_done', ['follow_up_date', 'done'], unique=False)
        batch_op.create_index(batch_op.f('ix_activities_occurred_at'), ['occurred_at'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('activities', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_activities_occurred_at'))
        batch_op.drop_index('ix_activities_follow_up_date_done')
        batch_op.drop_index(batch_op.f('ix_activities_deal_id'))
        batch_op.drop_index(batch_op.f('ix_activities_contact_id'))

    op.drop_table('activities')
    with op.batch_alter_table('deals', schema=None) as batch_op:
        batch_op.drop_index('ix_deals_stage_position')
        batch_op.drop_index(batch_op.f('ix_deals_organization_id'))
        batch_op.drop_index(batch_op.f('ix_deals_main_contact_id'))

    op.drop_table('deals')
    with op.batch_alter_table('contacts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_contacts_organization_id'))

    op.drop_table('contacts')
    op.drop_index('ux_organizations_name_lower', table_name='organizations')
    op.drop_table('organizations')
