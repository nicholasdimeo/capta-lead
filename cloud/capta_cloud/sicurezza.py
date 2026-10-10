"""Password, token di accesso (JWT), codici monouso e cifratura dei segreti dei gestionali."""

from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from cryptography.fernet import Fernet, InvalidToken

from .impostazioni import impostazioni

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verifica_password(password: str, hash_: str) -> bool:
    try:
        return _hasher.verify(hash_, password)
    except VerificationError:
        return False
    except Exception:  # hash corrotto o formato sconosciuto
        return False


def password_accettabile(password: str) -> str | None:
    """Restituisce il motivo se la password non va bene, altrimenti None."""
    if len(password) < 8:
        return "La password deve avere almeno 8 caratteri."
    if password.strip() != password:
        return "La password non può iniziare o finire con uno spazio."
    return None


# ---------- token di accesso (JWT, di breve durata) ----------

def crea_token_accesso(utente_id: int, azienda_id: int, ruolo: str, dispositivo_id: int | None) -> str:
    imp = impostazioni()
    ora = datetime.now(timezone.utc)
    corpo = {
        "sub": str(utente_id),
        "az": azienda_id,
        "ruolo": ruolo,
        "disp": dispositivo_id,
        "iat": int(ora.timestamp()),
        "exp": int((ora + timedelta(minutes=imp.durata_token_accesso_minuti)).timestamp()),
        "tipo": "accesso",
    }
    return jwt.encode(corpo, imp.chiave_segreta, algorithm="HS256")


def leggi_token_accesso(token: str) -> dict[str, Any] | None:
    try:
        corpo = jwt.decode(token, impostazioni().chiave_segreta, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if corpo.get("tipo") != "accesso":
        return None
    return corpo


# ---------- token di rinnovo e codici monouso (casuali, salvati come hash) ----------

def nuovo_segreto() -> str:
    return secrets.token_urlsafe(32)


def hash_segreto(valore: str) -> str:
    return hashlib.sha256(valore.encode("utf-8")).hexdigest()


# ---------- cifratura dei codici dei gestionali ----------

def _fernet() -> Fernet:
    imp = impostazioni()
    chiave = imp.chiave_cifratura
    if not chiave:
        # derivata dalla chiave segreta: va bene in sviluppo; in produzione impostare CAPTA_CHIAVE_CIFRATURA
        chiave = base64.urlsafe_b64encode(hashlib.sha256(imp.chiave_segreta.encode()).digest()).decode()
    return Fernet(chiave)


def cifra(testo: str) -> bytes:
    return _fernet().encrypt(testo.encode("utf-8"))


def decifra(dati: bytes) -> str | None:
    try:
        return _fernet().decrypt(dati).decode("utf-8")
    except InvalidToken:
        return None
