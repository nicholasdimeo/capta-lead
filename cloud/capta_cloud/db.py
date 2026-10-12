"""Collegamento al database (SQLAlchemy). SQLite in sviluppo e nei test, PostgreSQL in produzione."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .impostazioni import impostazioni


class Base(DeclarativeBase):
    pass


def normalizza_url_database(url: str) -> str:
    """Gli hosting danno "postgres://…" o "postgresql://…": SQLAlchemy vuole il driver esplicito (psycopg 3)."""
    for prefisso in ("postgres://", "postgresql://"):
        if url.startswith(prefisso):
            return "postgresql+psycopg://" + url[len(prefisso):]
    return url


_motore: Engine | None = None
_Sessione: sessionmaker[Session] | None = None


def motore() -> Engine:
    global _motore, _Sessione
    if _motore is None:
        url = normalizza_url_database(impostazioni().database_url)
        argomenti = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _motore = create_engine(url, connect_args=argomenti, pool_pre_ping=True)
        if url.startswith("sqlite"):
            # SQLite: vincoli tra tabelle attivi e scritture concorrenti più tolleranti
            @event.listens_for(_motore, "connect")
            def _pragma(conn, _record):  # pragma: no cover - dipende dal driver
                cursore = conn.cursor()
                cursore.execute("PRAGMA foreign_keys=ON")
                cursore.execute("PRAGMA journal_mode=WAL")
                cursore.execute("PRAGMA busy_timeout=5000")
                cursore.close()

        _Sessione = sessionmaker(bind=_motore, autoflush=False, expire_on_commit=False)
    return _motore


def fabbrica_sessioni() -> sessionmaker[Session]:
    motore()
    assert _Sessione is not None
    return _Sessione


def sessione() -> Iterator[Session]:
    """Dipendenza FastAPI: una sessione per richiesta, chiusa alla fine."""
    s = fabbrica_sessioni()()
    try:
        yield s
    finally:
        s.close()


def crea_tabelle() -> None:
    """Crea le tabelle mancanti (sviluppo e test; in produzione si usano le migrazioni Alembic)."""
    from . import modelli  # noqa: F401  (registra i modelli)

    Base.metadata.create_all(motore())


def azzera_motore() -> None:
    """Chiude il motore corrente (usato dai test per cambiare database)."""
    global _motore, _Sessione
    if _motore is not None:
        _motore.dispose()
    _motore = None
    _Sessione = None
