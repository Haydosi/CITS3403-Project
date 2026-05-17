"""add leaderboard_enabled to groups

Revision ID: c4e2b91f0a3d
Revises: b3f1a8d27e91
Create Date: 2026-05-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "c4e2b91f0a3d"
down_revision = "b3f1a8d27e91"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("groups", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "leaderboard_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
            )
        )


def downgrade():
    with op.batch_alter_table("groups", schema=None) as batch_op:
        batch_op.drop_column("leaderboard_enabled")
