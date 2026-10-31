
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline

BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR.parent / "expense_training_data_v2.csv"

data = pd.read_csv(DATASET_PATH)
data = data.dropna(subset=["description", "category"]).copy()
data["description"] = data["description"].astype(str).str.strip()
data["category"] = data["category"].astype(str).str.strip()
data = data[
    (data["description"] != "")
    & (data["category"] != "")
]

if data["description"].duplicated().any():
    raise ValueError("Duplicate descriptions found. Resolve them first.")

X = data["description"]
y = data["category"]

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

accuracy_scores = results["test_accuracy"]
f1_scores = results["test_macro_f1"]

print("\n===== FIVE-FOLD CROSS-VALIDATION =====")
print(f"Dataset examples: {len(data)}")
print(f"Categories: {y.nunique()}")

print("\nAccuracy per fold:")
print([round(score, 4) for score in accuracy_scores])
print(f"Mean accuracy: {accuracy_scores.mean():.4f}")
print(f"Accuracy standard deviation: {accuracy_scores.std():.4f}")

print("\nMacro-F1 per fold:")
print([round(score, 4) for score in f1_scores])
print(f"Mean macro-F1: {f1_scores.mean():.4f}")
print(f"Macro-F1 standard deviation: {f1_scores.std():.4f}")
