"""add category column to transactions

Revision ID: b3f1a8d27e91
Revises: 71cb942d397a
Create Date: 2026-05-16 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b3f1a8d27e91'
down_revision = '71cb942d397a'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('category', sa.String(length=50), nullable=True))
    # Backfill: existing expense rows are uncategorised — bucket them under
    # "other" so the dashboard breakdown shows a sensible value instead of NULL.
    op.execute(
        "UPDATE transactions SET category='other' "
        "WHERE transaction_type='expense' AND category IS NULL"
    )


def downgrade():
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_column('category')