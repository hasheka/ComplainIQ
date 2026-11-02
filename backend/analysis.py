"""Complaint analytics. Pure functions: DataFrame in, plain dicts/lists out.

No Streamlit, no matplotlib, no web code - so the same functions serve the API,
the tests and the verification script. Input is the cleaned frame produced by
preprocessing.clean_dataset (columns: date, product, issue, ... has_narrative).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd


# --------------------------------------------------------------------------
# Filters
# --------------------------------------------------------------------------
@dataclass
class Filters:
    date_from: pd.Timestamp | str | None = None
    date_to: pd.Timestamp | str | None = None
    products: list[str] | None = None
    issues: list[str] | None = None
    sentiments: list[str] | None = None  # needs a 'sentiment' column (added by sentiment.py)


def apply_filters(df: pd.DataFrame, f: Filters | None) -> pd.DataFrame:
    """Return the filtered frame. Using a date filter drops rows with no date."""
    if f is None:
        return df
    mask = pd.Series(True, index=df.index)
    if f.date_from is not None:
        mask &= df["date"] >= pd.Timestamp(f.date_from)
    if f.date_to is not None:
        mask &= df["date"] <= pd.Timestamp(f.date_to)
    if f.products:
        mask &= df["product"].isin(f.products)
    if f.issues:
        mask &= df["issue"].isin(f.issues)
    if f.sentiments:
        if "sentiment" not in df.columns:
            raise ValueError("Sentiment filter requested but sentiment has not been computed.")
        mask &= df["sentiment"].isin(f.sentiments)
    return df.loc[mask]


# --------------------------------------------------------------------------
# Overview metrics (the 4 cards from the Streamlit app + data-quality extras)
# --------------------------------------------------------------------------
def overview_metrics(df: pd.DataFrame) -> dict:
    total = len(df)
    dates = df["date"].dropna()
    narr = int(df["has_narrative"].sum()) if "has_narrative" in df else 0
    return {
        "total_complaints": total,
        "unique_products": int(df["product"].nunique()),
        "unique_issues": int(df["issue"].nunique()),
        "date_min": dates.min().strftime("%Y-%m-%d") if not dates.empty else None,
        "date_max": dates.max().strftime("%Y-%m-%d") if not dates.empty else None,
        "rows_with_valid_date": int(len(dates)),
        "narratives_present": narr,
        "narratives_missing": total - narr,
        "narrative_pct": round(100 * narr / total, 2) if total else 0.0,
    }


def top_counts(df: pd.DataFrame, column: str, n: int = 10) -> list[dict]:
    """Top-n categories. `pct` is the share of rows that HAVE a value in this column."""
    if column not in df.columns:
        return []
    vc = df[column].value_counts(dropna=True)
    vc = vc[vc > 0].head(n)          # categorical columns keep unused labels with count 0
    denom = int(df[column].notna().sum())
    return [{"name": str(k), "count": int(v), "pct": round(100 * v / denom, 2) if denom else 0.0}
            for k, v in vc.items()]


# --------------------------------------------------------------------------
# Trends
# --------------------------------------------------------------------------
def _month_is_partial(ts_min: pd.Timestamp, ts_max: pd.Timestamp) -> tuple[bool, bool]:
    first_partial = ts_min.day > 1
    last_partial = ts_max.day < ts_max.days_in_month
    return first_partial, last_partial


def monthly_trend(df: pd.DataFrame) -> list[dict]:
    """Complaints per month, zero-filled between first and last month.
    Months at either end that the data only partly covers are flagged `partial`."""
    d = df["date"].dropna()
    if d.empty:
        return []
    counts = d.dt.to_period("M").value_counts().sort_index()
    full = pd.period_range(counts.index.min(), counts.index.max(), freq="M")
    counts = counts.reindex(full, fill_value=0)
    first_p, last_p = _month_is_partial(d.min(), d.max())
    rows = []
    for i, (period, c) in enumerate(counts.items()):
        partial = (i == 0 and first_p) or (i == len(counts) - 1 and last_p)
        rows.append({"month": str(period), "count": int(c), "partial": bool(partial)})
    return rows


def yearly_trend(df: pd.DataFrame) -> list[dict]:
    d = df["date"].dropna()
    if d.empty:
        return []
    g = pd.DataFrame({"year": d.dt.year, "month": d.dt.month})
    out = []
    for year, grp in g.groupby("year"):
        months = int(grp["month"].nunique())
        out.append({"year": int(year), "count": int(len(grp)), "months_covered": months,
                    "partial": months < 12})
    return out


def trend_by_category(df: pd.DataFrame, column: str, top: int = 5) -> dict:
    """Monthly counts for the `top` biggest categories (for multi-line charts)."""
    d = df.dropna(subset=["date"])
    keep = d[column].value_counts().head(top).index
    sub = d[d[column].isin(keep)]
    pivot = (sub.assign(month=sub["date"].dt.to_period("M").astype(str))
                .groupby(["month", column], observed=True).size().unstack(fill_value=0))
    return {"months": pivot.index.tolist(),
            "series": {str(c): pivot[c].astype(int).tolist() for c in pivot.columns}}


# --------------------------------------------------------------------------
# Breakdowns
# --------------------------------------------------------------------------
def issues_for_product(df: pd.DataFrame, product: str, n: int = 5) -> list[dict]:
    return top_counts(df[df["product"] == product], "issue", n)


def sub_issues_for_issue(df: pd.DataFrame, issue: str, n: int = 10) -> dict:
    if "sub_issue" not in df.columns:
        return {"available": False, "items": [], "missing_pct": None}
    sub = df[df["issue"] == issue]
    missing = int(sub["sub_issue"].isna().sum())
    return {"available": True, "items": top_counts(sub, "sub_issue", n),
            "missing_pct": round(100 * missing / len(sub), 2) if len(sub) else None}


def product_issue_matrix(df: pd.DataFrame, top_products: int = 8, top_issues: int = 10) -> dict:
    ps = df["product"].value_counts().head(top_products).index
    iss = df["issue"].value_counts().head(top_issues).index
    sub = df[df["product"].isin(ps) & df["issue"].isin(iss)]
    m = sub.groupby(["issue", "product"], observed=True).size().unstack(fill_value=0)
    return {"products": [str(p) for p in m.columns], "issues": [str(i) for i in m.index],
            "values": m.astype(int).values.tolist()}


# --------------------------------------------------------------------------
# Period comparison and "rising issue" detection
# --------------------------------------------------------------------------
def complete_month_range(df: pd.DataFrame) -> tuple[pd.Period, pd.Period] | None:
    """First and last calendar months fully covered by the data."""
    d = df["date"].dropna()
    if d.empty:
        return None
    first, last = d.min().to_period("M"), d.max().to_period("M")
    first_p, last_p = _month_is_partial(d.min(), d.max())
    if first_p:
        first += 1
    if last_p:
        last -= 1
    return (first, last) if first <= last else None


def _two_prop_p(x1: int, n1: int, x2: int, n2: int) -> float:
    """Two-sided two-proportion z-test p-value (normal approximation)."""
    if n1 == 0 or n2 == 0:
        return 1.0
    p_pool = (x1 + x2) / (n1 + n2)
    se = math.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))
    if se == 0:
        return 1.0
    z = (x2 / n2 - x1 / n1) / se
    return math.erfc(abs(z) / math.sqrt(2))


def _bh_adjust(p: np.ndarray) -> np.ndarray:
    """Benjamini-Hochberg false-discovery-rate adjustment."""
    n = len(p)
    if n == 0:
        return p
    order = np.argsort(p)
    ranked = p[order] * n / (np.arange(n) + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    adj = np.empty(n)
    adj[order] = np.minimum(ranked, 1.0)
    return adj


def compare_periods(df: pd.DataFrame, prev: tuple, recent: tuple, column: str = "issue",
                    min_count: int = 50, min_relative_change: float = 0.20) -> dict:
    """Compare category SHARES between two date ranges.

    An item is `meaningful` only if ALL hold:
      * its share changed with FDR-adjusted p < 0.05 (statistical evidence), AND
      * it has at least `min_count` complaints in the larger of the two periods, AND
      * its share changed by at least `min_relative_change` (practical size).
    With ~100k complaints almost any difference is "significant", so the size
    thresholds stop trivial changes from being flagged.
    """
    (p0, p1), (r0, r1) = [(pd.Timestamp(a), pd.Timestamp(b)) for a, b in (prev, recent)]
    a = df[(df["date"] >= p0) & (df["date"] <= p1)]
    b = df[(df["date"] >= r0) & (df["date"] <= r1)]
    n1, n2 = int(a[column].notna().sum()), int(b[column].notna().sum())
    ca = a[column].value_counts()
    cb = b[column].value_counts()
    ca, cb = ca[ca > 0], cb[cb > 0]   # drop unused categorical labels
    names = sorted(set(ca.index) | set(cb.index), key=str)
    rows, pvals = [], []
    for name in names:
        x1, x2 = int(ca.get(name, 0)), int(cb.get(name, 0))
        s1, s2 = (x1 / n1 if n1 else 0.0), (x2 / n2 if n2 else 0.0)
        p = _two_prop_p(x1, n1, x2, n2)
        pvals.append(p)
        rel = (s2 - s1) / s1 if s1 > 0 else (math.inf if s2 > 0 else 0.0)
        rows.append({"name": str(name), "count_prev": x1, "count_recent": x2,
                     "share_prev_pct": round(100 * s1, 3), "share_recent_pct": round(100 * s2, 3),
                     "share_change_pp": round(100 * (s2 - s1), 3),
                     "share_relative_change_pct": None if math.isinf(rel) else round(100 * rel, 1),
                     "count_change_pct": None if x1 == 0 else round(100 * (x2 - x1) / x1, 1),
                     "p_value": p})
    adj = _bh_adjust(np.array(pvals))
    for r, pa in zip(rows, adj):
        r["p_adjusted"] = float(pa)
        rel = r["share_relative_change_pct"]
        big = (rel is None) or abs(rel) >= 100 * min_relative_change
        r["meaningful"] = bool(pa < 0.05 and max(r["count_prev"], r["count_recent"]) >= min_count and big)
        r["direction"] = "up" if r["share_change_pp"] > 0 else "down" if r["share_change_pp"] < 0 else "flat"
    rows.sort(key=lambda r: abs(r["share_change_pp"]), reverse=True)
    return {"column": column, "total_prev": n1, "total_recent": n2,
            "volume_change_pct": None if n1 == 0 else round(100 * (n2 - n1) / n1, 1),
            "thresholds": {"min_count": min_count, "min_relative_change": min_relative_change, "alpha": 0.05},
            "items": rows}


def rising_issues(df: pd.DataFrame, window_months: int = 12, column: str = "issue", **kw) -> dict:
    """Compare the last `window_months` complete months with the window before it."""
    rng = complete_month_range(df)
    if rng is None:
        return {"status": "insufficient_data", "reason": "No complete calendar month of dated data.", "items": []}
    first, last = rng
    need = 2 * window_months
    available = (last - first).n + 1
    if available < need:
        return {"status": "insufficient_data",
                "reason": f"Need {need} complete months of data; found {available}.", "items": []}
    recent = (last - window_months + 1, last)
    prev = (recent[0] - window_months, recent[0] - 1)
    span = lambda p: (p[0].start_time, p[1].end_time)
    res = compare_periods(df, span(prev), span(recent), column, **kw)
    res.update({"status": "ok",
                "period_prev": [str(prev[0]), str(prev[1])],
                "period_recent": [str(recent[0]), str(recent[1])]})
    return res


# --------------------------------------------------------------------------
# One call for the dashboard
# --------------------------------------------------------------------------
def dashboard_summary(df: pd.DataFrame, filters: Filters | None = None) -> dict:
    d = apply_filters(df, filters)
    return {"metrics": overview_metrics(d),
            "top_products": top_counts(d, "product", 10),
            "top_issues": top_counts(d, "issue", 10),
            "monthly": monthly_trend(d),
            "yearly": yearly_trend(d)}
