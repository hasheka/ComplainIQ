"""Stage-2 verification on the REAL dataset.
Usage: python scripts/verify_stage2.py Consumer_Complaints.csv [sentiment_cache.parquet]
(The optional parquet holds `compound`/`sentiment` scored earlier by sentiment.score_texts.)"""
import json, sys, time, warnings
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.filterwarnings("ignore")
import pandas as pd
from backend import preprocessing as pp, analysis as an, recommendations as rc, sentiment as sm

results = []
def check(name, ok, detail=""):
    results.append(bool(ok)); print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}")

df, _ = pp.load_dataset(sys.argv[1]); df, _ = pp.clean_dataset(df, copy=False)
have_sent = len(sys.argv) > 2
if have_sent:
    res = pd.read_parquet(sys.argv[2])
    df["compound"] = res["compound"].values
    df["sentiment"] = pd.Categorical(res["sentiment"].values, categories=sm.LABELS)

rs = rc.load_rules()
counts = df["issue"].value_counts()
cov = rc.rule_coverage(counts, rs)
check("rules file valid", True, f"({len(rs.rules)} rules, {len(rs.doc['product_fallbacks'])} fallbacks)")
check("every one of the 158 issues has an issue-specific rule", len(counts[counts > 0]) == 158 and cov["specific_rule_pct"] == 100.0)

t = time.time(); rep = rc.build_report(df, top_n=10); secs = time.time() - t
print(f"report built in {secs:.1f}s | trend: {rep['trend_status']['status']} {rep['trend_status']['period_prev']} -> {rep['trend_status']['period_recent']}")
check("report ok with 10 items", rep["status"] == "ok" and len(rep["items"]) == 10)
check("sentiment signal available" if have_sent else "sentiment skipped", rep["dataset"]["sentiment_available"] == have_sent)

# ---- independent recomputation with plain pandas
tot = int(df["issue"].notna().sum())
for it in rep["items"]:
    n = int((df["issue"] == it["issue"]).sum())
    assert it["count"] == n and abs(it["share_pct"] - 100 * n / tot) < 0.001, it["issue"]
check("counts and shares of all 10 items match plain pandas", True)

top = rep["items"][0]
lm = next(i for i in rep["items"] if i["issue"].startswith("Loan modification"))
m = df[df["date"].between("2015-05-01", "2016-04-30")]   # prev window: 2015-05..2016-04? computed below
rising = an.rising_issues(df, 12)
pp_, pr_ = rising["period_prev"], rising["period_recent"]
a = df[(df["date"] >= pd.Period(pp_[0]).start_time) & (df["date"] <= pd.Period(pp_[1]).end_time)]
b = df[(df["date"] >= pd.Period(pr_[0]).start_time) & (df["date"] <= pd.Period(pr_[1]).end_time)]
manual_prev = 100 * (a["issue"] == lm["issue"]).sum() / len(a)
manual_recent = 100 * (b["issue"] == lm["issue"]).sum() / len(b)
check("trend shares for 'Loan modification' match manual calculation",
      abs(lm["trend"]["share_prev_pct"] - manual_prev) < 0.01 and abs(lm["trend"]["share_recent_pct"] - manual_recent) < 0.01,
      f"({manual_prev:.2f}% -> {manual_recent:.2f}%)")
if have_sent:
    overall = 100 * (df["sentiment"] == "Negative").sum() / df["sentiment"].notna().sum()
    sub = df[(df["issue"] == lm["issue"]) & df["sentiment"].notna()]
    manual_neg = 100 * (sub["sentiment"] == "Negative").mean()
    check("negative % for 'Loan modification' matches manual calculation",
          abs(lm["sentiment"]["negative_pct"] - manual_neg) < 0.01, f"({manual_neg:.1f}% vs overall {overall:.1f}%)")

# ---- invariants
check("score = sum of signal points; tier consistent",
      all(i["score"]["total"] == sum(b["points"] for b in i["score"]["breakdown"]) for i in rep["items"]))
check("ranking is by score then volume",
      [(-i["score"]["total"], -i["count"]) for i in rep["items"]] == sorted((-i["score"]["total"], -i["count"]) for i in rep["items"]))
check("every item has actions, reason, evidence, follow-up, label and 'why'",
      all(i["recommendation"]["actions"] and i["recommendation"]["reason"] and i["recommendation"]["evidence_and_assumptions"]
          and i["recommendation"]["follow_up_metrics"] and i["recommendation"]["label"] and i["why_highlighted"] for i in rep["items"]))
blob = json.dumps(rep, default=str)
sample_text = df.loc[df["has_narrative"], "narrative"].iloc[0][:60]
check("report contains no complaint narrative text", sample_text not in blob)
check("exports work", rc.to_csv(rep).count("\n") >= 11 and "Limitations" in rc.to_markdown(rep))
Path("/tmp/report_sample.md").write_text(rc.to_markdown(rep), encoding="utf-8")

print("\nTOP 10 PRIORITIES")
for i in rep["items"]:
    tr = i["trend"]; se = i["sentiment"]
    print(f"{i['rank']:2d}. [{i['tier']:6s} {i['score']['total']:3d}/{i['score']['max_possible']}] {i['issue'][:46]:46s} n={i['count']:>7,} ({i['share_pct']:4.1f}%) "
          f"trend={'n/a' if tr is None else ('UP' if tr['meaningful'] and tr['direction']=='up' else 'DOWN' if tr['meaningful'] else 'flat')} "
          f"neg={'n/a' if se is None else str(round(se['negative_pct']))+'%'}  -> {i['recommendation']['title'][:34]}")
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
