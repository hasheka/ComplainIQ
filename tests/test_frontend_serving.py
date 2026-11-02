import dataclasses

import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


@pytest.fixture
def dist(tmp_path):
    d = tmp_path / "site" / "dist"
    (d / "assets").mkdir(parents=True)
    (d / "index.html").write_text('<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/app-abc123.js"></script></body></html>')
    (d / "assets" / "app-abc123.js").write_text("console.log('app');")
    (d / "favicon.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'/>")
    (tmp_path / "site" / "secret.txt").write_text("TOP-SECRET")           # next to dist, must stay unreachable
    (tmp_path / "outside.txt").write_text("OUTSIDE")
    return d


@pytest.fixture
def web(engine, app_settings, dist):
    cfg = dataclasses.replace(app_settings, frontend_dir=dist)
    with TestClient(create_app(cfg, engine=engine), base_url="https://testserver") as c:
        yield c


def test_root_and_app_routes_return_the_single_page_app(web):
    for path in ["/", "/login", "/register", "/app", "/app/data", "/app/settings", "/some/deep/client/route"]:
        r = web.get(path)
        assert r.status_code == 200 and '<div id="root">' in r.text, path
        assert r.headers["cache-control"] == "no-cache"

def test_assets_are_served_with_long_cache_and_correct_type(web):
    r = web.get("/assets/app-abc123.js")
    assert r.status_code == 200 and "javascript" in r.headers["content-type"]
    assert "immutable" in r.headers["cache-control"] and "max-age=31536000" in r.headers["cache-control"]
    assert web.get("/favicon.svg").status_code == 200

def test_missing_files_are_404_not_the_app(web):
    for path in ["/assets/missing.js", "/nope.png", "/app/data.csv"]:
        assert web.get(path).status_code == 404, path

def test_api_routes_still_win_and_unknown_api_paths_are_json_404(web):
    assert web.get("/api/health").json()["database"] == "ok"
    r = web.get("/api/does-not-exist")
    assert r.status_code == 404 and r.json() == {"detail": "Not found."} and "<html" not in r.text
    assert web.get("/api").status_code == 404
    assert web.get("/api/docs").status_code == 200                       # interactive docs still work

def test_path_traversal_cannot_leave_the_site_folder(web):
    for path in ["/../secret.txt", "/..%2fsecret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt",
                 "/assets/..%2f..%2fsecret.txt", "/....//secret.txt", "/%2e%2e%2f%2e%2e%2foutside.txt", "//etc/passwd"]:
        r = web.get(path)
        assert "TOP-SECRET" not in r.text and "OUTSIDE" not in r.text and "root:" not in r.text, path

def test_directories_are_not_listed(web):
    r = web.get("/assets")
    assert r.text == web.get("/").text                                   # just the app shell, never a file listing
    assert "Index of" not in r.text and "<li>" not in r.text

def test_strict_content_security_policy_on_pages_but_not_on_the_api(web):
    csp = web.get("/").headers["content-security-policy"]
    for part in ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "connect-src 'self'"]:
        assert part in csp
    assert "unsafe-eval" not in csp and "script-src 'self' 'unsafe" not in csp and "http" not in csp
    assert "content-security-policy" not in web.get("/api/health").headers
    assert "content-security-policy" in web.get("/assets/app-abc123.js").headers

def test_security_headers_on_pages(web):
    h = web.get("/").headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY" and "same-origin" in h["referrer-policy"]
    assert "max-age=31536000" in h["strict-transport-security"] and "camera=()" in h["permissions-policy"]

def test_without_a_built_frontend_the_api_still_works(engine, app_settings, tmp_path):
    cfg = dataclasses.replace(app_settings, frontend_dir=tmp_path / "does-not-exist")
    with TestClient(create_app(cfg, engine=engine), base_url="https://testserver") as c:
        assert c.get("/api/health").status_code == 200 and c.get("/").status_code == 404

def test_mutating_requests_to_unknown_paths_do_not_serve_the_app(web):
    assert web.post("/login", json={}).status_code == 405
