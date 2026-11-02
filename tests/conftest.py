import sys
from pathlib import Path
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import preprocessing as pp  # noqa: E402

SAMPLE_ROWS = [
    # Date received, Product, Issue, Sub-issue, Narrative, Complaint ID
    ("01/05/2016", "Mortgage", "Loan servicing", "Escrow", "The bank was terrible and I am very angry about the fees", "1"),
    ("01/20/2016", "Mortgage", "Loan servicing", "", "", "2"),
    ("02/10/2016", "Credit card", "Billing dispute", "Fee", "Great help from the agent, thank you so much", "3"),
    ("02/11/2016", "Credit card", "Billing dispute", "Fee", "N/A", "4"),
    ("03/15/2016", "Debt collection", "Harassment", "Calls", "They call me every day and it is awful", "5"),
    ("not a date", "Debt collection", "Harassment", "Calls", "", "6"),
]
HEADER = "Date received,Product,Issue,Sub-issue,Consumer complaint narrative,Complaint ID\n"


def write_csv(path: Path, rows=SAMPLE_ROWS, header=HEADER, encoding="utf-8") -> Path:
    lines = [header] + [",".join(f'"{c}"' for c in r) + "\n" for r in rows]
    path.write_text("".join(lines), encoding=encoding)
    return path


@pytest.fixture
def sample_csv(tmp_path):
    return write_csv(tmp_path / "sample.csv")


@pytest.fixture
def cleaned(sample_csv):
    df, _ = pp.load_dataset(sample_csv)
    out, rep = pp.clean_dataset(df)
    return out


@pytest.fixture(scope="session")
def bundle():
    from backend import prediction
    return prediction.load_bundle()


# ======================================================================
# API fixtures (a throw-away SQLite file per test session; no database server needed)
# ======================================================================
import os  # noqa: E402

# Optional override, e.g. TEST_DATABASE_URL=postgresql+psycopg://... to also test against PostgreSQL.
_TEST_DB_OVERRIDE = os.environ.get("TEST_DATABASE_URL")
TEST_DB = _TEST_DB_OVERRIDE or "sqlite:///" + (Path(__file__).resolve().parent / ".test_db" / "test.db").as_posix()


def alembic_cfg(url):
    from alembic.config import Config
    cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parent.parent / "migrations"))
    cfg.attributes["url"] = url
    return cfg


@pytest.fixture(scope="session")
def engine():
    from sqlalchemy import text
    from alembic import command
    from backend.database import make_engine
    if TEST_DB.startswith("sqlite"):
        db_file = Path(TEST_DB.replace("sqlite:///", "", 1))
        db_file.parent.mkdir(parents=True, exist_ok=True)
        for suffix in ("", "-wal", "-shm"):             # always start from an empty database
            Path(str(db_file) + suffix).unlink(missing_ok=True)
    eng = make_engine(TEST_DB)
    try:
        with eng.connect() as c:
            c.execute(text("select 1"))
    except Exception as exc:
        pytest.skip(f"Test database not reachable ({type(exc).__name__}). Set TEST_DATABASE_URL.")
    if eng.dialect.name == "postgresql":
        with eng.begin() as c:
            c.execute(text("drop schema public cascade"))
            c.execute(text("create schema public"))
    command.upgrade(alembic_cfg(TEST_DB), "head")     # build the schema with the real migrations
    yield eng
    eng.dispose()


@pytest.fixture
def app_settings(tmp_path):
    from backend.config import Settings
    return Settings(database_url=TEST_DB, storage_dir=tmp_path / "storage", cookie_secure=True,
                    max_upload_mb=1, max_datasets_per_user=3)


@pytest.fixture
def make_client(engine, app_settings):
    """Factory: each client has its own cookie jar (= a separate browser) on the same app."""
    from sqlalchemy import text
    from fastapi.testclient import TestClient
    from backend.main import create_app
    with engine.begin() as c:
        for table in ("jobs", "analyses", "datasets", "user_sessions", "users"):      # children first
            c.execute(text(f"delete from {table}"))
    app = create_app(app_settings, engine=engine)
    clients = []
    def _make():
        c = TestClient(app, base_url="https://testserver")
        c.__enter__()
        clients.append(c)
        return c
    _make.app = app
    _make.settings = app_settings
    yield _make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client):
    return make_client()


STRONG_PW = "correct horse battery"


def register(c, email="alice@example.com", password=STRONG_PW, name="Alice"):
    return c.post("/api/auth/register", json={"email": email, "password": password, "display_name": name})


def upload(c, path_or_bytes, name="complaints.csv", content_type="text/csv"):
    data = path_or_bytes.read_bytes() if isinstance(path_or_bytes, Path) else path_or_bytes
    return c.post("/api/datasets", files={"file": (name, data, content_type)})


# ---- richer dataset for analytics tests: 36 months, one issue ("Fraud or scam") rising in the last year
PAIRS = [("Mortgage", "Loan modification,collection,foreclosure"), ("Credit card", "Late fee"),
         ("Money transfers", "Fraud or scam"), ("Credit reporting", "Incorrect information on credit report")]
NARRATIVES = {
    "Mortgage": "My mortgage servicer lost my escrow payment and the foreclosure notice came anyway",
    "Credit card": "The credit card company charged a late fee even though I paid my statement on time",
    "Money transfers": "The money transfer service scam took my funds and I am furious, this was awful and terrible",
    "Credit reporting": "The credit bureau still shows incorrect information on my credit report after my dispute"}


def make_rich_rows(per_month=25, seed=0):
    import numpy as np
    rng = np.random.default_rng(seed)
    rows, n = [], 0
    for m in pd.period_range("2014-01", "2016-12", freq="M"):
        p = [0.10, 0.20, 0.25, 0.45] if m.year == 2016 else [0.30, 0.20, 0.05, 0.45]
        for k in rng.choice(4, per_month, p=p):
            n += 1
            prod, issue = PAIRS[k]
            day = 31 if (m == pd.Period("2016-12") and per_month and n % per_month == 1) else int(rng.integers(1, 28))   # data reaches month-end
            text = NARRATIVES[prod] + (" thank you for the great help" if rng.random() < 0.3 and k != 2 else "")
            if rng.random() < 0.25:
                text = ""                                        # about a quarter have no narrative
            sub = "Account takeover" if k == 2 and rng.random() < 0.6 else ""
            rows.append((f"{m.month:02d}/{day:02d}/{m.year}", prod, issue, sub, text, str(n)))
    return rows


@pytest.fixture
def rich_csv(tmp_path):
    return write_csv(tmp_path / "rich.csv", make_rich_rows())


@pytest.fixture
def rich_df(rich_csv):
    return pd.read_csv(rich_csv, dtype=str, keep_default_na=False)


# ---- helpers for the few tests that use raw SQL (SQLite stores UUIDs as hex text and datetimes as UTC text)
def sqlv(engine, value):
    """Make a Python value safe to bind in a raw `text()` statement on either database."""
    import uuid
    from datetime import datetime, timezone
    if engine.dialect.name == "sqlite":
        if isinstance(value, uuid.UUID):
            return value.hex
        if isinstance(value, datetime):
            if value.tzinfo:
                value = value.astimezone(timezone.utc).replace(tzinfo=None)
            return value.isoformat(sep=" ", timespec="microseconds")
    return value


def as_dt(value):
    """A datetime read through raw SQL -> timezone-aware UTC datetime (SQLite returns text)."""
    from datetime import datetime, timezone
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
