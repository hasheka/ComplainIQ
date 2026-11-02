"""Request/response models (Pydantic). They define the API contract shown in /api/docs."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .preprocessing import OPTIONAL, REQUIRED


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=80)

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name cannot be blank.")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()


class PasswordChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


class PasswordConfirmIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    display_name: str
    created_at: datetime


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    original_filename: str
    size_bytes: int
    status: str
    error: str | None = None
    rows: int | None = None
    summary: dict | None = None
    created_at: datetime
    processed_at: datetime | None = None


class DatasetDetailOut(DatasetOut):
    file_columns: list[str] | None = None
    mapping: dict[str, str] | None = None
    cleaning_report: dict | None = None
    profile: dict | None = None
    required_fields: list[str] = Field(default_factory=lambda: list(REQUIRED))
    optional_fields: list[str] = Field(default_factory=lambda: list(OPTIONAL))


class MappingIn(BaseModel):
    mapping: dict[str, str] = Field(min_length=1, description="canonical field -> column name in your file")


class PreviewOut(BaseModel):
    page: int
    page_size: int
    total_rows: int
    rows: list[dict]


class PredictIn(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class FilterIn(BaseModel):
    date_from: str | None = None
    date_to: str | None = None
    products: list[str] = Field(default_factory=list, max_length=50)
    issues: list[str] = Field(default_factory=list, max_length=50)
    sentiments: list[str] = Field(default_factory=list, max_length=3)


class ReportIn(BaseModel):
    kind: str = Field(pattern="^(recommendations|summary)$")
    title: str | None = Field(default=None, max_length=120)
    filters: FilterIn = Field(default_factory=FilterIn)
    top_n: int = Field(default=10, ge=1, le=25)
    window_months: int = Field(default=12, ge=3, le=24)


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    dataset_id: uuid.UUID
    kind: str
    status: str
    progress: int
    error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class AnalysisOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    dataset_name: str
    kind: str
    title: str | None = None
    headline: str | None = None
    filters: dict | None = None
    created_at: datetime


class AnalysisDetailOut(AnalysisOut):
    report: dict
