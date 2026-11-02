import numpy as np
import pandas as pd
import pytest
from backend import analysis as an


def make_df(dates, products=None, issues=None):
    n = len(dates)
    return pd.DataFrame({"date": pd.to_datetime(dates),
                         "product": products or ["P"] * n,
                         "issue": issues or ["I"] * n,
                         "has_narrative": [True] * n})


def test_overview_metrics(cleaned):
    m = an.overview_metrics(cleaned)
    assert m["total_complaints"] == 6 and m["unique_products"] == 3 and m["unique_issues"] == 3
    assert m["rows_with_valid_date"] == 5
    assert (m["date_min"], m["date_max"]) == ("2016-01-05", "2016-03-15")
    assert m["narratives_present"] == 3 and m["narrative_pct"] == 50.0

def test_top_counts_sorted_with_pct(cleaned):
    top = an.top_counts(cleaned, "product", 2)
    assert [t["count"] for t in top] == [2, 2] and top[0]["pct"] == pytest.approx(33.33, abs=0.01)

def test_top_counts_ignores_missing(cleaned):
    sub = an.top_counts(cleaned, "sub_issue", 5)       # 1 of 6 is missing
    assert sum(s["count"] for s in sub) == 5

def test_monthly_trend_zero_fills_and_flags_partial():
    df = make_df(["2016-01-01", "2016-01-15", "2016-03-31", "2016-04-10"])
    rows = an.monthly_trend(df)
    assert [r["month"] for r in rows] == ["2016-01", "2016-02", "2016-03", "2016-04"]
    assert [r["count"] for r in rows] == [2, 0, 1, 1]
    assert [r["partial"] for r in rows] == [False, False, False, True]   # ends 10 Apr -> partial

def test_invalid_dates_excluded_from_trend(cleaned):
    assert sum(r["count"] for r in an.monthly_trend(cleaned)) == 5

def test_yearly_trend_flags_partial_years():
    df = make_df(["2015-12-05", "2016-01-05", "2016-02-05"])
    y = {r["year"]: r for r in an.yearly_trend(df)}
    assert y[2015]["partial"] and y[2016]["months_covered"] == 2

def test_empty_frame_is_safe():
    df = make_df([])
    assert an.monthly_trend(df) == [] and an.overview_metrics(df)["total_complaints"] == 0

def test_filters(cleaned):
    f = an.Filters(date_from="2016-02-01", products=["Credit card"])
    assert len(an.apply_filters(cleaned, f)) == 2
    assert len(an.apply_filters(cleaned, None)) == 6
    with pytest.raises(ValueError):
        an.apply_filters(cleaned, an.Filters(sentiments=["Negative"]))

def test_breakdowns(cleaned):
    assert an.issues_for_product(cleaned, "Mortgage")[0]["name"] == "Loan servicing"
    s = an.sub_issues_for_issue(cleaned, "Loan servicing")
    assert s["available"] and s["missing_pct"] == 50.0

def test_dashboard_summary_keys(cleaned):
    assert set(an.dashboard_summary(cleaned)) == {"metrics", "top_products", "top_issues", "monthly", "yearly"}


# ---------- period comparison
def _two_period_frame(seed=0):
    rng = np.random.default_rng(seed)
    d1 = pd.date_range("2015-01-01", "2015-12-31").to_series().sample(6000, replace=True, random_state=1)
    d2 = pd.date_range("2016-01-01", "2016-12-31").to_series().sample(6000, replace=True, random_state=2)
    iss1 = rng.choice(["Stable", "Shifting", "Other"], 6000, p=[0.5, 0.10, 0.4])
    iss2 = rng.choice(["Stable", "Shifting", "Other"], 6000, p=[0.5, 0.25, 0.25])
    return make_df(list(d1) + list(d2), issues=list(iss1) + list(iss2))

def test_real_shift_is_flagged_and_stable_issue_is_not():
    df = _two_period_frame()
    res = an.compare_periods(df, ("2015-01-01", "2015-12-31"), ("2016-01-01", "2016-12-31"))
    items = {i["name"]: i for i in res["items"]}
    assert items["Shifting"]["meaningful"] and items["Shifting"]["direction"] == "up"
    assert items["Other"]["meaningful"] and items["Other"]["direction"] == "down"
    assert not items["Stable"]["meaningful"]

def test_small_changes_not_flagged_even_if_significant():
    # 50.0% -> 51.5% of 200k rows is "significant" but only a 3% relative change
    n = 100_000
    a = ["X"] * 50_000 + ["Y"] * 50_000
    b = ["X"] * 51_500 + ["Y"] * 48_500
    df = make_df(["2015-06-01"] * n + ["2016-06-01"] * n, issues=a + b)
    res = an.compare_periods(df, ("2015-01-01", "2015-12-31"), ("2016-01-01", "2016-12-31"))
    x = next(i for i in res["items"] if i["name"] == "X")
    assert x["p_adjusted"] < 0.05 and not x["meaningful"]

def test_rising_issues_needs_enough_months():
    df = make_df(pd.date_range("2016-01-01", "2016-06-30", freq="5D"))
    r = an.rising_issues(df, window_months=12)
    assert r["status"] == "insufficient_data" and "24 complete months" in r["reason"]

def test_rising_issues_excludes_partial_last_month():
    dates = pd.date_range("2014-01-01", "2016-05-10", freq="3D")
    r = an.rising_issues(make_df(dates), window_months=12)
    assert r["status"] == "ok" and r["period_recent"][1] == "2016-04"      # May is partial

def test_bh_adjust_is_monotone_and_bounded():
    p = np.array([0.001, 0.04, 0.03, 0.5])
    adj = an._bh_adjust(p)
    assert (adj >= p).all() and (adj <= 1).all()


def test_top_counts_never_lists_zero_count_categories(cleaned):
    # after filtering, categorical columns still remember the removed labels
    sub = an.apply_filters(cleaned, an.Filters(products=["Mortgage"]))
    names = [x["name"] for x in an.top_counts(sub, "issue", 10)]
    assert names == ["Loan servicing"] and all(x["count"] > 0 for x in an.top_counts(sub, "product", 10))

def test_compare_periods_ignores_unused_categories():
    df = make_df(["2015-06-01", "2016-06-01"], issues=["A", "B"]).astype({"issue": "category"})
    df["issue"] = df["issue"].cat.add_categories(["Never used"])
    res = an.compare_periods(df, ("2015-01-01", "2015-12-31"), ("2016-01-01", "2016-12-31"))
    assert {i["name"] for i in res["items"]} == {"A", "B"}
