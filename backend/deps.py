"""FastAPI dependencies: database session, current user, ownership checks."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from datetime import date
from typing import Annotated, Iterator

from fastapi import Cookie, Depends, HTTPException, Query, Request
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import analysis as an
from . import prediction as pr
from .auth import COOKIE_NAME, token_hash
from .frames import load_frame
from .config import Settings
from .models import Dataset, User, UserSession
from .storage import Storage


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_storage(request: Request) -> Storage:
    return request.app.state.storage


def get_db(request: Request) -> Iterator[Session]:
    with request.app.state.sessionmaker() as db:
        yield db


DB = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
StorageDep = Annotated[Storage, Depends(get_storage)]


def current_session(db: DB, settings: SettingsDep,
                    token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None) -> UserSession:
    if not token:
        raise HTTPException(401, "Not signed in.")
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash(token)))
    now = datetime.now(timezone.utc)
    if sess is None or sess.expires_at <= now:
        if sess is not None:
            db.delete(sess)
            db.commit()
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    if sess.expires_at - now < timedelta(days=settings.session_days) / 2:     # sliding renewal
        sess.expires_at = now + timedelta(days=settings.session_days)
        db.commit()
    return sess


def current_user(sess: Annotated[UserSession, Depends(current_session)], db: DB) -> User:
    user = db.get(User, sess.user_id)
    if user is None:
        raise HTTPException(401, "Not signed in.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def owned_dataset(dataset_id: uuid.UUID, user: CurrentUser, db: DB) -> Dataset:
    """The dataset only if it belongs to the signed-in user. Others get 404 (not 403), so IDs cannot be probed."""
    ds = db.scalar(select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id))
    if ds is None:
        raise HTTPException(404, "Dataset not found.")
    return ds


OwnedDataset = Annotated[Dataset, Depends(owned_dataset)]


def ready_dataset(ds: OwnedDataset) -> Dataset:
    if ds.status != "ready":
        raise HTTPException(409, f"The dataset is not ready (status: {ds.status}).")
    return ds


ReadyDataset = Annotated[Dataset, Depends(ready_dataset)]


def get_frame(request: Request, ds: ReadyDataset):
    return load_frame(request.app.state.storage, request.app.state.frame_cache, ds)


Frame = Annotated[pd.DataFrame, Depends(get_frame)]


class FilterParams:
    """Query-string filters shared by the analytics routes: ?date_from=&date_to=&product=&issue=&sentiment="""
    def __init__(self, date_from: date | None = Query(None), date_to: date | None = Query(None),
                 product: list[str] = Query(default=[], max_length=50), issue: list[str] = Query(default=[], max_length=50),
                 sentiment: list[str] = Query(default=[], max_length=3)):
        if date_from and date_to and date_from > date_to:
            raise HTTPException(422, "date_from must not be after date_to.")
        bad = [x for x in sentiment if x not in ("Negative", "Neutral", "Positive")]
        if bad:
            raise HTTPException(422, "sentiment must be Negative, Neutral or Positive.")
        self.date_from, self.date_to, self.products, self.issues, self.sentiments = date_from, date_to, product, issue, sentiment

    def to_filters(self, frame, ignore_dates: bool = False) -> an.Filters:
        if self.sentiments and "sentiment" not in frame.columns:
            raise HTTPException(409, "Sentiment has not been computed for this dataset yet.")
        return an.Filters(None if ignore_dates else self.date_from, None if ignore_dates else self.date_to,
                          self.products or None, self.issues or None, self.sentiments or None)

    def as_dict(self) -> dict:
        return {"date_from": self.date_from.isoformat() if self.date_from else None,
                "date_to": self.date_to.isoformat() if self.date_to else None,
                "products": self.products, "issues": self.issues, "sentiments": self.sentiments}


Filt = Annotated[FilterParams, Depends()]


def get_bundle(request: Request):
    """The loaded model, or HTTP 503 with a plain explanation (details go to the server log only)."""
    try:
        return request.app.state.bundles.get()
    except pr.ModelError as exc:
        import logging
        logging.getLogger("complainiq").error("Model unavailable: %s", exc)
        raise HTTPException(503, "The prediction model is not available on the server right now.")
