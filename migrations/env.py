import os
from alembic import context
from backend import models  # noqa: F401  (registers the tables on Base.metadata)
from backend.database import Base, make_engine

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    # Priority: explicit url (tests) > DATABASE_URL environment variable > the default SQLite file.
    url = config.attributes.get("url") or os.environ.get("DATABASE_URL")
    if not url:
        from backend.config import settings
        url = settings.database_url
    return url


def run_migrations_online() -> None:
    engine = config.attributes.get("connection") or make_engine(_url())
    if hasattr(engine, "connect"):
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata, compare_type=not str(connection.engine.url).startswith('sqlite'))
            with context.begin_transaction():
                context.run_migrations()
    else:
        context.configure(connection=engine, target_metadata=target_metadata, compare_type=not engine.dialect.name == 'sqlite')
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
