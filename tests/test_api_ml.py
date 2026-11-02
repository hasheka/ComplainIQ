import dataclasses
import io
import uuid
from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend import jobs, processing
from backend.main import create_app
from tests.conftest import STRONG_PW, register, upload, write_csv, sqlv


def rich(client, rich_csv):
    did = upload(client, rich_csv, name="rich.csv").json()["id"]
    assert client.get(f"/api/datasets/{did}").json()["status"] == "ready"
    return did


def finished(client, did, kind):
    j = next(j for j in client.get(f"/api/datasets/{did}/jobs").json() if j["kind"] == kind)
    return j


# ------------------------------------------------------------------ single prediction + model card
def test_single_prediction(client):
    register(client)
    r = client.post("/api/predict", json={"text": "I was charged an incorrect amount on my credit card and I want a refund."}).json()
    assert r["status"] == "ok" and r["predicted_product"] == "Credit card" and r["target"] == "Product"
    assert 0 < r["confidence"] <= 1 and len(r["top_predictions"]) == 3

def test_prediction_input_validation(client):
    register(client)
    assert client.post("/api/predict", json={"text": ""}).status_code == 422
    assert client.post("/api/predict", json={"text": "   "}).status_code == 422
    assert client.post("/api/predict", json={"text": "x" * 10_001}).status_code == 422
    assert client.post("/api/predict", json={}).status_code == 422
    g = client.post("/api/predict", json={"text": "zzzz qqqq 123"})
    assert g.status_code == 200 and g.json()["status"] == "insufficient_text" and g.json()["predicted_product"] is None

def test_prediction_requires_login(client):
    assert client.post("/api/predict", json={"text": "hello world mortgage"}).status_code == 401
    assert client.get("/api/model").status_code == 401 and client.get("/api/info").status_code == 401

def test_model_card_and_privacy_info(client):
    register(client)
    m = client.get("/api/model").json()
    assert len(m["classes"]) == 12 and m["target"] == "Product" and m["evaluation"]["accuracy"] == pytest.approx(0.8502, abs=1e-4)
    i = client.get("/api/info").json()
    assert "never the complaint texts" in " ".join(i["privacy"]["storage"]) and i["limits"]["max_upload_mb"] == 1

def test_missing_model_files_give_503_without_leaking_paths(make_client, engine, app_settings, tmp_path):   # make_client resets the DB
    cfg = dataclasses.replace(app_settings, model_path=tmp_path / "secret_dir" / "nope.pkl")
    with TestClient(create_app(cfg, engine=engine), base_url="https://testserver") as c:
        register(c)
        for call in (lambda: c.post("/api/predict", json={"text": "mortgage escrow"}), lambda: c.get("/api/model")):
            r = call()
            assert r.status_code == 503 and "secret_dir" not in r.text and "not available" in r.json()["detail"]
        assert c.get("/api/health").json()["model_files"]["model"] is False        # health still tells the operator


# ------------------------------------------------------------------ sentiment
def test_sentiment_flow_and_numbers(client, rich_csv, rich_df):
    register(client); did = rich(client, rich_csv)
    assert client.get(f"/api/datasets/{did}/sentiment").status_code == 409
    r = client.post(f"/api/datasets/{did}/sentiment")
    assert r.status_code == 202 and r.json()["kind"] == "sentiment"
    j = finished(client, did, "sentiment")
    assert j["status"] == "done" and j["progress"] == 100 and j["finished_at"]
    n_text = int((rich_df["Consumer complaint narrative"] != "").sum())
    res = client.get(f"/api/datasets/{did}/sentiment", params={"min_n": 1}).json()
    dist = res["distribution"]
    assert dist["analysed"] == n_text and dist["no_text"] == 900 - n_text            # missing text is NOT neutral
    assert sum(dist["counts"].values()) == n_text and "not a measure" in dist["note"]
    by_issue = {x["name"]: x for x in res["by_issue"]}
    assert by_issue["Fraud or scam"]["negative_pct"] == max(x["negative_pct"] for x in by_issue.values())
    assert res["most_negative_issues"][0]["name"] == "Fraud or scam"
    assert sum(x["analysed"] for x in res["monthly"]) == n_text

def test_sentiment_appears_in_dashboard_and_filters_after_it_is_computed(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    assert client.get(f"/api/datasets/{did}/dashboard").json()["sentiment"] is None        # (and gets cached)
    client.post(f"/api/datasets/{did}/sentiment")
    d = client.get(f"/api/datasets/{did}/dashboard").json()                                # cache must not be stale
    assert d["sentiment_available"] and d["sentiment"]["analysed"] > 0
    neg = client.get(f"/api/datasets/{did}/dashboard", params={"sentiment": "Negative"}).json()
    assert neg["metrics"]["total_complaints"] == d["sentiment"]["counts"]["Negative"]
    f = client.get(f"/api/datasets/{did}/filters").json()
    assert f["sentiment_available"] and f["sentiments"] == ["Negative", "Neutral", "Positive"]
    t = client.get(f"/api/datasets/{did}/analytics/trends").json()
    assert "negative_sentiment_monthly" in t

def test_recommendations_use_sentiment_once_available(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    before = client.get(f"/api/datasets/{did}/recommendations?top_n=4").json()
    assert before["dataset"]["sentiment_available"] is False
    client.post(f"/api/datasets/{did}/sentiment")
    after = client.get(f"/api/datasets/{did}/recommendations?top_n=4").json()
    assert after["dataset"]["sentiment_available"] is True
    assert any(i["sentiment"] and i["score"]["breakdown"][2]["assessed"] for i in after["items"])

def test_no_narratives_means_no_sentiment_or_prediction(client, tmp_path):
    register(client)
    f = tmp_path / "nonarr.csv"; f.write_text("Date received,Product,Issue\n03/05/2016,Mortgage,Escrow\n")
    did = upload(client, f).json()["id"]
    assert client.post(f"/api/datasets/{did}/sentiment").status_code == 409
    assert client.post(f"/api/datasets/{did}/predictions").status_code == 409

def test_second_start_while_running_returns_same_job(client, rich_csv, engine):
    register(client); did = rich(client, rich_csv)
    with engine.begin() as c:
        c.execute(text("insert into jobs (id,dataset_id,user_id,kind,status,progress,created_at) "
                       "select :j, d.id, d.user_id, 'sentiment', 'running', 40, current_timestamp from datasets d"), {"j": sqlv(engine, uuid.uuid4())})
    r = client.post(f"/api/datasets/{did}/sentiment")
    assert r.status_code == 202 and r.json()["status"] == "running" and r.json()["progress"] == 40
    assert len(client.get(f"/api/datasets/{did}/jobs").json()) == 1                       # no duplicate job
    assert client.post(f"/api/datasets/{did}/mapping", json={"mapping": {"date": "Date received"}}).status_code == 409

def test_rerun_after_completion_creates_a_new_job(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    a = client.post(f"/api/datasets/{did}/sentiment").json()["id"]
    b = client.post(f"/api/datasets/{did}/sentiment").json()["id"]
    assert a != b and len(client.get(f"/api/datasets/{did}/jobs").json()) == 2

def test_job_failure_is_recorded_not_raised(client, rich_csv, make_client, engine):
    register(client); did = rich(client, rich_csv)
    app = make_client.app
    with engine.begin() as c:
        c.execute(text("insert into jobs (id,dataset_id,user_id,kind,status,progress,created_at) "
                       "select :j, d.id, d.user_id, 'sentiment', 'queued', 0, current_timestamp from datasets d"), {"j": sqlv(engine, (jid := uuid.uuid4()))})
        c.execute(text("update datasets set status = 'failed'"))
    jobs.run_job(app.state.sessionmaker, app.state.storage, make_client.settings, app.state.bundles, jid)
    with engine.connect() as c:
        status, err = c.execute(text("select status, error from jobs where id = :j"), {"j": sqlv(engine, jid)}).one()
    assert status == "failed" and "not ready" in err

def test_stale_running_jobs_are_failed_at_startup_cleanup(client, rich_csv, make_client, engine, app_settings):
    register(client); did = rich(client, rich_csv)
    old = datetime.now(timezone.utc) - timedelta(hours=app_settings.stale_upload_hours + 1)
    with engine.begin() as c:
        c.execute(text("insert into jobs (id,dataset_id,user_id,kind,status,progress,created_at) "
                       "select :j, d.id, d.user_id, 'prediction', 'running', 10, :t from datasets d"), {"j": sqlv(engine, uuid.uuid4()), "t": sqlv(engine, old)})
    out = processing.cleanup_stale(make_client.app.state.sessionmaker, make_client.app.state.storage, app_settings)
    assert out["stale_jobs"] == 1
    j = finished(client, did, "prediction")
    assert j["status"] == "failed" and "interrupted" in j["error"]


# ------------------------------------------------------------------ batch predictions
def test_batch_prediction_flow(client, rich_csv, rich_df):
    register(client); did = rich(client, rich_csv)
    assert client.get(f"/api/datasets/{did}/predictions").status_code == 409
    assert client.post(f"/api/datasets/{did}/predictions").status_code == 202
    assert finished(client, did, "prediction")["status"] == "done"
    n_text = int((rich_df["Consumer complaint narrative"] != "").sum())
    res = client.get(f"/api/datasets/{did}/predictions").json()
    assert res["predicted_rows"] == n_text and res["rows_without_narrative"] == 900 - n_text
    assert sum(x["count"] for x in res["distribution"]) == n_text and 0 < res["mean_confidence"] <= 1
    ag = res["agreement_with_product_column"]
    assert ag["compared_rows"] == n_text and ag["agreement_pct"] > 90 and "NOT an accuracy estimate" in ag["caveat"]
    assert "85.02%" in ag["caveat"] and res["target"] == "Product"
    assert res["product_coverage"]["rows_without_model_label"] == 0

def test_prediction_download_has_no_narrative_text(client, rich_csv, rich_df):
    register(client); did = rich(client, rich_csv)
    client.post(f"/api/datasets/{did}/predictions")
    r = client.get(f"/api/datasets/{did}/predictions/download")
    assert r.status_code == 200 and "predictions_rich.csv" in r.headers["content-disposition"]
    df = pd.read_csv(io.StringIO(r.text))
    assert len(df) == int((rich_df["Consumer complaint narrative"] != "").sum())
    assert {"row_number", "complaint_id", "actual_product", "issue", "predicted_product", "confidence"} <= set(df.columns)
    assert "furious" not in r.text and "narrative" not in " ".join(df.columns)

def test_prediction_job_with_missing_model_fails_fast(make_client, engine, app_settings, tmp_path, rich_csv):
    cfg = dataclasses.replace(app_settings, model_path=tmp_path / "nope.pkl")
    with TestClient(create_app(cfg, engine=engine), base_url="https://testserver") as c:
        register(c); did = rich(c, rich_csv)
        assert c.post(f"/api/datasets/{did}/predictions").status_code == 503
        assert c.get(f"/api/datasets/{did}/jobs").json() == []

def test_remapping_discards_stale_results(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    client.post(f"/api/datasets/{did}/sentiment"); client.post(f"/api/datasets/{did}/predictions")
    assert client.get(f"/api/datasets/{did}/sentiment").status_code == 200
    client.post(f"/api/datasets/{did}/mapping", json={"mapping": {"issue": "Issue"}})        # re-cleans the file
    assert client.get(f"/api/datasets/{did}/sentiment").status_code == 409
    assert client.get(f"/api/datasets/{did}/predictions").status_code == 409
    assert client.get(f"/api/datasets/{did}/jobs").json() == []
    assert client.get(f"/api/datasets/{did}/dashboard").json()["sentiment"] is None

def test_deleting_dataset_removes_results_and_jobs(client, rich_csv, engine, app_settings):
    register(client); did = rich(client, rich_csv)
    client.post(f"/api/datasets/{did}/sentiment"); client.post(f"/api/datasets/{did}/predictions")
    client.get(f"/api/datasets/{did}/predictions/download")
    assert client.delete(f"/api/datasets/{did}").status_code == 204
    assert [p for p in app_settings.storage_dir.rglob("*") if p.is_file()] == []
    with engine.connect() as c:
        assert c.execute(text("select count(*) from jobs")).scalar() == 0
