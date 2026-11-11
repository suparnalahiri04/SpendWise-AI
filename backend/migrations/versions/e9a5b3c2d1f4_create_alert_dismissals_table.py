"""create alert dismissals table

Revision ID: e9a5b3c2d1f4
Revises: d8f4e2b1c3a5
Create Date: 2026-11-02 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e9a5b3c2d1f4'
down_revision: Union[str, Sequence[str], None] = 'd8f4e2b1c3a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'alert_dismissals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('alert_key', sa.String(length=128), nullable=False),
        sa.Column('dismissed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'alert_key', name='uq_user_alert_dismissal'),
    )
    op.create_index(op.f('ix_alert_dismissals_id'), 'alert_dismissals', ['id'], unique=False)
    op.create_index(op.f('ix_alert_dismissals_user_id'), 'alert_dismissals', ['user_id'], unique=False)
    op.create_index(op.f('ix_alert_dismissals_alert_key'), 'alert_dismissals', ['alert_key'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_alert_dismissals_alert_key'), table_name='alert_dismissals')
    op.drop_index(op.f('ix_alert_dismissals_user_id'), table_name='alert_dismissals')
    op.drop_index(op.f('ix_alert_dismissals_id'), table_name='alert_dismissals')
    op.drop_table('alert_dismissals')

