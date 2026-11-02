import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from backend.auth import LoginThrottle
from tests.conftest import STRONG_PW, as_dt, register, sqlv, upload


def test_health_reports_database_and_model_files(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["database"] == "ok" and r.json()["model_files"]["model"] is True

def test_register_sets_secure_cookie_and_logs_in(client):
    r = register(client)
    assert r.status_code == 201 and r.json()["email"] == "alice@example.com" and "password" not in r.text
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=lax" in cookie
    assert client.get("/api/auth/me").json()["display_name"] == "Alice"

def test_password_is_stored_as_argon2_hash_only(client, engine):
    register(client)
    with engine.connect() as c:
        h = c.execute(text("select password_hash from users")).scalar()
        tokens = c.execute(text("select token_hash from user_sessions")).scalars().all()
    assert h.startswith("$argon2id$") and STRONG_PW not in h
    session_cookie = client.cookies.get("complainiq_session")
    assert session_cookie not in tokens and len(tokens[0]) == 64          # only a SHA-256 of the token is stored

def test_email_is_case_insensitive_and_unique(client, make_client):
    register(client, "Bob@Example.com")
    assert register(make_client(), "bob@example.COM").status_code == 409
    other = make_client()
    assert other.post("/api/auth/login", json={"email": "BOB@example.com", "password": STRONG_PW}).status_code == 200

def test_register_validation(client):
    assert register(client, email="not-an-email").status_code == 422
    assert register(client, password="short").status_code == 422
    assert register(client, password="password123").status_code == 422           # common password
    assert register(client, email="longname@example.com", password="longname@x").status_code in (201, 422)
    assert register(client, email="x@example.com", name="   ").status_code == 422

def test_login_wrong_password_and_unknown_email_look_identical(client, make_client):
    register(client)
    c2 = make_client()
    a = c2.post("/api/auth/login", json={"email": "alice@example.com", "password": "wrong-password-1"})
    b = c2.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong-password-1"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()

def test_endpoints_require_login(client):
    for method, url in [("get", "/api/auth/me"), ("get", "/api/datasets"), ("post", "/api/auth/logout"),
                        ("get", "/api/datasets/00000000-0000-0000-0000-000000000000")]:
        assert getattr(client, method)(url).status_code == 401, url

def test_logout_invalidates_the_session_immediately(client, make_client):
    register(client)
    stolen = client.cookies.get("complainiq_session")
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    other = make_client()
    other.cookies.set("complainiq_session", stolen)                 # replaying the old cookie must fail
    assert other.get("/api/auth/me").status_code == 401

def test_expired_session_is_rejected(client, engine):
    register(client)
    with engine.begin() as c:
        c.execute(text("update user_sessions set expires_at = :t"), {"t": sqlv(engine, datetime.now(timezone.utc) - timedelta(minutes=1))})
    assert client.get("/api/auth/me").status_code == 401
    with engine.connect() as c:
        assert c.execute(text("select count(*) from user_sessions")).scalar() == 0      # expired row cleaned up

def test_session_is_renewed_when_half_used(client, engine):
    register(client)
    soon = datetime.now(timezone.utc) + timedelta(days=1)
    with engine.begin() as c:
        c.execute(text("update user_sessions set expires_at = :t"), {"t": sqlv(engine, soon)})
    client.get("/api/auth/me")
    with engine.connect() as c:
        assert as_dt(c.execute(text("select expires_at from user_sessions")).scalar()) > soon + timedelta(days=3)

def test_login_throttling_blocks_after_five_failures(client, make_client):
    register(client)
    c2 = make_client()
    for _ in range(5):
        assert c2.post("/api/auth/login", json={"email": "alice@example.com", "password": "bad-password-x"}).status_code == 401
    r = c2.post("/api/auth/login", json={"email": "alice@example.com", "password": STRONG_PW})   # even the right one
    assert r.status_code == 429

def test_successful_login_resets_failure_count(client, make_client):
    register(client)
    c2 = make_client()
    for _ in range(4):
        c2.post("/api/auth/login", json={"email": "alice@example.com", "password": "bad-password-x"})
    assert c2.post("/api/auth/login", json={"email": "alice@example.com", "password": STRONG_PW}).status_code == 200
    for _ in range(4):
        assert c2.post("/api/auth/login", json={"email": "alice@example.com", "password": "bad-password-x"}).status_code == 401

def test_throttle_window_expires():
    now = [0.0]
    t = LoginThrottle(max_email=2, window_s=10, clock=lambda: now[0])
    t.failed("a@x.com", "1.1.1.1"); t.failed("a@x.com", "1.1.1.1")
    assert t.blocked("a@x.com", "1.1.1.1")
    now[0] = 11
    assert not t.blocked("a@x.com", "1.1.1.1")

def test_cross_site_origin_is_blocked_same_origin_allowed(client):
    r = client.post("/api/auth/register", headers={"Origin": "https://evil.example"},
                    json={"email": "e@example.com", "password": STRONG_PW, "display_name": "E"})
    assert r.status_code == 403
    ok = client.post("/api/auth/register", headers={"Origin": "https://testserver"},
                     json={"email": "e@example.com", "password": STRONG_PW, "display_name": "E"})
    assert ok.status_code == 201

def test_security_headers_present(client):
    h = client.get("/api/health").headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY" and h["cache-control"] == "no-store"

def test_change_password_signs_out_other_devices(client, make_client):
    register(client)
    other = make_client()
    other.post("/api/auth/login", json={"email": "alice@example.com", "password": STRONG_PW})
    assert client.post("/api/auth/password", json={"current_password": "wrong-one-12", "new_password": "another long pass"}).status_code == 403
    assert client.post("/api/auth/password", json={"current_password": STRONG_PW, "new_password": "short"}).status_code == 422
    assert client.post("/api/auth/password", json={"current_password": STRONG_PW, "new_password": "another long pass"}).status_code == 204
    assert client.get("/api/auth/me").status_code == 200 and other.get("/api/auth/me").status_code == 401
    fresh = make_client()
    assert fresh.post("/api/auth/login", json={"email": "alice@example.com", "password": STRONG_PW}).status_code == 401
    assert fresh.post("/api/auth/login", json={"email": "alice@example.com", "password": "another long pass"}).status_code == 200

def test_account_deletion_removes_rows_and_files(client, engine, sample_csv, app_settings):
    register(client)
    assert upload(client, sample_csv).status_code == 201
    user_dirs = [p for p in app_settings.storage_dir.iterdir() if p.is_dir()]
    assert len(user_dirs) == 1 and any(user_dirs[0].rglob("*.parquet"))
    assert client.request("DELETE", "/api/auth/account", json={"password": "wrong-password-1"}).status_code == 403
    assert client.request("DELETE", "/api/auth/account", json={"password": STRONG_PW}).status_code == 204
    assert not list(app_settings.storage_dir.iterdir())
    with engine.connect() as c:
        for table in ("users", "datasets", "user_sessions"):
            assert c.execute(text(f"select count(*) from {table}")).scalar() == 0, table
    assert client.get("/api/auth/me").status_code == 401
