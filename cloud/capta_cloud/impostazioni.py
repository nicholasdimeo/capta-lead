"""Impostazioni del server, lette dalle variabili d'ambiente (prefisso CAPTA_) o da un file .env.

In sviluppo funziona tutto senza configurare nulla: database SQLite nella cartella dati/, email
stampate a console, chiavi generate al volo (e quindi diverse a ogni avvio: i token scadono).
In produzione vanno impostate almeno CAPTA_CHIAVE_SEGRETA, CAPTA_CHIAVE_CIFRATURA e CAPTA_DATABASE_URL.
"""

from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

CARTELLA_BASE = Path(__file__).resolve().parent.parent


class Impostazioni(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CAPTA_", env_file=CARTELLA_BASE / ".env", extra="ignore")

    ambiente: str = "sviluppo"  # sviluppo | produzione | test
    database_url: str = f"sqlite:///{CARTELLA_BASE / 'dati' / 'capta.db'}"
    # Foto: "disco" (cartella locale), "s3" (Object Storage compatibile S3, per più server)
    # oppure "database" (dentro PostgreSQL: per gli hosting gratuiti senza disco persistente)
    archivio_foto: str = "disco"
    cartella_foto: Path = CARTELLA_BASE / "dati" / "foto"
    s3_bucket: str = ""
    s3_endpoint: str = ""  # es. https://s3.fr-par.scw.cloud
    s3_regione: str = ""
    s3_chiave: str = ""
    s3_segreto: str = ""
    s3_prefisso: str = "foto"

    # Sicurezza: la chiave segreta firma i token; quella di cifratura protegge i codici dei gestionali.
    chiave_segreta: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    chiave_cifratura: str = ""  # chiave Fernet (base64); se vuota viene derivata dalla chiave segreta
    durata_token_accesso_minuti: int = 30
    durata_token_rinnovo_giorni: int = 60
    durata_codici_ore: int = 48

    # Indirizzo pubblico dell'app (per i link nelle email) e origini ammesse (CORS).
    url_app: str = "http://localhost:5173"
    origini: str = "*"  # elenco separato da virgole, oppure * per tutte

    # Email transazionali: console (stampa), smtp, brevo (API HTTPS), resend (API HTTPS)
    posta: str = "console"
    posta_mittente: str = "Capta Lead <noreply@capta-lead.it>"
    smtp_host: str = ""
    smtp_porta: int = 587
    smtp_utente: str = ""
    smtp_password: str = ""
    smtp_tls: bool = True
    brevo_api_key: str = ""
    resend_api_key: str = ""

    # Integrazioni con i gestionali: il lavoratore in sottofondo che invia a Plexus
    integrazioni_attive: bool = True
    integrazioni_intervallo_secondi: int = 10

    # Email (o domini, scritti come "@azienda.it") che ottengono il piano "interno", senza limiti:
    # serve per la fase di test in azienda. Separati da virgola.
    email_piano_interno: str = ""

    def piano_interno_per(self, email: str) -> bool:
        email = email.strip().lower()
        for voce in (v.strip().lower() for v in self.email_piano_interno.split(",")):
            if voce and (email == voce or (voce.startswith("@") and email.endswith(voce))):
                return True
        return False

    # Limiti generali
    foto_dimensione_massima_byte: int = 12 * 1024 * 1024

    @property
    def elenco_origini(self) -> list[str]:
        return [o.strip() for o in self.origini.split(",") if o.strip()]


@lru_cache
def impostazioni() -> Impostazioni:
    return Impostazioni()
