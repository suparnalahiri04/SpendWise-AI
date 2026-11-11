"""Reusable in-memory sliding-window rate limiter for sensitive endpoints.

Single-process/multi-worker note:
Each worker process maintains independent in-memory buckets.
Limits reset when the application restarts.
"""
from collections import defaultdict, deque
import math
import threading
import time

from fastapi import Depends, HTTPException, Request, status

from app.auth_dependencies import get_current_user
from app.models import User

# Centralized approved initial limits (SEC-02)
LOGIN_RATE_LIMIT = 5
LOGIN_RATE_WINDOW = 60

REGISTER_RATE_LIMIT = 3
REGISTER_RATE_WINDOW = 3600

ASSISTANT_RATE_LIMIT = 20
ASSISTANT_RATE_WINDOW = 60


def get_client_ip(request: Request) -> str:
    """Extract authoritative client IP address from ASGI peer connection.

    Forwarded headers (X-Forwarded-For, X-Real-IP) are strictly ignored to prevent
    header-spoofing attacks from bypassing rate limits.
    """
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


class InMemoryRateLimiter:
    """Thread-safe sliding-window in-memory rate limiter with proactive cleanup."""

    def __init__(
        self,
        requests_limit: int,
        window_seconds: int,
        scope_name: str,
        cleanup_interval_seconds: float = 300.0,
        max_buckets: int = 10000,
    ):
        self.requests_limit = requests_limit
        self.window_seconds = window_seconds
        self.scope_name = scope_name
        self.cleanup_interval_seconds = cleanup_interval_seconds
        self.max_buckets = max_buckets

        self._lock = threading.Lock()
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._last_cleanup = 0.0

    def _cleanup_expired_locked(self, now: float) -> None:
        """Evict expired timestamps and prune empty keys to prevent unbounded memory growth."""
        cutoff = now - self.window_seconds
        expired_keys = []
        for key, timestamps in list(self._buckets.items()):
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if not timestamps:
                expired_keys.append(key)

        for key in expired_keys:
            del self._buckets[key]

        # If bucket count still exceeds max_buckets, evict stalest keys
        if len(self._buckets) > self.max_buckets:
            excess = len(self._buckets) - self.max_buckets
            sorted_keys = sorted(
                self._buckets.keys(),
                key=lambda k: self._buckets[k][-1] if self._buckets[k] else 0.0,
            )
            for k in sorted_keys[:excess]:
                del self._buckets[k]

        self._last_cleanup = now

    def check(self, identity: str, now: float | None = None) -> None:
        """Record request and enforce rate limit.

        Raises HTTPException(429) with accurate Retry-After header if limit exceeded.
        """
        current_time = time.monotonic() if now is None else now
        cutoff = current_time - self.window_seconds

        with self._lock:
            if self._last_cleanup == 0.0:
                self._last_cleanup = current_time

            # Proactive cleanup check
            if (
                current_time - self._last_cleanup >= self.cleanup_interval_seconds
                or len(self._buckets) >= self.max_buckets
            ):
                self._cleanup_expired_locked(current_time)

            timestamps = self._buckets[identity]
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()

            if len(timestamps) >= self.requests_limit:
                oldest = timestamps[0]
                elapsed = current_time - oldest
                remaining = self.window_seconds - elapsed
                retry_after = max(1, math.ceil(remaining))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )

            timestamps.append(current_time)
            if len(self._buckets) > self.max_buckets:
                self._cleanup_expired_locked(current_time)

    def reset(self) -> None:
        """Reset internal buckets (primarily for testing isolation)."""
        with self._lock:
            self._buckets.clear()
            self._last_cleanup = 0.0


# Reusable singleton limiter instances
login_limiter = InMemoryRateLimiter(
    requests_limit=LOGIN_RATE_LIMIT,
    window_seconds=LOGIN_RATE_WINDOW,
    scope_name="auth:login",
)

register_limiter = InMemoryRateLimiter(
    requests_limit=REGISTER_RATE_LIMIT,
    window_seconds=REGISTER_RATE_WINDOW,
    scope_name="auth:register",
)

assistant_limiter = InMemoryRateLimiter(
    requests_limit=ASSISTANT_RATE_LIMIT,
    window_seconds=ASSISTANT_RATE_WINDOW,
    scope_name="assistant:query",
)


# FastAPI dependency functions
async def rate_limit_login(request: Request) -> None:
    ip = get_client_ip(request)
    login_limiter.check(ip)


async def rate_limit_register(request: Request) -> None:
    ip = get_client_ip(request)
    register_limiter.check(ip)


async def rate_limit_assistant(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    user_key = f"user:{current_user.id}"
    assistant_limiter.check(user_key)
