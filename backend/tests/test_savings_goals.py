from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.dependencies import get_db
from app.main import app
from app.models import Base, GoalContribution, SavingsGoal, Transaction, User
from app.savings_goals import (
    add_goal_contribution,
    calculate_goal_progress,
    create_savings_goal,
    delete_goal_contribution,
    delete_savings_goal,
    get_savings_goal,
    list_goal_contributions,
    list_savings_goals,
    update_savings_goal,
)
from app.schemas import (
    GoalContributionCreate,
    SavingsGoalCreate,
    SavingsGoalUpdate,
)


class SavingsGoalsBackendTestCase(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite database isolated for each test
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        def override_get_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db

        # Create two test users
        self.user1 = User(id=1, email="user1@example.com", password_hash="hash1")
        self.user2 = User(id=2, email="user2@example.com", password_hash="hash2")
        self.db.add_all([self.user1, self.user2])
        self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    # -------------------------------------------------------------------------
    # Goal CRUD Tests
    # -------------------------------------------------------------------------

    def test_create_goal_success(self):
        target_date = date.today() + timedelta(days=90)
        payload = SavingsGoalCreate(
            name="Emergency Fund",
            target_amount=Decimal("50000.00"),
            target_date=target_date,
        )
        goal = create_savings_goal(payload=payload, current_user=self.user1, db=self.db)
        self.assertIsNotNone(goal.id)
        self.assertEqual(goal.user_id, self.user1.id)
        self.assertEqual(goal.name, "Emergency Fund")
        self.assertEqual(goal.target_amount, Decimal("50000.00"))
        self.assertEqual(goal.target_date, target_date)
        self.assertEqual(goal.status, "in_progress")
        self.assertEqual(goal.total_contributed, Decimal("0.00"))
        self.assertEqual(goal.remaining_amount, Decimal("50000.00"))
        self.assertEqual(goal.progress_pct, 0.0)
        self.assertFalse(goal.is_completed)

    def test_create_goal_empty_name_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            create_savings_goal(
                payload=SavingsGoalCreate(name="   ", target_amount=Decimal("1000.00")),
                current_user=self.user1,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_create_goal_validation_non_positive_amount(self):
        with self.assertRaises(ValidationError):
            SavingsGoalCreate(name="Trip", target_amount=Decimal("0.00"))
        with self.assertRaises(ValidationError):
            SavingsGoalCreate(name="Trip", target_amount=Decimal("-100.00"))

    def test_list_goals_summary_and_status_filtering(self):
        # Create 2 goals for user 1
        g1 = create_savings_goal(
            SavingsGoalCreate(name="Goal 1", target_amount=Decimal("1000.00")),
            current_user=self.user1,
            db=self.db,
        )
        g2 = create_savings_goal(
            SavingsGoalCreate(name="Goal 2", target_amount=Decimal("2000.00")),
            current_user=self.user1,
            db=self.db,
        )
        # User 2 goal
        create_savings_goal(
            SavingsGoalCreate(name="User2 Goal", target_amount=Decimal("5000.00")),
            current_user=self.user2,
            db=self.db,
        )

        # Add contribution to g1 to complete it
        add_goal_contribution(
            goal_id=g1.id,
            payload=GoalContributionCreate(amount=Decimal("1000.00")),
            current_user=self.user1,
            db=self.db,
        )

        summary_all = list_savings_goals(include_archived=True, current_user=self.user1, db=self.db)
        self.assertEqual(len(summary_all.items), 2)
        self.assertEqual(summary_all.total_target_amount, Decimal("3000.00"))
        self.assertEqual(summary_all.total_saved_amount, Decimal("1000.00"))
        self.assertEqual(summary_all.total_remaining_amount, Decimal("2000.00"))
        self.assertAlmostEqual(summary_all.overall_progress_pct, 33.33, places=2)
        self.assertEqual(summary_all.goals_count, 2)
        self.assertEqual(summary_all.completed_goals_count, 1)

    def test_get_goal_success_and_not_found(self):
        g = create_savings_goal(
            SavingsGoalCreate(name="Laptop", target_amount=Decimal("60000.00")),
            current_user=self.user1,
            db=self.db,
        )
        fetched = get_savings_goal(goal_id=g.id, current_user=self.user1, db=self.db)
        self.assertEqual(fetched.id, g.id)
        self.assertEqual(fetched.name, "Laptop")

        with self.assertRaises(HTTPException) as ctx:
            get_savings_goal(goal_id=9999, current_user=self.user1, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_update_goal_success_and_validation(self):
        g = create_savings_goal(
            SavingsGoalCreate(name="Old Name", target_amount=Decimal("1000.00")),
            current_user=self.user1,
            db=self.db,
        )
        updated = update_savings_goal(
            goal_id=g.id,
            payload=SavingsGoalUpdate(name="New Name", target_amount=Decimal("1500.00")),
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(updated.name, "New Name")
        self.assertEqual(updated.target_amount, Decimal("1500.00"))

        # Empty name update rejected
        with self.assertRaises(HTTPException) as ctx:
            update_savings_goal(
                goal_id=g.id,
                payload=SavingsGoalUpdate(name="  "),
                current_user=self.user1,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_delete_goal_cascade_contributions(self):
        g = create_savings_goal(
            SavingsGoalCreate(name="Bike", target_amount=Decimal("20000.00")),
            current_user=self.user1,
            db=self.db,
        )
        add_goal_contribution(
            goal_id=g.id,
            payload=GoalContributionCreate(amount=Decimal("5000.00")),
            current_user=self.user1,
            db=self.db,
        )
        delete_savings_goal(goal_id=g.id, current_user=self.user1, db=self.db)

        # Check goal is deleted
        with self.assertRaises(HTTPException) as ctx:
            get_savings_goal(goal_id=g.id, current_user=self.user1, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

        # Check contributions deleted
        contribs = self.db.query(GoalContribution).filter(GoalContribution.goal_id == g.id).all()
        self.assertEqual(len(contribs), 0)

    # -------------------------------------------------------------------------
    # Contributions CRUD Tests
    # -------------------------------------------------------------------------

    def test_create_and_list_contributions(self):
        g = create_savings_goal(
            SavingsGoalCreate(name="Vacation", target_amount=Decimal("10000.00")),
            current_user=self.user1,
            db=self.db,
        )
        add_goal_contribution(
            goal_id=g.id,
            payload=GoalContributionCreate(
                amount=Decimal("2000.00"),
                contribution_date=date(2026, 10, 1),
                notes="First deposit",
            ),
            current_user=self.user1,
            db=self.db,
        )
        add_goal_contribution(
            goal_id=g.id,
            payload=GoalContributionCreate(
                amount=Decimal("3000.00"),
                contribution_date=date(2026, 10, 15),
                notes="Bonus",
            ),
            current_user=self.user1,
            db=self.db,
        )

        contrib_list = list_goal_contributions(goal_id=g.id, current_user=self.user1, db=self.db)
        self.assertEqual(len(contrib_list), 2)
        # Should be sorted newest first (Oct 15, then Oct 1)
        self.assertEqual(contrib_list[0].amount, Decimal("3000.00"))
        self.assertEqual(contrib_list[0].notes, "Bonus")
        self.assertEqual(contrib_list[1].amount, Decimal("2000.00"))
        self.assertEqual(contrib_list[1].notes, "First deposit")

    def test_delete_single_contribution(self):
        g = create_savings_goal(
            SavingsGoalCreate(name="Phone", target_amount=Decimal("10000.00")),
            current_user=self.user1,
            db=self.db,
        )
        add_goal_contribution(
            goal_id=g.id,
            payload=GoalContributionCreate(amount=Decimal("2500.00")),
            current_user=self.user1,
            db=self.db,
        )
        contrib_list = list_goal_contributions(goal_id=g.id, current_user=self.user1, db=self.db)
        self.assertEqual(len(contrib_list), 1)
        contrib_id = contrib_list[0].id

        updated_goal = delete_goal_contribution(
            goal_id=g.id,
            contribution_id=contrib_id,
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(updated_goal.total_contributed, Decimal("0.00"))
        self.assertEqual(updated_goal.remaining_amount, Decimal("10000.00"))

        remaining_contribs = list_goal_contributions(goal_id=g.id, current_user=self.user1, db=self.db)
        self.assertEqual(len(remaining_contribs), 0)

    # -------------------------------------------------------------------------
    # Calculations, Over-Contribution, and Target Reduction
    # -------------------------------------------------------------------------

    def test_over_contribution_caps_progress_at_100_and_remaining_at_zero(self):
        g = create_savings_goal(
            SavingsGoalCreate(name="Trip", target_amount=Decimal("5000.00")),
            current_user=self.user1,
            db=self.db,
        )
        add_goal_contribution(
            goal_id=g.id,
            payload=GoalContributionCreate(amount=Decimal("6000.00")),
            current_user=self.user1,
            db=self.db,
        )
        progress = get_savings_goal(goal_id=g.id, current_user=self.user1, db=self.db)
        self.assertEqual(progress.total_contributed, Decimal("6000.00"))
        self.assertEqual(progress.remaining_amount, Decimal("0.00"))
        self.assertEqual(progress.progress_pct, 100.0)
        self.assertTrue(progress.is_completed)
        self.assertEqual(progress.status, "completed")

    def test_target_reduction_below_contributed_preserves_history(self):
        g = create_savings_goal(
            SavingsGoalCreate(name="Car Downpayment", target_amount=Decimal("10000.00")),
            current_user=self.user1,
            db=self.db,
        )
        add_goal_contribution(
            goal_id=g.id,
            payload=GoalContributionCreate(amount=Decimal("4000.00"), notes="Savings 1"),
            current_user=self.user1,
            db=self.db,
        )
        add_goal_contribution(
            goal_id=g.id,
            payload=GoalContributionCreate(amount=Decimal("3000.00"), notes="Savings 2"),
            current_user=self.user1,
            db=self.db,
        )
        # Contributed so far = 7000
        # Now reduce target to 5000
        updated = update_savings_goal(
            goal_id=g.id,
            payload=SavingsGoalUpdate(target_amount=Decimal("5000.00")),
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(updated.target_amount, Decimal("5000.00"))
        self.assertEqual(updated.total_contributed, Decimal("7000.00"))
        self.assertEqual(updated.remaining_amount, Decimal("0.00"))
        self.assertEqual(updated.progress_pct, 100.0)
        self.assertTrue(updated.is_completed)

        # Verify contributions are intact
        contribs = list_goal_contributions(goal_id=g.id, current_user=self.user1, db=self.db)
        self.assertEqual(len(contribs), 2)

    # -------------------------------------------------------------------------
    # Pacing (is_on_track, days_remaining)
    # -------------------------------------------------------------------------

    def test_pacing_deterministic_logic(self):
        today = date(2026, 10, 15)
        created_dt = datetime(2026, 10, 1, 0, 0, 0, tzinfo=timezone.utc)
        target_d = date(2026, 10, 31)

        goal = SavingsGoal(
            id=10,
            user_id=1,
            name="Pacing Goal",
            target_amount=Decimal("3000.00"),
            target_date=target_d,
            status="in_progress",
            created_at=created_dt,
        )
        # Case 1: 0 contributions -> behind pace
        p1 = calculate_goal_progress(goal, ref_date=today)
        self.assertFalse(p1.is_on_track)
        self.assertEqual(p1.days_remaining, 16)

        # Case 2: Ahead of pace (contributed 2000 of 3000, expected was ~1400)
        goal.contributions = [
            GoalContribution(
                id=1,
                goal_id=10,
                user_id=1,
                amount=Decimal("2000.00"),
                contribution_date=date(2026, 10, 5),
                created_at=created_dt,
            )
        ]
        p2 = calculate_goal_progress(goal, ref_date=today)
        self.assertTrue(p2.is_on_track)

        # Case 3: Overdue deadline without target reached
        past_target = date(2026, 10, 10)
        goal.target_date = past_target
        goal.contributions = [
            GoalContribution(
                id=1,
                goal_id=10,
                user_id=1,
                amount=Decimal("2000.00"),
                contribution_date=date(2026, 10, 5),
                created_at=created_dt,
            )
        ]
        p3 = calculate_goal_progress(goal, ref_date=today)
        self.assertFalse(p3.is_on_track)
        self.assertEqual(p3.days_remaining, -5)

        # Case 4: Overdue deadline but fully funded
        goal.contributions = [
            GoalContribution(
                id=1,
                goal_id=10,
                user_id=1,
                amount=Decimal("3500.00"),
                contribution_date=date(2026, 10, 5),
                created_at=created_dt,
            )
        ]
        p4 = calculate_goal_progress(goal, ref_date=today)
        self.assertTrue(p4.is_on_track)
        self.assertTrue(p4.is_completed)

        # Case 5: No target date -> is_on_track is None, days_remaining is None
        goal.target_date = None
        p5 = calculate_goal_progress(goal, ref_date=today)
        self.assertIsNone(p5.is_on_track)
        self.assertIsNone(p5.days_remaining)

    # -------------------------------------------------------------------------
    # Status Consistency & Archiving
    # -------------------------------------------------------------------------

    def test_status_consistency_archived_vs_completed(self):
        g = create_savings_goal(
            SavingsGoalCreate(name="Archived Goal", target_amount=Decimal("5000.00")),
            current_user=self.user1,
            db=self.db,
        )
        # Archive it
        updated = update_savings_goal(
            goal_id=g.id,
            payload=SavingsGoalUpdate(status="archived"),
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(updated.status, "archived")

        # Even if target reached while archived, status remains archived
        add_goal_contribution(
            goal_id=g.id,
            payload=GoalContributionCreate(amount=Decimal("5000.00")),
            current_user=self.user1,
            db=self.db,
        )
        progress = get_savings_goal(goal_id=g.id, current_user=self.user1, db=self.db)
        self.assertEqual(progress.status, "archived")
        self.assertTrue(progress.is_completed)

        # Unarchive back to in_progress -> since target is met, becomes completed
        unarchived = update_savings_goal(
            goal_id=g.id,
            payload=SavingsGoalUpdate(status="in_progress"),
            current_user=self.user1,
            db=self.db,
        )
        self.assertEqual(unarchived.status, "completed")

    # -------------------------------------------------------------------------
    # Strict Multi-User Data Isolation
    # -------------------------------------------------------------------------

    def test_multi_user_data_isolation(self):
        # User 1 creates a goal
        g1 = create_savings_goal(
            SavingsGoalCreate(name="User1 Private Goal", target_amount=Decimal("10000.00")),
            current_user=self.user1,
            db=self.db,
        )
        add_goal_contribution(
            goal_id=g1.id,
            payload=GoalContributionCreate(amount=Decimal("1000.00")),
            current_user=self.user1,
            db=self.db,
        )
        contribs = list_goal_contributions(goal_id=g1.id, current_user=self.user1, db=self.db)
        c1 = contribs[0]

        # User 2 cannot access g1
        with self.assertRaises(HTTPException) as ctx:
            get_savings_goal(goal_id=g1.id, current_user=self.user2, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

        # User 2 cannot update g1
        with self.assertRaises(HTTPException) as ctx:
            update_savings_goal(
                goal_id=g1.id,
                payload=SavingsGoalUpdate(name="Hacked"),
                current_user=self.user2,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 404)

        # User 2 cannot contribute to g1
        with self.assertRaises(HTTPException) as ctx:
            add_goal_contribution(
                goal_id=g1.id,
                payload=GoalContributionCreate(amount=Decimal("500.00")),
                current_user=self.user2,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 404)

        # User 2 cannot list g1 contributions
        with self.assertRaises(HTTPException) as ctx:
            list_goal_contributions(goal_id=g1.id, current_user=self.user2, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

        # User 2 cannot delete g1 contribution
        with self.assertRaises(HTTPException) as ctx:
            delete_goal_contribution(
                goal_id=g1.id,
                contribution_id=c1.id,
                current_user=self.user2,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 404)

        # User 2 cannot delete g1
        with self.assertRaises(HTTPException) as ctx:
            delete_savings_goal(goal_id=g1.id, current_user=self.user2, db=self.db)
        self.assertEqual(ctx.exception.status_code, 404)

        # User 2's list_savings_goals must not include g1
        u2_summary = list_savings_goals(current_user=self.user2, db=self.db)
        self.assertEqual(len(u2_summary.items), 0)

    # -------------------------------------------------------------------------
    # Separation from Transactions Ledger
    # -------------------------------------------------------------------------

    def test_contributions_do_not_alter_transactions_table(self):
        # Verify transaction table remains empty when goals and contributions are created
        self.assertEqual(self.db.query(Transaction).count(), 0)

        g = create_savings_goal(
            SavingsGoalCreate(name="Safety Net", target_amount=Decimal("5000.00")),
            current_user=self.user1,
            db=self.db,
        )
        add_goal_contribution(
            goal_id=g.id,
            payload=GoalContributionCreate(amount=Decimal("1500.00")),
            current_user=self.user1,
            db=self.db,
        )

        self.assertEqual(self.db.query(Transaction).count(), 0)
