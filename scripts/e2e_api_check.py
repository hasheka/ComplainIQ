"""End-to-end check of the running API with the REAL dataset.
Start the server first (see README), then:  python scripts/e2e_api_check.py path/to/Consumer_Complaints.csv [base_url]"""
import io, subprocess, sys, time, uuid
import httpx

csv_path = sys.argv[1]
base = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8000"
ok_all = []
def check(name, ok, detail=""):
    ok_all.append(bool(ok)); print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}", flush=True)
def rss():
    out = subprocess.run("ps -eo rss,cmd | grep 'uvicorn backend.main' | grep -v grep | awk '{s+=$1} END {print int(s/1024)}'", shell=True, capture_output=True, text=True).stdout
    return int(out or 0)
def wait_job(c, did, kind, label):
    t, peak, last = time.time(), 0, -1
    while True:
        j = next(j for j in c.get(f"/api/datasets/{did}/jobs").json() if j["kind"] == kind)
        peak = max(peak, rss())
        if j["progress"] // 25 != last // 25: print(f"    {label}: {j['status']} {j['progress']}%", flush=True)
        last = j["progress"]
        if j["status"] in ("done", "failed"): return j, time.time() - t, peak
        time.sleep(3)

email = f"e2e-{uuid.uuid4().hex[:8]}@example.com"
with httpx.Client(base_url=base, timeout=900) as c:
    check("register", c.post("/api/auth/register", json={"email": email, "password": "a long e2e passphrase", "display_name": "E2E"}).status_code == 201)
    with open(csv_path, "rb") as fh:
        did = c.post("/api/datasets", files={"file": ("Consumer_Complaints.csv", fh, "text/csv")}).json()["id"]
    while (d := c.get(f"/api/datasets/{did}").json())["status"] in ("processing", "uploaded"): time.sleep(2)
    check("dataset ready with 777,959 rows", d["status"] == "ready" and d["rows"] == 777_959, f"({d['status']}, {d['rows']})")
    b = f"/api/datasets/{did}"

    t = time.time(); dash = c.get(f"{b}/dashboard").json(); t1 = time.time() - t
    t = time.time(); c.get(f"{b}/dashboard"); t2 = time.time() - t
    m = dash["metrics"]
    check("dashboard matches Stage 1 numbers", (m["total_complaints"], m["unique_products"], m["unique_issues"], m["narratives_present"]) == (777_959, 18, 158, 157_865))
    check("top product = Mortgage 228,167", (dash["top_products"][0]["name"], dash["top_products"][0]["count"]) == ("Mortgage", 228_167))
    print(f"    dashboard: first call {t1:.1f}s (loads file), cached call {t2:.2f}s", flush=True)
    t = time.time(); f = c.get(f"{b}/dashboard", params={"product": "Mortgage", "date_from": "2016-01-01"}).json()
    check("filtered dashboard responds", f["metrics"]["total_complaints"] > 0, f"({f['metrics']['total_complaints']:,} mortgage complaints since 2016, {time.time()-t:.2f}s)")
    r = c.get(f"{b}/analytics/rising").json()
    check("rising issues computed", r["status"] == "ok" and r["period_recent"] == ["2016-05", "2017-04"], f"({r['period_prev']} -> {r['period_recent']})")

    print("  sentiment job...", flush=True)
    c.post(f"{b}/sentiment")
    j, secs, peak = wait_job(c, did, "sentiment", "sentiment")
    check("sentiment job done", j["status"] == "done", f"({secs:.0f}s, server peak RSS {peak} MB, error={j['error']})")
    s = c.get(f"{b}/sentiment").json()["distribution"]
    check("sentiment totals match Stage 1 (vaderSentiment)", s["counts"] == {"Negative": 80_075, "Neutral": 7_921, "Positive": 69_869} and s["no_text"] == 620_094, f"({s['counts']}, no text {s['no_text']:,})")
    d2 = c.get(f"{b}/dashboard").json()
    check("dashboard now includes sentiment", d2["sentiment"]["analysed"] == 157_865)
    neg = c.get(f"{b}/dashboard", params={"sentiment": "Negative"}).json()
    check("sentiment filter works", neg["metrics"]["total_complaints"] == 80_075)

    rec = c.get(f"{b}/recommendations", params={"top_n": 10}).json()
    issues = [i["issue"] for i in rec["items"]]
    check("recommendations use all 3 signals", rec["dataset"]["sentiment_available"] and all(i["score"]["signals_assessed"] >= 2 for i in rec["items"]))
    check("recommendations match Stage 2 top priority", "Disclosure verification of debt" in issues[:3], f"(top: {issues[:3]})")

    print("  prediction job...", flush=True)
    c.post(f"{b}/predictions")
    j, secs, peak = wait_job(c, did, "prediction", "prediction")
    check("prediction job done", j["status"] == "done", f"({secs:.0f}s, server peak RSS {peak} MB, error={j['error']})")
    p = c.get(f"{b}/predictions").json()
    # 3 narratives ('fradulent', a PDF file name, a hyphen-joined string) contain no word the model knows:
    # the API deliberately gives them NO label instead of guessing.
    check("predicted every narrative the model can read (157,862 + 3 unreadable)", (p["predicted_rows"], p["narratives_without_prediction"]) == (157_862, 3))
    ag = p["agreement_with_product_column"]
    print(f"    agreement with Product column: {ag['agreement_pct']}% over {ag['compared_rows']:,} rows | mean confidence {p['mean_confidence']} | low-confidence {p['low_confidence_pct']}%", flush=True)
    check("agreement is plausible and carries the honesty caveat", 80 < ag["agreement_pct"] < 95 and "NOT an accuracy" in ag["caveat"])
    dl = c.get(f"{b}/predictions/download")
    check("predictions CSV downloads", dl.status_code == 200 and dl.text.count("\n") >= 157_863, f"({len(dl.content)/1e6:.0f} MB)")

    rep = c.post(f"{b}/reports", json={"kind": "recommendations", "top_n": 10, "title": "E2E run"})
    check("report saved to history", rep.status_code == 201, f"({rep.json().get('headline')})")
    aid = rep.json()["id"]
    check("history lists and exports it", len(c.get("/api/analyses").json()) == 1 and c.get(f"/api/analyses/{aid}/export?format=csv").text.count("\n") >= 11)
    check("single prediction", c.post("/api/predict", json={"text": "debt collectors call me every day about a debt I do not owe"}).json()["predicted_product"] == "Debt collection")

    check("delete dataset", c.delete(b).status_code == 204 and c.get("/api/analyses").json() == [])
    c.request("DELETE", "/api/auth/account", json={"password": "a long e2e passphrase"})
print(f"\n{sum(ok_all)}/{len(ok_all)} checks passed")
sys.exit(0 if all(ok_all) else 1)
