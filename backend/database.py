"""Database engine / session helpers (SQLAlchemy 2.0).

Default: a single SQLite file (no server to install). PostgreSQL still works if DATABASE_URL points at one.
"""
from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(url: str | None) -> Engine:
    if not url:
        raise RuntimeError("DATABASE_URL is not set. Leave it unset to use the default SQLite file, or set it "
                           "(for example sqlite:///storage/app.db or postgresql+psycopg://user:password@host:5432/dbname).")
    if url.startswith("sqlite"):
        # Background jobs (sentiment / prediction) use their own threads, so allow cross-thread use.
        engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection, _record):     # SQLite ignores foreign keys unless asked
            cur = dbapi_connection.cursor()
            cur.execute("PRAGMA foreign_keys=ON")           # needed for ON DELETE CASCADE
            cur.execute("PRAGMA journal_mode=WAL")          # readers do not block the job thread's writes
            cur.execute("PRAGMA busy_timeout=30000")
            cur.close()
        return engine
    if url.startswith("postgresql://"):          # make plain URLs use the psycopg v3 driver
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


def make_sessionmaker(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
