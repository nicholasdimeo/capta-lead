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
    cartella_foto: Path = CARTELLA_BASE / "dati" / "foto"

    # Sicurezza: la chiave segreta firma i token; quella di cifratura protegge i codici dei gestionali.
    chiave_segreta: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    chiave_cifratura: str = ""  # chiave Fernet (base64); se vuota viene derivata dalla chiave segreta
    durata_token_accesso_minuti: int = 30
    durata_token_rinnovo_giorni: int = 60
    durata_codici_ore: int = 48

    # Indirizzo pubblico dell'app (per i link nelle email) e origini ammesse (CORS).
    url_app: str = "http://localhost:5173"
    origini: str = "*"  # elenco separato da virgole, oppure * per tutte

    # Email transazionali: console (stampa), smtp
    posta: str = "console"
    posta_mittente: str = "Capta Lead <noreply@capta-lead.it>"
    smtp_host: str = ""
    smtp_porta: int = 587
    smtp_utente: str = ""
    smtp_password: str = ""
    smtp_tls: bool = True

    # Integrazioni con i gestionali: il lavoratore in sottofondo che invia a Plexus
    integrazioni_attive: bool = True
    integrazioni_intervallo_secondi: int = 10

    # Limiti generali
    foto_dimensione_massima_byte: int = 12 * 1024 * 1024

    @property
    def elenco_origini(self) -> list[str]:
        return [o.strip() for o in self.origini.split(",") if o.strip()]


@lru_cache
def impostazioni() -> Impostazioni:
    return Impostazioni()
