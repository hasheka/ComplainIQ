import copy
import csv
import io
import json

import numpy as np
import pandas as pd
import pytest

from backend import analysis as an
from backend import recommendations as rc


@pytest.fixture(scope="module")
def rules():
    return rc.load_rules()

@pytest.fixture
def doc():
    return copy.deepcopy(json.loads(rc.RULES_PATH.read_text(encoding="utf-8")))


# ---------------------------------------------------------------- rules file
def test_shipped_rules_file_is_valid_and_complete(rules):
    assert len(rules.rules) >= 30
    for r in rules.rules.values():
        assert r["recommended_actions"] and r["follow_up_metrics"] and r["evidence_and_assumptions"]
        assert r["reason"] and r["priority_criteria"] and r["context"]

def test_rules_do_not_claim_causes(rules):
    banned = ["root cause is", "is caused by", "proves", "guarantee", "will fix", "illegal violation"]
    text = json.dumps(rules.doc).lower()
    assert not [b for b in banned if b in text]

def test_label_marks_recommendations_as_investigation(rules):
    assert "not a confirmed root cause" in rules.doc["label"].lower()

@pytest.mark.parametrize("mutate,msg", [
    (lambda d: d["rules"][0].pop("reason"), "missing field 'reason'"),
    (lambda d: d["rules"][1].update(id=d["rules"][0]["id"]), "Duplicate rule id"),
    (lambda d: d["rules"][1]["match"]["issues"].append(d["rules"][0]["match"]["issues"][0]), "claimed by both"),
    (lambda d: d["rules"][0]["match"]["issue_patterns"].append("([unclosed"), "invalid pattern"),
    (lambda d: d["rules"][0].update(recommended_actions="do it"), "must be a list"),
    (lambda d: d["rules"][0].update(match={"issues": [], "issue_patterns": []}), "matches nothing"),
    (lambda d: d["priority_config"].pop("trend"), "priority_config.trend"),
    (lambda d: d["priority_config"]["tiers"].reverse(), "ordered"),
    (lambda d: d["priority_config"]["tiers"].pop(), "min_score is 0"),
    (lambda d: d.pop("generic_fallback"), "generic_fallback"),
])
def test_validator_rejects_bad_rules(doc, mutate, msg):
    mutate(doc)
    with pytest.raises(rc.RulesError, match=msg):
        rc.RuleSet(doc)

def test_missing_or_broken_rules_file(tmp_path):
    with pytest.raises(rc.RulesError, match="not found"):
        rc.load_rules.__wrapped__(str(tmp_path / "x.json"))
    bad = tmp_path / "b.json"; bad.write_text("{not json")
    with pytest.raises(rc.RulesError, match="not valid JSON"):
        rc.load_rules.__wrapped__(str(bad))


# ---------------------------------------------------------------- matching
def test_exact_match_ignores_case_and_spacing(rules):
    r, t = rules.match("  incorrect   INFORMATION on credit report ")
    assert r["id"] == "credit-report-accuracy" and t == "issue"

def test_pattern_match_for_unseen_issue_name(rules):
    r, t = rules.match("Incorrect information on your credit report")
    assert r["id"] == "credit-report-accuracy" and t == "pattern"

def test_product_fallback_then_generic(rules):
    r, t = rules.match("Something brand new", product="Mortgage")
    assert t == "product_fallback" and r["id"] == "fb-mortgage"
    r, t = rules.match("Something brand new", product="Pet insurance")
    assert t == "generic" and r["id"] == "generic"

def test_exact_beats_pattern(rules):
    # "Other fee" is listed under fees; the pattern for overdraft must not steal fee names
    assert rules.match("Other fee")[0]["id"] == "fees-unexpected"
    assert rules.match("Overdraft, savings or rewards features")[0]["id"] == "overdraft-low-funds"


# ---------------------------------------------------------------- scoring
CFG = json.loads(rc.RULES_PATH.read_text(encoding="utf-8"))["priority_config"]
UP = {"meaningful": True, "direction": "up", "share_prev_pct": 1.0, "share_recent_pct": 3.0}
SENT = {"negative_pct": 75.0, "analysed": 500}

@pytest.mark.parametrize("share,points", [(14.0, 40), (5.0, 40), (4.99, 30), (2.0, 30), (1.0, 20), (0.5, 10), (0.49, 0)])
def test_volume_bands(share, points):
    s = rc.score_issue(CFG, share, 1000, None, None, None)
    assert s["breakdown"][0]["points"] == points

def test_small_issues_get_no_volume_points():
    assert rc.score_issue(CFG, 6.0, 10, None, None, None)["breakdown"][0]["points"] == 0

def test_unassessed_signals_score_zero_and_are_flagged():
    s = rc.score_issue(CFG, 6.0, 1000, None, None, None)
    assert s["signals_assessed"] == 1 and s["total"] == 40
    assert [b["assessed"] for b in s["breakdown"]] == [True, False, False]
    assert s["tier"] == "Medium"                                   # one signal can never reach High

def test_all_signals_reach_high():
    s = rc.score_issue(CFG, 6.0, 1000, UP, SENT, 50.0)
    assert (s["total"], s["tier"], s["signals_assessed"]) == (100, "High", 3)

def test_rise_not_meaningful_gets_partial_credit_and_fall_none():
    small = dict(UP, meaningful=False)
    assert rc.score_issue(CFG, 0.1, 1000, small, None, None)["breakdown"][1]["points"] == 10
    down = {"meaningful": True, "direction": "down", "share_prev_pct": 3.0, "share_recent_pct": 1.0}
    assert rc.score_issue(CFG, 0.1, 1000, down, None, None)["breakdown"][1]["points"] == 0

@pytest.mark.parametrize("neg,points", [(70.0, 25), (60.0, 15), (50.0, 5), (49.0, 0)])
def test_sentiment_bands_relative_to_overall(neg, points):
    s = rc.score_issue(CFG, 0.1, 1000, None, {"negative_pct": neg, "analysed": 500}, 50.0)
    assert s["breakdown"][2]["points"] == points

def test_tier_boundaries():
    assert rc.score_issue(CFG, 6.0, 1000, dict(UP, meaningful=False), SENT, 50.0)["tier"] == "High"   # 40+10+25
    assert rc.score_issue(CFG, 0.1, 1000, None, None, None)["tier"] == "Low"


# ---------------------------------------------------------------- report
def make_frame(with_sentiment=True, months=36):
    rng = np.random.default_rng(0)
    rows = []
    for m in pd.period_range("2014-01", periods=months, freq="M"):
        late = m.year >= 2016                       # last 12 months of a 36-month frame
        p = ([0.05, 0.10, 0.30, 0.55] if not late else [0.25, 0.10, 0.10, 0.55])
        names = ["Fraud or scam", "Late fee", "Loan modification,collection,foreclosure", "Incorrect information on credit report"]
        prod = ["Money transfers", "Credit card", "Mortgage", "Credit reporting"]
        for k in rng.choice(4, 300, p=p):
            rows.append((m.to_timestamp() + pd.Timedelta(days=int(rng.integers(0, 27))), prod[k], names[k]))
    df = pd.DataFrame(rows, columns=["date", "product", "issue"])
    df["has_narrative"] = True
    if with_sentiment:
        neg = df["issue"].eq("Fraud or scam").map({True: 0.85, False: 0.45})
        df["sentiment"] = pd.Categorical(np.where(rng.random(len(df)) < neg, "Negative", "Positive"),
                                         categories=["Negative", "Neutral", "Positive"])
    return df

def test_report_ranks_rising_negative_issue_first_with_evidence():
    rep = rc.build_report(make_frame(), top_n=4)
    assert rep["status"] == "ok" and rep["label"].startswith("Recommendation for investigation")
    top = rep["items"][0]
    assert top["issue"] == "Fraud or scam" and top["tier"] == "High"
    assert top["trend"]["meaningful"] and top["trend"]["direction"] == "up"
    assert top["sentiment"]["negative_pct"] > 80 and top["sentiment"]["vs_overall_pp"] > 15
    assert top["recommendation"]["rule_id"] == "fraud-unauthorized" and top["recommendation"]["specific"]
    assert any("rose" in w for w in top["why_highlighted"])
    assert top["recommendation"]["follow_up_metrics"] and top["recommendation"]["evidence_and_assumptions"]

def test_falling_issue_is_not_boosted_by_trend():
    rep = rc.build_report(make_frame(), top_n=4)
    falling = next(i for i in rep["items"] if i["issue"].startswith("Loan modification"))
    assert falling["trend"]["direction"] == "down"
    assert falling["score"]["breakdown"][1]["points"] == 0
    assert any("fell" in w for w in falling["why_highlighted"])

def test_report_without_sentiment_marks_signal_unassessed():
    rep = rc.build_report(make_frame(with_sentiment=False), top_n=2)
    assert rep["dataset"]["sentiment_available"] is False
    assert all(i["sentiment"] is None and not i["score"]["breakdown"][2]["assessed"] for i in rep["items"])

def test_report_with_too_little_history_says_so():
    rep = rc.build_report(make_frame(months=10), top_n=2)
    assert rep["trend_status"]["status"] == "insufficient_data"
    assert all(i["trend"] is None and not i["score"]["breakdown"][1]["assessed"] for i in rep["items"])
    assert any("not assessed" in w for i in rep["items"] for w in i["why_highlighted"])

def test_report_respects_filters_and_empty_result():
    df = make_frame()
    rep = rc.build_report(df, an.Filters(products=["Mortgage"]), top_n=5)
    assert [i["issue"] for i in rep["items"]] == ["Loan modification,collection,foreclosure"]
    empty = rc.build_report(df, an.Filters(products=["Nonexistent"]))
    assert empty["status"] == "no_data" and empty["items"] == []

def test_report_uses_filtered_denominator():
    df = make_frame()
    rep = rc.build_report(df, an.Filters(products=["Mortgage"]))
    assert rep["items"][0]["share_pct"] == 100.0

def test_general_guidance_is_flagged_not_specific():
    df = make_frame(with_sentiment=False)
    df.loc[df["issue"] == "Late fee", "issue"] = "Totally unknown issue"
    df.loc[df["issue"] == "Totally unknown issue", "product"] = "Pet insurance"
    rep = rc.build_report(df, top_n=10)
    it = next(i for i in rep["items"] if i["issue"] == "Totally unknown issue")
    assert it["recommendation"]["match_type"] == "generic" and not it["recommendation"]["specific"]
    assert rep["coverage"]["fallback_only_pct"] > 0
    assert any(u["issue"] == "Totally unknown issue" for u in rep["coverage"]["unmatched_issues"])

def test_theme_variants_are_combined(rules):
    counts = pd.Series({"Incorrect information on credit report": 900, "Incorrect information on your report": 100, "Late fee": 50})
    th = rc.theme_summary(counts, rules)
    assert th[0]["title"] == "Credit report data accuracy" and th[0]["count"] == 1000 and len(th[0]["issues"]) == 2
    df = make_frame(with_sentiment=False)
    df.loc[df.index[:200], "issue"] = "Incorrect information on your report"
    it = next(i for i in rc.build_report(df, top_n=10)["items"] if i["issue"] == "Incorrect information on credit report")
    assert [v["name"] for v in it["same_theme_variants"]] == ["Incorrect information on your report"]

def test_report_contains_no_narrative_text():
    df = make_frame(); df["narrative"] = "SECRET-PRIVATE-TEXT"
    assert "SECRET-PRIVATE-TEXT" not in json.dumps(rc.build_report(df, top_n=4), default=str)


# ---------------------------------------------------------------- export
def test_csv_export_roundtrip_and_label():
    rep = rc.build_report(make_frame(), top_n=3)
    rows = list(csv.DictReader(io.StringIO(rc.to_csv(rep))))
    assert len(rows) == 3 and rows[0]["issue"] == "Fraud or scam" and rows[0]["priority"] == "High"
    assert all("not a confirmed root cause" in r["label"].lower() for r in rows)
    assert " | " in rows[0]["recommended_actions"]

def test_markdown_export_has_disclaimer_evidence_and_limitations():
    md = rc.to_markdown(rc.build_report(make_frame(), top_n=2))
    for needle in ["Recommendation for investigation", "Why this is highlighted", "Score breakdown",
                   "Evidence and assumptions", "Follow-up measures", "## Limitations", "not confirmed root causes"]:
        assert needle in md


def test_issue_absent_from_both_windows_is_assessed_as_flat():
    df = make_frame(with_sentiment=False)
    old = pd.DataFrame({"date": pd.to_datetime(["2014-01-05"] * 60), "product": "Credit card",
                        "issue": "Privacy", "has_narrative": True})
    rep = rc.build_report(pd.concat([df, old], ignore_index=True), top_n=10)
    it = next(i for i in rep["items"] if i["issue"] == "Privacy")
    assert it["trend"] is not None and it["trend"]["direction"] == "flat"
    assert it["score"]["breakdown"][1]["assessed"] and it["score"]["breakdown"][1]["points"] == 0
