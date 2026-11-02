"""Loads a user's cleaned dataset for analytics, with a small in-memory cache.

Only the light columns are read (the big narrative text is NOT loaded), and the last few frames are kept in
memory so a dashboard click does not re-read the file. Cached frames are shared between requests: treat
them as READ-ONLY (analysis functions only slice them). Cache size: FRAME_CACHE_SIZE (default 2)."""
from __future__ import annotations

import os
import threading
import uuid
from collections import OrderedDict

import pandas as pd
import pyarrow.parquet as pq

from . import preprocessing as pp
from . import sentiment as sm
from .models import Dataset
from .storage import Storage

BASE_COLUMNS = ["date", "product", "issue", "sub_issue", "has_narrative"]


class FrameCache:
    def __init__(self, size: int | None = None):
        self.size = size or int(os.environ.get("FRAME_CACHE_SIZE", "2"))
        self._items: OrderedDict = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            if key in self._items:
                self._items.move_to_end(key)
                return self._items[key]
        return None

    def put(self, key, frame) -> None:
        with self._lock:
            self._items[key] = frame
            self._items.move_to_end(key)
            while len(self._items) > self.size:
                self._items.popitem(last=False)

    def drop(self, dataset_id: uuid.UUID) -> None:
        with self._lock:
            for k in [k for k in self._items if k[0] == dataset_id]:
                del self._items[k]


def _mtime(p) -> int:
    try:
        return p.stat().st_mtime_ns
    except FileNotFoundError:
        return 0


def sentiment_path(storage: Storage, ds: Dataset):
    return storage.dataset_dir(ds.user_id, ds.id) / "sentiment.parquet"


def predictions_path(storage: Storage, ds: Dataset):
    return storage.dataset_dir(ds.user_id, ds.id) / "predictions.parquet"


def load_frame(storage: Storage, cache: FrameCache, ds: Dataset) -> pd.DataFrame:
    """Light cleaned frame (+ sentiment columns if sentiment has been computed)."""
    cleaned, sent = storage.cleaned(ds.user_id, ds.id), sentiment_path(storage, ds)
    key = (ds.id, _mtime(cleaned), _mtime(sent))
    hit = cache.get(key)
    if hit is not None:
        return hit
    cols = [c for c in BASE_COLUMNS if c in pq.read_schema(cleaned).names]
    df = pp.load_cleaned(cleaned, columns=cols)
    if sent.exists():
        s = pd.read_parquet(sent)
        df["compound"] = s["compound"].values
        df["sentiment"] = pd.Categorical(s["sentiment"].values, categories=sm.LABELS)
    cache.put(key, df)
    return df
