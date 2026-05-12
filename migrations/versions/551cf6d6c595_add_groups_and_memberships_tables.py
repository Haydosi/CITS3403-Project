"""add groups and memberships tables

Revision ID: 551cf6d6c595
Revises: c6baf92c5bf8
Create Date: 2026-05-12 15:49:22.863439

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '551cf6d6c595'
down_revision = 'c6baf92c5bf8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('group_name', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table('user_group_memberships',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('user_role', sa.Enum('MEMBER', 'ADMIN', 'OWNER', name='grouprole'), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'group_id', name='unique_user_group_membership')
    )


def downgrade():
    op.drop_table('user_group_memberships')
    op.drop_table('groups')
