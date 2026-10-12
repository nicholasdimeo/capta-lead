"""Impostazioni per gli hosting gratuiti: foto nel database e indirizzi PostgreSQL."""

import io

from conftest import intestazioni, registra

from capta_cloud import archivio_foto as modulo_foto
from capta_cloud.db import normalizza_url_database
from capta_cloud.impostazioni import impostazioni


def test_indirizzi_postgres_degli_hosting():
    assert normalizza_url_database("postgres://u:p@host/db?sslmode=require") == "postgresql+psycopg://u:p@host/db?sslmode=require"
    assert normalizza_url_database("postgresql://u:p@host/db") == "postgresql+psycopg://u:p@host/db"
    assert normalizza_url_database("postgresql+psycopg://u:p@host/db") == "postgresql+psycopg://u:p@host/db"
    assert normalizza_url_database("sqlite:///x.db") == "sqlite:///x.db"


def test_foto_salvate_nel_database(client, monkeypatch):
    import shutil

    shutil.rmtree(impostazioni().cartella_foto, ignore_errors=True)  # foto lasciate da altri test
    monkeypatch.setattr(impostazioni(), "archivio_foto", "database")
    modulo_foto.azzera_archivio_foto()
    try:
        admin = registra(client)
        h = intestazioni(admin["token"]["token_accesso"])
        evento = client.post("/api/v1/eventi", json={"uuid": "evento-0001-abcd", "nome": "Fiera"}, headers=h).json()["evento"]
        lead = client.post(f"/api/v1/eventi/{evento['id']}/lead", json={"uuid": "lead-0001-abcd", "nome": "Anna"}, headers=h).json()["lead"]
        contenuto = b"\xff\xd8\xff" + b"1" * 500
        r = client.post(f"/api/v1/lead/{lead['id']}/foto", files={"file": ("b.jpg", io.BytesIO(contenuto), "image/jpeg")}, data={"tipo": "biglietto", "uuid": "foto-0001-abcd"}, headers=h)
        assert r.status_code == 201
        assert not any(impostazioni().cartella_foto.rglob("*.jpg"))  # niente su disco
        r = client.get(f"/api/v1/lead/{lead['id']}/foto/{r.json()['foto_id']}", headers=h)
        assert r.status_code == 200 and r.content == contenuto
    finally:
        modulo_foto.azzera_archivio_foto()


def test_piano_interno_per_le_email_indicate(client, monkeypatch):
    monkeypatch.setattr(impostazioni(), "email_piano_interno", "@sgmpharma.it, capo@altro.it")
    sgm = registra(client, email="anna@SGMpharma.it")
    assert sgm["me"]["azienda"]["piano"]["nome"] == "interno"
    altro = registra(client, azienda="Altra Srl", email="mario@altro.it")
    assert altro["me"]["azienda"]["piano"]["nome"] == "prova"
    # aggiunta dopo: al successivo accesso l'azienda passa al piano interno
    monkeypatch.setattr(impostazioni(), "email_piano_interno", "@sgmpharma.it, mario@altro.it")
    r = client.post("/api/v1/auth/accesso", json={"email": "mario@altro.it", "password": "segreta123"})
    assert r.json()["me"]["azienda"]["piano"]["nome"] == "interno"
