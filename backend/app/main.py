"""SpendWise AI backend - minimal FastAPI application."""

from fastapi import FastAPI

app = FastAPI(title="SpendWise AI API", version="0.1.0")


@app.get("/")
def read_root() -> dict[str, str]:
    """Identify the API."""
    return {"message": "Welcome to the SpendWise AI API"}


@app.get("/health")
def health_check() -> dict[str, str]:
    """Report that the service is running."""
    return {"status": "ok", "service": "spendwise-ai-backend"}

