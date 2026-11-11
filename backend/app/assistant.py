from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.assistant_service import get_starter_prompts, process_assistant_query
from app.auth_dependencies import get_current_user
from app.dependencies import get_db
from app.models import User
from app.rate_limiter import rate_limit_assistant
from app.schemas import (
    AssistantQueryRequest,
    AssistantQueryResponse,
    StarterPromptsResponse,
)

router = APIRouter(prefix="/assistant", tags=["AI Money Assistant"])


@router.post(
    "/query",
    response_model=AssistantQueryResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit_assistant)],
)
def query_assistant(
    request: AssistantQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssistantQueryResponse:
    """Answer personal finance questions using strictly authenticated user data."""
    return process_assistant_query(
        query=request.query,
        user=current_user,
        db=db,
        month=request.month,
    )


@router.get(
    "/starter-prompts",
    response_model=StarterPromptsResponse,
    status_code=status.HTTP_200_OK,
)
def list_starter_prompts(
    current_user: User = Depends(get_current_user),
) -> StarterPromptsResponse:
    """Retrieve recommended conversation starter prompts."""
    return get_starter_prompts()

