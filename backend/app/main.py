
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.statements import router as statements_router
from app.auth import router as auth_router
from app.transactions import router as transactions_router
from app.ml_routes import router as ml_router

app = FastAPI(
    title="SpendWise AI API",
    description="Personal finance management API",
    version="0.1.0",
)

# Allow the Vite dev frontend to call this API from the browser.
# Override with a comma-separated CORS_ALLOWED_ORIGINS environment variable.
# Authentication uses a Bearer header (no cookies), so credentials are not allowed.
_default_origins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", _default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(transactions_router)
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
