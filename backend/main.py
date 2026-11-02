"""FastAPI application factory.  Run:  uvicorn backend.main:app  (needs DATABASE_URL, see .env.example)"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text

from .auth import LoginThrottle
from .config import Settings, settings as default_settings
from .database import make_engine, make_sessionmaker
from .processing import cleanup_stale
from .frames import FrameCache
from .jobs import BundleProvider
from .routes import analytics_routes, auth_routes, dataset_routes, history_routes, ml_routes
from .storage import Storage

log = logging.getLogger("complainiq")
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
# Strict policy for the app's own pages: only our own scripts, no inline scripts, no third-party anything.
# 'unsafe-inline' is allowed for STYLES only (the chart library sets inline style attributes).
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


def mount_frontend(app: FastAPI, dist: Path) -> bool:
    """Serve the built single-page app. Unknown paths return index.html (client-side routing), but unknown
    files (a missing .js, .png...) and unknown /api paths return a real 404. Nothing outside `dist` is reachable."""
    root = dist.resolve()
    index = root / "index.html"
    if not index.is_file():
        return False

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found."}, status_code=404)
        candidate = (root / full_path).resolve()
        if full_path and candidate != root and root in candidate.parents and candidate.is_file():
            hashed = candidate.parent.name == "assets"
            cache = "public, max-age=31536000, immutable" if hashed else "public, max-age=3600"
            return FileResponse(candidate, headers={"Cache-Control": cache})
        if "." in full_path.rsplit("/", 1)[-1]:
            return JSONResponse({"detail": "Not found."}, status_code=404)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return True


def create_app(settings: Settings | None = None, engine=None) -> FastAPI:
    settings = settings or default_settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        eng = engine or make_engine(settings.database_url)
        app.state.engine, app.state.settings = eng, settings
        app.state.sessionmaker = make_sessionmaker(eng)
        app.state.storage = Storage(settings.storage_dir)
        app.state.throttle = LoginThrottle()
        app.state.frame_cache = FrameCache()
        app.state.bundles = BundleProvider(settings)
        try:
            log.info("Start-up cleanup: %s", cleanup_stale(app.state.sessionmaker, app.state.storage, settings))
        except Exception:
            log.exception("Start-up cleanup skipped")
        yield
        if engine is None:
            eng.dispose()

    app = FastAPI(title=f"{settings.app_name} API", version="0.4.0", lifespan=lifespan,
                  docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")

    @app.middleware("http")
    async def security(request: Request, call_next):
        # 1. CSRF defence (on top of SameSite=Lax cookies): a browser-sent Origin must be this site or allow-listed
        if request.method in UNSAFE:
            origin = request.headers.get("origin")
            if origin and urlparse(origin).netloc != request.headers.get("host") and origin not in settings.allowed_origins:
                return JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)
        # 2. refuse oversized uploads before reading the body
        if request.method == "POST" and request.url.path == "/api/datasets":
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > settings.max_upload_bytes + 1024 * 1024:
                return JSONResponse({"detail": f"File is too large. The limit is {settings.max_upload_mb} MB."}, status_code=413)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        else:
            response.headers.setdefault("Content-Security-Policy", CSP)
            response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if settings.cookie_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Something went wrong on the server."}, status_code=500)

    @app.get("/api/health", tags=["system"])
    def health(request: Request):
        s = request.app.state.settings
        files = {"model": s.model_path.exists(), "vectorizer": s.vectorizer_path.exists()}
        try:
            with request.app.state.engine.connect() as c:
                c.execute(text("select 1"))
            db = "ok"
        except Exception:
            db = "unavailable"
        body = {"status": "ok" if db == "ok" else "degraded", "database": db, "model_files": files}
        return JSONResponse(body, status_code=200 if db == "ok" else 503)

    app.include_router(auth_routes.router)
    app.include_router(dataset_routes.router)
    app.include_router(analytics_routes.router)
    app.include_router(ml_routes.router)
    app.include_router(history_routes.router)
    mount_frontend(app, settings.frontend_dir)       # last, so the catch-all never hides an API route
    return app


def get_app() -> FastAPI:        # for `uvicorn backend.main:get_app --factory`
    return create_app()


try:                             # `uvicorn backend.main:app` works when DATABASE_URL is configured
    app = create_app()
except Exception:                # pragma: no cover - importing must not fail in tools/tests without config
    app = None
