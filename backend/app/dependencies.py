
from collections.abc import Generator

from sqlalchemy.orm import Session

from app.database import engine


def get_db() -> Generator[Session, None, None]:
    """Provide a database session for an API request."""
    with Session(engine) as session:
        yield session
