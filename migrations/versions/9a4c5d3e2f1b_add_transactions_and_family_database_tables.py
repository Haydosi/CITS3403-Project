"""Add transactions and family database tables for leaderboard

Revision ID: 9a4c5d3e2f1b
Revises: 8bfa2c439e6e
Create Date: 2026-05-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9a4c5d3e2f1b'
down_revision = '8bfa2c439e6e'
branch_labels = None
depends_on = None


def upgrade():
    # Create transactions table for global database
    op.create_table(
        'transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('transaction_type', sa.String(50), nullable=False, server_default='savings'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_transactions_user_id', 'transactions', ['user_id'])
    op.create_index('idx_transactions_group_id', 'transactions', ['group_id'])
    op.create_index('idx_transactions_created_at', 'transactions', ['created_at'])
    op.create_index('idx_transactions_type', 'transactions', ['transaction_type'])

    # Create family_groups table
    op.create_table(
        'family_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('global_group_id', sa.Integer(), nullable=False),
        sa.Column('group_name', sa.String(50), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('family_code', sa.String(20), nullable=True),
        sa.Column('total_savings', sa.Float(), nullable=True, server_default='0'),
        sa.Column('member_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['global_group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('global_group_id'),
        sa.UniqueConstraint('family_code')
    )
    op.create_index('idx_family_groups_owner', 'family_groups', ['owner_id'])
    op.create_index('idx_family_groups_code', 'family_groups', ['family_code'])

    # Create family_members table
    op.create_table(
        'family_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('family_group_id', sa.Integer(), nullable=False),
        sa.Column('global_user_id', sa.Integer(), nullable=False),
        sa.Column('first_name', sa.String(100), nullable=True),
        sa.Column('last_name', sa.String(100), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('total_savings', sa.Float(), nullable=True, server_default='0'),
        sa.Column('contribution_percentage', sa.Float(), nullable=True, server_default='0'),
        sa.Column('member_since', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('last_updated', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['family_group_id'], ['family_groups.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('family_group_id', 'global_user_id')
    )
    op.create_index('idx_family_members_group', 'family_members', ['family_group_id'])
    op.create_index('idx_family_members_user', 'family_members', ['global_user_id'])

    # Create family_transactions table
    op.create_table(
        'family_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('family_group_id', sa.Integer(), nullable=False),
        sa.Column('family_member_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('transaction_type', sa.String(50), nullable=False, server_default='savings'),
        sa.Column('recorded_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['family_group_id'], ['family_groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['family_member_id'], ['family_members.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_family_transactions_group', 'family_transactions', ['family_group_id'])
    op.create_index('idx_family_transactions_member', 'family_transactions', ['family_member_id'])

    # Create family_goals table
    op.create_table(
        'family_goals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('family_group_id', sa.Integer(), nullable=False),
        sa.Column('goal_name', sa.String(100), nullable=False),
        sa.Column('target_amount', sa.Float(), nullable=False),
        sa.Column('current_amount', sa.Float(), nullable=True, server_default='0'),
        sa.Column('deadline', sa.Date(), nullable=True),
        sa.Column('status', sa.String(20), nullable=True, server_default='active'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['family_group_id'], ['family_groups.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_family_goals_group', 'family_goals', ['family_group_id'])


def downgrade():
    # Drop family_goals table
    op.drop_index('idx_family_goals_group', table_name='family_goals')
    op.drop_table('family_goals')

    # Drop family_transactions table
    op.drop_index('idx_family_transactions_member', table_name='family_transactions')
    op.drop_index('idx_family_transactions_group', table_name='family_transactions')
    op.drop_table('family_transactions')

    # Drop family_members table
    op.drop_index('idx_family_members_user', table_name='family_members')
    op.drop_index('idx_family_members_group', table_name='family_members')
    op.drop_table('family_members')

    # Drop family_groups table
    op.drop_index('idx_family_groups_code', table_name='family_groups')
    op.drop_index('idx_family_groups_owner', table_name='family_groups')
    op.drop_table('family_groups')

    # Drop transactions table
    op.drop_index('idx_transactions_type', table_name='transactions')
    op.drop_index('idx_transactions_created_at', table_name='transactions')
    op.drop_index('idx_transactions_group_id', table_name='transactions')
    op.drop_index('idx_transactions_user_id', table_name='transactions')
    op.drop_table('transactions')
