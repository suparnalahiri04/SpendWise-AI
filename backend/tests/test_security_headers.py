import unittest

from app.main import SecurityHeadersMiddleware, app


def _run_sync(coro):
    """Run in-memory coroutines synchronously without socket/thread loops."""
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


class SecurityHeadersMiddlewareTestCase(unittest.TestCase):
    """Unit tests for defensive standard HTTP security headers middleware (SEC-04)."""

    def test_security_headers_middleware_wraps_main_app_stack(self):
        """SecurityHeadersMiddleware wraps the application stack returned by build_middleware_stack."""
        stack = app.build_middleware_stack()
        self.assertIsInstance(stack, SecurityHeadersMiddleware)

    def test_security_headers_present_on_success_response(self):
        """Normal successful responses (HTTP 200) contain all three security headers."""
        async def mock_app(scope, receive, send):
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"custom-header", b"test-value"),
                ],
            })
            await send({
                "type": "http.response.body",
                "body": b'{"status":"ok"}',
            })

        middleware = SecurityHeadersMiddleware(mock_app)
        messages = []

        async def mock_send(msg):
            messages.append(msg)

        scope = {"type": "http", "method": "GET", "path": "/health"}
        _run_sync(middleware(scope, None, mock_send))

        self.assertGreaterEqual(len(messages), 1)
        start_msg = messages[0]
        self.assertEqual(start_msg["type"], "http.response.start")
        self.assertEqual(start_msg["status"], 200)

        headers_dict = dict(start_msg["headers"])
        self.assertEqual(headers_dict[b"x-content-type-options"], b"nosniff")
        self.assertEqual(headers_dict[b"x-frame-options"], b"DENY")
        self.assertEqual(headers_dict[b"referrer-policy"], b"strict-origin-when-cross-origin")
        # Preserves original headers
        self.assertEqual(headers_dict[b"content-type"], b"application/json")
        self.assertEqual(headers_dict[b"custom-header"], b"test-value")

    def test_security_headers_present_on_handled_error_responses(self):
        """Handled error responses (400, 401, 404, 422, 500) consistently contain all three security headers."""
        for error_status in [400, 401, 404, 422, 500]:
            with self.subTest(status=error_status):
                async def mock_error_app(scope, receive, send):
                    await send({
                        "type": "http.response.start",
                        "status": error_status,
                        "headers": [(b"content-type", b"application/json")],
                    })
                    await send({
                        "type": "http.response.body",
                        "body": b'{"detail":"error occurred"}',
                    })

                middleware = SecurityHeadersMiddleware(mock_error_app)
                messages = []

                async def mock_send(msg):
                    messages.append(msg)

                scope = {"type": "http", "method": "POST", "path": "/test-endpoint"}
                _run_sync(middleware(scope, None, mock_send))

                start_msg = messages[0]
                self.assertEqual(start_msg["status"], error_status)

                headers_dict = dict(start_msg["headers"])
                self.assertEqual(headers_dict[b"x-content-type-options"], b"nosniff")
                self.assertEqual(headers_dict[b"x-frame-options"], b"DENY")
                self.assertEqual(headers_dict[b"referrer-policy"], b"strict-origin-when-cross-origin")

    def test_genuine_unhandled_exception_through_app_stack_includes_security_headers(self):
        """Genuine unhandled exception raised through the actual application ASGI stack returns 500 with all three headers."""
        from fastapi import APIRouter
        test_router = APIRouter()

        @test_router.get("/_test_genuine_crash_endpoint")
        async def unhandled_endpoint():
            raise RuntimeError("Genuine unhandled exception in application handler")

        app.include_router(test_router)
        app.middleware_stack = None  # Force stack rebuild incorporating new route

        messages = []

        async def mock_send(msg):
            messages.append(msg)

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/_test_genuine_crash_endpoint",
            "raw_path": b"/_test_genuine_crash_endpoint",
            "query_string": b"",
            "headers": [(b"host", b"localhost")],
        }

        try:
            _run_sync(app(scope, None, mock_send))
        except RuntimeError:
            pass  # ServerErrorMiddleware re-raises exception after delivering 500 response

        self.assertGreaterEqual(len(messages), 1)
        start_msg = messages[0]
        self.assertEqual(start_msg["type"], "http.response.start")
        self.assertEqual(start_msg["status"], 500)

        headers = start_msg.get("headers", [])
        headers_dict = dict(headers)
        self.assertEqual(headers_dict[b"x-content-type-options"], b"nosniff")
        self.assertEqual(headers_dict[b"x-frame-options"], b"DENY")
        self.assertEqual(headers_dict[b"referrer-policy"], b"strict-origin-when-cross-origin")

        # Confirm exactly one instance of each header
        x_content_type_count = sum(1 for k, _ in headers if k.lower() == b"x-content-type-options")
        x_frame_count = sum(1 for k, _ in headers if k.lower() == b"x-frame-options")
        referrer_count = sum(1 for k, _ in headers if k.lower() == b"referrer-policy")
        self.assertEqual(x_content_type_count, 1)
        self.assertEqual(x_frame_count, 1)
        self.assertEqual(referrer_count, 1)

    def test_duplicate_and_conflicting_security_headers_replaced_and_deduplicated(self):
        """Pre-existing security headers with conflicting values or casing are replaced; no duplicates emitted."""
        async def mock_app_with_conflicts(scope, receive, send):
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (b"X-Frame-Options", b"SAMEORIGIN"),
                    (b"x-content-type-options", b"sniff"),
                    (b"REFERRER-POLICY", b"unsafe-url"),
                    (b"X-FRAME-OPTIONS", b"ALLOW-FROM https://external.com"),
                    (b"Custom-Header", b"preserve-me"),
                ],
            })
            await send({
                "type": "http.response.body",
                "body": b"test",
            })

        middleware = SecurityHeadersMiddleware(mock_app_with_conflicts)
        messages = []

        async def mock_send(msg):
            messages.append(msg)

        scope = {"type": "http", "method": "GET", "path": "/test-conflict"}
        _run_sync(middleware(scope, None, mock_send))

        start_msg = messages[0]
        headers = start_msg["headers"]

        # Check exact count and values of each security header name (case-insensitively)
        x_content_type = [v for k, v in headers if k.lower() == b"x-content-type-options"]
        x_frame = [v for k, v in headers if k.lower() == b"x-frame-options"]
        referrer = [v for k, v in headers if k.lower() == b"referrer-policy"]

        self.assertEqual(len(x_content_type), 1)
        self.assertEqual(x_content_type[0], b"nosniff")

        self.assertEqual(len(x_frame), 1)
        self.assertEqual(x_frame[0], b"DENY")

        self.assertEqual(len(referrer), 1)
        self.assertEqual(referrer[0], b"strict-origin-when-cross-origin")

        # Verify unrelated header preserved with original casing and value
        custom_headers = [v for k, v in headers if k == b"Custom-Header"]
        self.assertEqual(len(custom_headers), 1)
        self.assertEqual(custom_headers[0], b"preserve-me")

    def test_security_headers_non_http_scope_passthrough(self):
        """Non-HTTP scopes (e.g. lifespan or websocket) pass through without intercepting send."""
        called = False

        async def mock_lifespan_app(scope, receive, send):
            nonlocal called
            called = True
            self.assertEqual(scope["type"], "lifespan")

        middleware = SecurityHeadersMiddleware(mock_lifespan_app)
        scope = {"type": "lifespan"}
        _run_sync(middleware(scope, None, None))
        self.assertTrue(called)


class CORSCrossOriginTestCase(unittest.TestCase):
    """Regression tests for Cross-Origin Resource Sharing (CORS) header exposure."""

    def test_cors_cross_origin_response_exposes_content_disposition(self):
        """Cross-origin requests from an allowed origin receive Access-Control-Expose-Headers for Content-Disposition."""
        from fastapi import APIRouter
        from starlette.responses import Response

        test_router = APIRouter()

        @test_router.get("/_test_cors_download_endpoint")
        async def mock_download_endpoint():
            return Response(
                content=b"sample,csv,data\n1,2,3",
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=transactions.csv"},
            )

        app.include_router(test_router)
        app.middleware_stack = None  # Force stack rebuild

        messages = []

        async def mock_send(msg):
            messages.append(msg)

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/_test_cors_download_endpoint",
            "raw_path": b"/_test_cors_download_endpoint",
            "query_string": b"",
            "headers": [
                (b"host", b"localhost:8000"),
                (b"origin", b"http://localhost:5173"),
            ],
        }

        _run_sync(app(scope, None, mock_send))

        self.assertGreaterEqual(len(messages), 1)
        start_msg = messages[0]
        self.assertEqual(start_msg["type"], "http.response.start")
        self.assertEqual(start_msg["status"], 200)

        headers_dict = dict(start_msg["headers"])
        # Verify CORS allowed origin and exposed Content-Disposition header
        self.assertEqual(headers_dict.get(b"access-control-allow-origin"), b"http://localhost:5173")
        self.assertEqual(headers_dict.get(b"access-control-expose-headers"), b"Content-Disposition")
        self.assertEqual(headers_dict.get(b"content-disposition"), b"attachment; filename=transactions.csv")


class CORSConfigurationTestCase(unittest.TestCase):
    """Isolated tests verifying CORS_ALLOWED_ORIGINS Settings default and .env loading."""

    def test_cors_allowed_origins_default_and_parsing(self):
        """Settings exposes default localhost CORS origins when omitted from env."""
        import os
        from unittest.mock import patch

        from app.database import DEFAULT_CORS_ALLOWED_ORIGINS, Settings, parse_cors_allowed_origins

        env = {
            "POSTGRES_PASSWORD": "test_password_placeholder",
            "JWT_SECRET_KEY": "a" * 32,
        }
        with patch.dict(os.environ, env, clear=True):
            isolated = Settings(_env_file=None)

        self.assertEqual(isolated.CORS_ALLOWED_ORIGINS, DEFAULT_CORS_ALLOWED_ORIGINS)
        parsed = parse_cors_allowed_origins(isolated.CORS_ALLOWED_ORIGINS)
        self.assertIn("http://localhost:5173", parsed)
        self.assertIn("http://127.0.0.1:5173", parsed)

    def test_cors_allowed_origins_loaded_from_temp_env_file(self):
        """Custom comma-separated CORS_ALLOWED_ORIGINS in an env file is parsed cleanly."""
        import os
        import tempfile
        from pathlib import Path
        from unittest.mock import patch

        from app.database import Settings, parse_cors_allowed_origins

        with tempfile.TemporaryDirectory() as tmp_dir:
            env_path = Path(tmp_dir) / ".env"
            env_path.write_text(
                "\n".join([
                    "POSTGRES_PASSWORD=test_password_placeholder",
                    f"JWT_SECRET_KEY={'b' * 32}",
                    "CORS_ALLOWED_ORIGINS=https://app.example.com, https://admin.example.com ,",
                ]),
                encoding="utf-8",
            )
            with patch.dict(os.environ, {}, clear=True):
                isolated = Settings(_env_file=env_path)

        self.assertEqual(
            parse_cors_allowed_origins(isolated.CORS_ALLOWED_ORIGINS),
            ["https://app.example.com", "https://admin.example.com"],
        )

    def test_main_cors_middleware_uses_settings_origins(self):
        """FastAPI CORSMiddleware in app.main is wired with Settings origins and Content-Disposition."""
        from fastapi.middleware.cors import CORSMiddleware

        from app.database import parse_cors_allowed_origins, settings

        cors_middleware = next(
            (m for m in app.user_middleware if m.cls is CORSMiddleware),
            None,
        )
        self.assertIsNotNone(cors_middleware)
        self.assertEqual(
            cors_middleware.kwargs["allow_origins"],
            parse_cors_allowed_origins(settings.CORS_ALLOWED_ORIGINS),
        )
        self.assertIn("Content-Disposition", cors_middleware.kwargs["expose_headers"])


if __name__ == "__main__":
    unittest.main()
