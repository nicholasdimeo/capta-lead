"""Registrazione, accesso, token, verifica email, recupero password, inviti."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import sessione
from ..dipendenze import Contesto, contesto, errore
from ..impostazioni import impostazioni
from ..modelli import Azienda, Sessione, Utente, adesso
from ..posta import Messaggio, link_app, posta, testo
from ..schemi import AccessoIn, AccessoOut, CodiceIn, EmailIn, InvitoAccettaIn, MeOut, PasswordReimpostaIn, RegistrazioneIn, TokenOut, TokenRinnovoIn
from ..servizi import account
from ..sicurezza import hash_password, hash_segreto, nuovo_segreto, password_accettabile, verifica_password

router = APIRouter(tags=["accesso"])


@router.post("/auth/registrazione", response_model=AccessoOut, status_code=201)
def registrazione(dati: RegistrazioneIn, db: Session = Depends(sessione)) -> AccessoOut:
    problema = password_accettabile(dati.password)
    if problema:
        raise errore(400, problema, "password_debole")
    email = dati.email.lower()
    if db.scalar(select(Utente.id).where(Utente.email == email)):
        raise errore(409, "Esiste già un account con questa email.", "email_esistente")
    azienda = Azienda(nome=dati.azienda_nome.strip(), slug=account.slug_azienda(db, dati.azienda_nome), lingua=dati.lingua, piano="prova", configurazione={})
    db.add(azienda)
    db.flush()
    utente = Utente(azienda_id=azienda.id, email=email, nome=dati.nome.strip(), password_hash=hash_password(dati.password), ruolo="amministratore", lingua=dati.lingua, ultimo_accesso=adesso())
    db.add(utente)
    db.flush()
    dispositivo = account.registra_dispositivo(db, azienda, utente, dati.dispositivo)
    token = account.crea_sessione(db, utente, dispositivo)
    account.invia_verifica(db, azienda, utente)
    account.registra(db, azienda.id, utente.id, "registrazione", {"email": email})
    db.commit()
    return AccessoOut(token=token, me=account.me_out(db, utente, azienda))


@router.post("/auth/accesso", response_model=AccessoOut)
def accesso(dati: AccessoIn, db: Session = Depends(sessione)) -> AccessoOut:
    utente = db.scalar(select(Utente).where(Utente.email == dati.email.lower()))
    if not utente or not verifica_password(dati.password, utente.password_hash):
        raise errore(401, "Email o password non corretti.", "credenziali_errate")
    if not utente.attivo:
        raise errore(401, "Questo account è stato disattivato.", "account_disattivato")
    azienda = db.get(Azienda, utente.azienda_id)
    if not azienda or not azienda.attiva:
        raise errore(403, "L'azienda non è attiva.", "azienda_non_attiva")
    utente.ultimo_accesso = adesso()
    dispositivo = account.registra_dispositivo(db, azienda, utente, dati.dispositivo)
    token = account.crea_sessione(db, utente, dispositivo)
    account.registra(db, azienda.id, utente.id, "accesso", {"dispositivo": dati.dispositivo.nome if dati.dispositivo else ""})
    db.commit()
    return AccessoOut(token=token, me=account.me_out(db, utente, azienda))


@router.post("/auth/rinnovo", response_model=TokenOut)
def rinnovo(dati: TokenRinnovoIn, db: Session = Depends(sessione)) -> TokenOut:
    s = db.scalar(select(Sessione).where(Sessione.token_hash == hash_segreto(dati.token_rinnovo)))
    if not s or s.revocata or s.scade_il < adesso():
        raise errore(401, "Sessione scaduta: accedi di nuovo.", "sessione_scaduta")
    utente = db.get(Utente, s.utente_id)
    if not utente or not utente.attivo:
        raise errore(401, "Account non attivo.", "account_disattivato")
    # rotazione: il vecchio token di rinnovo viene sostituito da uno nuovo
    s.revocata = True
    segreto = nuovo_segreto()
    db.add(Sessione(utente_id=utente.id, dispositivo_id=s.dispositivo_id, token_hash=hash_segreto(segreto), scade_il=adesso() + timedelta(days=impostazioni().durata_token_rinnovo_giorni)))
    db.commit()
    from ..sicurezza import crea_token_accesso

    return TokenOut(token_accesso=crea_token_accesso(utente.id, utente.azienda_id, utente.ruolo, s.dispositivo_id), token_rinnovo=segreto, scade_in_secondi=impostazioni().durata_token_accesso_minuti * 60)


@router.post("/auth/uscita")
def uscita(dati: TokenRinnovoIn, db: Session = Depends(sessione)) -> dict[str, bool]:
    s = db.scalar(select(Sessione).where(Sessione.token_hash == hash_segreto(dati.token_rinnovo)))
    if s:
        s.revocata = True
        db.commit()
    return {"ok": True}


@router.post("/auth/verifica-email")
def verifica_email(dati: CodiceIn, db: Session = Depends(sessione)) -> dict[str, bool]:
    codice = account.trova_codice(db, "verifica", dati.codice)
    if not codice or codice.utente_id is None:
        raise errore(400, "Codice di verifica non valido o scaduto.", "codice_non_valido")
    utente = db.get(Utente, codice.utente_id)
    if not utente:
        raise errore(400, "Codice di verifica non valido o scaduto.", "codice_non_valido")
    utente.verificato = True
    codice.usato_il = adesso()
    account.registra(db, utente.azienda_id, utente.id, "email_verificata")
    db.commit()
    return {"ok": True}


@router.post("/auth/invia-verifica")
def invia_verifica(c: Contesto = Depends(contesto)) -> dict[str, bool]:
    if c.utente.verificato:
        return {"ok": True}
    account.invia_verifica(c.db, c.azienda, c.utente)
    c.db.commit()
    return {"ok": True}


@router.post("/auth/password-dimenticata")
def password_dimenticata(dati: EmailIn, db: Session = Depends(sessione)) -> dict[str, bool]:
    # risponde sempre ok: non rivela se l'email esiste
    utente = db.scalar(select(Utente).where(Utente.email == dati.email.lower(), Utente.attivo.is_(True)))
    if utente:
        azienda = db.get(Azienda, utente.azienda_id)
        if azienda:
            codice = account.crea_codice(db, "password", azienda, utente.email, utente)
            app = account.nome_app(azienda)
            posta().invia(Messaggio(a=utente.email, oggetto=testo(utente.lingua, "password_oggetto", app=app), testo=testo(utente.lingua, "password_testo", app=app, nome=utente.nome, link=link_app(f"password/{codice}"), ore=impostazioni().durata_codici_ore)))
            db.commit()
    return {"ok": True}


@router.post("/auth/password-reimposta")
def password_reimposta(dati: PasswordReimpostaIn, db: Session = Depends(sessione)) -> dict[str, bool]:
    problema = password_accettabile(dati.password)
    if problema:
        raise errore(400, problema, "password_debole")
    codice = account.trova_codice(db, "password", dati.codice)
    if not codice or codice.utente_id is None:
        raise errore(400, "Codice non valido o scaduto: richiedi un nuovo link.", "codice_non_valido")
    utente = db.get(Utente, codice.utente_id)
    if not utente:
        raise errore(400, "Codice non valido o scaduto.", "codice_non_valido")
    utente.password_hash = hash_password(dati.password)
    utente.verificato = True
    codice.usato_il = adesso()
    account.revoca_sessioni(db, utente.id)
    account.registra(db, utente.azienda_id, utente.id, "password_reimpostata")
    db.commit()
    return {"ok": True}


@router.get("/inviti/{codice}")
def invito(codice: str, db: Session = Depends(sessione)) -> dict[str, object]:
    c = account.trova_codice(db, "invito", codice)
    if not c:
        return {"valido": False}
    azienda = db.get(Azienda, c.azienda_id)
    return {"valido": True, "azienda": azienda.nome if azienda else "", "app": account.nome_app(azienda), "email": c.email, "ruolo": c.ruolo}


@router.post("/inviti/{codice}/accetta", response_model=AccessoOut, status_code=201)
def accetta_invito(codice: str, dati: InvitoAccettaIn, db: Session = Depends(sessione)) -> AccessoOut:
    problema = password_accettabile(dati.password)
    if problema:
        raise errore(400, problema, "password_debole")
    c = account.trova_codice(db, "invito", codice)
    if not c:
        raise errore(400, "Invito non valido o scaduto: chiedi un nuovo invito.", "codice_non_valido")
    if db.scalar(select(Utente.id).where(Utente.email == c.email)):
        raise errore(409, "Esiste già un account con questa email: accedi con la tua password.", "email_esistente")
    azienda = db.get(Azienda, c.azienda_id)
    if not azienda or not azienda.attiva:
        raise errore(403, "L'azienda non è attiva.", "azienda_non_attiva")
    utente = Utente(azienda_id=azienda.id, email=c.email, nome=dati.nome.strip(), password_hash=hash_password(dati.password), ruolo=c.ruolo or "operatore", lingua=dati.lingua, verificato=True, ultimo_accesso=adesso())
    db.add(utente)
    db.flush()
    c.usato_il = adesso()
    dispositivo = account.registra_dispositivo(db, azienda, utente, dati.dispositivo)
    token = account.crea_sessione(db, utente, dispositivo)
    account.registra(db, azienda.id, utente.id, "invito_accettato", {"email": c.email, "ruolo": utente.ruolo})
    db.commit()
    return AccessoOut(token=token, me=account.me_out(db, utente, azienda))


@router.get("/me", response_model=MeOut)
def me(c: Contesto = Depends(contesto)) -> MeOut:
    return account.me_out(c.db, c.utente, c.azienda)
