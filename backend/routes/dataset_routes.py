from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from .. import preprocessing as pp
from ..deps import DB, CurrentUser, OwnedDataset, SettingsDep, StorageDep
from ..models import Dataset
from ..jobs import active_job
from ..processing import process_dataset
from ..schemas import DatasetDetailOut, DatasetOut, MappingIn, PreviewOut
from ..storage import safe_display_name

router = APIRouter(prefix="/api/datasets", tags=["datasets"])
CHUNK = 1024 * 1024


def _detail(ds: Dataset) -> DatasetDetailOut:
    return DatasetDetailOut.model_validate(ds)


def _copy_limited(src, dest: Path, max_bytes: int) -> int:
    written = 0
    with open(dest, "wb") as fh:
        while chunk := src.read(CHUNK):
            written += len(chunk)
            if written > max_bytes:
                raise HTTPException(413, f"File is too large. The limit is {max_bytes // (1024 * 1024)} MB.")
            fh.write(chunk)
    return written


@router.post("", response_model=DatasetDetailOut, status_code=201)
def upload_dataset(request: Request, background: BackgroundTasks, user: CurrentUser, db: DB,
                   settings: SettingsDep, storage: StorageDep, file: UploadFile = File(...)):
    """Accepts a CSV, stores the untouched original privately, detects columns and starts cleaning.
    Returns status 'processing' (poll GET /api/datasets/{id}) or 'needs_mapping' if columns need your help."""
    name = safe_display_name(file.filename)
    if not name.lower().endswith(".csv"):
        raise HTTPException(415, "Unsupported file type. Please upload a .csv file.")
    count = db.scalar(select(func.count()).select_from(Dataset).where(Dataset.user_id == user.id))
    if count >= settings.max_datasets_per_user:
        raise HTTPException(409, f"You have reached the limit of {settings.max_datasets_per_user} datasets. Delete one first.")

    ds = Dataset(user_id=user.id, original_filename=name, size_bytes=0, status="uploaded")
    db.add(ds)
    db.commit()
    storage.prepare(user.id, ds.id)
    try:
        ds.size_bytes = _copy_limited(file.file, storage.original(user.id, ds.id), settings.max_upload_bytes)
        pp.validate_file(storage.original(user.id, ds.id), settings.max_upload_mb)
        header, _ = pp.read_header(storage.original(user.id, ds.id))
        cm = pp.detect_columns(header)
    except (HTTPException, pp.DatasetError) as exc:
        storage.delete_dataset(user.id, ds.id)               # nothing is left behind after a failed upload
        db.delete(ds)
        db.commit()
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(400, str(exc))
    except Exception:
        storage.delete_dataset(user.id, ds.id)
        db.delete(ds)
        db.commit()
        raise
    ds.file_columns, ds.mapping = header, cm.mapping
    if cm.ok:
        ds.status = "processing"
        db.commit()
        background.add_task(process_dataset, request.app.state.sessionmaker, storage, settings, ds.id, None)
    else:
        ds.status = "needs_mapping"
        ds.error = "Some required columns could not be found: " + ", ".join(cm.missing_required) + ". Please match them to columns in your file."
        db.commit()
    return _detail(ds)


@router.get("", response_model=list[DatasetOut])
def list_datasets(user: CurrentUser, db: DB):
    rows = db.scalars(select(Dataset).where(Dataset.user_id == user.id).order_by(Dataset.created_at.desc()))
    return list(rows)


@router.get("/{dataset_id}", response_model=DatasetDetailOut)
def get_dataset(ds: OwnedDataset):
    return _detail(ds)


@router.post("/{dataset_id}/mapping", response_model=DatasetDetailOut)
def set_mapping(body: MappingIn, request: Request, background: BackgroundTasks, ds: OwnedDataset, db: DB,
                settings: SettingsDep, storage: StorageDep):
    """Choose which file column holds each field, then (re)run cleaning."""
    if ds.status in ("processing", "uploaded"):
        raise HTTPException(409, "This dataset is still being processed.")
    if not ds.file_columns:
        raise HTTPException(409, "This dataset has no stored file to map.")
    if active_job(db, ds.id):
        raise HTTPException(409, "An analysis is still running on this dataset. Wait for it to finish.")
    try:
        cm = pp.detect_columns(ds.file_columns, overrides=body.mapping)
    except pp.DatasetError as exc:
        raise HTTPException(400, str(exc))
    if not cm.ok:
        raise HTTPException(400, "Required fields still missing: " + ", ".join(cm.missing_required))
    ds.mapping, ds.status, ds.error = cm.mapping, "processing", None
    db.commit()
    background.add_task(process_dataset, request.app.state.sessionmaker, storage, settings, ds.id, body.mapping)
    return _detail(ds)


def _require_ready(ds: Dataset) -> None:
    if ds.status != "ready":
        raise HTTPException(409, f"The dataset is not ready (status: {ds.status}).")


@router.get("/{dataset_id}/preview", response_model=PreviewOut)
def preview_dataset(ds: OwnedDataset, storage: StorageDep, page: int = Query(1, ge=1),
                    page_size: int = Query(20, ge=1, le=100)):
    _require_ready(ds)
    rows, total = pp.read_page(storage.cleaned(ds.user_id, ds.id), page, page_size)
    return PreviewOut(page=page, page_size=page_size, total_rows=total, rows=rows)


@router.get("/{dataset_id}/download/cleaned")
def download_cleaned(ds: OwnedDataset, storage: StorageDep):
    _require_ready(ds)
    csv_path = storage.cleaned_csv(ds.user_id, ds.id)
    if not csv_path.exists():
        pp.export_parquet_to_csv(storage.cleaned(ds.user_id, ds.id), csv_path)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(ds.original_filename).stem)[:80] or "dataset"
    return FileResponse(csv_path, media_type="text/csv", filename=f"cleaned_{stem}.csv")


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(request: Request, ds: OwnedDataset, db: DB, storage: StorageDep):
    """Deletes the database record, history, and BOTH stored files (original and cleaned)."""
    storage.delete_dataset(ds.user_id, ds.id)
    request.app.state.frame_cache.drop(ds.id)
    db.delete(ds)
    db.commit()
