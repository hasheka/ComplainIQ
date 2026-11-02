"""Background jobs: sentiment scoring and batch prediction over a dataset's narratives.
Results are written next to the dataset as parquet files aligned to the cleaned file's row order
(missing narrative -> missing result). Progress is stored on the job row so the UI can show a bar."""
from __future__ import annotations

import gc
import logging
import threading
import uuid
from datetime import timezone

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from . import prediction as pr
from . import sentiment as sm
from .config import Settings
from .frames import predictions_path, sentiment_path
from .models import Dataset, Job, utcnow
from .storage import Storage

log = logging.getLogger("complainiq.jobs")
CHUNK = {"sentiment": 5_000, "prediction": 10_000}


class BundleProvider:
    """Loads the model lazily, once. A failed load is NOT cached, so fixing the files needs no restart."""
    def __init__(self, settings: Settings):
        self.settings, self._bundle, self._lock = settings, None, threading.Lock()

    def get(self):
        with self._lock:
            if self._bundle is None:
                self._bundle = pr.load_bundle(self.settings)
            return self._bundle


def active_job(db: Session, dataset_id: uuid.UUID, kind: str | None = None) -> Job | None:
    q = select(Job).where(Job.dataset_id == dataset_id, Job.status.in_(["queued", "running"]))
    if kind:
        q = q.where(Job.kind == kind)
    return db.scalars(q.order_by(Job.created_at.desc())).first()


def _atomic_parquet(df: pd.DataFrame, path) -> None:
    tmp = path.with_suffix(".tmp")
    df.to_parquet(tmp, index=False)
    tmp.replace(path)


def run_job(session_factory: sessionmaker, storage: Storage, settings: Settings,
            bundles: BundleProvider, job_id: uuid.UUID) -> None:
    narr = None
    with session_factory() as db:
        job = db.get(Job, job_id)
        if job is None:
            return
        ds = db.get(Dataset, job.dataset_id)
        job.status, job.progress = "running", 0
        db.commit()
        try:
            if ds is None or ds.status != "ready":
                raise ValueError("The dataset is not ready.")
            narr = pd.read_parquet(storage.cleaned(ds.user_id, ds.id), columns=["narrative"])["narrative"]
            idx = narr.index[narr.notna()]
            if len(idx) == 0:
                raise ValueError("This dataset has no complaint narratives to analyse.")
            n, step = len(narr), CHUNK[job.kind]
            if job.kind == "sentiment":
                compound = np.full(n, np.nan)
                label = np.full(n, None, dtype=object)
            else:
                bundle = bundles.get()
                pred = np.full(n, None, dtype=object)
                conf = np.full(n, np.nan)
            for i in range(0, len(idx), step):
                sl = idx[i:i + step]
                if job.kind == "sentiment":
                    r = sm.score_texts(narr.loc[sl])
                    compound[sl] = r["compound"].values
                    label[sl] = r["sentiment"].astype(object).values
                else:
                    r = pr.predict_batch(bundle, narr.loc[sl])
                    pred[sl] = r["predicted_product"].astype(object).values
                    conf[sl] = r["confidence"].values
                job.progress = min(99, int(100 * (i + len(sl)) / len(idx)))
                db.commit()
            if job.kind == "sentiment":
                out = pd.DataFrame({"compound": compound, "sentiment": pd.Series(label, dtype="string")})
                _atomic_parquet(out, sentiment_path(storage, ds))
            else:
                out = pd.DataFrame({"predicted_product": pd.Series(pred, dtype="string"), "confidence": conf})
                _atomic_parquet(out, predictions_path(storage, ds))
                (storage.dataset_dir(ds.user_id, ds.id) / "predictions_export.csv").unlink(missing_ok=True)
            job.status, job.progress, job.error = "done", 100, None
        except pr.ModelError as exc:
            log.error("Model unavailable for job %s: %s", job_id, exc)
            job.status, job.error = "failed", "The prediction model is not available on the server."
        except ValueError as exc:
            job.status, job.error = "failed", str(exc)
        except Exception:
            log.exception("Job %s failed", job_id)
            job.status, job.error = "failed", "The analysis failed unexpectedly. Please try again."
        finally:
            job.finished_at = utcnow()
            db.commit()
            del narr
            gc.collect()
