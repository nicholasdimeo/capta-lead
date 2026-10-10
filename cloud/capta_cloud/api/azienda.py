"""Area di amministrazione dell'azienda: dati, personalizzazione, utenti, inviti, dispositivi, integrazioni."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select

from ..dipendenze import Contesto, errore, solo_amministratore
from ..impostazioni import impostazioni
from ..modelli import Codice, Dispositivo, Integrazione, OperazioneIntegrazione, Registro, Sessione, Utente, adesso
from ..posta import Messaggio, link_app, posta, testo
from ..schemi import AziendaModificaIn, AziendaOut, DispositivoOut, IntegrazioneOut, IntegrazionePlexusIn, InvitoIn, InvitoOut, UtenteModificaIn, UtenteOut
from ..servizi import account, integrazioni, piani
from ..servizi.plexus_client import ErrorePlexus, ClientPlexus
from ..sicurezza import cifra, decifra

router = APIRouter(prefix="/azienda", tags=["azienda"])

# chiavi della configurazione del marchio che l'azienda può impostare (stesse di config/brand.json dell'app)
CHIAVI_CONFIGURAZIONE = {"app", "azienda", "tema", "lingue", "linee", "linea_predefinita", "categorie_predefinite", "professioni_suggerite", "tipi_foto", "privacy", "questionario_predefinito"}


@router.get("", response_model=AziendaOut)
def leggi(c: Contesto = Depends(solo_amministratore)) -> AziendaOut:
    return account.azienda_out(c.db, c.azienda)


@router.put("", response_model=AziendaOut)
def modifica(dati: AziendaModificaIn, c: Contesto = Depends(solo_amministratore)) -> AziendaOut:
    if dati.nome is not None:
        c.azienda.nome = dati.nome.strip()
    if dati.lingua is not None:
        c.azienda.lingua = dati.lingua
    account.registra(c.db, c.azienda.id, c.utente.id, "azienda_modificata")
    c.db.commit()
    return account.azienda_out(c.db, c.azienda)


@router.get("/configurazione")
def leggi_configurazione(c: Contesto = Depends(solo_amministratore)) -> dict[str, Any]:
    return c.azienda.configurazione or {}


@router.put("/configurazione")
def salva_configurazione(dati: dict[str, Any], c: Contesto = Depends(solo_amministratore)) -> dict[str, Any]:
    sconosciute = set(dati) - CHIAVI_CONFIGURAZIONE
    if sconosciute:
        raise errore(400, f"Chiavi non ammesse: {', '.join(sorted(sconosciute))}", "configurazione_non_valida")
    c.azienda.configurazione = dati
    account.registra(c.db, c.azienda.id, c.utente.id, "configurazione_modificata", {"chiavi": sorted(dati)})
    c.db.commit()
    return c.azienda.configurazione


# ---------- utenti e inviti ----------


@router.get("/utenti", response_model=list[UtenteOut])
def utenti(c: Contesto = Depends(solo_amministratore)) -> list[UtenteOut]:
    return [account.utente_out(u) for u in c.db.scalars(select(Utente).where(Utente.azienda_id == c.azienda.id).order_by(Utente.creato_il))]


@router.put("/utenti/{utente_id}", response_model=UtenteOut)
def modifica_utente(utente_id: int, dati: UtenteModificaIn, c: Contesto = Depends(solo_amministratore)) -> UtenteOut:
    u = c.db.get(Utente, utente_id)
    if not u or u.azienda_id != c.azienda.id:
        raise errore(404, "Utente non trovato.")
    if dati.nome is not None:
        u.nome = dati.nome.strip()
    if dati.ruolo is not None:
        u.ruolo = dati.ruolo
    if dati.attivo is not None:
        if u.id == c.utente.id and not dati.attivo:
            raise errore(400, "Non puoi disattivare il tuo stesso account.")
        u.attivo = dati.attivo
        if not dati.attivo:
            account.revoca_sessioni(c.db, u.id)
    amministratori_attivi = [x for x in c.db.scalars(select(Utente).where(Utente.azienda_id == c.azienda.id)) if x.attivo and x.ruolo == "amministratore"]
    if not amministratori_attivi:
        c.db.rollback()
        raise errore(400, "L'azienda deve avere almeno un amministratore attivo.")
    account.registra(c.db, c.azienda.id, c.utente.id, "utente_modificato", {"utente": u.id, "ruolo": u.ruolo, "attivo": u.attivo})
    c.db.commit()
    return account.utente_out(u)


@router.get("/inviti", response_model=list[InvitoOut])
def inviti(c: Contesto = Depends(solo_amministratore)) -> list[InvitoOut]:
    righe = c.db.scalars(select(Codice).where(Codice.azienda_id == c.azienda.id, Codice.tipo == "invito").order_by(Codice.creato_il.desc()))
    return [InvitoOut(id=i.id, email=i.email, ruolo=i.ruolo or "operatore", scade_il=account.iso(i.scade_il) or "", usato=i.usato_il is not None) for i in righe]


@router.post("/inviti", response_model=InvitoOut, status_code=201)
def invita(dati: InvitoIn, c: Contesto = Depends(solo_amministratore)) -> InvitoOut:
    email = dati.email.lower()
    if c.db.scalar(select(Utente.id).where(Utente.email == email)):
        raise errore(409, "Questa email ha già un account.", "email_esistente")
    motivo = piani.puo_aggiungere_utente(c.db, c.azienda)
    if motivo:
        raise errore(402, motivo, "limite_piano")
    codice = account.crea_codice(c.db, "invito", c.azienda, email, ruolo=dati.ruolo)
    app = account.nome_app(c.azienda)
    lingua = c.azienda.lingua
    posta().invia(Messaggio(a=email, oggetto=testo(lingua, "invito_oggetto", chi=c.utente.nome, azienda=c.azienda.nome, app=app), testo=testo(lingua, "invito_testo", chi=c.utente.nome, azienda=c.azienda.nome, app=app, ruolo=testo(lingua, f"ruolo_{dati.ruolo}"), link=link_app(f"invito/{codice}"), ore=impostazioni().durata_codici_ore)))
    account.registra(c.db, c.azienda.id, c.utente.id, "invito_creato", {"email": email, "ruolo": dati.ruolo})
    c.db.commit()
    nuovo = c.db.scalar(select(Codice).where(Codice.tipo == "invito", Codice.email == email, Codice.usato_il.is_(None)))
    assert nuovo is not None
    return InvitoOut(id=nuovo.id, email=nuovo.email, ruolo=nuovo.ruolo or "operatore", scade_il=account.iso(nuovo.scade_il) or "", usato=False)


@router.delete("/inviti/{invito_id}")
def annulla_invito(invito_id: int, c: Contesto = Depends(solo_amministratore)) -> dict[str, bool]:
    i = c.db.get(Codice, invito_id)
    if not i or i.azienda_id != c.azienda.id or i.tipo != "invito":
        raise errore(404, "Invito non trovato.")
    i.usato_il = adesso()
    c.db.commit()
    return {"ok": True}


# ---------- dispositivi ----------


@router.get("/dispositivi", response_model=list[DispositivoOut])
def dispositivi(c: Contesto = Depends(solo_amministratore)) -> list[DispositivoOut]:
    esito = []
    for d in c.db.scalars(select(Dispositivo).where(Dispositivo.azienda_id == c.azienda.id).order_by(Dispositivo.ultimo_accesso.desc())):
        u = c.db.get(Utente, d.utente_id)
        esito.append(DispositivoOut(id=d.id, nome=d.nome, identificativo=d.identificativo, utente_id=d.utente_id, utente_nome=u.nome if u else "", ultimo_accesso=account.iso(d.ultimo_accesso) or ""))
    return esito


@router.delete("/dispositivi/{dispositivo_id}")
def scollega_dispositivo(dispositivo_id: int, c: Contesto = Depends(solo_amministratore)) -> dict[str, bool]:
    d = c.db.get(Dispositivo, dispositivo_id)
    if not d or d.azienda_id != c.azienda.id:
        raise errore(404, "Dispositivo non trovato.")
    for s in c.db.scalars(select(Sessione).where(Sessione.dispositivo_id == d.id)):
        s.revocata = True
    account.registra(c.db, c.azienda.id, c.utente.id, "dispositivo_scollegato", {"dispositivo": d.nome})
    c.db.commit()
    return {"ok": True}


# ---------- integrazioni ----------


@router.get("/integrazioni", response_model=list[IntegrazioneOut])
def elenco_integrazioni(c: Contesto = Depends(solo_amministratore)) -> list[IntegrazioneOut]:
    return [account.integrazione_out(c.db, i) for i in c.db.scalars(select(Integrazione).where(Integrazione.azienda_id == c.azienda.id))]


@router.put("/integrazioni/plexus", response_model=IntegrazioneOut)
def salva_plexus(dati: IntegrazionePlexusIn, c: Contesto = Depends(solo_amministratore)) -> IntegrazioneOut:
    i = c.db.scalar(select(Integrazione).where(Integrazione.azienda_id == c.azienda.id, Integrazione.tipo == "plexus"))
    codice = (dati.codice or "").strip()
    if not codice:
        if not i:
            raise errore(400, "Serve il codice personale creato in Plexus.", "codice_mancante")
        codice = decifra(i.codice_cifrato) or ""
        if not codice:
            raise errore(400, "Il codice salvato non è leggibile: inseriscilo di nuovo.", "codice_mancante")
    if not codice.startswith("plx_"):
        raise errore(400, "Il codice deve iniziare con «plx_».", "codice_non_valido")
    # verifica subito il collegamento con GET /stato
    try:
        stato = ClientPlexus(dati.url, codice, transport=integrazioni.trasporto_di_prova()).stato()
    except ErrorePlexus as e:
        raise errore(400, f"Plexus non raggiungibile o codice rifiutato: {e}", "verifica_fallita") from e
    nuova = i is None
    if i is None:
        i = Integrazione(azienda_id=c.azienda.id, tipo="plexus", url=dati.url.strip(), codice_cifrato=cifra(codice))
        c.db.add(i)
    else:
        i.url = dati.url.strip()
        i.codice_cifrato = cifra(codice)
    i.attiva = dati.attiva
    i.stato = "ok"
    i.ultimo_errore = ""
    i.dettagli = {"azienda": stato.get("azienda"), "utente": stato.get("utente"), "api": stato.get("api"), "posta_lead_pronta": stato.get("posta_lead_pronta"), "verificata_il": account.iso(adesso())}
    c.db.flush()
    if nuova or dati.attiva:
        integrazioni.accoda_tutto(c.db, c.azienda.id)
    account.registra(c.db, c.azienda.id, c.utente.id, "integrazione_plexus_salvata", {"url": i.url})
    c.db.commit()
    return account.integrazione_out(c.db, i)


@router.delete("/integrazioni/plexus")
def rimuovi_plexus(c: Contesto = Depends(solo_amministratore)) -> dict[str, bool]:
    i = c.db.scalar(select(Integrazione).where(Integrazione.azienda_id == c.azienda.id, Integrazione.tipo == "plexus"))
    if i:
        for op in c.db.scalars(select(OperazioneIntegrazione).where(OperazioneIntegrazione.azienda_id == c.azienda.id, OperazioneIntegrazione.stato != "completata")):
            c.db.delete(op)
        c.db.delete(i)
        account.registra(c.db, c.azienda.id, c.utente.id, "integrazione_plexus_rimossa")
        c.db.commit()
    return {"ok": True}


@router.get("/registro")
def registro(c: Contesto = Depends(solo_amministratore)) -> list[dict[str, Any]]:
    righe = c.db.scalars(select(Registro).where(Registro.azienda_id == c.azienda.id).order_by(Registro.quando.desc()).limit(200))
    return [{"quando": account.iso(r.quando), "utente_id": r.utente_id, "azione": r.azione, "dettagli": r.dettagli} for r in righe]
