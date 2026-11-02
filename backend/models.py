"""Database tables. Large files are NOT stored here - only their metadata and results."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, TypeDecorator, Uuid)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base



class UTCDateTime(TypeDecorator):
    """Timestamp that always comes back timezone-aware (UTC).

    PostgreSQL keeps the time zone itself. SQLite does not: it returns naive datetimes, which would crash
    comparisons such as `session.expires_at <= datetime.now(timezone.utc)`. Values are stored as UTC.
    """
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and dialect.name == "sqlite":
            value = (value.astimezone(timezone.utc) if value.tzinfo else value).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


JSONType = JSON().with_variant(JSONB(), "postgresql")
DATASET_STATUSES = ("uploaded", "needs_mapping", "processing", "ready", "failed")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)   # argon2 hash, never the password
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)
    sessions: Mapped[list["UserSession"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)
    datasets: Mapped[list["Dataset"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)


class UserSession(Base):
    """Server-side login session. Only a SHA-256 of the cookie token is stored."""
    __tablename__ = "user_sessions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = (
        CheckConstraint("status in ('uploaded','needs_mapping','processing','ready','failed')", name="ck_datasets_status"),
        Index("ix_datasets_user_created", "user_id", "created_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)   # display only, never used as a path
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="uploaded")
    error: Mapped[str | None] = mapped_column(Text)
    rows: Mapped[int | None] = mapped_column(Integer)
    file_columns: Mapped[list | None] = mapped_column(JSONType)       # header found in the upload
    mapping: Mapped[dict | None] = mapped_column(JSONType)            # canonical field -> file column
    cleaning_report: Mapped[dict | None] = mapped_column(JSONType)
    profile: Mapped[dict | None] = mapped_column(JSONType)
    summary: Mapped[dict | None] = mapped_column(JSONType)            # overview metrics for the history list
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    analyses: Mapped[list["Analysis"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)
    jobs: Mapped[list["Job"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)


class Job(Base):
    """A long-running task on a dataset (sentiment scoring or batch prediction) with progress."""
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint("kind in ('sentiment','prediction')", name="ck_jobs_kind"),
        CheckConstraint("status in ('queued','running','done','failed')", name="ck_jobs_status"),
        Index("ix_jobs_dataset_kind", "dataset_id", "kind"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="queued")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class Analysis(Base):
    """A saved report (the user's analysis history). `summary` holds the full report so it can be reopened/exported."""
    __tablename__ = "analyses"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str | None] = mapped_column(String(120))
    headline: Mapped[str | None] = mapped_column(String(300))      # one-line preview for the history list
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    filters: Mapped[dict | None] = mapped_column(JSONType)
    summary: Mapped[dict | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)
