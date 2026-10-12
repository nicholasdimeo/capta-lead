"""Le tabelle di Capta Cloud. Ogni dato appartiene a un'azienda (azienda_id): è la base del multi-azienda."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def adesso() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Azienda(Base):
    __tablename__ = "aziende"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    # prova | evento | annuale | interno (uso interno illimitato, es. SGM Pharma in fase di test)
    piano: Mapped[str] = mapped_column(String(20), default="prova")
    piano_scadenza: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    crediti_eventi: Mapped[int] = mapped_column(Integer, default=0)  # eventi acquistati singolarmente non ancora usati
    lingua: Mapped[str] = mapped_column(String(8), default="it")
    configurazione: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # marchio, questionario, categorie…
    attiva: Mapped[bool] = mapped_column(Boolean, default=True)
    creata_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)

    utenti: Mapped[list[Utente]] = relationship(back_populates="azienda")


class Utente(Base):
    __tablename__ = "utenti"

    id: Mapped[int] = mapped_column(primary_key=True)
    azienda_id: Mapped[int] = mapped_column(ForeignKey("aziende.id"), index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    nome: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    ruolo: Mapped[str] = mapped_column(String(20), default="operatore")  # amministratore | operatore
    lingua: Mapped[str] = mapped_column(String(8), default="it")
    verificato: Mapped[bool] = mapped_column(Boolean, default=False)
    attivo: Mapped[bool] = mapped_column(Boolean, default=True)
    creato_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)
    ultimo_accesso: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    azienda: Mapped[Azienda] = relationship(back_populates="utenti")


class Codice(Base):
    """Codici monouso inviati per email: verifica dell'account, recupero password, inviti."""

    __tablename__ = "codici"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(20))  # verifica | password | invito
    hash: Mapped[str] = mapped_column(String(128), unique=True)
    azienda_id: Mapped[int] = mapped_column(ForeignKey("aziende.id"), index=True)
    utente_id: Mapped[int | None] = mapped_column(ForeignKey("utenti.id"), nullable=True)
    email: Mapped[str] = mapped_column(String(254))
    ruolo: Mapped[str | None] = mapped_column(String(20), nullable=True)  # per gli inviti
    scade_il: Mapped[datetime] = mapped_column(DateTime)
    usato_il: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    creato_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)


class Dispositivo(Base):
    __tablename__ = "dispositivi"

    id: Mapped[int] = mapped_column(primary_key=True)
    azienda_id: Mapped[int] = mapped_column(ForeignKey("aziende.id"), index=True)
    utente_id: Mapped[int] = mapped_column(ForeignKey("utenti.id"), index=True)
    identificativo: Mapped[str] = mapped_column(String(64), index=True)  # generato dall'app, uno per installazione
    nome: Mapped[str] = mapped_column(String(120), default="")
    ultimo_accesso: Mapped[datetime] = mapped_column(DateTime, default=adesso)
    creato_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)

    __table_args__ = (UniqueConstraint("azienda_id", "identificativo", name="uq_dispositivo_azienda"),)


class Sessione(Base):
    """Un token di rinnovo (refresh) attivo: uno per dispositivo/accesso. Si può revocare."""

    __tablename__ = "sessioni"

    id: Mapped[int] = mapped_column(primary_key=True)
    utente_id: Mapped[int] = mapped_column(ForeignKey("utenti.id"), index=True)
    dispositivo_id: Mapped[int | None] = mapped_column(ForeignKey("dispositivi.id"), nullable=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True)
    scade_il: Mapped[datetime] = mapped_column(DateTime)
    revocata: Mapped[bool] = mapped_column(Boolean, default=False)
    creata_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)


class Evento(Base):
    __tablename__ = "eventi"

    id: Mapped[int] = mapped_column(primary_key=True)
    uuid: Mapped[str] = mapped_column(String(64))  # generato dall'app
    azienda_id: Mapped[int] = mapped_column(ForeignKey("aziende.id"), index=True)
    nome: Mapped[str] = mapped_column(String(200))
    luogo: Mapped[str] = mapped_column(String(200), default="")
    data_inizio: Mapped[str] = mapped_column(String(10), default="")
    data_fine: Mapped[str] = mapped_column(String(10), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    lingua: Mapped[str] = mapped_column(String(8), default="it")
    linea: Mapped[str] = mapped_column(String(40), default="")
    ringraziamento_attivo: Mapped[bool] = mapped_column(Boolean, default=True)
    archiviato: Mapped[bool] = mapped_column(Boolean, default=False)
    questionario: Mapped[list[Any]] = mapped_column(JSON, default=list)
    categorie_suggerite: Mapped[list[Any]] = mapped_column(JSON, default=list)
    creato_da: Mapped[int | None] = mapped_column(ForeignKey("utenti.id"), nullable=True)
    creato_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)
    aggiornato_il: Mapped[datetime] = mapped_column(DateTime, default=adesso, onupdate=adesso)
    # collegamento con il gestionale dell'azienda (Plexus): numero assegnato da lui
    gestionale_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (UniqueConstraint("azienda_id", "uuid", name="uq_evento_uuid"),)


class Lead(Base):
    __tablename__ = "lead"

    id: Mapped[int] = mapped_column(primary_key=True)
    uuid: Mapped[str] = mapped_column(String(64))
    azienda_id: Mapped[int] = mapped_column(ForeignKey("aziende.id"), index=True)
    evento_id: Mapped[int] = mapped_column(ForeignKey("eventi.id"), index=True)
    nome: Mapped[str] = mapped_column(String(120), default="")
    cognome: Mapped[str] = mapped_column(String(120), default="")
    email: Mapped[str] = mapped_column(String(254), default="")
    telefono: Mapped[str] = mapped_column(String(60), default="")
    azienda: Mapped[str] = mapped_column(String(200), default="")
    professione: Mapped[str] = mapped_column(String(120), default="")
    citta: Mapped[str] = mapped_column(String(120), default="")
    provincia: Mapped[str] = mapped_column(String(60), default="")
    indirizzo: Mapped[str] = mapped_column(String(250), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    categoria: Mapped[str] = mapped_column(String(80), default="")
    lingua: Mapped[str | None] = mapped_column(String(8), nullable=True)
    consenso: Mapped[str | None] = mapped_column(String(1), nullable=True)  # S | N | null
    risposte: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    stato: Mapped[str] = mapped_column(String(20), default="nuova")
    origine: Mapped[str] = mapped_column(String(20), default="app")
    registrata_da: Mapped[int | None] = mapped_column(ForeignKey("utenti.id"), nullable=True)
    aggiornata_da: Mapped[int | None] = mapped_column(ForeignKey("utenti.id"), nullable=True)
    dispositivo_id: Mapped[int | None] = mapped_column(ForeignKey("dispositivi.id"), nullable=True)
    eliminata: Mapped[bool] = mapped_column(Boolean, default=False)
    creato_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)
    aggiornato_il: Mapped[datetime] = mapped_column(DateTime, default=adesso, onupdate=adesso)
    # stato nel gestionale (Plexus)
    gestionale_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gestionale_stato: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ringraziamento_esito: Mapped[str | None] = mapped_column(String(20), nullable=True)  # inviato | in_attesa | saltato | errore
    ringraziamento_dettaglio: Mapped[str] = mapped_column(Text, default="")
    ringraziamento_inviato_il: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("azienda_id", "uuid", name="uq_lead_uuid"), Index("ix_lead_evento_agg", "evento_id", "aggiornato_il"))


class Foto(Base):
    __tablename__ = "foto"

    id: Mapped[int] = mapped_column(primary_key=True)
    uuid: Mapped[str] = mapped_column(String(64))
    azienda_id: Mapped[int] = mapped_column(ForeignKey("aziende.id"), index=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("lead.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(20), default="altro")
    percorso: Mapped[str] = mapped_column(String(400))  # relativo alla cartella delle foto
    mime: Mapped[str] = mapped_column(String(80), default="image/jpeg")
    dimensione: Mapped[int] = mapped_column(Integer, default=0)
    caricata_da: Mapped[int | None] = mapped_column(ForeignKey("utenti.id"), nullable=True)
    creato_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)
    gestionale_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (UniqueConstraint("azienda_id", "uuid", name="uq_foto_uuid"),)


class FileFoto(Base):
    """Il contenuto di una foto, quando l'archivio scelto è il database (CAPTA_ARCHIVIO_FOTO=database)."""

    __tablename__ = "file_foto"

    percorso: Mapped[str] = mapped_column(String(400), primary_key=True)
    mime: Mapped[str] = mapped_column(String(80), default="image/jpeg")
    contenuto: Mapped[bytes] = mapped_column(LargeBinary)
    creato_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)


class Integrazione(Base):
    """Collegamento di un'azienda a un gestionale (per ora: plexus). Il codice è cifrato."""

    __tablename__ = "integrazioni"

    id: Mapped[int] = mapped_column(primary_key=True)
    azienda_id: Mapped[int] = mapped_column(ForeignKey("aziende.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(20), default="plexus")
    url: Mapped[str] = mapped_column(String(300))
    codice_cifrato: Mapped[bytes] = mapped_column(LargeBinary)
    attiva: Mapped[bool] = mapped_column(Boolean, default=True)
    stato: Mapped[str] = mapped_column(String(20), default="ok")  # ok | token_non_valido | permesso_negato | errore
    ultimo_errore: Mapped[str] = mapped_column(Text, default="")
    dettagli: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # azienda, utente, api, posta_lead_pronta…
    ultima_sincronizzazione: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    creata_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)

    __table_args__ = (UniqueConstraint("azienda_id", "tipo", name="uq_integrazione_azienda"),)


class OperazioneIntegrazione(Base):
    """Coda verso il gestionale: stessa logica della coda dell'app (ritentativi con attesa crescente)."""

    __tablename__ = "operazioni_integrazione"

    id: Mapped[int] = mapped_column(primary_key=True)
    azienda_id: Mapped[int] = mapped_column(ForeignKey("aziende.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(20))  # invia_evento | invia_lead | carica_foto
    riferimento_id: Mapped[int] = mapped_column(Integer)  # id di evento, lead o foto
    stato: Mapped[str] = mapped_column(String(20), default="in_attesa", index=True)  # in_attesa | in_corso | completata | errore
    tentativi: Mapped[int] = mapped_column(Integer, default=0)
    prossimo_tentativo: Mapped[datetime] = mapped_column(DateTime, default=adesso, index=True)
    ultimo_errore: Mapped[str] = mapped_column(Text, default="")
    codice_errore: Mapped[int | None] = mapped_column(Integer, nullable=True)
    creata_il: Mapped[datetime] = mapped_column(DateTime, default=adesso)
    aggiornata_il: Mapped[datetime] = mapped_column(DateTime, default=adesso, onupdate=adesso)


class Registro(Base):
    """Chi ha fatto cosa: accessi, inviti, cancellazioni, modifiche al piano."""

    __tablename__ = "registro"

    id: Mapped[int] = mapped_column(primary_key=True)
    azienda_id: Mapped[int | None] = mapped_column(ForeignKey("aziende.id"), nullable=True, index=True)
    utente_id: Mapped[int | None] = mapped_column(ForeignKey("utenti.id"), nullable=True)
    azione: Mapped[str] = mapped_column(String(60))
    dettagli: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    quando: Mapped[datetime] = mapped_column(DateTime, default=adesso)
