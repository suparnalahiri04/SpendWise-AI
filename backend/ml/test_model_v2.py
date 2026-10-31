
from pathlib import Path

import joblib

MODEL_PATH = Path(__file__).resolve().parent / "expense_classifier_v2.joblib"

model = joblib.load(MODEL_PATH)

test_descriptions = [
    "Starbucks coffee",
    "Uber ride to office",
    "Monthly salary credited",
    "Electricity bill payment",
    "Grocery store purchase",
    "Amazon online shopping",
    "Doctor consultation fee",
    "Netflix monthly subscription",
    "University tuition payment",
    "Credit card bill repayment",
    "Unknown bank adjustment",
]

print("\n===== SPENDWISE AI: MODEL V2 TEST =====")

for description in test_descriptions:
    probabilities = model.predict_proba([description])[0]
    best_index = probabilities.argmax()

    category = model.classes_[best_index]
    confidence = probabilities[best_index]

    print(f"\nTransaction: {description}")
    print(f"Predicted category: {category}")
    print(f"Model confidence: {confidence:.2%}")
