"""Coda e lavoratore in sottofondo che manda a Plexus (o altri gestionali) i dati delle aziende collegate.

Stessa logica della coda dell'app: ogni operazione (evento, lead, foto) viene ritentata con attese
crescenti; gli errori 401/403 fermano l'integrazione dell'azienda finché l'amministratore non la sistema.
"""

from __future__ import annotations

import logging
import threading
from datetime import timedelta
from typing import Callable

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..impostazioni import impostazioni
from ..modelli import Evento, Foto, Integrazione, Lead, OperazioneIntegrazione, adesso
from ..sicurezza import decifra
from .plexus_client import ClientPlexus, ErrorePlexus

log = logging.getLogger("capta.integrazioni")

PRIORITA = {"invia_evento": 0, "invia_lead": 1, "carica_foto": 2}

# Nei test si può sostituire il trasporto HTTP con uno finto (httpx.MockTransport).
_trasporto_di_prova: httpx.BaseTransport | None = None


def usa_trasporto_di_prova(t: httpx.BaseTransport | None) -> None:
    global _trasporto_di_prova
    _trasporto_di_prova = t


def trasporto_di_prova() -> httpx.BaseTransport | None:
    return _trasporto_di_prova


def attesa_per_tentativo(tentativi: int, permanente: bool) -> timedelta:
    if permanente:
        return timedelta(hours=6)
    return timedelta(seconds=min(5 * 3 ** max(0, tentativi - 1), 600))


# ---------- accodare ----------


def integrazione_attiva(db: Session, azienda_id: int) -> Integrazione | None:
    return db.scalar(select(Integrazione).where(Integrazione.azienda_id == azienda_id, Integrazione.tipo == "plexus", Integrazione.attiva.is_(True)))


def accoda(db: Session, azienda_id: int, tipo: str, riferimento_id: int) -> None:
    """Mette in coda (senza doppioni) un'operazione verso il gestionale, se l'azienda ne ha uno attivo."""
    if integrazione_attiva(db, azienda_id) is None:
        return
    aperta = db.scalar(select(OperazioneIntegrazione).where(OperazioneIntegrazione.azienda_id == azienda_id, OperazioneIntegrazione.tipo == tipo, OperazioneIntegrazione.riferimento_id == riferimento_id, OperazioneIntegrazione.stato.in_(["in_attesa", "errore"])))
    if aperta:
        aperta.stato = "in_attesa"
        aperta.tentativi = 0
        aperta.prossimo_tentativo = adesso()
        return
    db.add(OperazioneIntegrazione(azienda_id=azienda_id, tipo=tipo, riferimento_id=riferimento_id))


def accoda_tutto(db: Session, azienda_id: int) -> None:
    """Quando si collega un gestionale a un'azienda che ha già dati: manda tutto (eventi, lead, foto)."""
    for e in db.scalars(select(Evento).where(Evento.azienda_id == azienda_id)):
        accoda(db, azienda_id, "invia_evento", e.id)
    for l in db.scalars(select(Lead).where(Lead.azienda_id == azienda_id, Lead.eliminata.is_(False))):
        accoda(db, azienda_id, "invia_lead", l.id)
    for f in db.scalars(select(Foto).where(Foto.azienda_id == azienda_id)):
        accoda(db, azienda_id, "carica_foto", f.id)


# ---------- eseguire ----------


def questionario_per_plexus(questionario: list) -> list[dict]:
    esito = []
    for d in questionario or []:
        voce = {"domanda": d.get("domanda", ""), "opzioni": list(d.get("opzioni", [])), "multipla": bool(d.get("multipla"))}
        if d.get("consenso"):
            voce["consenso"] = True
        if d.get("traduzioni"):
            voce["traduzioni"] = d["traduzioni"]
        esito.append(voce)
    return esito


def corpo_evento(e: Evento) -> dict:
    return {
        "nome": e.nome, "luogo": e.luogo, "data_inizio": e.data_inizio, "data_fine": e.data_fine, "note": e.note,
        "lingua": e.lingua, "linea": e.linea, "ringraziamento_attivo": e.ringraziamento_attivo,
        "categorie_suggerite": list(e.categorie_suggerite or []), "questionario": questionario_per_plexus(e.questionario),
    }


def corpo_lead(l: Lead) -> dict:
    corpo = {
        "uuid": l.uuid, "nome": l.nome, "cognome": l.cognome, "email": l.email, "telefono": l.telefono, "azienda": l.azienda,
        "professione": l.professione, "citta": l.citta, "provincia": l.provincia, "indirizzo": l.indirizzo, "note": l.note,
        "categoria": l.categoria, "risposte": dict(l.risposte or {}),
    }
    if l.lingua:
        corpo["lingua"] = l.lingua
    if l.consenso in ("S", "N"):
        corpo["consenso"] = l.consenso == "S"
    return corpo


class EsecuzioneInterrotta(Exception):
    """L'integrazione dell'azienda si è fermata (token non valido, permesso negato, rete assente)."""


def _assicura(db: Session, azienda_id: int, tipo: str, rif: int) -> None:
    accoda(db, azienda_id, tipo, rif)


def esegui_operazione(db: Session, client: ClientPlexus, integrazione: Integrazione, op: OperazioneIntegrazione) -> bool:
    """Esegue una singola operazione. True se ha fatto qualcosa; False se è stata saltata (dipendenza non pronta).
    Lancia ErrorePlexus per gli errori della chiamata."""
    if op.tipo == "invia_evento":
        e = db.get(Evento, op.riferimento_id)
        if not e:
            return False
        corpo = corpo_evento(e)
        if e.gestionale_id is None:
            risposta = client.crea_evento({"uuid": e.uuid, **corpo})
            e.gestionale_id = int(risposta["evento"]["id"])
            if e.archiviato:
                client.modifica_evento(e.gestionale_id, {"archiviato": True})
        else:
            try:
                client.modifica_evento(e.gestionale_id, {**corpo, "archiviato": e.archiviato})
            except ErrorePlexus as err:
                if err.codice == 404:  # l'evento non esiste più in Plexus: lo si ricrea con lo stesso uuid
                    e.gestionale_id = None
                    _assicura(db, op.azienda_id, "invia_evento", e.id)
                    return False
                raise
        return True

    if op.tipo == "invia_lead":
        l = db.get(Lead, op.riferimento_id)
        if not l or l.eliminata:
            return False
        e = db.get(Evento, l.evento_id)
        if not e:
            return False
        if e.gestionale_id is None:
            _assicura(db, op.azienda_id, "invia_evento", e.id)
            return False
        try:
            risposta = client.crea_lead(e.gestionale_id, corpo_lead(l))
        except ErrorePlexus as err:
            if err.codice == 404:
                e.gestionale_id = None
                _assicura(db, op.azienda_id, "invia_evento", e.id)
                _assicura(db, op.azienda_id, "invia_lead", l.id)
                return False
            raise
        lead_remota = risposta.get("lead") or {}
        l.gestionale_id = int(lead_remota.get("id")) if lead_remota.get("id") is not None else l.gestionale_id
        l.gestionale_stato = lead_remota.get("stato") or l.gestionale_stato
        r = risposta.get("ringraziamento") or {}
        esito = r.get("esito")
        if esito == "gia_inviato":
            if l.ringraziamento_esito != "inviato":
                l.ringraziamento_esito = "inviato"
                l.ringraziamento_dettaglio = r.get("dettaglio") or ""
        elif esito and not (esito == "saltato" and l.ringraziamento_esito == "inviato"):
            l.ringraziamento_esito = esito
            l.ringraziamento_dettaglio = r.get("dettaglio") or ""
            if esito == "inviato":
                l.ringraziamento_inviato_il = adesso()
        return True

    if op.tipo == "carica_foto":
        f = db.get(Foto, op.riferimento_id)
        if not f:
            return False
        if f.gestionale_id is not None:
            return False
        l = db.get(Lead, f.lead_id)
        if not l or l.eliminata:
            return False
        if l.gestionale_id is None:
            _assicura(db, op.azienda_id, "invia_lead", l.id)
            return False
        percorso = impostazioni().cartella_foto / f.percorso
        try:
            contenuto = percorso.read_bytes()
        except FileNotFoundError:
            log.warning("foto %s senza file: operazione chiusa", f.uuid)
            return False
        try:
            risposta = client.carica_foto(l.gestionale_id, contenuto, f.mime, f.tipo, percorso.name, f.uuid)
        except ErrorePlexus as err:
            if err.codice == 404:
                l.gestionale_id = None
                _assicura(db, op.azienda_id, "invia_lead", l.id)
                return False
            raise
        f.gestionale_id = int(risposta["foto_id"])
        return True

    log.warning("operazione sconosciuta %s", op.tipo)
    return False


def allinea_ringraziamenti(db: Session, client: ClientPlexus, integrazione: Integrazione) -> None:
    """Rilegge da Plexus l'esito delle mail (GET /eventi/{id}/lead) per gli eventi dell'azienda: ogni 5 minuti."""
    dettagli = dict(integrazione.dettagli or {})
    ultimo = dettagli.get("ultimo_allineamento")
    if ultimo:
        try:
            from datetime import datetime

            if adesso() - datetime.fromisoformat(ultimo.rstrip("Z")) < timedelta(minutes=5):
                return
        except ValueError:
            pass
    for e in db.scalars(select(Evento).where(Evento.azienda_id == integrazione.azienda_id, Evento.gestionale_id.is_not(None), Evento.archiviato.is_(False))):
        remote = client.lead_di_evento(e.gestionale_id)  # type: ignore[arg-type]
        per_uuid = {r.get("uuid"): r for r in remote if r.get("uuid")}
        for l in db.scalars(select(Lead).where(Lead.evento_id == e.id, Lead.eliminata.is_(False))):
            r = per_uuid.get(l.uuid)
            if not r:
                continue
            l.gestionale_id = int(r["id"]) if r.get("id") is not None else l.gestionale_id
            l.gestionale_stato = r.get("stato") or l.gestionale_stato
            ring = r.get("ringraziamento") or {}
            if ring.get("esito"):
                l.ringraziamento_esito = ring["esito"]
                if ring.get("inviato_il") and l.ringraziamento_inviato_il is None:
                    try:
                        from datetime import datetime

                        l.ringraziamento_inviato_il = datetime.fromisoformat(str(ring["inviato_il"]).rstrip("Z"))
                    except ValueError:
                        pass
    dettagli["ultimo_allineamento"] = adesso().isoformat(timespec="seconds") + "Z"
    integrazione.dettagli = dettagli


def esegui_una_volta(db: Session, fabbrica_client: Callable[[Integrazione, str], ClientPlexus] | None = None) -> int:
    """Un giro completo su tutte le aziende con operazioni pronte. Restituisce quante operazioni ha completato."""
    completate = 0
    ora = adesso()
    aziende = db.scalars(select(OperazioneIntegrazione.azienda_id).where(OperazioneIntegrazione.stato.in_(["in_attesa", "errore"]), OperazioneIntegrazione.prossimo_tentativo <= ora).distinct()).all()
    integrazioni_da_allineare = db.scalars(select(Integrazione).where(Integrazione.attiva.is_(True), Integrazione.stato == "ok")).all()
    da_visitare = {i.azienda_id: i for i in integrazioni_da_allineare}
    for azienda_id in aziende:
        integrazione = integrazione_attiva(db, azienda_id)
        if not integrazione or integrazione.stato in ("token_non_valido", "permesso_negato"):
            continue
        da_visitare.pop(azienda_id, None)
        codice = decifra(integrazione.codice_cifrato)
        if not codice:
            integrazione.stato = "errore"
            integrazione.ultimo_errore = "codice non leggibile: inseriscilo di nuovo"
            db.commit()
            continue
        client = fabbrica_client(integrazione, codice) if fabbrica_client else ClientPlexus(integrazione.url, codice, transport=_trasporto_di_prova)
        try:
            operazioni = db.scalars(select(OperazioneIntegrazione).where(OperazioneIntegrazione.azienda_id == azienda_id, OperazioneIntegrazione.stato.in_(["in_attesa", "errore"]), OperazioneIntegrazione.prossimo_tentativo <= ora)).all()
            operazioni.sort(key=lambda o: (PRIORITA.get(o.tipo, 9), o.id))
            for op in operazioni:
                op.stato = "in_corso"
                db.commit()
                try:
                    fatta = esegui_operazione(db, client, integrazione, op)
                    op.stato = "completata"
                    op.ultimo_errore = ""
                    op.codice_errore = None
                    if fatta:
                        completate += 1
                    integrazione.ultima_sincronizzazione = adesso()
                    db.commit()
                except ErrorePlexus as err:
                    db.rollback()
                    op = db.get(OperazioneIntegrazione, op.id)  # type: ignore[assignment]
                    integrazione = db.get(Integrazione, integrazione.id)  # type: ignore[assignment]
                    assert op is not None and integrazione is not None
                    if err.codice == 401:
                        integrazione.stato = "token_non_valido"
                        integrazione.ultimo_errore = str(err)
                        op.stato = "in_attesa"
                        db.commit()
                        raise EsecuzioneInterrotta from err
                    if err.codice == 403:
                        integrazione.stato = "permesso_negato"
                        integrazione.ultimo_errore = str(err)
                        op.stato = "in_attesa"
                        db.commit()
                        raise EsecuzioneInterrotta from err
                    if err.tipo == "rete":
                        op.stato = "in_attesa"
                        op.ultimo_errore = str(err)
                        db.commit()
                        raise EsecuzioneInterrotta from err
                    op.stato = "errore"
                    op.tentativi += 1
                    op.prossimo_tentativo = adesso() + attesa_per_tentativo(op.tentativi, err.permanente)
                    op.ultimo_errore = str(err)
                    op.codice_errore = err.codice
                    db.commit()
            try:
                allinea_ringraziamenti(db, client, integrazione)
                db.commit()
            except ErrorePlexus as err:
                db.rollback()
                log.info("allineamento ringraziamenti rimandato: %s", err)
        except EsecuzioneInterrotta:
            log.info("integrazione dell'azienda %s interrotta", azienda_id)
        finally:
            client.chiudi()
    # aziende senza operazioni in coda: solo l'allineamento periodico degli esiti
    for azienda_id, integrazione in da_visitare.items():
        codice = decifra(integrazione.codice_cifrato)
        if not codice:
            continue
        client = fabbrica_client(integrazione, codice) if fabbrica_client else ClientPlexus(integrazione.url, codice, transport=_trasporto_di_prova)
        try:
            allinea_ringraziamenti(db, client, integrazione)
            db.commit()
        except ErrorePlexus as err:
            db.rollback()
            log.info("allineamento ringraziamenti rimandato (%s): %s", azienda_id, err)
        finally:
            client.chiudi()
    return completate


class Lavoratore:
    """Filo in sottofondo che chiama esegui_una_volta a intervalli regolari."""

    def __init__(self, fabbrica_sessioni: Callable[[], Session], intervallo_secondi: int):
        self._fabbrica = fabbrica_sessioni
        self._intervallo = intervallo_secondi
        self._stop = threading.Event()
        self._filo: threading.Thread | None = None

    def avvia(self) -> None:
        if self._filo:
            return
        self._filo = threading.Thread(target=self._ciclo, name="integrazioni", daemon=True)
        self._filo.start()

    def ferma(self) -> None:
        self._stop.set()
        if self._filo:
            self._filo.join(timeout=5)
            self._filo = None

    def _ciclo(self) -> None:
        while not self._stop.is_set():
            db = self._fabbrica()
            try:
                esegui_una_volta(db)
            except Exception:  # pragma: no cover - il lavoratore non deve mai morire
                log.exception("errore nel lavoratore delle integrazioni")
            finally:
                db.close()
            self._stop.wait(self._intervallo)
