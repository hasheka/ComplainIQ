"""Sentiment check on the real dataset against the notebook's printed distribution.
Usage: python scripts/verify_sentiment.py path/to/Consumer_Complaints.csv"""
import sys, time, warnings
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.filterwarnings("ignore")
import pandas as pd
from backend import preprocessing as pp, sentiment as sm

df, _ = pp.load_dataset(sys.argv[1])
df, rep = pp.clean_dataset(df, copy=False)
t = time.time()
texts = df["narrative"]
print("narratives to score:", int(texts.notna().sum()), flush=True)
res = sm.score_texts(texts)
print(f"scored in {time.time()-t:.0f}s", flush=True)
c = res["sentiment"].value_counts()
exp = {"Negative": 80031, "Positive": 69885, "Neutral": 7949}
print("counts:", dict(c), "| notebook:", exp)
# Exact equality is NOT expected: the notebook used NLTK's VADER, the app uses the pinned
# `vaderSentiment` package, and the two implementations differ slightly (different NLTK
# versions even differ from each other on ~4% of labels). We require totals within 0.1%.
tol = int(0.001 * sum(exp.values()))
ok1 = all(abs(int(c.get(k, 0)) - v) <= tol for k, v in exp.items())
print("largest gap vs notebook:", max(abs(int(c.get(k, 0)) - v) for k, v in exp.items()), f"rows (tolerance {tol})")
ok2 = res.loc[~df["has_narrative"], "sentiment"].isna().all()
ok3 = int(res["sentiment"].isna().sum()) == 620_094
print(f"[{'PASS' if ok1 else 'FAIL'}] distribution approximately matches notebook (within 0.1%)")
print(f"[{'PASS' if ok2 else 'FAIL'}] complaints without narrative get NO sentiment")
print(f"[{'PASS' if ok3 else 'FAIL'}] 620,094 rows have no sentiment (not counted as Neutral)")
d = df.assign(sentiment=pd.Categorical(res["sentiment"], categories=sm.LABELS), compound=res["compound"])
dist = sm.distribution(d)
print("pct of analysed:", dist["pct"], "| mean compound:", dist["mean_compound"])
print("\nMost negative issues (>=100 narratives):")
for r in sm.by_category(d, "issue", min_n=100, top=5):
    print(f"   {r['negative_pct']:5.1f}% negative  n={r['analysed']:>5}  {r['name']}")
print("Most negative products:")
for r in sm.by_category(d, "product", min_n=100, top=3):
    print(f"   {r['negative_pct']:5.1f}% negative  n={r['analysed']:>5}  {r['name']}")
sys.exit(0 if (ok1 and ok2 and ok3) else 1)
