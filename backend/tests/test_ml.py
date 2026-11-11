import unittest
from unittest.mock import MagicMock, patch

import numpy as np
from fastapi import HTTPException
from pydantic import ValidationError

from app.models import User
from app.ml_routes import (
    CategoryPredictionRequest,
    CategoryPredictionResponse,
    predict_transaction_category,
)
from ml.predict import (
    CONFIDENCE_THRESHOLD,
    MODEL_PATH,
    load_model,
    predict_category,
)


class DirectMLEndpointTestCase(unittest.TestCase):
    """Unit tests for the direct ML prediction route: POST /ml/predict-category."""

    def setUp(self):
        self.test_user = User(
            id=1,
            email="ml_tester@spendwise.ai",
            password_hash="fake_hash",
        )

    def test_predict_category_endpoint_has_get_current_user_dependency(self):
        """Verify POST /ml/predict-category endpoint declares get_current_user dependency."""
        import inspect
        from fastapi.params import Depends as DependsType
        from app.auth_dependencies import get_current_user

        sig = inspect.signature(predict_transaction_category)
        self.assertIn("current_user", sig.parameters)
        param = sig.parameters["current_user"]
        self.assertIsInstance(param.default, DependsType)
        self.assertEqual(param.default.dependency, get_current_user)

    def test_predict_category_endpoint_unauthenticated_missing_token_raises_401(self):
        """Unauthenticated request without Bearer credentials raises HTTP 401."""
        from app.auth_dependencies import get_current_user

        with self.assertRaises(HTTPException) as ctx:
            get_current_user(credentials=None, db=MagicMock())

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid or missing authentication token.")

    def test_predict_category_endpoint_unauthenticated_invalid_token_raises_401(self):
        """Unauthenticated request with invalid or malformed credentials raises HTTP 401."""
        from fastapi.security import HTTPAuthorizationCredentials
        from app.auth_dependencies import get_current_user

        bad_creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid.token.payload")
        with self.assertRaises(HTTPException) as ctx:
            get_current_user(credentials=bad_creds, db=MagicMock())

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid or missing authentication token.")

    def test_predict_category_endpoint_authenticated_retains_prediction_behavior(self):
        """Authenticated request with valid user retains exact prediction response behavior."""
        mock_result = {
            "predicted_category": "Transport",
            "confidence": 0.92,
            "needs_review": False,
        }

        with patch("app.ml_routes.predict_category", return_value=mock_result):
            req = CategoryPredictionRequest(description="Metro rail transit ticket")
            res = predict_transaction_category(req, current_user=self.test_user)

            self.assertEqual(res.predicted_category, "Transport")
            self.assertEqual(res.confidence, 0.92)
            self.assertFalse(res.needs_review)

    def test_predict_category_endpoint_success(self):
        """Valid description returns CategoryPredictionResponse with correct schema types."""
        mock_result = {
            "predicted_category": "Food/Dining",
            "confidence": 0.8842,
            "needs_review": False,
        }

        with patch("app.ml_routes.predict_category", return_value=mock_result) as mock_predict:
            req = CategoryPredictionRequest(description="Starbucks coffee latte")
            res = predict_transaction_category(req, current_user=self.test_user)

            mock_predict.assert_called_once_with("Starbucks coffee latte")
            self.assertIsInstance(res, CategoryPredictionResponse)
            self.assertEqual(res.predicted_category, "Food/Dining")
            self.assertEqual(res.confidence, 0.8842)
            self.assertFalse(res.needs_review)

    def test_predict_category_endpoint_high_confidence(self):
        """High-confidence prediction (>= 0.60) yields needs_review=False."""
        mock_result = {
            "predicted_category": "Transport",
            "confidence": 0.95,
            "needs_review": False,
        }

        with patch("app.ml_routes.predict_category", return_value=mock_result):
            req = CategoryPredictionRequest(description="Uber airport ride")
            res = predict_transaction_category(req, current_user=self.test_user)

            self.assertEqual(res.predicted_category, "Transport")
            self.assertEqual(res.confidence, 0.95)
            self.assertFalse(res.needs_review)

    def test_predict_category_endpoint_low_confidence(self):
        """Low-confidence prediction (< 0.60) yields needs_review=True."""
        mock_result = {
            "predicted_category": "Other",
            "confidence": 0.42,
            "needs_review": True,
        }

        with patch("app.ml_routes.predict_category", return_value=mock_result):
            req = CategoryPredictionRequest(description="Miscellaneous generic store 123")
            res = predict_transaction_category(req, current_user=self.test_user)

            self.assertEqual(res.predicted_category, "Other")
            self.assertEqual(res.confidence, 0.42)
            self.assertTrue(res.needs_review)

    def test_predict_category_endpoint_whitespace_description_raises_422(self):
        """Whitespace-only description passes schema length check but triggers 422 in handler."""
        req = CategoryPredictionRequest(description="     ")

        with self.assertRaises(HTTPException) as ctx:
            predict_transaction_category(req, current_user=self.test_user)

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail, "Transaction description cannot be empty.")

    def test_predict_category_endpoint_empty_description_fails_schema(self):
        """Empty string description fails Pydantic schema validation (min_length=1)."""
        with self.assertRaises(ValidationError) as ctx:
            CategoryPredictionRequest(description="")

        errors = ctx.exception.errors()
        self.assertTrue(any(e["loc"] == ("description",) for e in errors))

    def test_predict_category_endpoint_max_length_boundary(self):
        """Description up to 500 chars is valid; 501 chars fails Pydantic validation."""
        valid_desc = "a" * 500
        req = CategoryPredictionRequest(description=valid_desc)
        self.assertEqual(len(req.description), 500)

        overlong_desc = "a" * 501
        with self.assertRaises(ValidationError) as ctx:
            CategoryPredictionRequest(description=overlong_desc)

        errors = ctx.exception.errors()
        self.assertTrue(any(e["loc"] == ("description",) for e in errors))

    def test_predict_category_endpoint_missing_model_raises_503(self):
        """Missing ML model raises HTTP 503 Service Unavailable."""
        with patch("app.ml_routes.predict_category", side_effect=FileNotFoundError("Model missing")):
            req = CategoryPredictionRequest(description="Groceries shopping")
            with self.assertRaises(HTTPException) as ctx:
                predict_transaction_category(req, current_user=self.test_user)

            self.assertEqual(ctx.exception.status_code, 503)
            self.assertEqual(
                ctx.exception.detail,
                "The expense categorization model is unavailable.",
            )

    def test_predict_category_endpoint_error_does_not_leak_internal_paths_or_tracebacks(self):
        """Error responses must not leak file system paths, model filenames, or tracebacks."""
        fake_internal_path = "C:\\Users\\Secret\\Desktop\\models\\expense_classifier_v2.joblib"
        with patch(
            "app.ml_routes.predict_category",
            side_effect=FileNotFoundError(f"Trained model not found: {fake_internal_path}"),
        ):
            req = CategoryPredictionRequest(description="Dinner at Italian Bistro")
            with self.assertRaises(HTTPException) as ctx:
                predict_transaction_category(req, current_user=self.test_user)

            error_detail = str(ctx.exception.detail)
            self.assertEqual(error_detail, "The expense categorization model is unavailable.")
            self.assertNotIn("Secret", error_detail)
            self.assertNotIn(".joblib", error_detail)
            self.assertNotIn("Traceback", error_detail)
            self.assertNotIn("FileNotFoundError", error_detail)
            self.assertIsNone(ctx.exception.__cause__)


class PredictorBehaviorTestCase(unittest.TestCase):
    """Unit tests for the underlying predictor module: ml.predict."""

    def test_predictor_empty_string_raises_value_error(self):
        """predict_category with an empty string raises ValueError."""
        with self.assertRaises(ValueError) as ctx:
            predict_category("")
        self.assertEqual(str(ctx.exception), "Transaction description cannot be empty.")

    def test_predictor_whitespace_only_raises_value_error(self):
        """predict_category with whitespace-only strings raises ValueError."""
        for ws in ["   ", "\t", "\n", " \t \r\n "]:
            with self.subTest(whitespace=repr(ws)):
                with self.assertRaises(ValueError) as ctx:
                    predict_category(ws)
                self.assertEqual(str(ctx.exception), "Transaction description cannot be empty.")

    def test_predictor_strips_surrounding_whitespace(self):
        """predict_category strips leading/trailing whitespace before vectorization."""
        mock_model = MagicMock()
        mock_model.classes_ = np.array(["Groceries", "Transport"])
        mock_model.predict_proba.return_value = np.array([[0.85, 0.15]])

        with patch("ml.predict.load_model", return_value=mock_model):
            result = predict_category("   Supermarket Store   ")
            mock_model.predict_proba.assert_called_once_with(["Supermarket Store"])
            self.assertEqual(result["predicted_category"], "Groceries")

    def test_predictor_returns_expected_structure_and_types(self):
        """predict_category returns dict with exact keys and expected Python types."""
        mock_model = MagicMock()
        mock_model.classes_ = np.array(["Entertainment", "Utilities"])
        mock_model.predict_proba.return_value = np.array([[0.25, 0.75]])

        with patch("ml.predict.load_model", return_value=mock_model):
            res = predict_category("Electricity bill payment")

            self.assertIsInstance(res, dict)
            self.assertEqual(set(res.keys()), {"predicted_category", "confidence", "needs_review"})
            self.assertIsInstance(res["predicted_category"], str)
            self.assertIsInstance(res["confidence"], float)
            self.assertIsInstance(res["needs_review"], bool)
            self.assertEqual(res["predicted_category"], "Utilities")
            self.assertEqual(res["confidence"], 0.75)
            self.assertFalse(res["needs_review"])

    def test_predictor_confidence_threshold_boundaries(self):
        """Verify boundary condition for needs_review: True if < 0.60, False if >= 0.60."""
        self.assertEqual(CONFIDENCE_THRESHOLD, 0.60)

        test_cases = [
            # (probabilities, expected_confidence, expected_needs_review)
            ([0.6000, 0.4000], 0.6, False),      # Exact threshold
            ([0.6001, 0.3999], 0.6001, False),   # Just above threshold
            ([0.5999, 0.4001], 0.5999, True),    # Just below threshold
            ([0.0000, 1.0000], 1.0, False),      # Maximum confidence for class 1
            ([0.5000, 0.5000], 0.5, True),       # Tie/low confidence
            ([0.1000, 0.9000], 0.9, False),      # High confidence for class 1
        ]

        for probs, expected_conf, expected_review in test_cases:
            with self.subTest(probs=probs):
                mock_model = MagicMock()
                mock_model.classes_ = np.array(["ClassA", "ClassB"])
                mock_model.predict_proba.return_value = np.array([probs])

                with patch("ml.predict.load_model", return_value=mock_model):
                    res = predict_category("Sample description")
                    self.assertEqual(res["confidence"], expected_conf)
                    self.assertEqual(res["needs_review"], expected_review)

    def test_predictor_confidence_rounding(self):
        """Confidence is rounded to 4 decimal places."""
        mock_model = MagicMock()
        mock_model.classes_ = np.array(["Shopping", "Food"])
        # 0.7654321 should round to 0.7654
        mock_model.predict_proba.return_value = np.array([[0.7654321, 0.2345679]])

        with patch("ml.predict.load_model", return_value=mock_model):
            res = predict_category("Bookstore purchase")
            self.assertEqual(res["confidence"], 0.7654)

    def test_load_model_lru_cache_reuses_instance(self):
        """load_model caches and reuses model instance without reloading from disk."""
        load_model.cache_clear()
        try:
            m1 = load_model()
            m2 = load_model()
            self.assertIs(m1, m2)
            self.assertGreaterEqual(load_model.cache_info().hits, 1)
        finally:
            load_model.cache_clear()

    def test_load_model_missing_file_raises_file_not_found(self):
        """load_model raises FileNotFoundError if model path does not exist."""
        load_model.cache_clear()
        try:
            with patch("ml.predict.MODEL_PATH", MODEL_PATH.parent / "non_existent_classifier.joblib"):
                with self.assertRaises(FileNotFoundError) as ctx:
                    load_model()
                self.assertIn("Trained model not found", str(ctx.exception))
        finally:
            load_model.cache_clear()

    def test_predictor_real_model_inference(self):
        """Execute real inference against the trained model on disk if present."""
        if not MODEL_PATH.exists():
            self.skipTest("Trained model file not found on disk.")

        load_model.cache_clear()
        try:
            model = load_model()
            known_classes = set(model.classes_)

            descriptions = [
                "Swiggy delivery food order",
                "Metro train ticket recharge",
                "Amazon online shopping clothes",
            ]

            for desc in descriptions:
                with self.subTest(description=desc):
                    res = predict_category(desc)
                    self.assertIn(res["predicted_category"], known_classes)
                    self.assertIsInstance(res["confidence"], float)
                    self.assertGreaterEqual(res["confidence"], 0.0)
                    self.assertLessEqual(res["confidence"], 1.0)
                    self.assertIsInstance(res["needs_review"], bool)
                    self.assertEqual(res["needs_review"], res["confidence"] < 0.60)
        finally:
            load_model.cache_clear()


if __name__ == "__main__":
    unittest.main()
