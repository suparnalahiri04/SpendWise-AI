from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth_dependencies import get_current_user
from app.dependencies import get_db
from app.models import GoalContribution, SavingsGoal, User
from app.timezone import get_current_ist_date
from app.schemas import (
    GoalContributionCreate,
    GoalContributionResponse,
    SavingsGoalCreate,
    SavingsGoalProgressItem,
    SavingsGoalsSummaryResponse,
    SavingsGoalUpdate,
)

router = APIRouter(prefix="/goals", tags=["Savings Goals"])


def calculate_goal_progress(
    goal: SavingsGoal,
    ref_date: date | None = None,
) -> SavingsGoalProgressItem:
    """Calculate progress, remaining amount, and on-track status for a savings goal.

    Pure deterministic calculation without external AI.
    """
    now_utc = datetime.now(timezone.utc)
    effective_today = ref_date or get_current_ist_date()

    contributions = list(goal.contributions or [])
    total_contributed = sum((c.amount for c in contributions), Decimal("0.00"))
    target_amount = goal.target_amount

    # If target amount was reduced below contributions, remaining amount is zero
    remaining_amount = max(Decimal("0.00"), target_amount - total_contributed)

    # Progress percentage: mathematically calculated, capped at 100.0% for display
    if target_amount > 0:
        raw_pct = float(total_contributed / target_amount) * 100.0
        progress_pct = round(min(100.0, max(0.0, raw_pct)), 2)
    else:
        progress_pct = 100.0 if total_contributed > 0 else 0.0

    # Status consistency rules:
    # 1. Archived goals stay archived so they remain distinguishable.
    # 2. Non-archived goals reaching their target amount are reported as completed.
    if goal.status == "archived":
        effective_status = "archived"
        is_completed = total_contributed >= target_amount
    else:
        if total_contributed >= target_amount or goal.status == "completed":
            effective_status = "completed"
            is_completed = True
        else:
            effective_status = "in_progress"
            is_completed = False

    # Pacing / On-track logic:
    if goal.target_date is None:
        days_remaining = None
        is_on_track = None
    else:
        days_remaining = (goal.target_date - effective_today).days
        if is_completed:
            is_on_track = True
        elif effective_today > goal.target_date:
            # Overdue target date without reaching target amount
            is_on_track = False
        else:
            # Start date anchor from created_at
            created_dt = goal.created_at
            start_date = (
                created_dt.date()
                if isinstance(created_dt, datetime)
                else effective_today
            )
            if start_date > effective_today:
                start_date = effective_today

            total_days = (goal.target_date - start_date).days
            elapsed_days = (effective_today - start_date).days

            if total_days <= 0:
                is_on_track = total_contributed >= target_amount
            elif elapsed_days <= 0:
                is_on_track = True
            else:
                expected_amount = (
                    target_amount * Decimal(elapsed_days)
                ) / Decimal(total_days)
                is_on_track = total_contributed >= expected_amount

    recent_contributions = [
        GoalContributionResponse.model_validate(c) for c in contributions[:5]
    ]

    return SavingsGoalProgressItem(
        id=goal.id,
        user_id=goal.user_id,
        name=goal.name,
        target_amount=goal.target_amount,
        target_date=goal.target_date,
        status=effective_status,
        total_contributed=total_contributed,
        remaining_amount=remaining_amount,
        progress_pct=progress_pct,
        is_completed=is_completed,
        is_on_track=is_on_track,
        days_remaining=days_remaining,
        recent_contributions=recent_contributions,
        created_at=goal.created_at or now_utc,
        updated_at=goal.updated_at or now_utc,
    )


@router.get("/", response_model=SavingsGoalsSummaryResponse)
def list_savings_goals(
    include_archived: bool = Query(default=True, description="Include archived goals"),
    ref_date: date | None = Query(default=None, description="Optional evaluation date for testing"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsGoalsSummaryResponse:
    """Retrieve all savings goals belonging exclusively to the authenticated user."""
    stmt = (
        select(SavingsGoal)
        .options(selectinload(SavingsGoal.contributions))
        .where(SavingsGoal.user_id == current_user.id)
        .order_by(SavingsGoal.created_at.desc(), SavingsGoal.id.desc())
    )
    if not include_archived:
        stmt = stmt.where(SavingsGoal.status != "archived")

    goals = list(db.scalars(stmt).all())
    items = [calculate_goal_progress(g, ref_date=ref_date) for g in goals]

    # Overall summary metrics excluding archived goals
    active_items = [item for item in items if item.status != "archived"]
    total_target = sum((item.target_amount for item in active_items), Decimal("0.00"))
    total_saved = sum((item.total_contributed for item in active_items), Decimal("0.00"))
    total_remaining = sum((item.remaining_amount for item in active_items), Decimal("0.00"))
    overall_progress = (
        round(min(100.0, float(total_saved / total_target) * 100), 2)
        if total_target > 0
        else 0.0
    )
    completed_count = len([item for item in active_items if item.is_completed])

    return SavingsGoalsSummaryResponse(
        total_target_amount=total_target,
        total_saved_amount=total_saved,
        total_remaining_amount=total_remaining,
        overall_progress_pct=overall_progress,
        goals_count=len(active_items),
        completed_goals_count=completed_count,
        items=items,
    )


@router.post("/", response_model=SavingsGoalProgressItem, status_code=status.HTTP_201_CREATED)
def create_savings_goal(
    payload: SavingsGoalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsGoalProgressItem:
    """Create a new savings goal for the authenticated user."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Goal name cannot be empty.",
        )
    if payload.target_amount <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Target amount must be greater than zero.",
        )

    goal = SavingsGoal(
        user_id=current_user.id,
        name=name,
        target_amount=payload.target_amount,
        target_date=payload.target_date,
        status="in_progress",
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)

    return calculate_goal_progress(goal)


@router.get("/{goal_id}", response_model=SavingsGoalProgressItem)
def get_savings_goal(
    goal_id: int,
    ref_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsGoalProgressItem:
    """Retrieve details for a single goal owned by the authenticated user."""
    stmt = (
        select(SavingsGoal)
        .options(selectinload(SavingsGoal.contributions))
        .where(
            SavingsGoal.id == goal_id,
            SavingsGoal.user_id == current_user.id,
        )
    )
    goal = db.scalar(stmt)
    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings goal not found.",
        )

    return calculate_goal_progress(goal, ref_date=ref_date)


@router.put("/{goal_id}", response_model=SavingsGoalProgressItem)
def update_savings_goal(
    goal_id: int,
    payload: SavingsGoalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsGoalProgressItem:
    """Update goal attributes (name, target amount, target date, status)."""
    stmt = (
        select(SavingsGoal)
        .options(selectinload(SavingsGoal.contributions))
        .where(
            SavingsGoal.id == goal_id,
            SavingsGoal.user_id == current_user.id,
        )
    )
    goal = db.scalar(stmt)
    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings goal not found.",
        )

    if payload.name is not None:
        cleaned_name = payload.name.strip()
        if not cleaned_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Goal name cannot be empty.",
            )
        goal.name = cleaned_name

    if payload.target_amount is not None:
        if payload.target_amount <= Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Target amount must be greater than zero.",
            )
        goal.target_amount = payload.target_amount

    if payload.target_date is not None or "target_date" in payload.model_fields_set:
        goal.target_date = payload.target_date

    if payload.status is not None:
        goal.status = payload.status

    db.commit()
    db.refresh(goal)

    return calculate_goal_progress(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_savings_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a goal and its contributions."""
    stmt = select(SavingsGoal).where(
        SavingsGoal.id == goal_id,
        SavingsGoal.user_id == current_user.id,
    )
    goal = db.scalar(stmt)
    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings goal not found.",
        )

    db.delete(goal)
    db.commit()


@router.post(
    "/{goal_id}/contributions",
    response_model=SavingsGoalProgressItem,
    status_code=status.HTTP_201_CREATED,
)
def add_goal_contribution(
    goal_id: int,
    payload: GoalContributionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsGoalProgressItem:
    """Record a savings contribution towards an owned goal.

    Semantics: User-recorded savings entries for goal tracking. Does not alter real bank ledger entries.
    """
    stmt = (
        select(SavingsGoal)
        .options(selectinload(SavingsGoal.contributions))
        .where(
            SavingsGoal.id == goal_id,
            SavingsGoal.user_id == current_user.id,
        )
    )
    goal = db.scalar(stmt)
    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings goal not found.",
        )

    if payload.amount <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Contribution amount must be greater than zero.",
        )

    contrib_date = payload.contribution_date or get_current_ist_date()
    cleaned_notes = payload.notes.strip() if payload.notes else None

    contribution = GoalContribution(
        goal_id=goal.id,
        user_id=current_user.id,
        amount=payload.amount,
        contribution_date=contrib_date,
        notes=cleaned_notes,
    )
    db.add(contribution)
    db.commit()
    db.refresh(goal)

    return calculate_goal_progress(goal)


@router.get(
    "/{goal_id}/contributions",
    response_model=list[GoalContributionResponse],
)
def list_goal_contributions(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[GoalContributionResponse]:
    """List all historical contributions recorded for a goal."""
    # Ensure goal belongs to current_user
    goal_stmt = select(SavingsGoal).where(
        SavingsGoal.id == goal_id,
        SavingsGoal.user_id == current_user.id,
    )
    goal = db.scalar(goal_stmt)
    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings goal not found.",
        )

    stmt = (
        select(GoalContribution)
        .where(
            GoalContribution.goal_id == goal_id,
            GoalContribution.user_id == current_user.id,
        )
        .order_by(GoalContribution.contribution_date.desc(), GoalContribution.id.desc())
    )
    contributions = list(db.scalars(stmt).all())
    return [GoalContributionResponse.model_validate(c) for c in contributions]


@router.delete(
    "/{goal_id}/contributions/{contribution_id}",
    response_model=SavingsGoalProgressItem,
)
def delete_goal_contribution(
    goal_id: int,
    contribution_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsGoalProgressItem:
    """Delete an individual contribution and return updated goal progress."""
    goal_stmt = (
        select(SavingsGoal)
        .options(selectinload(SavingsGoal.contributions))
        .where(
            SavingsGoal.id == goal_id,
            SavingsGoal.user_id == current_user.id,
        )
    )
    goal = db.scalar(goal_stmt)
    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings goal not found.",
        )

    stmt = select(GoalContribution).where(
        GoalContribution.id == contribution_id,
        GoalContribution.goal_id == goal_id,
        GoalContribution.user_id == current_user.id,
    )
    contribution = db.scalar(stmt)
    if contribution is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contribution not found.",
        )

    db.delete(contribution)
    db.commit()
    db.refresh(goal)

    return calculate_goal_progress(goal)
