"""Email transazionali (verifica account, inviti, recupero password). Testi in italiano e inglese.

In sviluppo le email vengono stampate a console e conservate in memoria (i test le leggono da lì).
"""

from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage

from .impostazioni import impostazioni

log = logging.getLogger("capta.posta")


@dataclass
class Messaggio:
    a: str
    oggetto: str
    testo: str


@dataclass
class PostaConsole:
    inviate: list[Messaggio] = field(default_factory=list)

    def invia(self, m: Messaggio) -> None:
        self.inviate.append(m)
        log.info("EMAIL (console) a %s | %s\n%s", m.a, m.oggetto, m.testo)


class PostaSmtp:
    def invia(self, m: Messaggio) -> None:
        imp = impostazioni()
        msg = EmailMessage()
        msg["From"] = imp.posta_mittente
        msg["To"] = m.a
        msg["Subject"] = m.oggetto
        msg.set_content(m.testo)
        with smtplib.SMTP(imp.smtp_host, imp.smtp_porta, timeout=20) as s:
            if imp.smtp_tls:
                s.starttls()
            if imp.smtp_utente:
                s.login(imp.smtp_utente, imp.smtp_password)
            s.send_message(msg)


_posta: PostaConsole | PostaSmtp | None = None


def posta() -> PostaConsole | PostaSmtp:
    global _posta
    if _posta is None:
        _posta = PostaSmtp() if impostazioni().posta == "smtp" else PostaConsole()
    return _posta


def azzera_posta() -> None:
    global _posta
    _posta = None


# ---------- testi ----------

TESTI = {
    "it": {
        "verifica_oggetto": "Conferma il tuo account {app}",
        "verifica_testo": "Ciao {nome},\n\nper confermare il tuo account {app} apri questo link:\n{link}\n\nSe non sei stato tu a registrarti, ignora questa email.",
        "invito_oggetto": "{chi} ti ha invitato in {azienda} su {app}",
        "invito_testo": "Ciao,\n\n{chi} ti ha invitato a usare {app} con l'azienda {azienda}, come {ruolo}.\nPer accettare apri questo link e scegli una password:\n{link}\n\nIl link vale {ore} ore.",
        "password_oggetto": "Reimposta la password di {app}",
        "password_testo": "Ciao {nome},\n\nper scegliere una nuova password apri questo link:\n{link}\n\nIl link vale {ore} ore. Se non hai chiesto tu di cambiarla, ignora questa email.",
        "ruolo_amministratore": "amministratore",
        "ruolo_operatore": "operatore",
    },
    "en": {
        "verifica_oggetto": "Confirm your {app} account",
        "verifica_testo": "Hi {nome},\n\nto confirm your {app} account open this link:\n{link}\n\nIf you did not sign up, ignore this email.",
        "invito_oggetto": "{chi} invited you to {azienda} on {app}",
        "invito_testo": "Hi,\n\n{chi} invited you to use {app} with the company {azienda}, as {ruolo}.\nTo accept, open this link and choose a password:\n{link}\n\nThe link is valid for {ore} hours.",
        "password_oggetto": "Reset your {app} password",
        "password_testo": "Hi {nome},\n\nto choose a new password open this link:\n{link}\n\nThe link is valid for {ore} hours. If you did not ask for this, ignore this email.",
        "ruolo_amministratore": "administrator",
        "ruolo_operatore": "operator",
    },
}


def testo(lingua: str, chiave: str, **parametri: object) -> str:
    dizionario = TESTI.get(lingua) or TESTI["it"]
    return (dizionario.get(chiave) or TESTI["it"][chiave]).format(**parametri)


def link_app(percorso: str) -> str:
    """Link dentro l'app (router con #): es. link_app('verifica/abc') → https://app/#/verifica/abc"""
    return f"{impostazioni().url_app.rstrip('/')}/#/{percorso}"
