"""Read-only analytics over a ready dataset. Every route returns aggregates, never raw rows."""
from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from .. import analysis as an
from .. import recommendations as rc
from .. import sentiment as sm
from ..deps import Filt, Frame, ReadyDataset

router = APIRouter(prefix="/api/datasets/{dataset_id}", tags=["analytics"])


def _apply(frame, f: Filt, ignore_dates: bool = False):
    return an.apply_filters(frame, f.to_filters(frame, ignore_dates))


@router.get("/filters")
def filter_options(ds: ReadyDataset, frame: Frame):
    """Values for the filter drop-downs on the dashboard."""
    dates = frame["date"].dropna()
    has_sent = "sentiment" in frame.columns
    return {"products": sorted(map(str, frame["product"].cat.categories if hasattr(frame["product"], "cat") else frame["product"].dropna().unique())),
            "issues": sorted(map(str, frame["issue"].cat.categories if hasattr(frame["issue"], "cat") else frame["issue"].dropna().unique())),
            "date_min": dates.min().strftime("%Y-%m-%d") if not dates.empty else None,
            "date_max": dates.max().strftime("%Y-%m-%d") if not dates.empty else None,
            "sentiment_available": has_sent, "sentiments": list(sm.LABELS) if has_sent else []}


@router.get("/dashboard")
def dashboard(ds: ReadyDataset, frame: Frame, f: Filt):
    d = _apply(frame, f)
    out = an.dashboard_summary(d)
    out["sentiment"] = sm.distribution(d) if "sentiment" in d.columns else None
    out["sentiment_available"] = "sentiment" in frame.columns
    out["filters_applied"] = f.as_dict()
    return out


@router.get("/analytics/issues")
def issues(ds: ReadyDataset, frame: Frame, f: Filt, limit: int = Query(20, ge=1, le=200)):
    d = _apply(frame, f)
    return {"total_unique": int(d["issue"].nunique()), "items": an.top_counts(d, "issue", limit)}


@router.get("/analytics/products")
def products(ds: ReadyDataset, frame: Frame, f: Filt, limit: int = Query(20, ge=1, le=200)):
    d = _apply(frame, f)
    return {"total_unique": int(d["product"].nunique()), "items": an.top_counts(d, "product", limit)}


@router.get("/analytics/trends")
def trends(ds: ReadyDataset, frame: Frame, f: Filt, by: Literal["none", "product", "issue"] = "none",
           top: int = Query(5, ge=1, le=10)):
    d = _apply(frame, f)
    out = {"monthly": an.monthly_trend(d), "yearly": an.yearly_trend(d)}
    if by != "none":
        out["by_category"] = {"column": by, **an.trend_by_category(d, by, top)}
    if "sentiment" in d.columns:
        out["negative_sentiment_monthly"] = sm.monthly_sentiment(d)
    return out


@router.get("/analytics/breakdown")
def breakdown(ds: ReadyDataset, frame: Frame, f: Filt, issue: str | None = None, product: str | None = None):
    """Give either ?issue=NAME (its products and sub-issues) or ?product=NAME (its top issues)."""
    if bool(issue) == bool(product):
        raise HTTPException(422, "Provide exactly one of 'issue' or 'product'.")
    d = _apply(frame, f)
    if issue:
        sub = d[d["issue"] == issue]
        if sub.empty:
            raise HTTPException(404, "No complaints match that issue.")
        return {"issue": issue, "count": int(len(sub)), "products": an.top_counts(sub, "product", 10),
                "sub_issues": an.sub_issues_for_issue(d, issue, 10)}
    sub = d[d["product"] == product]
    if sub.empty:
        raise HTTPException(404, "No complaints match that product.")
    return {"product": product, "count": int(len(sub)), "issues": an.top_counts(sub, "issue", 10)}


@router.get("/analytics/matrix")
def matrix(ds: ReadyDataset, frame: Frame, f: Filt, products: int = Query(8, ge=1, le=15), issues: int = Query(10, ge=1, le=20)):
    return an.product_issue_matrix(_apply(frame, f), products, issues)


@router.get("/analytics/compare")
def compare(ds: ReadyDataset, frame: Frame, f: Filt, prev_from: date, prev_to: date, recent_from: date, recent_to: date,
            by: Literal["issue", "product"] = "issue", min_count: int = Query(50, ge=1, le=100000)):
    """Compare category shares between two periods. Date filters are ignored here; the periods are the dates."""
    if prev_from > prev_to or recent_from > recent_to:
        raise HTTPException(422, "Each period must start on or before it ends.")
    if prev_to >= recent_from:
        raise HTTPException(422, "The earlier period must end before the recent period starts.")
    d = _apply(frame, f, ignore_dates=True)
    res = an.compare_periods(d, (prev_from, prev_to), (recent_from, recent_to), by, min_count=min_count)
    res["items"] = res["items"][:100]
    return res


@router.get("/analytics/rising")
def rising(ds: ReadyDataset, frame: Frame, f: Filt, window_months: int = Query(12, ge=3, le=24),
           by: Literal["issue", "product"] = "issue"):
    d = _apply(frame, f)
    res = an.rising_issues(d, window_months, by)
    res["items"] = res["items"][:100]
    return res


@router.get("/recommendations")
def recommendations(ds: ReadyDataset, frame: Frame, f: Filt, top_n: int = Query(10, ge=1, le=25),
                    window_months: int = Query(12, ge=3, le=24)):
    """Live recommendation report (not saved). Use POST /reports to save it to your history."""
    return rc.build_report(frame, f.to_filters(frame), top_n=top_n, window_months=window_months)
