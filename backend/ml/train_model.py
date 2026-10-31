
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline


# Locate the new dataset and save the model separately.
BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR.parent / "expense_training_data_v2.csv"
MODEL_PATH = BASE_DIR / "expense_classifier_v2.joblib"


def main():
    # 1. Check that the dataset exists.
    if not DATASET_PATH.exists():
        raise FileNotFoundError(
            f"Training dataset not found: {DATASET_PATH}"
        )

    # 2. Load and validate the dataset.
    data = pd.read_csv(DATASET_PATH)

    required_columns = {"description", "category"}
    if not required_columns.issubset(data.columns):
        raise ValueError(
            "Dataset must contain description and category columns."
        )

    data = data.dropna(subset=["description", "category"]).copy()
    data["description"] = data["description"].astype(str).str.strip()
    data["category"] = data["category"].astype(str).str.strip()

    data = data[
        (data["description"] != "")
        & (data["category"] != "")
    ].copy()

    if data.empty:
        raise ValueError("The dataset contains no usable examples.")

    if data["category"].nunique() < 2:
        raise ValueError("At least two categories are required.")

    duplicate_count = data["description"].duplicated().sum()
    if duplicate_count:
        raise ValueError(
            f"Found {duplicate_count} duplicate descriptions. "
            "Resolve duplicates before training."
        )

    # Ensure every category has enough examples for stratification.
    category_counts = data["category"].value_counts()
    if category_counts.min() < 2:
        raise ValueError(
            "Every category must have at least two examples "
            "for a stratified train-test split."
        )

    X = data["description"]
    y = data["category"]

    # 3. Split BEFORE fitting TF-IDF to avoid test-data leakage.
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    # 4. Build the complete ML pipeline.
    model = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    lowercase=True,
                    ngram_range=(1, 2),
                    strip_accents="unicode",
                ),
            ),
            (
                "classifier",
                LogisticRegression(max_iter=1000),
            ),
        ]
    )

    # 5. Train using only the training split.
    model.fit(X_train, y_train)

    # 6. Evaluate on the held-out test split.
    predictions = model.predict(X_test)

    accuracy = accuracy_score(y_test, predictions)
    macro_f1 = f1_score(
        y_test,
        predictions,
        average="macro",
        zero_division=0,
    )

    print("\n===== DATASET SUMMARY =====")
    print(f"Dataset: {DATASET_PATH.name}")
    print(f"Total examples: {len(data)}")
    print(f"Number of categories: {y.nunique()}")
    print(f"Training examples: {len(X_train)}")
    print(f"Test examples: {len(X_test)}")
    print("\nExamples per category:")
    print(category_counts.sort_index().to_string())

    print("\n===== HELD-OUT TEST RESULTS =====")
    print(f"Accuracy: {accuracy:.4f} ({accuracy * 100:.2f}%)")
    print(f"Macro-F1: {macro_f1:.4f}")

    print("\n===== CLASSIFICATION REPORT =====")
    print(
        classification_report(
            y_test,
            predictions,
            labels=sorted(y.unique()),
            zero_division=0,
        )
    )

    # 7. Save the new model without overwriting the baseline.
    joblib.dump(model, MODEL_PATH)

    print("\n===== MODEL SAVED =====")
    print(f"Model path: {MODEL_PATH}")
    print("Original model and baseline backup were not modified.")


if __name__ == "__main__":
    main()
