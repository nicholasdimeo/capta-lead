"""Ambiente dei test: database SQLite temporaneo, foto in una cartella temporanea, email in memoria, niente lavoratore."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

_cartella = Path(tempfile.mkdtemp(prefix="capta-test-"))
os.environ.update({
    "CAPTA_AMBIENTE": "test",
    "CAPTA_DATABASE_URL": f"sqlite:///{_cartella / 'test.db'}",
    "CAPTA_CARTELLA_FOTO": str(_cartella / "foto"),
    "CAPTA_CHIAVE_SEGRETA": "chiave-di-prova-non-usare-in-produzione",
    "CAPTA_POSTA": "console",
    "CAPTA_INTEGRAZIONI_ATTIVE": "false",
    "CAPTA_URL_APP": "https://app.prova",
})

from fastapi.testclient import TestClient  # noqa: E402

from capta_cloud import db as modulo_db  # noqa: E402
from capta_cloud import posta as modulo_posta  # noqa: E402
from capta_cloud import archivio_foto as modulo_foto  # noqa: E402
from capta_cloud.principale import crea_app  # noqa: E402


@pytest.fixture()
def client():
    """Un'app nuova con database vuoto per ogni test."""
    modulo_db.azzera_motore()
    percorso = _cartella / "test.db"
    for suffisso in ("", "-wal", "-shm"):
        try:
            (Path(str(percorso) + suffisso)).unlink()
        except FileNotFoundError:
            pass
    modulo_posta.azzera_posta()
    modulo_foto.azzera_archivio_foto()
    app = crea_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def posta():
    return modulo_posta.posta()


DISPOSITIVO = {"identificativo": "ipad-stand-1-abcdef", "nome": "iPad stand 1"}


def registra(client, azienda="SGM Pharma", email="anna@sgm.it", nome="Anna", password="segreta123"):
    r = client.post("/api/v1/auth/registrazione", json={"azienda_nome": azienda, "nome": nome, "email": email, "password": password, "dispositivo": DISPOSITIVO})
    assert r.status_code == 201, r.text
    return r.json()


def intestazioni(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def leggi_link(testo: str) -> str:
    """Estrae il codice dal link dentro un'email (…/#/verifica/<codice>)."""
    for riga in testo.splitlines():
        if "/#/" in riga:
            return riga.strip().rsplit("/", 1)[-1]
    raise AssertionError("nessun link nell'email")
