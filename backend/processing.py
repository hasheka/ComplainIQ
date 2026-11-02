"""Runs the Stage 1 pipeline for an uploaded dataset and records the outcome in the database.
Designed to be called from a background task: it opens its own DB session and never raises."""
from __future__ import annotations

import gc
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import sessionmaker

from . import analysis as an
from . import preprocessing as pp
from .config import Settings
from .models import Dataset, Job, utcnow
from .storage import Storage

log = logging.getLogger("complainiq.processing")


def _jsonable(obj):
    return json.loads(json.dumps(obj, default=str))


def process_dataset(session_factory: sessionmaker, storage: Storage, settings: Settings,
                    dataset_id: uuid.UUID, overrides: dict[str, str] | None = None) -> None:
    df = None
    with session_factory() as db:
        ds = db.get(Dataset, dataset_id)
        if ds is None:
            return
        ds.status, ds.error = "processing", None
        db.commit()
        try:
            src = storage.original(ds.user_id, ds.id)
            df, cm = pp.load_dataset(src, overrides, max_mb=settings.max_upload_mb)
            if len(df) > settings.max_rows:
                raise pp.DatasetError(f"The file has {len(df):,} rows; the limit is {settings.max_rows:,}.")
            df, rep = pp.clean_dataset(df, copy=False)
            pp.save_cleaned(df, storage.cleaned(ds.user_id, ds.id))
            for stale in ("cleaned_export.csv", "sentiment.parquet", "predictions.parquet", "predictions_export.csv"):
                (storage.dataset_dir(ds.user_id, ds.id) / stale).unlink(missing_ok=True)   # derived from the OLD rows
            db.execute(delete(Job).where(Job.dataset_id == ds.id))
            ds.rows = int(len(df))
            ds.mapping = cm.mapping
            ds.cleaning_report = _jsonable(rep.to_dict())
            ds.profile = _jsonable(pp.profile_dataset(df))
            ds.summary = _jsonable(an.overview_metrics(df))
            ds.status, ds.processed_at = "ready", utcnow()
        except pp.DatasetError as exc:
            ds.status, ds.error = "failed", str(exc)[:1000]
            storage.cleaned(ds.user_id, ds.id).unlink(missing_ok=True)
        except Exception:                                       # never leak internals to the user
            log.exception("Processing failed for dataset %s", dataset_id)
            ds.status = "failed"
            ds.error = "Processing failed unexpectedly. Please check the file and try again."
            storage.cleaned(ds.user_id, ds.id).unlink(missing_ok=True)
        finally:
            db.commit()
            del df
            gc.collect()


def cleanup_stale(session_factory: sessionmaker, storage: Storage, settings: Settings) -> dict:
    """Housekeeping for failed/abandoned uploads (run at start-up):
    * datasets stuck in uploaded/processing/needs_mapping for longer than STALE_UPLOAD_HOURS are marked failed
      and their files removed (a restart during processing leaves such rows behind);
    * storage folders with no database row (a crash between writing the file and the insert) are deleted."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.stale_upload_hours)
    stale = orphan = 0
    with session_factory() as db:
        for ds in db.scalars(select(Dataset).where(Dataset.status.in_(["uploaded", "processing", "needs_mapping"]),
                                                    Dataset.created_at < cutoff)):
            ds.status, ds.error = "failed", "The upload was not completed. Please upload the file again."
            storage.delete_dataset(ds.user_id, ds.id)
            stale += 1
        jobs = 0
        for job in db.scalars(select(Job).where(Job.status.in_(["queued", "running"]), Job.created_at < cutoff)):
            job.status, job.error, job.finished_at = "failed", "The analysis was interrupted. Please run it again.", utcnow()
            jobs += 1
        db.commit()
        known = {(str(u), str(d)) for u, d in db.execute(select(Dataset.user_id, Dataset.id))}
    for user_dir in storage.root.iterdir():
        if not user_dir.is_dir():
            continue
        for d in user_dir.iterdir():
            if d.is_dir() and (user_dir.name, d.name) not in known \
                    and datetime.fromtimestamp(d.stat().st_mtime, timezone.utc) < cutoff:
                import shutil
                shutil.rmtree(d, ignore_errors=True)
                orphan += 1
    return {"stale_datasets": stale, "stale_jobs": jobs, "orphan_folders": orphan}
