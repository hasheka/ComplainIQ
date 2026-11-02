import pytest
from sqlalchemy import text

from tests.conftest import register, upload


def rich(client, rich_csv):
    r = upload(client, rich_csv, name="rich.csv")
    assert r.status_code == 201, r.text
    assert client.get(f"/api/datasets/{r.json()['id']}").json()["status"] == "ready"
    return r.json()["id"]


def test_filter_options(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    f = client.get(f"/api/datasets/{did}/filters").json()
    assert len(f["products"]) == 4 and len(f["issues"]) == 4
    assert f["date_min"].startswith("2014-01") and f["date_max"].startswith("2016-12") and f["sentiment_available"] is False

def test_dashboard_numbers_match_an_independent_pandas_count(client, rich_csv, rich_df):
    register(client); did = rich(client, rich_csv)
    d = client.get(f"/api/datasets/{did}/dashboard").json()
    m = d["metrics"]
    assert m["total_complaints"] == len(rich_df) == 900
    assert m["unique_products"] == rich_df["Product"].nunique() and m["unique_issues"] == rich_df["Issue"].nunique()
    assert m["narratives_present"] == int((rich_df["Consumer complaint narrative"] != "").sum())
    expect = rich_df["Issue"].value_counts()
    assert [(x["name"], x["count"]) for x in d["top_issues"]] == [(k, int(v)) for k, v in expect.items()]
    assert sum(x["count"] for x in d["monthly"]) == 900 and len(d["monthly"]) == 36
    assert d["sentiment"] is None and d["sentiment_available"] is False

def test_filters_change_the_numbers_correctly(client, rich_csv, rich_df):
    register(client); did = rich(client, rich_csv)
    base = f"/api/datasets/{did}/dashboard"
    only = client.get(base, params={"product": "Mortgage"}).json()["metrics"]["total_complaints"]
    assert only == int((rich_df["Product"] == "Mortgage").sum())
    dated = client.get(base, params={"date_from": "2016-01-01"}).json()["metrics"]["total_complaints"]
    assert dated == int((rich_df["Date received"].str[-4:] == "2016").sum())
    both = client.get(base, params={"date_from": "2015-01-01", "date_to": "2015-12-31", "issue": ["Late fee", "Fraud or scam"]}).json()
    mask = (rich_df["Date received"].str[-4:] == "2015") & rich_df["Issue"].isin(["Late fee", "Fraud or scam"])
    assert both["metrics"]["total_complaints"] == int(mask.sum())
    assert both["filters_applied"]["issues"] == ["Late fee", "Fraud or scam"]
    nothing = client.get(base, params={"product": "Nope"}).json()
    assert nothing["metrics"]["total_complaints"] == 0 and nothing["top_issues"] == [] and nothing["monthly"] == []

def test_bad_filter_input_is_rejected(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    base = f"/api/datasets/{did}/dashboard"
    assert client.get(base, params={"date_from": "2016-05-01", "date_to": "2016-01-01"}).status_code == 422
    assert client.get(base, params={"date_from": "yesterday"}).status_code == 422
    assert client.get(base, params={"sentiment": "Angry"}).status_code == 422
    assert client.get(base, params={"sentiment": "Negative"}).status_code == 409        # not computed yet

def test_issue_product_trend_and_breakdown_routes(client, rich_csv, rich_df):
    register(client); did = rich(client, rich_csv)
    b = f"/api/datasets/{did}"
    assert len(client.get(f"{b}/analytics/issues?limit=2").json()["items"]) == 2
    assert client.get(f"{b}/analytics/products").json()["total_unique"] == 4
    t = client.get(f"{b}/analytics/trends?by=product&top=2").json()
    assert len(t["by_category"]["series"]) == 2 and "negative_sentiment_monthly" not in t
    br = client.get(f"{b}/analytics/breakdown", params={"issue": "Fraud or scam"}).json()
    assert br["count"] == int((rich_df["Issue"] == "Fraud or scam").sum()) and br["products"][0]["name"] == "Money transfers"
    assert br["sub_issues"]["items"][0]["name"] == "Account takeover"
    assert client.get(f"{b}/analytics/breakdown", params={"product": "Mortgage"}).json()["issues"][0]["name"].startswith("Loan modification")
    assert client.get(f"{b}/analytics/breakdown").status_code == 422
    assert client.get(f"{b}/analytics/breakdown", params={"issue": "a", "product": "b"}).status_code == 422
    assert client.get(f"{b}/analytics/breakdown", params={"issue": "Unknown"}).status_code == 404
    m = client.get(f"{b}/analytics/matrix").json()
    assert sum(sum(r) for r in m["values"]) == 900

def test_compare_periods_finds_the_planted_change(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    b = f"/api/datasets/{did}/analytics/compare"
    q = {"prev_from": "2015-01-01", "prev_to": "2015-12-31", "recent_from": "2016-01-01", "recent_to": "2016-12-31"}
    res = client.get(b, params=q).json()
    fraud = next(i for i in res["items"] if i["name"] == "Fraud or scam")
    assert fraud["meaningful"] and fraud["direction"] == "up" and fraud["share_recent_pct"] > fraud["share_prev_pct"] * 3
    assert client.get(b, params=dict(q, prev_to="2016-06-01")).status_code == 422          # periods overlap
    assert client.get(b, params=dict(q, prev_from="2016-01-01")).status_code == 422        # start after end

def test_rising_issues_and_insufficient_history(client, rich_csv, sample_csv):
    register(client); did = rich(client, rich_csv)
    res = client.get(f"/api/datasets/{did}/analytics/rising").json()
    assert res["status"] == "ok" and res["period_recent"] == ["2016-01", "2016-12"]
    assert next(i for i in res["items"] if i["name"] == "Fraud or scam")["meaningful"]
    small = upload(client, sample_csv).json()["id"]
    assert client.get(f"/api/datasets/{small}/analytics/rising").json()["status"] == "insufficient_data"

def test_live_recommendations(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    r = client.get(f"/api/datasets/{did}/recommendations?top_n=4").json()
    assert r["status"] == "ok" and len(r["items"]) == 4 and r["label"].startswith("Recommendation for investigation")
    top = r["items"][0]
    assert top["issue"] == "Fraud or scam" and top["tier"] == "High" and top["recommendation"]["rule_id"] == "fraud-unauthorized"
    assert "Late fee" in {i["issue"] for i in r["items"]}
    assert all("furious" not in str(i) for i in r["items"])                                  # no narrative text leaks

def test_not_ready_dataset_blocks_every_analytics_route(client, rich_csv, engine):
    register(client); did = rich(client, rich_csv)
    with engine.begin() as c:
        c.execute(text("update datasets set status = 'processing'"))
    for path in ["filters", "dashboard", "analytics/issues", "analytics/trends", "recommendations", "sentiment", "predictions", "jobs"]:
        assert client.get(f"/api/datasets/{did}/{path}").status_code == 409, path

ENDPOINTS = ["filters", "dashboard", "analytics/issues", "analytics/products", "analytics/trends", "analytics/matrix",
             "analytics/rising", "recommendations", "sentiment", "predictions", "predictions/download", "jobs"]

def test_other_users_get_404_and_anonymous_get_401_everywhere(client, make_client, rich_csv):
    register(client); did = rich(client, rich_csv)
    bob = make_client(); register(bob, "bob@example.com", name="Bob")
    anon = make_client()
    for path in ENDPOINTS:
        assert bob.get(f"/api/datasets/{did}/{path}").status_code == 404, path
        assert anon.get(f"/api/datasets/{did}/{path}").status_code == 401, path
    for path in ["sentiment", "predictions"]:
        assert bob.post(f"/api/datasets/{did}/{path}").status_code == 404
    assert bob.post(f"/api/datasets/{did}/reports", json={"kind": "summary"}).status_code == 404
    assert bob.get(f"/api/datasets/{did}/analytics/breakdown", params={"issue": "Late fee"}).status_code == 404
    assert bob.get(f"/api/datasets/{did}/analytics/compare", params={"prev_from": "2015-01-01", "prev_to": "2015-02-01",
                                                                      "recent_from": "2016-01-01", "recent_to": "2016-02-01"}).status_code == 404
