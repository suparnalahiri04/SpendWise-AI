# SpendWise AI

SpendWise AI is a full-stack personal finance management application with machine-learning transaction categorization, statement import validation, budgeting, forecasting, reporting, and a deterministic financial assistant (**Penny**).

## Implemented Features

1. **Authentication & Security:** Email/password registration and login with Argon2id hashing, HS256 JWT Bearer authentication, sliding-window rate limiting, strict per-user data isolation, and defensive HTTP security headers.
2. **Transactions & Date-Grouped Ledger:** Create, edit, and delete transactions; filter by period, type, category, review status, and search query; view chronological date-grouped entries with one-click AI category confirmation (`>= 60%` confidence).
3. **CSV & Excel Statement Import:** Multi-sheet `.xlsx` and `.csv` parsing, row-level validation preview, ML category auto-tagging (`backend/ml/`), and duplicate detection with import history tracking.
4. **Budgets & Alerts:** Per-category monthly budgets, real-time utilization tracking, and actionable threshold notifications alongside overdue/upcoming bill and anomaly alerts.
5. **Recurring Payments, Savings Goals & Financial Calendar:** Scheduled bill tracking, savings goal targets and contributions, and a unified monthly calendar view.
6. **Insights, Forecasting & What-If Simulator:** Month-over-month category analysis, statistical anomaly detection, multi-month spending projections, and interactive scenario modeling.
7. **Reports & Exports:** Period summaries with category breakdowns plus CSV transaction exports and formatted PDF summary exports.
8. **Penny Financial Assistant:** Drawer and full-page conversational interface computing grounded answers directly from your recorded transactions, budgets, and recurring commitments.

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Radix UI, Motion, Recharts, Vitest, Oxlint
- **Backend:** Python, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL (`psycopg`), Pydantic Settings, PyJWT, `pwdlib[argon2]`, ReportLab
- **Machine Learning:** Pandas, NumPy, scikit-learn, joblib (`backend/ml/`)

## Repository Structure

- `backend/app/` — FastAPI application, routers, SQLAlchemy models, schemas, auth, and domain services
- `backend/migrations/` — Alembic schema migrations
- `backend/ml/` — Expense categorization training/evaluation scripts and serialized `.joblib` models
- `backend/tests/` — Isolated backend `unittest` suite (`sqlite:///:memory:`)
- `frontend/` — React + TypeScript + Vite web application
- `docs/` & `sample-data/` — Reserved workspace folders (currently empty)

## Prerequisites

- **Python** 3.12+
- **Node.js** 20+ and **npm**
- **PostgreSQL** 15+

## Local Setup & Run (Windows PowerShell)

### 1. Backend Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Optional developer/testing packages (includes pytest and httpx):
# pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

Edit `backend/.env` and set:
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB` (pointing to your local PostgreSQL database, e.g. `spendwise_ai`)
- `JWT_SECRET_KEY` (must be at least 32 non-whitespace characters; generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`)
- `CORS_ALLOWED_ORIGINS` (defaults to local Vite dev origins if omitted)

Run database migrations and start the API server (port `8001` matches `frontend/.env.example`):

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001
```

The API health endpoint is available at `http://127.0.0.1:8001/health` and OpenAPI docs at `http://127.0.0.1:8001/docs`.

### 2. Frontend Setup

Open a second PowerShell terminal from the repository root:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

`frontend/.env.example` sets `VITE_API_BASE_URL=http://127.0.0.1:8001`. Vite serves the app at `http://localhost:5173`.

## Running Tests, Lint & Build

From the repository root in PowerShell:

```powershell
# Backend unit tests (isolated in-memory SQLite; does not modify Postgres)
Push-Location backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
Pop-Location

# Frontend unit & component tests
npm --prefix frontend test

# Frontend linter (Oxlint) and production TypeScript + Vite build
npm --prefix frontend run lint
npm --prefix frontend run build
```

See [frontend/README.md](frontend/README.md) for frontend-specific scripts and details.
