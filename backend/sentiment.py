"""VADER sentiment for complaint narratives.

Rules:
  * thresholds on VADER's compound score: >= 0.05 Positive, <= -0.05 Negative,
    otherwise Neutral (same as the training notebook);
  * a MISSING narrative gets NO sentiment (NA) - it is never counted as Neutral;
  * sentiment is a text-based estimate. VADER reads word polarity, so polite
    words ("thank you", "please") can push a complaint toward Positive.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

POS_THRESHOLD = 0.05
NEG_THRESHOLD = -0.05
LABELS = ["Negative", "Neutral", "Positive"]
SENTIMENT_NOTE = ("Sentiment is estimated from the words in each narrative using VADER (compound score; "
                  f"Positive >= {POS_THRESHOLD}, Negative <= {NEG_THRESHOLD}, otherwise Neutral). It is an "
                  "approximation, not a measure of how the customer actually felt. Complaints without a "
                  "narrative are excluded, not counted as neutral.")


@lru_cache(maxsize=1)
def _analyzer() -> SentimentIntensityAnalyzer:
    return SentimentIntensityAnalyzer()


def label_from_compound(score: float) -> str:
    if score >= POS_THRESHOLD:
        return "Positive"
    if score <= NEG_THRESHOLD:
        return "Negative"
    return "Neutral"


def score_texts(texts: pd.Series) -> pd.DataFrame:
    """Return `compound` and `sentiment` aligned to texts.index; missing text -> NA."""
    sia = _analyzer()
    out = pd.DataFrame({"compound": pd.Series(np.nan, index=texts.index, dtype="float64"),
                        "sentiment": pd.Series(pd.NA, index=texts.index, dtype="string")})
    valid = texts.dropna().astype(str)
    valid = valid[valid.str.strip() != ""]
    scores = np.fromiter((sia.polarity_scores(t)["compound"] for t in valid), dtype="float64", count=len(valid))
    out.loc[valid.index, "compound"] = scores
    out.loc[valid.index, "sentiment"] = pd.Series(scores, index=valid.index).map(label_from_compound)
    return out


def add_sentiment(df: pd.DataFrame) -> pd.DataFrame:
    """Copy of df with `compound` and `sentiment` columns added."""
    if "narrative" not in df.columns:
        raise ValueError("This dataset has no narrative column, so sentiment cannot be computed.")
    res = score_texts(df["narrative"])
    out = df.copy()
    out["compound"] = res["compound"]
    out["sentiment"] = pd.Categorical(res["sentiment"], categories=LABELS)
    return out


# --------------------------------------------------------------------------
# Summaries (all take a frame that already has `sentiment`)
# --------------------------------------------------------------------------
def _require(df: pd.DataFrame) -> None:
    if "sentiment" not in df.columns:
        raise ValueError("Run add_sentiment() first.")


def distribution(df: pd.DataFrame) -> dict:
    _require(df)
    analysed = df["sentiment"].notna()
    n = int(analysed.sum())
    counts = df.loc[analysed, "sentiment"].value_counts()
    return {"analysed": n, "no_text": int((~analysed).sum()),
            "counts": {l: int(counts.get(l, 0)) for l in LABELS},
            "pct": {l: round(100 * counts.get(l, 0) / n, 2) if n else 0.0 for l in LABELS},
            "mean_compound": round(float(df["compound"].mean()), 4) if n and "compound" in df.columns else None,
            "note": SENTIMENT_NOTE}


def by_category(df: pd.DataFrame, column: str, min_n: int = 100, top: int = 15) -> list[dict]:
    """Sentiment mix per product/issue, most negative first. Categories with fewer than
    `min_n` analysed narratives are left out (percentages from tiny samples mislead)."""
    _require(df)
    d = df[df["sentiment"].notna()]
    g = d.groupby(column, observed=True)
    n = g.size()
    keep = n[n >= min_n].index
    if len(keep) == 0:
        return []
    ct = pd.crosstab(d[column], d["sentiment"]).reindex(columns=LABELS, fill_value=0).loc[keep]
    mean = g["compound"].mean().loc[keep] if "compound" in d.columns else None
    rows = []
    for name, r in ct.iterrows():
        tot = int(r.sum())
        rows.append({"name": str(name), "analysed": tot,
                     "negative": int(r["Negative"]), "neutral": int(r["Neutral"]), "positive": int(r["Positive"]),
                     "negative_pct": round(100 * r["Negative"] / tot, 2),
                     "positive_pct": round(100 * r["Positive"] / tot, 2),
                     "mean_compound": None if mean is None else round(float(mean[name]), 4)})
    rows.sort(key=lambda x: x["negative_pct"], reverse=True)
    return rows[:top]


def monthly_sentiment(df: pd.DataFrame, min_n: int = 30) -> list[dict]:
    """Negative share per month. `low_sample` marks months with fewer than `min_n` narratives."""
    _require(df)
    d = df[df["sentiment"].notna() & df["date"].notna()]
    if d.empty:
        return []
    month = d["date"].dt.to_period("M").astype(str)
    ct = pd.crosstab(month, d["sentiment"]).reindex(columns=LABELS, fill_value=0).sort_index()
    rows = []
    for m, r in ct.iterrows():
        tot = int(r.sum())
        rows.append({"month": m, "analysed": tot, "negative": int(r["Negative"]),
                     "negative_pct": round(100 * r["Negative"] / tot, 2) if tot else None,
                     "low_sample": tot < min_n})
    return rows
