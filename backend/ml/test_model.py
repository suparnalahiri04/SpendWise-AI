
from pathlib import Path

import joblib

MODEL_PATH = Path(__file__).resolve().parent / "expense_classifier.joblib"

model = joblib.load(MODEL_PATH)

test_descriptions = [
    "Starbucks coffee",
    "Uber ride payment",
    "Monthly salary credited",
    "Electricity bill",
    "Amazon shopping order",
    "Pharmacy medicine",
    "College tuition fee",
    "Transfer to savings account",
]

print("\n===== SAMPLE PREDICTIONS =====")

for description in test_descriptions:
    probabilities = model.predict_proba([description])[0]
    best_index = probabilities.argmax()

    category = model.classes_[best_index]
    confidence = probabilities[best_index]

    print(f"\nTransaction: {description}")
    print(f"Predicted category: {category}")
    print(f"Model confidence: {confidence:.2%}")
