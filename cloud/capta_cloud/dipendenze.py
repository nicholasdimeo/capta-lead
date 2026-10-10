"""Dipendenze comuni delle API: chi sta chiamando, e con quale ruolo."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .db import sessione
from .modelli import Azienda, Utente
from .sicurezza import leggi_token_accesso


@dataclass
class Contesto:
    utente: Utente
    azienda: Azienda
    dispositivo_id: int | None
    db: Session

    @property
    def amministratore(self) -> bool:
        return self.utente.ruolo == "amministratore"


def errore(codice: int, spiegazione: str, tipo: str | None = None) -> HTTPException:
    dettaglio: dict[str, str] = {"errore": spiegazione}
    if tipo:
        dettaglio["tipo"] = tipo
    return HTTPException(status_code=codice, detail=dettaglio)


def contesto(authorization: str | None = Header(default=None), db: Session = Depends(sessione)) -> Contesto:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise errore(401, "token mancante", "token_mancante")
    corpo = leggi_token_accesso(authorization[7:].strip())
    if not corpo:
        raise errore(401, "token non valido o scaduto", "token_non_valido")
    utente = db.get(Utente, int(corpo["sub"]))
    if not utente or not utente.attivo:
        raise errore(401, "account non attivo", "token_non_valido")
    azienda = db.get(Azienda, utente.azienda_id)
    if not azienda or not azienda.attiva:
        raise errore(403, "azienda non attiva", "azienda_non_attiva")
    return Contesto(utente=utente, azienda=azienda, dispositivo_id=corpo.get("disp"), db=db)


def solo_amministratore(c: Contesto = Depends(contesto)) -> Contesto:
    if not c.amministratore:
        raise errore(403, "serve il ruolo di amministratore", "permesso_negato")
    return c
