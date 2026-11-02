import csv
import io
import json

from sqlalchemy import text

from tests.conftest import register, upload


def rich(client, rich_csv):
    return upload(client, rich_csv, name="rich.csv").json()["id"]


def save(client, did, **body):
    return client.post(f"/api/datasets/{did}/reports", json={"kind": "recommendations", **body})


def test_history_starts_empty(client):
    register(client)
    assert client.get("/api/analyses").json() == []

def test_save_list_open_and_export_recommendation_report(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    r = save(client, did, top_n=4, title="My review")
    assert r.status_code == 201
    a = r.json()
    assert a["title"] == "My review" and a["dataset_name"] == "rich.csv" and "Fraud or scam" in a["headline"]
    assert a["report"]["items"][0]["issue"] == "Fraud or scam" and len(a["report"]["items"]) == 4
    lst = client.get("/api/analyses").json()
    assert [x["id"] for x in lst] == [a["id"]] and "report" not in lst[0]                  # list stays light
    assert client.get(f"/api/analyses/{a['id']}").json()["report"] == a["report"]          # reopen = same report
    csv_r = client.get(f"/api/analyses/{a['id']}/export?format=csv")
    rows = list(csv.DictReader(io.StringIO(csv_r.text)))
    assert csv_r.headers["content-type"].startswith("text/csv") and len(rows) == 4 and rows[0]["issue"] == "Fraud or scam"
    assert "not a confirmed root cause" in rows[0]["label"].lower()
    md = client.get(f"/api/analyses/{a['id']}/export?format=md").text
    assert "## Limitations" in md and "Recommendation for investigation" in md
    js = client.get(f"/api/analyses/{a['id']}/export?format=json")
    assert json.loads(js.text)["items"][0]["issue"] == "Fraud or scam" and "attachment" in js.headers["content-disposition"]
    assert client.get(f"/api/analyses/{a['id']}/export?format=pdf").status_code == 422

def test_summary_report_and_exports(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    a = client.post(f"/api/datasets/{did}/reports", json={"kind": "summary", "filters": {"products": ["Mortgage"]}}).json()
    assert a["report"]["metrics"]["unique_products"] == 1 and a["filters"]["products"] == ["Mortgage"]
    c = client.get(f"/api/analyses/{a['id']}/export?format=csv").text
    assert c.splitlines()[0] == "section,name,count,pct" and "product,Mortgage" in c
    assert "# Summary - rich.csv" in client.get(f"/api/analyses/{a['id']}/export?format=md").text

def test_report_filters_are_applied_and_validated(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    r = save(client, did, filters={"issues": ["Late fee"]}, top_n=5).json()["report"]
    assert [i["issue"] for i in r["items"]] == ["Late fee"]
    assert save(client, did, filters={"products": ["Nope"]}).status_code == 422                # nothing matches
    assert save(client, did, filters={"date_from": "garbage"}).status_code == 422
    assert save(client, did, filters={"sentiments": ["Angry"]}).status_code == 422
    assert save(client, did, filters={"sentiments": ["Negative"]}).status_code == 409           # not computed
    assert client.post(f"/api/datasets/{did}/reports", json={"kind": "other"}).status_code == 422
    assert save(client, did, top_n=99).status_code == 422

def test_report_contains_no_complaint_text(client, rich_csv):
    register(client); did = rich(client, rich_csv)
    a = save(client, did, top_n=10).json()
    assert "furious" not in json.dumps(a["report"]) and "escrow payment" not in json.dumps(a["report"])

def test_list_filter_by_dataset_and_delete(client, rich_csv, sample_csv):
    register(client); d1 = rich(client, rich_csv); d2 = upload(client, sample_csv).json()["id"]
    a1 = save(client, d1).json(); client.post(f"/api/datasets/{d2}/reports", json={"kind": "summary"})
    assert len(client.get("/api/analyses").json()) == 2
    assert [x["id"] for x in client.get(f"/api/analyses?dataset_id={d1}").json()] == [a1["id"]]
    assert client.delete(f"/api/analyses/{a1['id']}").status_code == 204
    assert client.get(f"/api/analyses/{a1['id']}").status_code == 404
    assert len(client.get("/api/analyses").json()) == 1

def test_history_is_private(client, make_client, rich_csv):
    register(client); did = rich(client, rich_csv)
    a = save(client, did).json()
    bob = make_client(); register(bob, "bob@example.com", name="Bob")
    assert bob.get("/api/analyses").json() == []
    for call in (lambda: bob.get(f"/api/analyses/{a['id']}"), lambda: bob.get(f"/api/analyses/{a['id']}/export?format=csv"),
                 lambda: bob.delete(f"/api/analyses/{a['id']}")):
        assert call().status_code == 404
    assert make_client().get("/api/analyses").status_code == 401
    assert client.get(f"/api/analyses/{a['id']}").status_code == 200                           # untouched

def test_deleting_dataset_or_account_removes_its_reports(client, rich_csv, engine):
    register(client); did = rich(client, rich_csv)
    save(client, did)
    assert client.delete(f"/api/datasets/{did}").status_code == 204
    assert client.get("/api/analyses").json() == []
    did2 = rich(client, rich_csv); save(client, did2)
    client.request("DELETE", "/api/auth/account", json={"password": "correct horse battery"})
    with engine.connect() as c:
        assert c.execute(text("select count(*) from analyses")).scalar() == 0
