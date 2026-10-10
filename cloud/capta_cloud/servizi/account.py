"""Funzioni comuni per account, sessioni, codici monouso e risposte /me."""

from __future__ import annotations

import re
import secrets
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..impostazioni import impostazioni
from ..modelli import Azienda, Codice, Dispositivo, Integrazione, OperazioneIntegrazione, Registro, Sessione, Utente, adesso
from ..posta import Messaggio, link_app, posta, testo
from ..schemi import AziendaOut, DispositivoIn, IntegrazioneOut, MeOut, PianoOut, TokenOut, UtenteOut
from ..sicurezza import crea_token_accesso, hash_segreto, nuovo_segreto
from . import piani


def iso(d) -> str | None:
    return d.isoformat(timespec="seconds") + "Z" if d is not None else None


def slug_azienda(db: Session, nome: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", nome.lower()).strip("-")[:60] or "azienda"
    slug = base
    while db.scalar(select(Azienda.id).where(Azienda.slug == slug)):
        slug = f"{base}-{secrets.token_hex(2)}"
    return slug


def registra(db: Session, azienda_id: int | None, utente_id: int | None, azione: str, dettagli: dict[str, Any] | None = None) -> None:
    db.add(Registro(azienda_id=azienda_id, utente_id=utente_id, azione=azione, dettagli=dettagli or {}))


def registra_dispositivo(db: Session, azienda: Azienda, utente: Utente, dati: DispositivoIn | None) -> Dispositivo | None:
    if dati is None:
        return None
    dispositivo = db.scalar(select(Dispositivo).where(Dispositivo.azienda_id == azienda.id, Dispositivo.identificativo == dati.identificativo))
    if dispositivo is None:
        dispositivo = Dispositivo(azienda_id=azienda.id, utente_id=utente.id, identificativo=dati.identificativo, nome=dati.nome)
        db.add(dispositivo)
    else:
        dispositivo.utente_id = utente.id
        if dati.nome:
            dispositivo.nome = dati.nome
        dispositivo.ultimo_accesso = adesso()
    db.flush()
    return dispositivo


def crea_sessione(db: Session, utente: Utente, dispositivo: Dispositivo | None) -> TokenOut:
    imp = impostazioni()
    segreto = nuovo_segreto()
    db.add(Sessione(utente_id=utente.id, dispositivo_id=dispositivo.id if dispositivo else None, token_hash=hash_segreto(segreto), scade_il=adesso() + timedelta(days=imp.durata_token_rinnovo_giorni)))
    db.flush()
    return TokenOut(
        token_accesso=crea_token_accesso(utente.id, utente.azienda_id, utente.ruolo, dispositivo.id if dispositivo else None),
        token_rinnovo=segreto,
        scade_in_secondi=imp.durata_token_accesso_minuti * 60,
    )


def revoca_sessioni(db: Session, utente_id: int, dispositivo_id: int | None = None) -> None:
    query = select(Sessione).where(Sessione.utente_id == utente_id, Sessione.revocata.is_(False))
    if dispositivo_id is not None:
        query = query.where(Sessione.dispositivo_id == dispositivo_id)
    for s in db.scalars(query):
        s.revocata = True


def crea_codice(db: Session, tipo: str, azienda: Azienda, email: str, utente: Utente | None = None, ruolo: str | None = None) -> str:
    """Crea un codice monouso e restituisce la versione in chiaro (da mettere nel link). Annulla i precedenti dello stesso tipo."""
    for vecchio in db.scalars(select(Codice).where(Codice.tipo == tipo, Codice.email == email, Codice.usato_il.is_(None))):
        vecchio.usato_il = adesso()
    chiaro = nuovo_segreto()
    db.add(Codice(tipo=tipo, hash=hash_segreto(chiaro), azienda_id=azienda.id, utente_id=utente.id if utente else None, email=email, ruolo=ruolo, scade_il=adesso() + timedelta(hours=impostazioni().durata_codici_ore)))
    db.flush()
    return chiaro


def trova_codice(db: Session, tipo: str, chiaro: str) -> Codice | None:
    codice = db.scalar(select(Codice).where(Codice.tipo == tipo, Codice.hash == hash_segreto(chiaro)))
    if not codice or codice.usato_il is not None or codice.scade_il < adesso():
        return None
    return codice


def invia_verifica(db: Session, azienda: Azienda, utente: Utente) -> None:
    codice = crea_codice(db, "verifica", azienda, utente.email, utente)
    app = nome_app(azienda)
    posta().invia(Messaggio(a=utente.email, oggetto=testo(utente.lingua, "verifica_oggetto", app=app), testo=testo(utente.lingua, "verifica_testo", app=app, nome=utente.nome, link=link_app(f"verifica/{codice}"))))


def nome_app(azienda: Azienda | None) -> str:
    conf = (azienda.configurazione or {}) if azienda else {}
    app = conf.get("app") if isinstance(conf, dict) else None
    if isinstance(app, dict) and isinstance(app.get("nome"), str) and app["nome"].strip():
        return app["nome"].strip()
    return "Capta Lead"


# ---------- risposte ----------


def utente_out(u: Utente) -> UtenteOut:
    return UtenteOut(id=u.id, email=u.email, nome=u.nome, ruolo=u.ruolo, lingua=u.lingua, verificato=u.verificato, attivo=u.attivo, ultimo_accesso=iso(u.ultimo_accesso))


def azienda_out(db: Session, a: Azienda) -> AziendaOut:
    return AziendaOut(
        id=a.id,
        nome=a.nome,
        slug=a.slug,
        lingua=a.lingua,
        piano=PianoOut(nome=a.piano, scadenza=iso(a.piano_scadenza), crediti_eventi=a.crediti_eventi, limiti=piani.limiti(a), utilizzo=piani.utilizzo(db, a)),
        configurazione=a.configurazione or {},
    )


def integrazione_out(db: Session, i: Integrazione) -> IntegrazioneOut:
    in_coda = db.scalar(select(func.count()).select_from(OperazioneIntegrazione).where(OperazioneIntegrazione.azienda_id == i.azienda_id, OperazioneIntegrazione.stato.in_(["in_attesa", "in_corso"]))) or 0
    in_errore = db.scalar(select(func.count()).select_from(OperazioneIntegrazione).where(OperazioneIntegrazione.azienda_id == i.azienda_id, OperazioneIntegrazione.stato == "errore")) or 0
    return IntegrazioneOut(tipo=i.tipo, url=i.url, attiva=i.attiva, stato=i.stato, ultimo_errore=i.ultimo_errore, dettagli=i.dettagli or {}, ultima_sincronizzazione=iso(i.ultima_sincronizzazione), in_coda=in_coda, in_errore=in_errore)


def me_out(db: Session, utente: Utente, azienda: Azienda) -> MeOut:
    integrazioni = [integrazione_out(db, i) for i in db.scalars(select(Integrazione).where(Integrazione.azienda_id == azienda.id))] if utente.ruolo == "amministratore" else []
    return MeOut(utente=utente_out(utente), azienda=azienda_out(db, azienda), integrazioni=integrazioni)
