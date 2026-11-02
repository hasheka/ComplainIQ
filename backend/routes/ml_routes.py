"""Prediction, sentiment and job routes."""
from __future__ import annotations

import re
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import select

from .. import prediction as pr
from .. import sentiment as sm
from .. import analysis as an
from ..deps import DB, CurrentUser, Filt, Frame, ReadyDataset, SettingsDep, StorageDep, get_bundle
from ..frames import predictions_path, sentiment_path
from ..jobs import active_job, run_job
from ..models import Job
from ..schemas import JobOut, PredictIn
from fastapi import Depends

router = APIRouter(tags=["ml"])

PRIVACY_INFO = {
    "storage": ["Each upload is kept as two private files on the server: your original CSV and a cleaned copy.",
                "Files are stored under random IDs in a folder only the server can read; other accounts cannot reach them.",
                "Only summary numbers (counts, report text) are kept in the database, never the complaint texts."],
    "processing": ["Cleaning, sentiment and prediction run on the server; nothing is sent to outside AI services.",
                   "Sentiment uses the VADER word-list method. Predictions use the bundled scikit-learn model."],
    "retention": ["Your data stays until you delete a dataset or your account; deleting removes the database record and every stored file.",
                  "Failed or abandoned uploads are removed automatically."],
}


@router.get("/api/info", tags=["system"])
def info(user: CurrentUser, settings: SettingsDep):
    return {"app_name": settings.app_name, "privacy": PRIVACY_INFO,
            "limits": {"max_upload_mb": settings.max_upload_mb, "max_rows": settings.max_rows,
                       "max_datasets_per_user": settings.max_datasets_per_user, "session_days": settings.session_days},
            "sentiment_note": sm.SENTIMENT_NOTE}


# ---------------------------------------------------------------- model + single prediction
@router.get("/api/model")
def model_info(user: CurrentUser, request: Request, settings: SettingsDep):
    return pr.model_card(get_bundle(request), settings)


@router.post("/api/predict")
def predict(body: PredictIn, user: CurrentUser, request: Request):
    """Predicts the PRODUCT category of one complaint text (that is what the supplied model was trained on)."""
    bundle = get_bundle(request)
    try:
        return pr.predict_one(bundle, body.text)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


# ---------------------------------------------------------------- jobs
def _start(kind: str, ds, db, request: Request, background: BackgroundTasks, user, settings, storage) -> Job:
    existing = active_job(db, ds.id, kind)
    if existing:
        return existing                                    # one run at a time per dataset and kind
    if not (ds.summary or {}).get("narratives_present"):
        raise HTTPException(409, "This dataset has no complaint narratives, so this analysis is not possible.")
    job = Job(dataset_id=ds.id, user_id=user.id, kind=kind, status="queued")
    db.add(job)
    db.commit()
    background.add_task(run_job, request.app.state.sessionmaker, storage, settings, request.app.state.bundles, job.id)
    return job


@router.get("/api/datasets/{dataset_id}/jobs", response_model=list[JobOut])
def list_jobs(ds: ReadyDataset, db: DB):
    return list(db.scalars(select(Job).where(Job.dataset_id == ds.id).order_by(Job.created_at.desc()).limit(10)))


# ---------------------------------------------------------------- sentiment
@router.post("/api/datasets/{dataset_id}/sentiment", response_model=JobOut, status_code=202)
def start_sentiment(request: Request, background: BackgroundTasks, ds: ReadyDataset, db: DB, user: CurrentUser,
                    settings: SettingsDep, storage: StorageDep):
    """Starts (or returns the running) sentiment job. Poll GET .../jobs for progress."""
    return _start("sentiment", ds, db, request, background, user, settings, storage)


@router.get("/api/datasets/{dataset_id}/sentiment")
def sentiment_results(ds: ReadyDataset, frame: Frame, f: Filt, min_n: int = Query(100, ge=1, le=100000)):
    if "sentiment" not in frame.columns:
        raise HTTPException(409, "Sentiment has not been computed yet. Start it with POST /sentiment.")
    d = an.apply_filters(frame, f.to_filters(frame))
    by_issue = sm.by_category(d, "issue", min_n=min_n, top=15)
    return {"distribution": sm.distribution(d), "by_product": sm.by_category(d, "product", min_n=min_n, top=15),
            "by_issue": by_issue, "most_negative_issues": by_issue[:10],
            "monthly": sm.monthly_sentiment(d), "min_narratives_per_category": min_n,
            "filters_applied": f.as_dict()}


# ---------------------------------------------------------------- batch predictions
@router.post("/api/datasets/{dataset_id}/predictions", response_model=JobOut, status_code=202)
def start_predictions(request: Request, background: BackgroundTasks, ds: ReadyDataset, db: DB, user: CurrentUser,
                      settings: SettingsDep, storage: StorageDep):
    get_bundle(request)                                    # fail fast (503) if the model files are missing
    return _start("prediction", ds, db, request, background, user, settings, storage)


@router.get("/api/datasets/{dataset_id}/predictions")
def prediction_results(ds: ReadyDataset, frame: Frame, request: Request, settings: SettingsDep, storage: StorageDep):
    path = predictions_path(storage, ds)
    if not path.exists():
        raise HTTPException(409, "Predictions have not been computed yet. Start them with POST /predictions.")
    bundle = get_bundle(request)
    p = pd.read_parquet(path)
    done = p["predicted_product"].notna()
    counts = p.loc[done, "predicted_product"].value_counts()
    n = int(done.sum())
    comparable = done & frame["product"].astype("string").isin(bundle.classes).values
    if comparable.any():
        predicted = p.loc[comparable, "predicted_product"].astype(str).to_numpy()
        actual = frame.loc[comparable.values, "product"].astype(str).to_numpy()
        agree = float((predicted == actual).mean())
    else:
        agree = None
    ev = pr.load_evaluation(settings)
    return {"target": pr.TRAINED_TARGET, "predicted_rows": n, "narratives_without_prediction": int((frame["has_narrative"] & ~done).sum()),
            "rows_without_narrative": int((~frame["has_narrative"]).sum()),
            "distribution": [{"name": k, "count": int(v), "pct": round(100 * v / n, 2)} for k, v in counts.items()] if n else [],
            "mean_confidence": round(float(p["confidence"].mean()), 4) if n else None,
            "low_confidence_pct": round(100 * float((p.loc[done, "confidence"] < pr.LOW_CONFIDENCE).mean()), 2) if n else None,
            "agreement_with_product_column": {"compared_rows": int(comparable.sum()),
                                              "agreement_pct": None if agree is None else round(100 * float(agree), 2),
                                              "caveat": "This is NOT an accuracy estimate: the model was trained on part of this same public dataset. "
                                                        f"The reliable figure is its held-out test accuracy ({ev.get('accuracy', 0):.2%}), measured on data it had not seen."},
            "product_coverage": pr.label_coverage(bundle, frame["product"]),
            "note": "Confidence is the model's raw probability and is not calibrated."}


@router.get("/api/datasets/{dataset_id}/predictions/download")
def download_predictions(ds: ReadyDataset, storage: StorageDep):
    path, out = predictions_path(storage, ds), storage.dataset_dir(ds.user_id, ds.id) / "predictions_export.csv"
    if not path.exists():
        raise HTTPException(409, "Predictions have not been computed yet.")
    if not out.exists():
        cleaned = storage.cleaned(ds.user_id, ds.id)
        import pyarrow.parquet as pq
        names = pq.read_schema(cleaned).names
        cols = [c for c in ("complaint_id", "product", "issue") if c in names]
        meta = pd.read_parquet(cleaned, columns=cols + ["has_narrative"])
        res = pd.concat([meta.reset_index(drop=True), pd.read_parquet(path)], axis=1)
        res = res[res["predicted_product"].notna()].rename(columns={"product": "actual_product"})
        res.insert(0, "row_number", res.index + 1)
        res.drop(columns=["has_narrative"]).to_csv(out, index=False)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(ds.original_filename).stem)[:80] or "dataset"
    return FileResponse(out, media_type="text/csv", filename=f"predictions_{stem}.csv")
