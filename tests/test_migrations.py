from alembic import command
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect

from tests.conftest import TEST_DB, alembic_cfg


def test_models_and_migrations_agree(engine):
    """`alembic check` fails if a model changed without a matching migration."""
    command.check(alembic_cfg(TEST_DB))

def test_upgrade_downgrade_roundtrip(engine):
    cfg = alembic_cfg(TEST_DB)
    command.downgrade(cfg, "base")
    assert "users" not in inspect(engine).get_table_names()
    command.upgrade(cfg, "head")
    tables = set(inspect(engine).get_table_names())
    assert {"users", "user_sessions", "datasets", "analyses", "jobs"} <= tables
    with engine.connect() as c:
        assert MigrationContext.configure(c).get_current_revision() == "0002"

def test_database_enforces_its_own_constraints(engine):
    import uuid
    uid = (lambda: uuid.uuid4().hex) if engine.dialect.name == "sqlite" else uuid.uuid4   # SQLite stores UUIDs as 32 hex chars
    import pytest
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError):
        with engine.begin() as c:
            c.execute(text("insert into users (id,email,password_hash,display_name,created_at) values (:i,'UPPER@X.COM','h','n',current_timestamp)"),
                      {"i": uid()})
    with pytest.raises(IntegrityError):
        with engine.begin() as c:
            c.execute(text("insert into datasets (id,user_id,original_filename,size_bytes,status,created_at) values (:i,:u,'f',1,'ready',current_timestamp)"),
                      {"i": uid(), "u": uid()})       # user does not exist -> foreign key
