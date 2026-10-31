
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline

BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR.parent / "expense_training_data.csv"


def main():
    data = pd.read_csv(DATASET_PATH)
    data = data.dropna(subset=["description", "category"])

    data["description"] = data["description"].astype(str).str.strip()
    data["category"] = data["category"].astype(str).str.strip()

    data = data[
        (data["description"] != "")
        & (data["category"] != "")
    ]

    X = data["description"]
    y = data["category"]

    if y.value_counts().min() < 5:
        raise ValueError(
            "Every category needs at least 5 examples for 5-fold "
            "stratified cross-validation."
        )

    model = Pipeline([
        (
            "tfidf",
            TfidfVectorizer(
                lowercase=True,
                ngram_range=(1, 2),
                strip_accents="unicode",
            ),
        ),
        ("classifier", LogisticRegression(max_iter=1000)),
    ])

    cv = StratifiedKFold(
        n_splits=5,
        shuffle=True,
        random_state=42,
    )

    results = cross_validate(
        model,
        X,
        y,
        cv=cv,
        scoring={
            "accuracy": "accuracy",
            "macro_f1": "f1_macro",
        },
        return_train_score=False,
    )

    accuracy = results["test_accuracy"]
    macro_f1 = results["test_macro_f1"]

    print("\n===== 5-FOLD CROSS-VALIDATION =====")
    print(f"Dataset examples: {len(data)}")
    print(f"Categories: {y.nunique()}")
    print(f"Examples per category (minimum): {y.value_counts().min()}")

    print("\nAccuracy per fold:", accuracy.round(4))
    print(f"Mean accuracy: {accuracy.mean():.4f}")
    print(f"Accuracy standard deviation: {accuracy.std():.4f}")

    print("\nMacro-F1 per fold:", macro_f1.round(4))
    print(f"Mean macro-F1: {macro_f1.mean():.4f}")
    print(f"Macro-F1 standard deviation: {macro_f1.std():.4f}")

    print(
        "\nNote: these results measure performance on this small, "
        "synthetic dataset, not on real bank statements."
    )


if __name__ == "__main__":
    main()
