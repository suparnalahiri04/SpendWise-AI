
from pathlib import Path
import pandas as pd

DATASET_PATH = Path(__file__).parent / "expense_training_data_v2.csv"

EXPECTED_CATEGORIES = {
    "Food/Dining",
    "Shopping",
    "Transport",
    "Groceries",
    "Bills/Utilities",
    "Education",
    "Entertainment",
    "Healthcare",
    "Income",
    "Transfers/Repayments",
    "Other",
}

df = pd.read_csv(DATASET_PATH)

print("\n--- Dataset Validation ---")
print(f"Total rows: {len(df)}")
print(f"Columns: {list(df.columns)}")

if list(df.columns) != ["description", "category"]:
    print("FAIL: Expected columns: description, category")
else:
    print("PASS: Column names are correct")

print(f"\nMissing descriptions: {df['description'].isna().sum()}")
print(f"Missing categories: {df['category'].isna().sum()}")

df["description"] = df["description"].astype("string").str.strip()
df["category"] = df["category"].astype("string").str.strip()

print(f"Duplicate descriptions: {df['description'].duplicated().sum()}")

unexpected = set(df["category"].dropna().unique()) - EXPECTED_CATEGORIES
print(f"Unexpected category labels: {unexpected}")

print("\nRows per category:")
counts = df["category"].value_counts().reindex(
    sorted(EXPECTED_CATEGORIES), fill_value=0
)
print(counts.to_string())

valid = (
    len(df) == 550
    and list(df.columns) == ["description", "category"]
    and df["description"].notna().all()
    and df["category"].notna().all()
    and df["description"].str.len().gt(0).all()
    and df["category"].str.len().gt(0).all()
    and df["description"].str.lower().nunique() == len(df)
    and set(df["category"].unique()) == EXPECTED_CATEGORIES
    and counts.eq(50).all()
)

print("\nOVERALL:", "PASS" if valid else "FAIL")
