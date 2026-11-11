"""Business-timezone helpers for SpendWise AI.

Stored database timestamps and JWT token claims remain in UTC, while user-facing
calendar defaults (current day, current billing month, overdue checks, and report
generation timestamps) resolve in Asia/Kolkata (IST, UTC+05:30).
"""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

IST_FIXED_OFFSET = timezone(timedelta(hours=5, minutes=30), name="IST")

try:
    IST_TIMEZONE = ZoneInfo("Asia/Kolkata")
except ZoneInfoNotFoundError:  # pragma: no cover - fallback when tzdata is absent
    IST_TIMEZONE = IST_FIXED_OFFSET


def get_current_ist_datetime() -> datetime:
    """Return the current timezone-aware datetime in Asia/Kolkata (IST)."""
    return datetime.now(IST_TIMEZONE)


def get_current_ist_date() -> date:
    """Return the current calendar date in Asia/Kolkata (IST)."""
    return get_current_ist_datetime().date()


def get_current_ist_month() -> str:
    """Return the current YYYY-MM calendar month in Asia/Kolkata (IST)."""
    return get_current_ist_datetime().strftime("%Y-%m")
