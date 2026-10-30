
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TransactionCreate(BaseModel):
    transaction_date: date
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    transaction_type: Literal["income", "expense"]
    category: str = Field(default="Other", min_length=1, max_length=100)


class TransactionUpdate(BaseModel):
    transaction_date: date
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    transaction_type: Literal["income", "expense"]
    category: str = Field(min_length=1, max_length=100)


class TransactionResponse(BaseModel):
    id: int
    transaction_date: date
    description: str
    amount: Decimal
    transaction_type: str
    category: str
    predicted_category: str | None
    prediction_confidence: Decimal | None
    is_reviewed: bool

    model_config = ConfigDict(from_attributes=True)
