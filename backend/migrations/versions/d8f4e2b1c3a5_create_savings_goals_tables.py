"""create savings goals and contributions tables

Revision ID: d8f4e2b1c3a5
Revises: c7e3f8a9b1d2
Create Date: 2026-11-01 04:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8f4e2b1c3a5'
down_revision: Union[str, Sequence[str], None] = 'c7e3f8a9b1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'savings_goals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('target_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('target_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=20), server_default='in_progress', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_savings_goals_id'), 'savings_goals', ['id'], unique=False)
    op.create_index(op.f('ix_savings_goals_user_id'), 'savings_goals', ['user_id'], unique=False)
    op.create_index(op.f('ix_savings_goals_status'), 'savings_goals', ['status'], unique=False)

    op.create_table(
        'goal_contributions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('contribution_date', sa.Date(), nullable=False),
        sa.Column('notes', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['goal_id'], ['savings_goals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_goal_contributions_id'), 'goal_contributions', ['id'], unique=False)
    op.create_index(op.f('ix_goal_contributions_goal_id'), 'goal_contributions', ['goal_id'], unique=False)
    op.create_index(op.f('ix_goal_contributions_user_id'), 'goal_contributions', ['user_id'], unique=False)
    op.create_index(op.f('ix_goal_contributions_contribution_date'), 'goal_contributions', ['contribution_date'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_goal_contributions_contribution_date'), table_name='goal_contributions')
    op.drop_index(op.f('ix_goal_contributions_user_id'), table_name='goal_contributions')
    op.drop_index(op.f('ix_goal_contributions_goal_id'), table_name='goal_contributions')
    op.drop_index(op.f('ix_goal_contributions_id'), table_name='goal_contributions')
    op.drop_table('goal_contributions')

    op.drop_index(op.f('ix_savings_goals_status'), table_name='savings_goals')
    op.drop_index(op.f('ix_savings_goals_user_id'), table_name='savings_goals')
    op.drop_index(op.f('ix_savings_goals_id'), table_name='savings_goals')
    op.drop_table('savings_goals')

