"""Forme dei dati in entrata e in uscita dall'API (controllate da Pydantic)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, EmailStr, Field

# ---------- accesso ----------


class DispositivoIn(BaseModel):
    identificativo: str = Field(min_length=8, max_length=64)
    nome: str = Field(default="", max_length=120)


class RegistrazioneIn(BaseModel):
    azienda_nome: str = Field(min_length=2, max_length=200)
    nome: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    lingua: str = Field(default="it", max_length=8)
    dispositivo: DispositivoIn | None = None


class AccessoIn(BaseModel):
    email: EmailStr
    password: str
    dispositivo: DispositivoIn | None = None


class TokenRinnovoIn(BaseModel):
    token_rinnovo: str


class CodiceIn(BaseModel):
    codice: str


class EmailIn(BaseModel):
    email: EmailStr


class PasswordReimpostaIn(BaseModel):
    codice: str
    password: str


class InvitoAccettaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    password: str
    lingua: str = Field(default="it", max_length=8)
    dispositivo: DispositivoIn | None = None


class TokenOut(BaseModel):
    token_accesso: str
    token_rinnovo: str
    scade_in_secondi: int


class UtenteOut(BaseModel):
    id: int
    email: str
    nome: str
    ruolo: str
    lingua: str
    verificato: bool
    attivo: bool
    ultimo_accesso: str | None


class PianoOut(BaseModel):
    nome: str
    scadenza: str | None
    crediti_eventi: int
    limiti: dict[str, int | None]
    utilizzo: dict[str, int]


class AziendaOut(BaseModel):
    id: int
    nome: str
    slug: str
    lingua: str
    piano: PianoOut
    configurazione: dict[str, Any]


class MeOut(BaseModel):
    utente: UtenteOut
    azienda: AziendaOut
    integrazioni: list[IntegrazioneOut]


class AccessoOut(BaseModel):
    token: TokenOut
    me: MeOut


# ---------- azienda ----------


class AziendaModificaIn(BaseModel):
    nome: str | None = Field(default=None, min_length=2, max_length=200)
    lingua: str | None = Field(default=None, max_length=8)


class InvitoIn(BaseModel):
    email: EmailStr
    ruolo: str = Field(default="operatore", pattern="^(amministratore|operatore)$")


class InvitoOut(BaseModel):
    id: int
    email: str
    ruolo: str
    scade_il: str
    usato: bool
    # presenti solo quando l'invito viene creato o rigenerato: il link non si può più rileggere dopo
    link: str | None = None
    email_inviata: bool | None = None


class LinkOut(BaseModel):
    link: str
    scade_il: str
    email_inviata: bool


class UtenteModificaIn(BaseModel):
    ruolo: str | None = Field(default=None, pattern="^(amministratore|operatore)$")
    attivo: bool | None = None
    nome: str | None = Field(default=None, min_length=1, max_length=120)


class DispositivoOut(BaseModel):
    id: int
    nome: str
    identificativo: str
    utente_id: int
    utente_nome: str
    ultimo_accesso: str


class IntegrazionePlexusIn(BaseModel):
    url: str = Field(min_length=4, max_length=300)
    codice: str | None = Field(default=None, max_length=300)  # vuoto = lascia quello salvato
    attiva: bool = True


class IntegrazioneOut(BaseModel):
    tipo: str
    url: str
    attiva: bool
    stato: str
    ultimo_errore: str
    dettagli: dict[str, Any]
    ultima_sincronizzazione: str | None
    in_coda: int
    in_errore: int


# ---------- eventi e lead (stessa forma del contratto Plexus 1.1) ----------


class DomandaIn(BaseModel):
    domanda: str = Field(min_length=1)
    opzioni: list[str] = Field(min_length=2)
    multipla: bool = False
    consenso: bool = False
    traduzioni: dict[str, dict[str, Any]] | None = None


class EventoIn(BaseModel):
    uuid: str = Field(min_length=8, max_length=64)
    nome: str = Field(min_length=1, max_length=200)
    luogo: str = ""
    data_inizio: str = ""
    data_fine: str = ""
    note: str = ""
    lingua: str = "it"
    linea: str = ""
    ringraziamento_attivo: bool | None = None
    categorie_suggerite: list[str] | None = None
    questionario: list[DomandaIn] | None = None


class EventoModificaIn(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    luogo: str | None = None
    data_inizio: str | None = None
    data_fine: str | None = None
    note: str | None = None
    lingua: str | None = None
    linea: str | None = None
    ringraziamento_attivo: bool | None = None
    categorie_suggerite: list[str] | None = None
    questionario: list[DomandaIn] | None = None
    archiviato: bool | None = None


class QuestionarioIn(BaseModel):
    questionario: list[DomandaIn]


class LeadIn(BaseModel):
    uuid: str = Field(min_length=8, max_length=64)
    nome: str = ""
    cognome: str = ""
    email: str = ""
    telefono: str = ""
    azienda: str = ""
    professione: str = ""
    citta: str = ""
    provincia: str = ""
    indirizzo: str = ""
    note: str = ""
    categoria: str = ""
    lingua: str | None = None
    consenso: bool | str | None = None
    risposte: dict[str, str | list[str]] = Field(default_factory=dict)
