
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

DEFAULT_CORS_ALLOWED_ORIGINS = (
    "http://localhost:5173,"
    "http://127.0.0.1:5173,"
    "http://[::1]:5173,"
    "http://localhost:5174,"
    "http://127.0.0.1:5174"
)


def parse_cors_allowed_origins(raw_origins: str) -> list[str]:
    """Parse a comma-separated CORS origins string into a clean list."""
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


class Settings(BaseSettings):
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "spendwise_ai"
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    CORS_ALLOWED_ORIGINS: str = DEFAULT_CORS_ALLOWED_ORIGINS

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret_key(cls, value: str) -> str:
        """Enforce minimum length of 32 characters and reject the documented placeholder secret."""
        if not isinstance(value, str) or not value.strip():
            raise ValueError("JWT_SECRET_KEY cannot be empty or whitespace-only.")
        stripped = value.strip()
        if stripped == "change_this_to_a_secure_random_key_of_at_least_32_characters":
            raise ValueError(
                "JWT_SECRET_KEY must be replaced with a real secret key, not the .env.example placeholder."
            )
        non_whitespace_length = len(stripped)
        if non_whitespace_length < 32:
            raise ValueError(
                f"JWT_SECRET_KEY must be at least 32 characters long (got {non_whitespace_length})."
            )
        return value

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

database_url = URL.create(
    drivername="postgresql+psycopg",
    username=settings.POSTGRES_USER,
    password=settings.POSTGRES_PASSWORD,
    host=settings.POSTGRES_HOST,
    port=settings.POSTGRES_PORT,
    database=settings.POSTGRES_DB,
)

engine = create_engine(database_url, pool_pre_ping=True)


def test_database_connection():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True
