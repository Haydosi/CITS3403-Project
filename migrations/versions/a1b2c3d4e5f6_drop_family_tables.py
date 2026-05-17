"""drop family_* tables

Revision ID: a1b2c3d4e5f6
Revises: b3f1a8d27e91
Create Date: 2026-05-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f6'
down_revision = 'b3f1a8d27e91'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table('family_transactions')
    op.drop_table('family_goals')
    op.drop_table('family_members')
    op.drop_table('family_groups')


def downgrade():
    op.create_table(
        'family_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('global_group_id', sa.Integer(), nullable=False),
        sa.Column('group_name', sa.String(length=50), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('family_code', sa.String(length=20), nullable=True),
        sa.Column('total_savings', sa.Float(), nullable=True),
        sa.Column('member_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['global_group_id'], ['groups.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('family_code'),
        sa.UniqueConstraint('global_group_id'),
    )
    op.create_table(
        'family_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('family_group_id', sa.Integer(), nullable=False),
        sa.Column('global_user_id', sa.Integer(), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=True),
        sa.Column('last_name', sa.String(length=100), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('total_savings', sa.Float(), nullable=True),
        sa.Column('contribution_percentage', sa.Float(), nullable=True),
        sa.Column('member_since', sa.DateTime(), nullable=False),
        sa.Column('last_updated', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['family_group_id'], ['family_groups.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('family_group_id', 'global_user_id', name='unique_family_member'),
    )
    op.create_table(
        'family_goals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('family_group_id', sa.Integer(), nullable=False),
        sa.Column('goal_name', sa.String(length=100), nullable=False),
        sa.Column('target_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('current_amount', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('deadline', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['family_group_id'], ['family_groups.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'family_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('family_group_id', sa.Integer(), nullable=False),
        sa.Column('family_member_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('transaction_type', sa.String(length=50), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['family_group_id'], ['family_groups.id'], ),
        sa.ForeignKeyConstraint(['family_member_id'], ['family_members.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
