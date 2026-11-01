"""The first tables.

Revision ID: 0001
Revises: none
"""

import sqlalchemy as sa
from alembic import op


revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


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
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_contacts_organization_id_organizations'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_contacts'))
    )
    with op.batch_alter_table('contacts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_contacts_organization_id'), ['organization_id'], unique=False)

    op.create_table('deals',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=True),
    sa.Column('main_contact_id', sa.Integer(), nullable=True),
    sa.Column('stage', sa.Text(), nullable=False),
    sa.Column('value', sa.Integer(), nullable=False),
    sa.Column('probability', sa.Integer(), nullable=False),
    sa.Column('close_date', sa.Date(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['main_contact_id'], ['contacts.id'], name=op.f('fk_deals_main_contact_id_contacts'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_deals_organization_id_organizations'), ondelete='SET NULL'),
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
    sa.Column('follow_up_done', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint('(contact_id IS NULL) != (deal_id IS NULL)', name=op.f('ck_activities_one_parent')),
    sa.ForeignKeyConstraint(['contact_id'], ['contacts.id'], name=op.f('fk_activities_contact_id_contacts'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], name=op.f('fk_activities_deal_id_deals'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_activities'))
    )
    with op.batch_alter_table('activities', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_activities_contact_id'), ['contact_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_activities_deal_id'), ['deal_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_activities_follow_up_date'), ['follow_up_date'], unique=False)
        batch_op.create_index(batch_op.f('ix_activities_occurred_at'), ['occurred_at'], unique=False)

    op.create_table('stage_changes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('deal_id', sa.Integer(), nullable=False),
    sa.Column('from_stage', sa.Text(), nullable=False),
    sa.Column('to_stage', sa.Text(), nullable=False),
    sa.Column('changed_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], name=op.f('fk_stage_changes_deal_id_deals'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_stage_changes'))
    )
    with op.batch_alter_table('stage_changes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_stage_changes_changed_at'), ['changed_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_stage_changes_deal_id'), ['deal_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('stage_changes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_stage_changes_deal_id'))
        batch_op.drop_index(batch_op.f('ix_stage_changes_changed_at'))

    op.drop_table('stage_changes')
    with op.batch_alter_table('activities', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_activities_occurred_at'))
        batch_op.drop_index(batch_op.f('ix_activities_follow_up_date'))
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
    op.drop_table('organizations')
