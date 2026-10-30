
from fastapi import FastAPI

from app.auth import router as auth_router
from app.transactions import router as transactions_router

app = FastAPI(
    title="SpendWise AI API",
    description="Personal finance management API",
    version="0.1.0",
)

app.include_router(auth_router)
app.include_router(transactions_router)


@app.get("/")
def read_root():
    return {"message": "Welcome to SpendWise AI API"}


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "spendwise-ai-backend",
    }
