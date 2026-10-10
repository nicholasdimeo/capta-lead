"""Piani e limiti. I numeri di partenza stanno qui, in un posto solo."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..modelli import Azienda, Evento, Lead, Utente, adesso

# None = illimitato
LIMITI: dict[str, dict[str, int | None]] = {
    "prova": {"utenti": 1, "eventi_attivi": 1, "lead_per_evento": 50},
    "evento": {"utenti": None, "eventi_attivi": None, "lead_per_evento": None},
    "annuale": {"utenti": None, "eventi_attivi": None, "lead_per_evento": None},
    "interno": {"utenti": None, "eventi_attivi": None, "lead_per_evento": None},
}


def limiti(azienda: Azienda) -> dict[str, int | None]:
    return dict(LIMITI.get(azienda.piano, LIMITI["prova"]))


def piano_scaduto(azienda: Azienda, ora: datetime | None = None) -> bool:
    if azienda.piano != "annuale" or azienda.piano_scadenza is None:
        return False
    return azienda.piano_scadenza < (ora or adesso())


def utilizzo(db: Session, azienda: Azienda) -> dict[str, int]:
    utenti = db.scalar(select(func.count()).select_from(Utente).where(Utente.azienda_id == azienda.id, Utente.attivo.is_(True))) or 0
    eventi_attivi = db.scalar(select(func.count()).select_from(Evento).where(Evento.azienda_id == azienda.id, Evento.archiviato.is_(False))) or 0
    lead = db.scalar(select(func.count()).select_from(Lead).where(Lead.azienda_id == azienda.id, Lead.eliminata.is_(False))) or 0
    return {"utenti": utenti, "eventi_attivi": eventi_attivi, "lead": lead}


def puo_aggiungere_utente(db: Session, azienda: Azienda) -> str | None:
    massimo = limiti(azienda)["utenti"]
    if massimo is None:
        return None
    if utilizzo(db, azienda)["utenti"] >= massimo:
        return f"Il piano {azienda.piano} prevede al massimo {massimo} utente/i."
    return None


def puo_creare_evento(db: Session, azienda: Azienda) -> str | None:
    """Restituisce il motivo se non si può creare un nuovo evento. Il piano 'evento' consuma un credito."""
    if piano_scaduto(azienda):
        return "L'abbonamento annuale è scaduto: rinnovalo per creare nuovi eventi."
    if azienda.piano == "evento" and azienda.crediti_eventi <= 0:
        return "Nessun evento disponibile: acquista un evento per continuare."
    massimo = limiti(azienda)["eventi_attivi"]
    if massimo is not None and utilizzo(db, azienda)["eventi_attivi"] >= massimo:
        return f"Il piano {azienda.piano} prevede al massimo {massimo} evento/i attivo/i: archivia quello in corso o passa a un piano superiore."
    return None


def consuma_credito_evento(azienda: Azienda) -> None:
    if azienda.piano == "evento" and azienda.crediti_eventi > 0:
        azienda.crediti_eventi -= 1


def puo_aggiungere_lead(db: Session, azienda: Azienda, evento: Evento) -> str | None:
    massimo = limiti(azienda)["lead_per_evento"]
    if massimo is None:
        return None
    n = db.scalar(select(func.count()).select_from(Lead).where(Lead.evento_id == evento.id, Lead.eliminata.is_(False))) or 0
    if n >= massimo:
        return f"Il piano {azienda.piano} prevede al massimo {massimo} contatti per evento."
    return None
