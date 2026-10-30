# SpendWise AI

SpendWise AI is a modern personal finance management application that leverages machine learning to automatically categorize expenses, detect anomalies, and forecast spending—helping users track, analyze, and optimize their financial health effortlessly.

## Core Features

1. **Automated Expense Categorization:** Machine learning pipeline that classifies raw transaction descriptions into structured spending categories.
2. **CSV Transaction Import & Parsing:** Seamless upload, validation, and normalization of bank and credit card statement files.
3. **Interactive Spending Dashboard:** Visual breakdowns of income, expenses, and category trends over time using dynamic charts.
4. **Spending Anomaly Detection:** Automated identification of unusual, duplicate, or outlier transactions that deviate from normal habits.
5. **Budget Tracking & Alerts:** Customizable monthly budgets per category with real-time progress tracking and threshold notifications.
6. **Future Expense Forecasting:** Predictive modeling to estimate upcoming monthly expenditures based on historical patterns.
7. **Transaction Management & Manual Overrides:** Full search, filtering, and manual category correction that feeds back into model improvement.

## Technology Stack

### Frontend
* **Framework & Build Tool:** React, TypeScript, Vite
* **Styling & Components:** Tailwind CSS, customized shadcn/ui
* **Animations & Visualization:** Motion for React, Recharts

### Backend
* **Language & Framework:** Python, FastAPI
* **Database & ORM:** PostgreSQL, SQLAlchemy

### Machine Learning
* **Core Libraries:** Pandas, NumPy, scikit-learn

## Project Structure

* `frontend/` — React + TypeScript + Vite client application
* `backend/` — FastAPI server, database models, and REST API endpoints
* `ml/` — Machine learning training scripts, feature engineering, and serialized models
* `sample-data/` — Example transaction CSV datasets for testing and development
* `docs/` — Architecture notes, API specifications, and project documentation

## Development Status

**Status:** Project setup is currently in progress. Initial repository structure and configuration files have been established; application scaffolding and feature implementation will follow in upcoming stages.


## Project Structure

* `frontend/` — React + TypeScript + Vite client application
* `backend/` — FastAPI server, database models, and REST API endpoints
* `ml/` — Machine learning training scripts, feature engineering, and serialized models
* `sample-data/` — Example transaction CSV datasets for testing and development
* `docs/` — Architecture notes, API specifications, and project documentation

## Development Status

**Status:** Project setup is currently in progress. Initial repository structure and configuration files have been established; application scaffolding and feature implementation will follow in upcoming stages.