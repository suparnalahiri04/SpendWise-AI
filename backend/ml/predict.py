
from functools import lru_cache
from pathlib import Path

import joblib

MODEL_PATH = Path(__file__).resolve().parent / "expense_classifier_v2.joblib"

# Initial review threshold; calibrate it using validation data later.
CONFIDENCE_THRESHOLD = 0.60


@lru_cache(maxsize=1)
def load_model():
    """Load the trained model once and reuse it."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Trained model not found: {MODEL_PATH}"
        )

    return joblib.load(MODEL_PATH)


def predict_category(description: str) -> dict:
    """Return a category suggestion and its estimated confidence."""
    cleaned_description = description.strip()

    if not cleaned_description:
        raise ValueError("Transaction description cannot be empty.")

    model = load_model()
    probabilities = model.predict_proba([cleaned_description])[0]
    best_index = probabilities.argmax()

    predicted_category = str(model.classes_[best_index])
    confidence = float(probabilities[best_index])

    return {
        "predicted_category": predicted_category,
        "confidence": round(confidence, 4),
        "needs_review": confidence < CONFIDENCE_THRESHOLD,
    }
