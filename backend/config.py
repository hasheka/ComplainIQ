"""Central configuration. Values come from environment variables so that
secrets and paths never live in source code (see .env.example in Stage 6)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
APP_NAME = os.environ.get("APP_NAME", "ComplainIQ")  # easy to rename later


def default_database_url() -> str:
    storage = Path(os.environ.get("STORAGE_DIR", PROJECT_ROOT / "storage"))
    storage.mkdir(parents=True, exist_ok=True)          # the SQLite file lives here
    return f"sqlite:///{(storage / 'complainiq.db').as_posix()}"      # forward slashes also work on Windows


@dataclass(frozen=True)
class Settings:
    app_name: str = APP_NAME
    model_path: Path = Path(os.environ.get("MODEL_PATH", PROJECT_ROOT / "models" / "best_complaint_model.pkl"))
    vectorizer_path: Path = Path(os.environ.get("VECTORIZER_PATH", PROJECT_ROOT / "models" / "tfidf_vectorizer.pkl"))
    eval_report_path: Path = Path(os.environ.get("EVAL_REPORT_PATH", PROJECT_ROOT / "models" / "model_evaluation_report.csv"))
    # Optional integrity check: pickle files can run code when loaded, so in
    # production set these to the SHA-256 of the files you trust.
    model_sha256: str | None = os.environ.get("MODEL_SHA256") or None
    vectorizer_sha256: str | None = os.environ.get("VECTORIZER_SHA256") or None
    max_upload_mb: int = int(os.environ.get("MAX_UPLOAD_MB", "500"))
    max_prediction_chars: int = 10_000
    # ---- web app (Stage 3)
    # Default: one SQLite file inside the storage folder (no database server needed).
    # To use PostgreSQL instead, set DATABASE_URL (it contains a password, so it only ever comes from the environment).
    database_url: str | None = os.environ.get("DATABASE_URL") or default_database_url()
    storage_dir: Path = Path(os.environ.get("STORAGE_DIR", PROJECT_ROOT / "storage"))
    cookie_secure: bool = os.environ.get("COOKIE_SECURE", "true").lower() != "false"  # set false only for local http
    session_days: int = int(os.environ.get("SESSION_DAYS", "7"))
    allowed_origins: tuple[str, ...] = tuple(o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip())
    max_rows: int = int(os.environ.get("MAX_ROWS", "2000000"))
    max_datasets_per_user: int = int(os.environ.get("MAX_DATASETS_PER_USER", "20"))
    min_password_length: int = 10
    frontend_dir: Path = Path(os.environ.get("FRONTEND_DIR", PROJECT_ROOT / "frontend" / "dist"))   # built UI (npm run build)
    stale_upload_hours: int = int(os.environ.get("STALE_UPLOAD_HOURS", "6"))

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


settings = Settings()
