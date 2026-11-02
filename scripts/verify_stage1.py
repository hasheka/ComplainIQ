"""Stage-1 verification against the REAL dataset.

Every expected number below was printed by the original training notebook
(docs/original_training_notebook.ipynb); the backend must reproduce them
independently. Usage:  python scripts/verify_stage1.py path/to/Consumer_Complaints.csv [--sentiment]
"""
import sys, time, warnings
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.filterwarnings("ignore")

import numpy as np, pandas as pd
from backend import preprocessing as pp, analysis as an, prediction as pr, sentiment as sm

csv = sys.argv[1]
results = []
def check(name, ok, detail=""):
    results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}")

# ---------------- 1. load + clean
t = time.time()
df, cm = pp.load_dataset(csv)
print("column mapping:", cm.mapping)
df, rep = pp.clean_dataset(df, copy=False)
print(f"load+clean: {time.time()-t:.1f}s | memory {df.memory_usage(deep=True).sum()/1e6:.0f} MB")
check("row count", rep.rows_out == 777_959, f"({rep.rows_out:,})")
check("no invalid dates", rep.invalid_dates == 0, f"(format {rep.date_format_used})")
check("narratives present = 157,865", rep.narratives_present == 157_865, f"({rep.narratives_present:,})")
check("narratives missing = 620,094", rep.narratives_missing == 620_094, f"({rep.narratives_missing:,})")
check("no rows silently dropped", rep.rows_in == rep.rows_out + rep.duplicate_ids_removed + rep.exact_duplicate_rows_removed)

# ---------------- 2. analysis vs notebook output
d = an.dashboard_summary(df)
m = d["metrics"]
check("products = 18, issues = 158", (m["unique_products"], m["unique_issues"]) == (18, 158))
check("date range", (m["date_min"], m["date_max"]) == ("2011-12-01", "2017-05-18"), f"({m['date_min']} -> {m['date_max']})")
exp_top = [("Mortgage",228167),("Debt collection",148016),("Credit reporting",140405),("Credit card",89189),
           ("Bank account or service",86206),("Student loan",33044),("Consumer Loan",31591),
           ("Payday loan",5543),("Money transfers",5355),("Prepaid card",3817)]
check("top-10 products match notebook", [(x["name"],x["count"]) for x in d["top_products"]] == exp_top)
exp_m = [2536,3230,3509,6230,5702,7617,7841,6755,6877,5493,6741,6137]
check("first 12 monthly counts match notebook", [x["count"] for x in d["monthly"][:12]] == exp_m)
check("66 months", len(d["monthly"]) == 66, f"({len(d['monthly'])})")
check("last month flagged partial (data ends 18 May 2017)", d["monthly"][-1]["partial"] is True)
check("monthly counts sum to total", sum(x["count"] for x in d["monthly"]) == 777_959)
sub = an.top_counts(df, "sub_issue", 3)
check("top sub-issue = Account status 37,057", (sub[0]["name"], sub[0]["count"]) == ("Account status", 37057))
check("missing sub-issues = 456,973", rep.missing_by_column["sub_issue"] == 456_973)
mort = an.issues_for_product(df, "Mortgage", 2)
check("Mortgage top issue = 112,316", mort[0]["count"] == 112316, f"({mort[0]['name']})")
print("top 5 issues:", [(x['name'], x['count']) for x in d['top_issues'][:5]])

# ---------------- 3. rising issues
r = an.rising_issues(df, 12)
print(f"\nperiods: {r['period_prev']} -> {r['period_recent']}  volume change {r['volume_change_pct']}%")
flag = [i for i in r["items"] if i["meaningful"]]
print(f"{len(flag)} of {len(r['items'])} issues flagged meaningful. Top movers:")
for i in flag[:6]:
    print(f"   {i['direction']:>4} {i['name'][:48]:48s} share {i['share_prev_pct']:.2f}% -> {i['share_recent_pct']:.2f}%  (rel {i['share_relative_change_pct']}%)")
check("rising-issue analysis ran", r["status"] == "ok")

# ---------------- 4. model reproduces notebook's 85.02%
bundle = pr.load_bundle()
print("\nmodel compatibility:", bundle.compatibility)
nl = df.loc[df["has_narrative"], ["narrative", "product"]]
t = time.time()
cleaned = [pr.preprocess(x) for x in nl["narrative"].astype(str)]
X = bundle.vectorizer.transform(cleaned)
from sklearn.model_selection import train_test_split
y = nl["product"].astype(str).values
idx = np.arange(len(y))
_, te = train_test_split(idx, test_size=0.2, random_state=42, stratify=y)
acc = (bundle.model.predict(X[te]) == y[te]).mean()
print(f"hold-out size {len(te):,}  accuracy {acc:.4f}  ({time.time()-t:.0f}s)")
check("test split size = 31,573", len(te) == 31573)
check("reproduces notebook accuracy 0.8502", abs(acc - 0.8502201247901688) < 1e-4, f"({acc:.4f})")
pb = pr.predict_batch(bundle, nl["narrative"].iloc[te[:2000]])
check("predict_batch agrees with model.predict", (pb["predicted_product"].values == bundle.model.predict(X[te[:2000]])).all())
cov = pr.label_coverage(bundle, df["product"])
print("labels the model can't output:", cov["rows_without_model_label"], "rows;", cov["unknown_products"])

# ---------------- 5. sentiment (slow: pass --sentiment)
if "--sentiment" in sys.argv:
    t = time.time()
    res = sm.score_texts(df["narrative"])
    df["sentiment"] = res["sentiment"]; df["compound"] = res["compound"]
    print(f"\nVADER on all narratives: {time.time()-t:.0f}s")
    c = df["sentiment"].value_counts()
    print(dict(c))
    exp = {"Negative": 80031, "Positive": 69885, "Neutral": 7949}
    check("sentiment counts match notebook (NLTK VADER)", all(abs(int(c.get(k,0)) - v) <= 25 for k, v in exp.items()),
          f"(expected {exp})")
    check("missing narratives have NO sentiment", df.loc[~df["has_narrative"], "sentiment"].isna().all())
    check("no sentiment = 620,094 rows", int(df["sentiment"].isna().sum()) == 620_094)
    dist_ = sm.distribution(df.assign(sentiment=pd.Categorical(df["sentiment"], categories=sm.LABELS)))
    print("distribution:", dist_["pct"], "| mean compound", dist_["mean_compound"])

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
