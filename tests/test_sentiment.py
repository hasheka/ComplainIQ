import pandas as pd
import pytest
from backend import sentiment as sm


@pytest.mark.parametrize("score,label", [(0.05, "Positive"), (0.0499, "Neutral"), (0.0, "Neutral"),
                                         (-0.0499, "Neutral"), (-0.05, "Negative"), (-0.9, "Negative")])
def test_threshold_boundaries(score, label):
    assert sm.label_from_compound(score) == label

def test_missing_text_gets_no_sentiment_not_neutral():
    s = pd.Series(["This is wonderful and I love it", None, "", "   "], index=[5, 6, 7, 8])
    r = sm.score_texts(s)
    assert r.loc[5, "sentiment"] == "Positive"
    assert r.loc[[6, 7, 8], "sentiment"].isna().all() and r.loc[[6, 7, 8], "compound"].isna().all()

def test_clear_examples():
    r = sm.score_texts(pd.Series(["This is terrible, awful, I hate them", "Excellent service, very happy"]))
    assert r["sentiment"].tolist() == ["Negative", "Positive"]

def test_add_sentiment_and_distribution(cleaned):
    d = sm.add_sentiment(cleaned)
    dist = sm.distribution(d)
    assert dist["analysed"] == 3 and dist["no_text"] == 3                # 3 missing narratives kept separate
    assert sum(dist["counts"].values()) == 3 and dist["counts"]["Neutral"] <= 3
    assert "not a measure" in dist["note"]

def test_add_sentiment_without_narrative_column():
    df = pd.DataFrame({"date": pd.to_datetime(["2016-01-01"]), "product": ["A"], "issue": ["B"]})
    with pytest.raises(ValueError, match="no narrative column"):
        sm.add_sentiment(df)

def test_summaries_require_sentiment(cleaned):
    with pytest.raises(ValueError):
        sm.distribution(cleaned)

def _synthetic(n_a=150, n_b=150, n_small=10):
    rows = []
    rows += [("A", "2016-01-10", "terrible awful horrible")] * int(n_a * 0.8) + [("A", "2016-01-11", "great happy")] * int(n_a * 0.2)
    rows += [("B", "2016-02-10", "terrible awful horrible")] * int(n_b * 0.3) + [("B", "2016-02-11", "great happy")] * int(n_b * 0.7)
    rows += [("C", "2016-03-10", "terrible awful horrible")] * n_small
    df = pd.DataFrame(rows, columns=["issue", "date", "narrative"])
    df["date"] = pd.to_datetime(df["date"]); df["has_narrative"] = True
    return sm.add_sentiment(df)

def test_by_category_sorted_and_hides_small_samples():
    res = sm.by_category(_synthetic(), "issue", min_n=100)
    assert [r["name"] for r in res] == ["A", "B"]                          # C (n=10) excluded
    assert res[0]["negative_pct"] == pytest.approx(80.0) and res[1]["negative_pct"] == pytest.approx(30.0)

def test_monthly_sentiment_flags_low_sample():
    m = {r["month"]: r for r in sm.monthly_sentiment(_synthetic())}
    assert m["2016-03"]["low_sample"] and not m["2016-01"]["low_sample"]
