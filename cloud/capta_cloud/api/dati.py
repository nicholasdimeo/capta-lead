"""Eventi, lead e foto: le API usate dall'app allo stand. Stessa forma del contratto Plexus 1.1,
così l'app usa lo stesso motore di sincronizzazione; in più: chi ha registrato ogni contatto e lo stato nel gestionale."""

from __future__ import annotations

import re
import uuid as uuid_lib
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select

from .. import VERSIONE_API
from ..dipendenze import Contesto, contesto, errore
from ..impostazioni import impostazioni
from ..modelli import Evento, Foto, Lead, Utente, adesso
from ..schemi import EventoIn, EventoModificaIn, LeadIn, QuestionarioIn
from ..servizi import account, integrazioni, piani
from ..archivio_foto import archivio_foto

router = APIRouter(tags=["dati"])

TIPI_FOTO = ("biglietto", "volto", "altro")
MIME_FOTO = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif"}
STATI_LEAD = ("nuova", "bozza", "approvata", "inviata", "risposta", "scartata")


def _iso(d: datetime | None) -> str | None:
    return account.iso(d)


def _scheda_evento(db, e: Evento, con_conteggi: bool = False) -> dict[str, Any]:
    scheda: dict[str, Any] = {
        "id": e.id, "uuid_app": e.uuid, "nome": e.nome, "luogo": e.luogo, "data_inizio": e.data_inizio, "data_fine": e.data_fine,
        "note": e.note, "lingua": e.lingua, "linea": e.linea, "ringraziamento_attivo": e.ringraziamento_attivo, "archiviato": e.archiviato,
        "questionario": e.questionario or [], "categorie_suggerite": e.categorie_suggerite or [],
        "creato_da": e.creato_da, "creato_il": _iso(e.creato_il), "aggiornato_il": _iso(e.aggiornato_il), "gestionale_id": e.gestionale_id,
    }
    if con_conteggi:
        conteggi = {s: 0 for s in STATI_LEAD}
        totale = 0
        for stato, n in db.execute(select(Lead.stato, func.count()).where(Lead.evento_id == e.id, Lead.eliminata.is_(False)).group_by(Lead.stato)):
            conteggi[stato] = n
            totale += n
        scheda["conteggi"] = conteggi
        scheda["totale_lead"] = totale
    return scheda


def _lead_out(db, l: Lead, nomi: dict[int, str]) -> dict[str, Any]:
    n_foto = db.scalar(select(func.count()).select_from(Foto).where(Foto.lead_id == l.id)) or 0
    return {
        "id": l.id, "uuid": l.uuid, "evento_id": l.evento_id, "nome": l.nome, "cognome": l.cognome, "email": l.email, "telefono": l.telefono,
        "azienda": l.azienda, "professione": l.professione, "citta": l.citta, "provincia": l.provincia, "indirizzo": l.indirizzo, "note": l.note,
        "lingua": l.lingua, "consenso": l.consenso, "categoria": l.categoria, "risposte": l.risposte or {}, "stato": l.gestionale_stato or l.stato,
        "origine": l.origine, "creato_il": _iso(l.creato_il), "aggiornato_il": _iso(l.aggiornato_il), "n_foto": n_foto,
        "registrata_da": {"id": l.registrata_da, "nome": nomi.get(l.registrata_da or -1, "")} if l.registrata_da else None,
        "gestionale": {"id": l.gestionale_id, "stato": l.gestionale_stato} if l.gestionale_id else None,
        "ringraziamento": {"esito": l.ringraziamento_esito, "inviato_il": _iso(l.ringraziamento_inviato_il), "dettaglio": l.ringraziamento_dettaglio or ""},
    }


def _nomi_utenti(db, azienda_id: int) -> dict[int, str]:
    return {u.id: u.nome for u in db.scalars(select(Utente).where(Utente.azienda_id == azienda_id))}


def _evento_di(c: Contesto, evento_id: int) -> Evento:
    e = c.db.get(Evento, evento_id)
    if not e or e.azienda_id != c.azienda.id:
        raise errore(404, "evento inesistente")
    return e


def _questionario_valido(q: list[Any] | None) -> list[dict[str, Any]] | None:
    if q is None:
        return None
    esito = []
    for d in q:
        voce = d.model_dump(exclude_none=True) if hasattr(d, "model_dump") else dict(d)
        if len(voce.get("opzioni", [])) < 2:
            raise errore(400, f"la domanda «{voce.get('domanda', '')}» ha meno di due opzioni")
        esito.append(voce)
    return esito


def _email_valida(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", email))


# ---------- stato ----------


@router.get("/stato")
def stato(c: Contesto = Depends(contesto)) -> dict[str, Any]:
    integrazione = integrazioni.integrazione_attiva(c.db, c.azienda.id)
    conf = c.azienda.configurazione or {}
    return {
        "api": VERSIONE_API, "piattaforma": "Capta Cloud", "azienda": c.azienda.nome,
        "utente": {"nome": c.utente.nome, "email": c.utente.email, "ruolo": c.utente.ruolo},
        "posta_lead_pronta": bool(integrazione and (integrazione.dettagli or {}).get("posta_lead_pronta")),
        "ai_pronta": False,
        "lingue": (conf.get("lingue") or {}).get("disponibili") or {"it": "italiano", "en": "inglese"},
        "linee": {k: (v if isinstance(v, str) else (v.get("it") if isinstance(v, dict) else k)) for k, v in (conf.get("linee") or {}).items()},
        "tipi_foto": list(TIPI_FOTO),
        "gestionale": {"tipo": integrazione.tipo, "stato": integrazione.stato} if integrazione else None,
    }


# ---------- eventi ----------


@router.get("/eventi")
def eventi(archiviati: int = 0, c: Contesto = Depends(contesto)) -> dict[str, Any]:
    query = select(Evento).where(Evento.azienda_id == c.azienda.id)
    if not archiviati:
        query = query.where(Evento.archiviato.is_(False))
    return {"eventi": [_scheda_evento(c.db, e, con_conteggi=True) for e in c.db.scalars(query.order_by(Evento.data_inizio.desc(), Evento.id.desc()))]}


@router.post("/eventi", status_code=201)
def crea_evento(dati: EventoIn, c: Contesto = Depends(contesto)) -> Any:
    from fastapi.responses import JSONResponse

    e = c.db.scalar(select(Evento).where(Evento.azienda_id == c.azienda.id, Evento.uuid == dati.uuid))
    questionario = _questionario_valido(dati.questionario)
    creato = e is None
    if creato:
        motivo = piani.puo_creare_evento(c.db, c.azienda)
        if motivo:
            raise errore(402, motivo, "limite_piano")
        e = Evento(uuid=dati.uuid, azienda_id=c.azienda.id, nome=dati.nome, creato_da=c.utente.id)
        c.db.add(e)
        piani.consuma_credito_evento(c.azienda)
    assert e is not None
    e.nome, e.luogo, e.data_inizio, e.data_fine, e.note, e.lingua, e.linea = dati.nome, dati.luogo, dati.data_inizio, dati.data_fine, dati.note, dati.lingua, dati.linea
    if dati.ringraziamento_attivo is not None:
        e.ringraziamento_attivo = dati.ringraziamento_attivo
    if dati.categorie_suggerite is not None:
        e.categorie_suggerite = [x for x in dati.categorie_suggerite if x]
    if questionario is not None:
        e.questionario = questionario
    elif creato:
        e.questionario = (c.azienda.configurazione or {}).get("questionario_predefinito") or []
        e.categorie_suggerite = e.categorie_suggerite or (c.azienda.configurazione or {}).get("categorie_predefinite") or []
    c.db.flush()
    integrazioni.accoda(c.db, c.azienda.id, "invia_evento", e.id)
    account.registra(c.db, c.azienda.id, c.utente.id, "evento_creato" if creato else "evento_aggiornato", {"evento": e.id, "nome": e.nome})
    c.db.commit()
    return JSONResponse(status_code=201 if creato else 200, content={"evento": _scheda_evento(c.db, e), "creato": creato})


@router.get("/eventi/{evento_id}")
def evento(evento_id: int, c: Contesto = Depends(contesto)) -> dict[str, Any]:
    return {"evento": _scheda_evento(c.db, _evento_di(c, evento_id), con_conteggi=True)}


@router.put("/eventi/{evento_id}")
def modifica_evento(evento_id: int, dati: EventoModificaIn, c: Contesto = Depends(contesto)) -> dict[str, Any]:
    e = _evento_di(c, evento_id)
    questionario = _questionario_valido(dati.questionario)
    for campo in ("nome", "luogo", "data_inizio", "data_fine", "note", "lingua", "linea", "ringraziamento_attivo"):
        valore = getattr(dati, campo)
        if valore is not None:
            setattr(e, campo, valore)
    if dati.categorie_suggerite is not None:
        e.categorie_suggerite = [x for x in dati.categorie_suggerite if x]
    if questionario is not None:
        e.questionario = questionario
    if dati.archiviato is not None and dati.archiviato != e.archiviato:
        if not dati.archiviato:
            motivo = piani.puo_creare_evento(c.db, c.azienda)
            if motivo:
                raise errore(402, motivo, "limite_piano")
        e.archiviato = dati.archiviato
    integrazioni.accoda(c.db, c.azienda.id, "invia_evento", e.id)
    account.registra(c.db, c.azienda.id, c.utente.id, "evento_aggiornato", {"evento": e.id, "archiviato": e.archiviato})
    c.db.commit()
    return {"evento": _scheda_evento(c.db, e)}


@router.put("/eventi/{evento_id}/questionario")
def modifica_questionario(evento_id: int, dati: QuestionarioIn, c: Contesto = Depends(contesto)) -> dict[str, Any]:
    e = _evento_di(c, evento_id)
    e.questionario = _questionario_valido(dati.questionario) or []
    integrazioni.accoda(c.db, c.azienda.id, "invia_evento", e.id)
    c.db.commit()
    return {"questionario": e.questionario}


# ---------- lead ----------


@router.get("/eventi/{evento_id}/lead")
def lead_di_evento(evento_id: int, da: str | None = None, c: Contesto = Depends(contesto)) -> dict[str, Any]:
    e = _evento_di(c, evento_id)
    query = select(Lead).where(Lead.evento_id == e.id, Lead.eliminata.is_(False))
    if da:
        try:
            query = query.where(Lead.aggiornato_il >= datetime.fromisoformat(da.rstrip("Z")))
        except ValueError:
            raise errore(400, "parametro 'da' non valido: usa una data ISO")
    nomi = _nomi_utenti(c.db, c.azienda.id)
    return {"lead": [_lead_out(c.db, l, nomi) for l in c.db.scalars(query.order_by(Lead.creato_il))]}


@router.post("/eventi/{evento_id}/lead")
def crea_lead(evento_id: int, dati: LeadIn, c: Contesto = Depends(contesto)) -> Any:
    from fastapi.responses import JSONResponse

    e = _evento_di(c, evento_id)
    email = dati.email.strip().lower()
    if email and not _email_valida(email):
        raise errore(400, "email non valida", "email_non_valida")
    l = c.db.scalar(select(Lead).where(Lead.azienda_id == c.azienda.id, Lead.uuid == dati.uuid))
    creata = l is None
    if creata:
        motivo = piani.puo_aggiungere_lead(c.db, c.azienda, e)
        if motivo:
            raise errore(402, motivo, "limite_piano")
        l = Lead(uuid=dati.uuid, azienda_id=c.azienda.id, evento_id=e.id, registrata_da=c.utente.id, dispositivo_id=c.dispositivo_id)
        c.db.add(l)
    assert l is not None
    if l.evento_id != e.id:
        raise errore(400, "la lead appartiene a un altro evento")
    for campo in ("nome", "cognome", "telefono", "azienda", "professione", "citta", "provincia", "indirizzo", "note", "categoria"):
        setattr(l, campo, getattr(dati, campo))
    l.email = email
    l.lingua = dati.lingua or None
    consenso = dati.consenso
    if consenso in (True, "S", "s", "true"):
        l.consenso = "S"
    elif consenso in (False, "N", "n", "false"):
        l.consenso = "N"
    else:
        l.consenso = _consenso_dalle_risposte(e, dati.risposte)
    l.risposte = {k: (v if isinstance(v, list) else v) for k, v in dati.risposte.items()}
    l.aggiornata_da = c.utente.id
    l.eliminata = False
    c.db.flush()
    integrazione = integrazioni.integrazione_attiva(c.db, c.azienda.id)
    integrazioni.accoda(c.db, c.azienda.id, "invia_lead", l.id)
    # la mail di ringraziamento la manda il gestionale (Plexus) quando riceve la lead dal cloud
    if l.ringraziamento_esito in (None, "saltato") or creata:
        if not e.ringraziamento_attivo:
            esito, dettaglio = "saltato", "ringraziamento spento per l'evento"
        elif not l.email:
            esito, dettaglio = "saltato", "contatto senza email"
        elif integrazione is None:
            esito, dettaglio = "saltato", "nessun gestionale collegato"
        elif l.ringraziamento_esito != "inviato":
            esito, dettaglio = "in_attesa", "in attesa dell'invio da parte del gestionale"
        else:
            esito, dettaglio = l.ringraziamento_esito, l.ringraziamento_dettaglio
        if l.ringraziamento_esito != "inviato":
            l.ringraziamento_esito, l.ringraziamento_dettaglio = esito, dettaglio
    account.registra(c.db, c.azienda.id, c.utente.id, "lead_creata" if creata else "lead_aggiornata", {"lead": l.id, "evento": e.id})
    c.db.commit()
    nomi = _nomi_utenti(c.db, c.azienda.id)
    risposta = {"lead": _lead_out(c.db, l, nomi), "creata": creata, "ringraziamento": {"esito": l.ringraziamento_esito or "saltato", "dettaglio": l.ringraziamento_dettaglio or ""}}
    return JSONResponse(status_code=201 if creata else 200, content=risposta)


def _consenso_dalle_risposte(e: Evento, risposte: dict[str, Any]) -> str | None:
    for d in e.questionario or []:
        if d.get("consenso"):
            r = risposte.get(d.get("domanda"))
            if r is None or r == "" or r == []:
                return None
            valore = r[0] if isinstance(r, list) else str(r)
            prima = str(valore).strip().lower().split(" ")[0]
            if prima in ("si", "sì", "sí", "yes", "ja", "oui"):
                return "S"
            if prima in ("no", "nein", "non"):
                return "N"
            opzioni = d.get("opzioni") or []
            if opzioni and valore == opzioni[0]:
                return "S"
            if len(opzioni) > 1 and valore == opzioni[1]:
                return "N"
            return None
    return None


@router.delete("/lead/{lead_id}")
def elimina_lead(lead_id: int, c: Contesto = Depends(contesto)) -> dict[str, bool]:
    l = c.db.get(Lead, lead_id)
    if not l or l.azienda_id != c.azienda.id:
        raise errore(404, "lead inesistente")
    if not c.amministratore and l.registrata_da != c.utente.id:
        raise errore(403, "solo chi ha registrato il contatto, o un amministratore, può eliminarlo", "permesso_negato")
    l.eliminata = True
    account.registra(c.db, c.azienda.id, c.utente.id, "lead_eliminata", {"lead": l.id})
    c.db.commit()
    return {"ok": True}


# ---------- foto ----------


def _lead_di(c: Contesto, lead_id: int) -> Lead:
    l = c.db.get(Lead, lead_id)
    if not l or l.azienda_id != c.azienda.id or l.eliminata:
        raise errore(404, "lead inesistente")
    return l


@router.post("/lead/{lead_id}/foto")
async def carica_foto(lead_id: int, file: UploadFile = File(...), tipo: str = Form("altro"), uuid: str | None = Form(None), c: Contesto = Depends(contesto)) -> Any:
    from fastapi.responses import JSONResponse

    l = _lead_di(c, lead_id)
    if tipo not in TIPI_FOTO:
        raise errore(400, "tipo foto non valido")
    mime = (file.content_type or "").split(";")[0].strip()
    if mime not in MIME_FOTO:
        raise errore(400, f"formato non accettato: {mime or 'sconosciuto'}")
    contenuto = await file.read()
    if len(contenuto) > impostazioni().foto_dimensione_massima_byte:
        raise errore(413, "foto oltre 12 MB")
    if uuid:
        esistente = c.db.scalar(select(Foto).where(Foto.azienda_id == c.azienda.id, Foto.uuid == uuid))
        if esistente:
            return JSONResponse(status_code=200, content={"foto_id": esistente.id, "tipo": esistente.tipo, "uuid": esistente.uuid, "creata": False})
    identificativo = uuid or str(uuid_lib.uuid4())
    relativo = f"{c.azienda.id}/{l.id}/{identificativo}.{MIME_FOTO[mime]}"
    archivio_foto().salva(relativo, contenuto, mime)
    f = Foto(uuid=identificativo, azienda_id=c.azienda.id, lead_id=l.id, tipo=tipo, percorso=relativo, mime=mime, dimensione=len(contenuto), caricata_da=c.utente.id)
    c.db.add(f)
    c.db.flush()
    integrazioni.accoda(c.db, c.azienda.id, "carica_foto", f.id)
    c.db.commit()
    return JSONResponse(status_code=201, content={"foto_id": f.id, "tipo": f.tipo, "uuid": f.uuid, "creata": True})


@router.get("/lead/{lead_id}/foto")
def foto_di_lead(lead_id: int, c: Contesto = Depends(contesto)) -> dict[str, Any]:
    l = _lead_di(c, lead_id)
    return {"foto": [{"foto_id": f.id, "tipo": f.tipo, "uuid": f.uuid, "creato_il": _iso(f.creato_il), "caricata_da": f.caricata_da} for f in c.db.scalars(select(Foto).where(Foto.lead_id == l.id).order_by(Foto.creato_il))]}


@router.get("/lead/{lead_id}/foto/{foto_id}")
def scarica_foto(lead_id: int, foto_id: int, c: Contesto = Depends(contesto)) -> Response:
    l = _lead_di(c, lead_id)
    f = c.db.get(Foto, foto_id)
    if not f or f.lead_id != l.id:
        raise errore(404, "foto inesistente")
    contenuto = archivio_foto().leggi(f.percorso)
    if contenuto is None:
        raise errore(410, "immagine non più disponibile")
    return Response(content=contenuto, media_type=f.mime, headers={"Cache-Control": "private, max-age=86400"})
