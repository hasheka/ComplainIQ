import io
import os
import uuid
from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest
from sqlalchemy import text

from backend import processing
from backend.routes import dataset_routes
from tests.conftest import HEADER, SAMPLE_ROWS, register, upload, write_csv, sqlv


def ready(c, sample_csv):
    r = upload(c, sample_csv)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_upload_cleans_and_reports(client, sample_csv):
    register(client)
    r = upload(client, sample_csv, name="my complaints.csv")
    assert r.status_code == 201
    ds = client.get(f"/api/datasets/{r.json()['id']}").json()           # background cleaning has finished
    assert ds["status"] == "ready" and ds["rows"] == 6 and ds["original_filename"] == "my complaints.csv"
    assert ds["mapping"]["narrative"] == "Consumer complaint narrative" and ds["required_fields"] == ["date", "product", "issue"]
    rep = ds["cleaning_report"]
    assert rep["invalid_dates"] == 1 and rep["narratives_present"] == 3 and rep["narratives_missing"] == 3
    assert ds["summary"]["total_complaints"] == 6 and ds["summary"]["narrative_pct"] == 50.0
    assert any(c["column"] == "narrative" and c["missing"] == 3 for c in ds["profile"]["columns"])

def test_listing_shows_only_own_datasets_newest_first(client, sample_csv):
    register(client)
    a, b = ready(client, sample_csv), ready(client, sample_csv)
    ids = [d["id"] for d in client.get("/api/datasets").json()]
    assert ids == [b, a]
    assert "cleaning_report" not in client.get("/api/datasets").json()[0]       # list stays light

def test_preview_paging(client, tmp_path):
    rows = [(f"01/{(i % 28) + 1:02d}/2016", "Mortgage", "Loan servicing", "", "text %d" % i, str(i)) for i in range(120)]
    register(client)
    did = upload(client, write_csv(tmp_path / "big.csv", rows)).json()["id"]
    p1 = client.get(f"/api/datasets/{did}/preview?page=1&page_size=50").json()
    p3 = client.get(f"/api/datasets/{did}/preview?page=3&page_size=50").json()
    assert p1["total_rows"] == 120 and len(p1["rows"]) == 50 and len(p3["rows"]) == 20
    assert p1["rows"][0]["complaint_id"] == "0" and p3["rows"][-1]["complaint_id"] == "119"
    assert client.get(f"/api/datasets/{did}/preview?page=9&page_size=50").json()["rows"] == []
    assert client.get(f"/api/datasets/{did}/preview?page_size=1000").status_code == 422

def test_download_cleaned_csv(client, sample_csv):
    register(client)
    did = ready(client, sample_csv)
    r = client.get(f"/api/datasets/{did}/download/cleaned")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "cleaned_complaints.csv" in r.headers["content-disposition"]
    df = pd.read_csv(io.StringIO(r.text))
    assert len(df) == 6 and "has_narrative" not in df.columns and df["date"].iloc[0] == "2016-01-05"
    assert df["date"].isna().sum() == 1 and df["narrative"].isna().sum() == 3        # nothing invented

def test_unsupported_empty_binary_and_oversize_files_are_rejected_cleanly(client, app_settings):
    register(client)
    assert upload(client, b"a,b\n1,2\n", name="data.xlsx").status_code == 415
    assert upload(client, b"", name="empty.csv").status_code == 400
    assert upload(client, b"abc\x00\x01binary", name="bin.csv").status_code == 400
    big = HEADER.encode() + b"01/01/2016,Mortgage,X,,text,1\n" * 40_000                     # ~1.3 MB > 1 MB limit
    r = upload(client, big)
    assert r.status_code == 413 and "too large" in r.json()["detail"].lower()
    assert client.get("/api/datasets").json() == []                                         # no rows left behind
    left = [p for p in app_settings.storage_dir.rglob("*") if p.is_file()]
    assert left == []                                                                       # no files left behind

def test_streaming_limit_without_content_length():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as e:
        dataset_routes._copy_limited(io.BytesIO(b"x" * 2048), __import__("pathlib").Path(os.devnull), 1024)
    assert e.value.status_code == 413

def test_header_only_file_fails_with_clear_message(client, tmp_path):
    register(client)
    did = upload(client, (tmp_path / "h.csv").write_bytes(HEADER.encode()) and (tmp_path / "h.csv")).json()["id"]
    ds = client.get(f"/api/datasets/{did}").json()
    assert ds["status"] == "failed" and "no data rows" in ds["error"]

def test_unknown_columns_need_mapping_then_process(client, tmp_path):
    register(client)
    f = tmp_path / "odd.csv"
    f.write_text("Filed on,Line of business,What went wrong,Extra\n03/05/2016,Mortgage,Escrow problem,x\n04/05/2016,Credit card,Late fee,y\n")
    r = upload(client, f)
    d = r.json()
    assert d["status"] == "needs_mapping" and d["file_columns"] == ["Filed on", "Line of business", "What went wrong", "Extra"]
    assert "date" in d["error"] and d["rows"] is None
    assert client.post(f"/api/datasets/{d['id']}/mapping", json={"mapping": {"date": "Nope"}}).status_code == 400
    assert client.post(f"/api/datasets/{d['id']}/mapping", json={"mapping": {"date": "Filed on"}}).status_code == 400   # still incomplete
    ok = client.post(f"/api/datasets/{d['id']}/mapping",
                     json={"mapping": {"date": "Filed on", "product": "Line of business", "issue": "What went wrong"}})
    assert ok.status_code == 200
    ds = client.get(f"/api/datasets/{d['id']}").json()
    assert ds["status"] == "ready" and ds["rows"] == 2 and ds["mapping"]["issue"] == "What went wrong"

def test_remapping_a_ready_dataset_reprocesses_it(client, tmp_path):
    register(client)
    f = tmp_path / "two.csv"
    f.write_text("Date received,Product,Issue,Category\n03/05/2016,Mortgage,Escrow,Alpha\n")
    did = upload(client, f).json()["id"]
    assert client.get(f"/api/datasets/{did}").json()["mapping"]["product"] == "Product"
    client.post(f"/api/datasets/{did}/mapping", json={"mapping": {"product": "Category"}})
    assert client.get(f"/api/datasets/{did}").json()["mapping"]["product"] == "Category"

def test_dataset_quota(client, sample_csv):
    register(client)
    for _ in range(3):
        ready(client, sample_csv)
    r = upload(client, sample_csv)
    assert r.status_code == 409 and "limit" in r.json()["detail"]

def test_delete_dataset_removes_row_and_every_file(client, sample_csv, app_settings):
    register(client)
    did = ready(client, sample_csv)
    client.get(f"/api/datasets/{did}/download/cleaned")                                    # creates the csv export too
    assert len([p for p in app_settings.storage_dir.rglob("*") if p.is_file()]) == 3       # original, parquet, export
    assert client.delete(f"/api/datasets/{did}").status_code == 204
    assert client.get(f"/api/datasets/{did}").status_code == 404
    assert [p for p in app_settings.storage_dir.rglob("*") if p.is_file()] == []

def test_hostile_file_names_never_touch_the_filesystem(client, sample_csv, app_settings, tmp_path):
    register(client)
    for name in ["../../evil.csv", "..\\..\\evil.csv", "/etc/passwd.csv", "a\x00b.csv"]:
        r = upload(client, sample_csv, name=name)
        assert r.status_code == 201, name
        assert "/" not in r.json()["original_filename"] and "\\" not in r.json()["original_filename"]
        if name.startswith(".."):                       # stay under the 3-dataset test quota
            client.delete(f"/api/datasets/{r.json()['id']}")
    files = [p for p in app_settings.storage_dir.rglob("*") if p.is_file()]
    assert files and all(p.name in {"original.csv", "cleaned.parquet"} for p in files)
    assert not (tmp_path / "evil.csv").exists() and not any(p.name == "evil.csv" for p in tmp_path.rglob("*"))
    outside = [p for p in tmp_path.iterdir() if p.name not in {"storage", "sample.csv"}]
    assert outside == []

def test_cleaned_data_not_ready_until_processing_finishes(client, engine, sample_csv):
    register(client)
    did = ready(client, sample_csv)
    with engine.begin() as c:
        c.execute(text("update datasets set status = 'processing'"))
    assert client.get(f"/api/datasets/{did}/preview").status_code == 409
    assert client.get(f"/api/datasets/{did}/download/cleaned").status_code == 409
    assert client.post(f"/api/datasets/{did}/mapping", json={"mapping": {"date": "Date received"}}).status_code == 409


# ------------------------------------------------------------------ isolation between users
def test_other_users_cannot_see_or_touch_my_dataset(client, make_client, sample_csv):
    register(client, "alice@example.com")
    did = ready(client, sample_csv)
    bob = make_client()
    register(bob, "bob@example.com", name="Bob")
    for method, url, kw in [("get", f"/api/datasets/{did}", {}),
                            ("get", f"/api/datasets/{did}/preview", {}),
                            ("get", f"/api/datasets/{did}/download/cleaned", {}),
                            ("post", f"/api/datasets/{did}/mapping", {"json": {"mapping": {"date": "Date received"}}}),
                            ("delete", f"/api/datasets/{did}", {})]:
        r = getattr(bob, method)(url, **kw)
        assert r.status_code == 404, (method, url, r.status_code)          # 404, not 403: existence is not revealed
    assert bob.get("/api/datasets").json() == []
    assert client.get(f"/api/datasets/{did}").status_code == 200            # and it is still intact for Alice

def test_unknown_id_looks_the_same_as_someone_elses(client):
    register(client)
    assert client.get(f"/api/datasets/{uuid.uuid4()}").status_code == 404
    assert client.get("/api/datasets/not-a-uuid").status_code == 422

def test_stored_files_are_in_per_user_folders(client, make_client, sample_csv, app_settings):
    register(client, "alice@example.com"); ready(client, sample_csv)
    bob = make_client(); register(bob, "bob@example.com", name="Bob"); ready(bob, sample_csv)
    assert len([p for p in app_settings.storage_dir.iterdir() if p.is_dir()]) == 2


# ------------------------------------------------------------------ housekeeping
def test_stale_uploads_and_orphan_folders_are_cleaned(client, make_client, engine, sample_csv, app_settings):
    register(client)
    did = ready(client, sample_csv)
    old = datetime.now(timezone.utc) - timedelta(hours=app_settings.stale_upload_hours + 1)
    with engine.begin() as c:
        c.execute(text("update datasets set status = 'processing', created_at = :t"), {"t": sqlv(engine, old)})
    orphan = app_settings.storage_dir / str(uuid.uuid4()) / str(uuid.uuid4())
    orphan.mkdir(parents=True); (orphan / "original.csv").write_text("x")
    os.utime(orphan, (old.timestamp(), old.timestamp()))
    result = processing.cleanup_stale(make_client.app.state.sessionmaker, make_client.app.state.storage, app_settings)
    assert result == {"stale_datasets": 1, "stale_jobs": 0, "orphan_folders": 1}
    ds = client.get(f"/api/datasets/{did}").json()
    assert ds["status"] == "failed" and "not completed" in ds["error"]
    assert [p for p in app_settings.storage_dir.rglob("*") if p.is_file()] == []

def test_recent_uploads_are_not_cleaned(client, make_client, engine, sample_csv, app_settings):
    register(client); ready(client, sample_csv)
    with engine.begin() as c:
        c.execute(text("update datasets set status = 'processing'"))
    r = processing.cleanup_stale(make_client.app.state.sessionmaker, make_client.app.state.storage, app_settings)
    assert r["stale_datasets"] == 0


def test_storage_folders_are_owner_only(client, sample_csv, app_settings):
    import stat
    register(client); ready(client, sample_csv)
    dirs = [p for p in [app_settings.storage_dir, *app_settings.storage_dir.rglob("*")] if p.is_dir()]
    assert len(dirs) == 3 and all(stat.S_IMODE(p.stat().st_mode) == 0o700 for p in dirs)
