
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ml.predict import predict_category

router = APIRouter(prefix="/ml", tags=["Machine Learning"])


class CategoryPredictionRequest(BaseModel):
    description: str = Field(min_length=1, max_length=500)


class CategoryPredictionResponse(BaseModel):
    predicted_category: str
    confidence: float
    needs_review: bool


@router.post(
    "/predict-category",
    response_model=CategoryPredictionResponse,
)
def predict_transaction_category(
    request: CategoryPredictionRequest,
) -> CategoryPredictionResponse:
    """Suggest an expense category for a transaction description."""
    try:
        result = predict_category(request.description)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="The expense categorization model is unavailable.",
        ) from None

    return CategoryPredictionResponse(**result)
