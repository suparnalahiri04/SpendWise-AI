from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import parse_cors_allowed_origins, settings
from app.statements import router as statements_router
from app.auth import router as auth_router
from app.transactions import router as transactions_router
from app.ml_routes import router as ml_router
from app.budgets import router as budgets_router
from app.recurring_payments import router as recurring_payments_router
from app.insights import router as insights_router
from app.assistant import router as assistant_router
from app.savings_goals import router as savings_goals_router
from app.reports import router as reports_router
from app.alerts import router as alerts_router
from app.forecasting import router as forecasting_router

app = FastAPI(
    title="SpendWise AI API",
    description="Personal finance management API",
    version="0.1.0",
)

# Allow the Vite dev frontend to call this API from the browser.
# Configured via Settings.CORS_ALLOWED_ORIGINS (backend/.env or environment variable).
# Authentication uses a Bearer header (no cookies), so credentials are not allowed.
allowed_origins = parse_cors_allowed_origins(settings.CORS_ALLOWED_ORIGINS)

_AUTHORITATIVE_SECURITY_HEADERS = (
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
)
_SECURITY_HEADER_NAMES = {name for name, _ in _AUTHORITATIVE_SECURITY_HEADERS}


class SecurityHeadersMiddleware:
    """Attach standard defensive HTTP security headers to all responses and enforce authoritative values."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_security_headers(message):
            if message["type"] == "http.response.start":
                # Filter out any pre-existing security headers matching case-insensitively
                raw_headers = list(message.get("headers", []))
                filtered = [
                    (k, v) for k, v in raw_headers
                    if k.lower() not in _SECURITY_HEADER_NAMES
                ]
                # Append authoritative security headers (no duplicates, replaces conflicting values)
                filtered.extend(_AUTHORITATIVE_SECURITY_HEADERS)
                message["headers"] = filtered
            await send(message)

        await self.app(scope, receive, send_with_security_headers)


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],
)

# Wrap the complete Starlette middleware stack so that all responses—including
# normal responses, handled HTTP errors, and genuine unhandled 500 exceptions
# from Starlette's outer ServerErrorMiddleware—receive the security headers.
_original_build_middleware_stack = app.build_middleware_stack


def _build_middleware_stack():
    return SecurityHeadersMiddleware(_original_build_middleware_stack())


app.build_middleware_stack = _build_middleware_stack

app.include_router(auth_router)
app.include_router(transactions_router)
app.include_router(budgets_router)
app.include_router(recurring_payments_router)
app.include_router(insights_router)
app.include_router(assistant_router)
app.include_router(savings_goals_router)
app.include_router(reports_router)
app.include_router(alerts_router)
app.include_router(forecasting_router)
app.include_router(statements_router)
app.include_router(ml_router)


@app.get("/")
def read_root():
    return {"message": "Welcome to SpendWise AI API"}


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "spendwise-ai-backend",
    }
