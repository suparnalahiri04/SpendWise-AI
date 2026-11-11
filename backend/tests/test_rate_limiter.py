import json
import threading
import time
import unittest
from unittest.mock import MagicMock

from fastapi import APIRouter, Depends, HTTPException, Request

from app.main import app
from app.models import User
from app.rate_limiter import (
    ASSISTANT_RATE_LIMIT,
    ASSISTANT_RATE_WINDOW,
    LOGIN_RATE_LIMIT,
    LOGIN_RATE_WINDOW,
    REGISTER_RATE_LIMIT,
    REGISTER_RATE_WINDOW,
    InMemoryRateLimiter,
    assistant_limiter,
    get_client_ip,
    login_limiter,
    rate_limit_assistant,
    rate_limit_login,
    rate_limit_register,
    register_limiter,
)


def _run_sync(coro):
    """Run in-memory coroutines synchronously without socket/thread loops."""
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


def _make_dummy_request(client_ip: str, headers: dict[str, str] | None = None) -> Request:
    """Construct a lightweight mock Request with authoritative client peer host and optional headers."""
    req = MagicMock(spec=Request)
    if client_ip:
        req.client = type("Client", (), {"host": client_ip, "port": 12345})()
    else:
        req.client = None
    req.headers = headers or {}
    return req


class InMemoryRateLimiterUnitTestCase(unittest.TestCase):
    """Unit tests for the thread-safe InMemoryRateLimiter sliding-window implementation."""

    def setUp(self):
        login_limiter.reset()
        register_limiter.reset()
        assistant_limiter.reset()

    def tearDown(self):
        login_limiter.reset()
        register_limiter.reset()
        assistant_limiter.reset()

    def test_requests_below_limit_succeed(self):
        limiter = InMemoryRateLimiter(requests_limit=5, window_seconds=60, scope_name="test")
        t0 = 1000.0
        for i in range(5):
            limiter.check("client-1", now=t0 + i)
        self.assertEqual(len(limiter._buckets["client-1"]), 5)

    def test_exceeding_limit_raises_429(self):
        limiter = InMemoryRateLimiter(requests_limit=3, window_seconds=60, scope_name="test")
        t0 = 1000.0
        limiter.check("client-1", now=t0)
        limiter.check("client-1", now=t0 + 5)
        limiter.check("client-1", now=t0 + 10)

        with self.assertRaises(HTTPException) as ctx:
            limiter.check("client-1", now=t0 + 15)

        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(ctx.exception.detail, "Too many requests. Please try again later.")
        self.assertIn("Retry-After", ctx.exception.headers)

    def test_retry_after_calculated_accurately(self):
        limiter = InMemoryRateLimiter(requests_limit=2, window_seconds=60, scope_name="test")
        t0 = 1000.0
        limiter.check("client-1", now=t0)
        limiter.check("client-1", now=t0 + 10.0)

        # Attempt at t=25.0 -> oldest request was at t0=1000.0, expires at t0+60=1060.0
        # Remaining time = 1060.0 - 1025.0 = 35.0 seconds
        with self.assertRaises(HTTPException) as ctx:
            limiter.check("client-1", now=t0 + 25.0)

        self.assertEqual(ctx.exception.headers["Retry-After"], "35")

    def test_requests_accepted_after_window_expires(self):
        limiter = InMemoryRateLimiter(requests_limit=2, window_seconds=60, scope_name="test")
        t0 = 1000.0
        limiter.check("client-1", now=t0)
        limiter.check("client-1", now=t0 + 5.0)

        # Blocked at t=10.0
        with self.assertRaises(HTTPException):
            limiter.check("client-1", now=t0 + 10.0)

        # After window expires (t=1061.0): oldest request at t0 is expired, slot opens
        limiter.check("client-1", now=t0 + 61.0)
        # Second request expires at t0+65.0; at t=1066.0, another slot opens
        limiter.check("client-1", now=t0 + 66.0)

    def test_different_identities_have_independent_buckets(self):
        limiter = InMemoryRateLimiter(requests_limit=2, window_seconds=60, scope_name="test")
        t0 = 1000.0
        limiter.check("user-alpha", now=t0)
        limiter.check("user-alpha", now=t0 + 1)

        # user-alpha is exhausted
        with self.assertRaises(HTTPException):
            limiter.check("user-alpha", now=t0 + 2)

        # user-beta has a clean bucket and succeeds
        limiter.check("user-beta", now=t0 + 2)
        limiter.check("user-beta", now=t0 + 3)

        with self.assertRaises(HTTPException):
            limiter.check("user-beta", now=t0 + 4)

    def test_concurrent_requests_cannot_bypass_limit(self):
        """Thread safety verification: 25 concurrent threads compete for 5 available slots."""
        limiter = InMemoryRateLimiter(requests_limit=5, window_seconds=60, scope_name="test")
        successes = 0
        rejections = 0
        lock = threading.Lock()

        def worker():
            nonlocal successes, rejections
            try:
                limiter.check("shared-ip")
                with lock:
                    successes += 1
            except HTTPException as exc:
                if exc.status_code == 429:
                    with lock:
                        rejections += 1

        threads = [threading.Thread(target=worker) for _ in range(25)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(successes, 5)
        self.assertEqual(rejections, 20)

    def test_expired_bucket_cleanup_prevents_unbounded_memory_growth(self):
        limiter = InMemoryRateLimiter(
            requests_limit=5,
            window_seconds=60,
            scope_name="test",
            cleanup_interval_seconds=10.0,
            max_buckets=50,
        )
        t0 = 1000.0
        # Create 30 distinct IP buckets at t0
        for i in range(30):
            limiter.check(f"ip-{i}", now=t0)
        self.assertEqual(len(limiter._buckets), 30)

        # After 70 seconds (> window_seconds and > cleanup_interval), a new request triggers eviction
        limiter.check("active-ip", now=t0 + 70.0)
        # All 30 expired buckets must be pruned; only active-ip remains
        self.assertIn("active-ip", limiter._buckets)
        self.assertNotIn("ip-0", limiter._buckets)
        self.assertEqual(len(limiter._buckets), 1)

    def test_max_buckets_capacity_bounding(self):
        limiter = InMemoryRateLimiter(
            requests_limit=5,
            window_seconds=3600,
            scope_name="test",
            cleanup_interval_seconds=9999.0,
            max_buckets=10,
        )
        # Flood 15 distinct keys
        for i in range(15):
            limiter.check(f"client-{i}", now=1000.0 + i)

        # Max buckets capacity enforced
        self.assertLessEqual(len(limiter._buckets), 10)


class ClientIpAndSpoofingTestCase(unittest.TestCase):
    """Verify that request.client.host is authoritative and spoofed headers are ignored."""

    def test_authoritative_peer_ip_extracted(self):
        req = _make_dummy_request(
            client_ip="192.168.1.100",
            headers={
                "X-Forwarded-For": "203.0.113.195, 10.0.0.1",
                "X-Real-IP": "172.16.0.5",
            },
        )
        ip = get_client_ip(req)
        # Must return the TCP peer host, completely ignoring forwarded headers
        self.assertEqual(ip, "192.168.1.100")

    def test_fallback_when_client_is_none(self):
        req = _make_dummy_request(client_ip="")
        ip = get_client_ip(req)
        self.assertEqual(ip, "unknown")


class RouteDependencyRateLimitingTestCase(unittest.TestCase):
    """Verify rate-limiting dependencies for Login, Registration, and Assistant."""

    def setUp(self):
        login_limiter.reset()
        register_limiter.reset()
        assistant_limiter.reset()

    def tearDown(self):
        login_limiter.reset()
        register_limiter.reset()
        assistant_limiter.reset()

    def test_login_rate_limiting_enforces_5_requests_per_minute(self):
        req = _make_dummy_request("198.51.100.10")

        # 5 requests allowed
        for _ in range(LOGIN_RATE_LIMIT):
            _run_sync(rate_limit_login(req))

        # 6th request from same IP raises 429 with Retry-After header
        with self.assertRaises(HTTPException) as ctx:
            _run_sync(rate_limit_login(req))

        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("Retry-After", ctx.exception.headers)

        # Spoofed X-Forwarded-For cannot bypass rate limiting
        spoofed_req = _make_dummy_request("198.51.100.10", headers={"X-Forwarded-For": "8.8.8.8"})
        with self.assertRaises(HTTPException) as ctx_spoofed:
            _run_sync(rate_limit_login(spoofed_req))
        self.assertEqual(ctx_spoofed.exception.status_code, 429)

        # Distinct IP is not blocked
        distinct_req = _make_dummy_request("198.51.100.20")
        _run_sync(rate_limit_login(distinct_req))

    def test_register_rate_limiting_enforces_3_requests_per_hour(self):
        req = _make_dummy_request("198.51.100.30")

        # 3 requests allowed
        for _ in range(REGISTER_RATE_LIMIT):
            _run_sync(rate_limit_register(req))

        # 4th request raises 429 with Retry-After
        with self.assertRaises(HTTPException) as ctx:
            _run_sync(rate_limit_register(req))

        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("Retry-After", ctx.exception.headers)

        # Distinct IP is not blocked
        other_req = _make_dummy_request("198.51.100.31")
        _run_sync(rate_limit_register(other_req))

    def test_assistant_rate_limiting_per_user_id(self):
        user1 = User(id=101, email="u1@spendwise.ai")
        user2 = User(id=102, email="u2@spendwise.ai")

        req = _make_dummy_request("192.168.1.5")

        # 20 requests allowed for User 1
        for _ in range(ASSISTANT_RATE_LIMIT):
            _run_sync(rate_limit_assistant(req, current_user=user1))

        # 21st request for User 1 raises 429
        with self.assertRaises(HTTPException) as ctx:
            _run_sync(rate_limit_assistant(req, current_user=user1))

        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("Retry-After", ctx.exception.headers)

        # User 2 from the SAME client IP is NOT blocked (per-user bucket)
        _run_sync(rate_limit_assistant(req, current_user=user2))


class ASGIRouteRegistrationAndStackTestCase(unittest.TestCase):
    """Verify route registration and end-to-end ASGI middleware stack execution."""

    def setUp(self):
        login_limiter.reset()
        register_limiter.reset()
        assistant_limiter.reset()

    def tearDown(self):
        login_limiter.reset()
        register_limiter.reset()
        assistant_limiter.reset()

    def test_protected_routes_are_correctly_registered_with_rate_limiting(self):
        """Confirm /auth/login, /auth/register, and /assistant/query exist in FastAPI router with rate limiters."""
        all_routes = {}
        for r in app.routes:
            if hasattr(r, "path"):
                all_routes[r.path] = r
            if hasattr(r, "original_router") and hasattr(r.original_router, "routes"):
                for sub_r in r.original_router.routes:
                    if hasattr(sub_r, "path"):
                        all_routes[sub_r.path] = sub_r

        self.assertIn("/auth/login", all_routes)
        self.assertIn("/auth/register", all_routes)
        self.assertIn("/assistant/query", all_routes)

        # Verify dependencies registered on login route
        login_route = all_routes["/auth/login"]
        self.assertTrue(any(getattr(d, "dependency", None) == rate_limit_login for d in login_route.dependencies))

        # Verify dependencies registered on register route
        register_route = all_routes["/auth/register"]
        self.assertTrue(any(getattr(d, "dependency", None) == rate_limit_register for d in register_route.dependencies))

        # Verify dependencies registered on assistant query route
        assistant_route = all_routes["/assistant/query"]
        self.assertTrue(any(getattr(d, "dependency", None) == rate_limit_assistant for d in assistant_route.dependencies))

    def test_asgi_stack_produces_429_with_security_and_retry_after_headers(self):
        """Verify full Starlette/FastAPI ASGI stack formats 429 with authoritative security headers."""
        test_router = APIRouter()
        business_logic_executed = 0

        @test_router.post("/_test_asgi_login_endpoint", dependencies=[Depends(rate_limit_login)])
        async def mock_login():
            nonlocal business_logic_executed
            business_logic_executed += 1
            return {"status": "ok"}

        app.include_router(test_router)
        app.middleware_stack = None  # Rebuild ASGI stack with new route

        messages = []

        async def mock_send(msg):
            messages.append(msg)

        async def mock_receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        scope = {
            "type": "http",
            "method": "POST",
            "path": "/_test_asgi_login_endpoint",
            "raw_path": b"/_test_asgi_login_endpoint",
            "query_string": b"",
            "headers": [(b"host", b"localhost")],
            "client": ("198.51.100.99", 54321),
        }

        # 5 allowed requests
        for i in range(LOGIN_RATE_LIMIT):
            messages.clear()
            _run_sync(app(scope, mock_receive, mock_send))
            start_msg = next(m for m in messages if m["type"] == "http.response.start")
            self.assertEqual(start_msg["status"], 200)

        self.assertEqual(business_logic_executed, 5)

        # 6th request: rejected with 429
        messages.clear()
        _run_sync(app(scope, mock_receive, mock_send))
        start_msg = next(m for m in messages if m["type"] == "http.response.start")
        self.assertEqual(start_msg["status"], 429)

        # Crucial check: business logic must NOT have been executed on the rejected request
        self.assertEqual(business_logic_executed, 5)

        # Verify headers include Retry-After AND all three authoritative security headers
        headers_dict = dict(start_msg["headers"])
        self.assertIn(b"retry-after", headers_dict)
        self.assertEqual(headers_dict[b"x-content-type-options"], b"nosniff")
        self.assertEqual(headers_dict[b"x-frame-options"], b"DENY")
        self.assertEqual(headers_dict[b"referrer-policy"], b"strict-origin-when-cross-origin")


if __name__ == "__main__":
    unittest.main()
