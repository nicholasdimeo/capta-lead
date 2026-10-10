"""Client Python per l'API di Plexus (contratto 1.1, compatibile 1.0). Usato dal lavoratore delle integrazioni."""

from __future__ import annotations

from typing import Any

import httpx


class ErrorePlexus(Exception):
    """tipo: rete | timeout | http | risposta. codice: stato HTTP (None se la rete non ha risposto)."""

    def __init__(self, tipo: str, codice: int | None, messaggio: str):
        super().__init__(messaggio)
        self.tipo = tipo
        self.codice = codice

    @property
    def permanente(self) -> bool:
        return self.codice in (400, 403, 404, 413, 422)


def normalizza_url(url: str) -> str:
    u = url.strip().rstrip("/")
    if not u.startswith(("http://", "https://")):
        u = f"https://{u}"
    if not u.endswith("/api/v1"):
        u = f"{u}/api/v1"
    return u


class ClientPlexus:
    def __init__(self, url: str, token: str, transport: httpx.BaseTransport | None = None, timeout: float = 30.0):
        self.base = normalizza_url(url)
        self._client = httpx.Client(headers={"Authorization": f"Bearer {token}", "Accept": "application/json"}, timeout=timeout, transport=transport)

    def chiudi(self) -> None:
        self._client.close()

    def _chiama(self, metodo: str, percorso: str, *, json: Any = None, files: Any = None, data: Any = None, timeout: float | None = None) -> Any:
        try:
            r = self._client.request(metodo, f"{self.base}{percorso}", json=json, files=files, data=data, timeout=timeout)
        except httpx.TimeoutException as e:
            raise ErrorePlexus("timeout", None, "tempo scaduto") from e
        except httpx.HTTPError as e:
            raise ErrorePlexus("rete", None, f"rete non raggiungibile: {e.__class__.__name__}") from e
        dati: Any = None
        if r.content:
            try:
                dati = r.json()
            except ValueError:
                if r.is_success:
                    raise ErrorePlexus("risposta", r.status_code, "risposta non in formato JSON")
        if not r.is_success:
            spiegazione = dati.get("errore") if isinstance(dati, dict) and isinstance(dati.get("errore"), str) else f"errore {r.status_code}"
            raise ErrorePlexus("http", r.status_code, spiegazione)
        return dati

    # ---------- endpoint ----------

    def stato(self) -> dict[str, Any]:
        return self._chiama("GET", "/stato")

    def eventi(self, con_archiviati: bool = True) -> list[dict[str, Any]]:
        return (self._chiama("GET", "/eventi?archiviati=1" if con_archiviati else "/eventi") or {}).get("eventi", [])

    def crea_evento(self, corpo: dict[str, Any]) -> dict[str, Any]:
        return self._chiama("POST", "/eventi", json=corpo)

    def modifica_evento(self, id_: int, corpo: dict[str, Any]) -> dict[str, Any]:
        return (self._chiama("PUT", f"/eventi/{id_}", json=corpo) or {}).get("evento", {})

    def aggiorna_questionario(self, id_: int, questionario: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return (self._chiama("PUT", f"/eventi/{id_}/questionario", json={"questionario": questionario}) or {}).get("questionario", [])

    def lead_di_evento(self, id_: int) -> list[dict[str, Any]]:
        return (self._chiama("GET", f"/eventi/{id_}/lead") or {}).get("lead", [])

    def crea_lead(self, evento_id: int, corpo: dict[str, Any]) -> dict[str, Any]:
        return self._chiama("POST", f"/eventi/{evento_id}/lead", json=corpo)

    def carica_foto(self, lead_id: int, contenuto: bytes, mime: str, tipo: str, nome_file: str, uuid: str | None) -> dict[str, Any]:
        dati = {"tipo": tipo}
        if uuid:
            dati["uuid"] = uuid
        attesa = min(300.0, max(60.0, 60.0 + (len(contenuto) / (1024 * 1024)) * 20.0))
        return self._chiama("POST", f"/lead/{lead_id}/foto", files={"file": (nome_file, contenuto, mime)}, data=dati, timeout=attesa)
