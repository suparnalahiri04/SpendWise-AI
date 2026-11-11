from datetime import datetime, timedelta, timezone
import unittest

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
import jwt
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import login_user, read_current_user, register_user
from app.auth_dependencies import get_current_user
from app.database import settings
from app.models import Base, User
from app.schemas import UserLogin, UserRegister, UserResponse
from app.security import hash_password, verify_password
from app.token import create_access_token


class AuthenticationBackendTestCase(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite database isolated for each test
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    # -------------------------------------------------------------------------
    # 1. Registration Tests
    # -------------------------------------------------------------------------
    def test_register_user_success(self):
        """User registration creates a user, hashes password, and returns profile."""
        payload = UserRegister(email="testuser@spendwise.ai", password="SecurePassword123!")
        user_result = register_user(payload, db=self.db)

        self.assertIsNotNone(user_result.id)
        self.assertEqual(user_result.email, "testuser@spendwise.ai")

        # Verify password is not in UserResponse schema
        response_model = UserResponse.model_validate(user_result)
        self.assertEqual(response_model.id, user_result.id)
        self.assertEqual(response_model.email, "testuser@spendwise.ai")
        self.assertFalse(hasattr(response_model, "password_hash"))
        self.assertFalse(hasattr(response_model, "password"))

        # Verify password stored in DB is hashed using Argon2
        db_user = self.db.scalar(select(User).where(User.id == user_result.id))
        self.assertIsNotNone(db_user)
        self.assertNotEqual(db_user.password_hash, "SecurePassword123!")
        self.assertTrue(db_user.password_hash.startswith("$argon2id$"))
        self.assertTrue(verify_password("SecurePassword123!", db_user.password_hash))

    def test_register_user_email_normalization(self):
        """Email with mixed case and surrounding whitespace is normalized to trimmed lowercase."""
        payload = UserRegister(email="  MixedCaseUser@SpendWise.AI  ", password="SecurePassword123!")
        user_result = register_user(payload, db=self.db)

        self.assertEqual(user_result.email, "mixedcaseuser@spendwise.ai")

        db_user = self.db.scalar(select(User).where(User.id == user_result.id))
        self.assertEqual(db_user.email, "mixedcaseuser@spendwise.ai")

    def test_register_duplicate_email_conflict_409(self):
        """Attempting to register an already existing email raises HTTP 409 conflict."""
        payload1 = UserRegister(email="existing@spendwise.ai", password="FirstPassword123!")
        register_user(payload1, db=self.db)

        payload2 = UserRegister(email="existing@spendwise.ai", password="SecondPassword123!")
        with self.assertRaises(HTTPException) as ctx:
            register_user(payload2, db=self.db)

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("An account with this email already exists", ctx.exception.detail)

    def test_register_case_insensitive_duplicate_email_conflict_409(self):
        """Attempting to register the same email with different casing raises HTTP 409."""
        payload1 = UserRegister(email="alice@spendwise.ai", password="FirstPassword123!")
        register_user(payload1, db=self.db)

        payload2 = UserRegister(email="ALICE@SpendWise.ai", password="SecondPassword123!")
        with self.assertRaises(HTTPException) as ctx:
            register_user(payload2, db=self.db)

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("An account with this email already exists", ctx.exception.detail)

    def test_register_validation_invalid_email_and_short_password(self):
        """Pydantic rejects invalid emails and passwords shorter than 8 characters."""
        with self.assertRaises(ValidationError) as ctx:
            UserRegister(email="notanemail", password="ValidPassword123!")
        self.assertTrue(any(err["loc"] == ("email",) for err in ctx.exception.errors()))

        with self.assertRaises(ValidationError) as ctx:
            UserRegister(email="valid@spendwise.ai", password="short")
        self.assertTrue(any(err["loc"] == ("password",) for err in ctx.exception.errors()))

    # -------------------------------------------------------------------------
    # 2. Login Tests
    # -------------------------------------------------------------------------
    def test_login_success_returns_jwt(self):
        """Logging in with correct credentials returns a valid Bearer JWT access token."""
        register_user(UserRegister(email="loginuser@spendwise.ai", password="MySecretPassword123!"), db=self.db)

        login_payload = UserLogin(email="loginuser@spendwise.ai", password="MySecretPassword123!")
        token_response = login_user(login_payload, db=self.db)

        self.assertEqual(token_response.token_type, "bearer")
        self.assertIsInstance(token_response.access_token, str)

        # Verify the returned JWT decodes with configured secret and sub matches user ID
        payload = jwt.decode(
            token_response.access_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        db_user = self.db.scalar(select(User).where(User.email == "loginuser@spendwise.ai"))
        self.assertEqual(int(payload["sub"]), db_user.id)

    def test_login_case_insensitive_email(self):
        """Logging in with different email casing succeeds due to normalization."""
        register_user(UserRegister(email="caseuser@spendwise.ai", password="MySecretPassword123!"), db=self.db)

        login_payload = UserLogin(email="CASEUSER@SpendWise.AI", password="MySecretPassword123!")
        token_response = login_user(login_payload, db=self.db)

        self.assertIsNotNone(token_response.access_token)

    def test_login_incorrect_password_unauthorized_401(self):
        """Logging in with wrong password returns HTTP 401 unauthorized."""
        register_user(UserRegister(email="victim@spendwise.ai", password="CorrectPassword123!"), db=self.db)

        login_payload = UserLogin(email="victim@spendwise.ai", password="WrongPassword999!")
        with self.assertRaises(HTTPException) as ctx:
            login_user(login_payload, db=self.db)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Incorrect email or password.")
        self.assertEqual(ctx.exception.headers.get("WWW-Authenticate"), "Bearer")

    def test_login_nonexistent_user_returns_identical_401(self):
        """Logging in with nonexistent email returns the exact same 401 error (no user enumeration)."""
        login_payload = UserLogin(email="ghost@spendwise.ai", password="SomePassword123!")
        with self.assertRaises(HTTPException) as ctx:
            login_user(login_payload, db=self.db)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Incorrect email or password.")
        self.assertEqual(ctx.exception.headers.get("WWW-Authenticate"), "Bearer")

    # -------------------------------------------------------------------------
    # 3. Current-User Endpoint & Dependency Tests
    # -------------------------------------------------------------------------
    def test_get_current_user_valid_token(self):
        """get_current_user extracts the user from a valid Bearer token."""
        user = register_user(UserRegister(email="validauth@spendwise.ai", password="ValidPassword123!"), db=self.db)
        token = create_access_token(user.id)
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        authenticated_user = get_current_user(credentials=creds, db=self.db)
        self.assertEqual(authenticated_user.id, user.id)
        self.assertEqual(authenticated_user.email, "validauth@spendwise.ai")

        # read_current_user profile endpoint
        profile = read_current_user(current_user=authenticated_user)
        self.assertEqual(profile.id, user.id)
        self.assertEqual(profile.email, "validauth@spendwise.ai")

    def test_get_current_user_missing_token_401(self):
        """get_current_user with missing credentials raises HTTP 401."""
        with self.assertRaises(HTTPException) as ctx:
            get_current_user(credentials=None, db=self.db)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid or missing authentication token.")
        self.assertEqual(ctx.exception.headers.get("WWW-Authenticate"), "Bearer")

    def test_get_current_user_malformed_token_401(self):
        """get_current_user with garbage or malformed token string raises HTTP 401."""
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="not-a-valid-jwt-token")
        with self.assertRaises(HTTPException) as ctx:
            get_current_user(credentials=creds, db=self.db)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid or missing authentication token.")

    def test_get_current_user_expired_token_401(self):
        """get_current_user with an expired JWT raises HTTP 401."""
        now = datetime.now(timezone.utc)
        expired_payload = {
            "sub": "1",
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
        }
        expired_token = jwt.encode(expired_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=expired_token)

        with self.assertRaises(HTTPException) as ctx:
            get_current_user(credentials=creds, db=self.db)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid or missing authentication token.")

    def test_get_current_user_invalid_signature_401(self):
        """get_current_user with a token signed using a wrong secret key raises HTTP 401."""
        now = datetime.now(timezone.utc)
        tampered_token = jwt.encode(
            {"sub": "1", "iat": now, "exp": now + timedelta(hours=1)},
            "completely-wrong-secret-key-1234567890",
            algorithm=settings.JWT_ALGORITHM,
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=tampered_token)

        with self.assertRaises(HTTPException) as ctx:
            get_current_user(credentials=creds, db=self.db)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid or missing authentication token.")

    def test_get_current_user_nonexistent_user_id_401(self):
        """Validly signed token referring to a nonexistent user ID raises HTTP 401."""
        ghost_token = create_access_token(99999)
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=ghost_token)

        with self.assertRaises(HTTPException) as ctx:
            get_current_user(credentials=creds, db=self.db)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid or missing authentication token.")

    def test_get_current_user_non_integer_sub_401(self):
        """Token with a non-integer sub claim raises HTTP 401."""
        now = datetime.now(timezone.utc)
        invalid_sub_token = jwt.encode(
            {"sub": "abc-non-int", "iat": now, "exp": now + timedelta(hours=1)},
            settings.JWT_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=invalid_sub_token)

        with self.assertRaises(HTTPException) as ctx:
            get_current_user(credentials=creds, db=self.db)

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid or missing authentication token.")

    # -------------------------------------------------------------------------
    # 4. Focused Helper Tests
    # -------------------------------------------------------------------------
    def test_password_hashing_and_verification(self):
        """hash_password produces unique salted Argon2 hashes; verify_password evaluates correctly."""
        raw_password = "ComplexPassword#2026!"
        hash1 = hash_password(raw_password)
        hash2 = hash_password(raw_password)

        self.assertTrue(hash1.startswith("$argon2id$"))
        self.assertTrue(hash2.startswith("$argon2id$"))
        # Salted: two hashes of the same password must differ
        self.assertNotEqual(hash1, hash2)

        self.assertTrue(verify_password(raw_password, hash1))
        self.assertTrue(verify_password(raw_password, hash2))
        self.assertFalse(verify_password("WrongPassword#2026!", hash1))
        # Case sensitive
        self.assertFalse(verify_password("complexpassword#2026!", hash1))

    def test_jwt_creation_claims(self):
        """create_access_token includes subject, issued-at, and expiration claims matching settings."""
        user_id = 42
        token = create_access_token(user_id)
        now = datetime.now(timezone.utc)

        decoded = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

        self.assertEqual(decoded["sub"], "42")
        self.assertIn("iat", decoded)
        self.assertIn("exp", decoded)

        # Expected expiry within 5 seconds of settings delta
        expected_exp = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
        actual_exp = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)
        self.assertAlmostEqual(actual_exp.timestamp(), expected_exp.timestamp(), delta=5)


class JwtSecretKeyValidationTestCase(unittest.TestCase):
    """Unit tests for JWT secret key length and strength validation (SEC-06)."""

    def test_valid_32_character_secret_accepted(self):
        """A 32-character synthetic secret is accepted by the validator."""
        from app.database import Settings
        synthetic_32 = "a" * 32
        validated = Settings.validate_jwt_secret_key(synthetic_32)
        self.assertEqual(len(validated), 32)
        self.assertEqual(validated, synthetic_32)

    def test_valid_64_character_secret_accepted(self):
        """A 64-character synthetic secret is accepted by the validator."""
        from app.database import Settings
        synthetic_64 = "b" * 64
        validated = Settings.validate_jwt_secret_key(synthetic_64)
        self.assertEqual(len(validated), 64)
        self.assertEqual(validated, synthetic_64)

    def test_valid_secret_with_intentional_whitespace_preserved_exactly(self):
        """A valid secret with intentional leading/trailing whitespace is preserved exactly without stripping."""
        from app.database import Settings
        raw_secret_with_padding = "  " + ("d" * 32) + "\t "
        validated = Settings.validate_jwt_secret_key(raw_secret_with_padding)
        self.assertEqual(validated, raw_secret_with_padding)
        self.assertEqual(len(validated), len(raw_secret_with_padding))

    def test_short_secret_rejected_with_validation_error(self):
        """Secrets shorter than 32 characters raise ValueError."""
        from app.database import Settings
        short_synthetic = "c" * 31
        with self.assertRaises(ValueError) as ctx:
            Settings.validate_jwt_secret_key(short_synthetic)
        self.assertIn("at least 32 characters long", str(ctx.exception))
        # Ensure raw secret is not leaked in exception message
        self.assertNotIn(short_synthetic, str(ctx.exception))

    def test_empty_secret_rejected_with_validation_error(self):
        """Empty string secret raises ValueError."""
        from app.database import Settings
        with self.assertRaises(ValueError) as ctx:
            Settings.validate_jwt_secret_key("")
        self.assertIn("cannot be empty or whitespace-only", str(ctx.exception))

    def test_whitespace_only_secret_rejected_with_validation_error(self):
        """Whitespace-only secret raises ValueError."""
        from app.database import Settings
        with self.assertRaises(ValueError) as ctx:
            Settings.validate_jwt_secret_key("   \t   \n  ")
        self.assertIn("cannot be empty or whitespace-only", str(ctx.exception))

    def test_placeholder_secret_rejected_with_validation_error(self):
        """Literal .env.example placeholder JWT secret raises ValueError."""
        from app.database import Settings
        with self.assertRaises(ValueError) as ctx:
            Settings.validate_jwt_secret_key("change_this_to_a_secure_random_key_of_at_least_32_characters")
        self.assertIn("placeholder", str(ctx.exception))

        with self.assertRaises(ValueError):
            Settings.validate_jwt_secret_key("  change_this_to_a_secure_random_key_of_at_least_32_characters  ")

    def test_loaded_development_settings_secret_meets_length_requirement(self):
        """The currently loaded application Settings instance meets the >= 32 character requirement."""
        # Check length without printing, logging, or exposing secret content
        self.assertIsInstance(settings.JWT_SECRET_KEY, str)
        self.assertGreaterEqual(len(settings.JWT_SECRET_KEY.strip()), 32)


if __name__ == "__main__":
    unittest.main()

