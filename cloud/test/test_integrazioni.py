"""Il lavoratore manda a un Plexus finto (httpx.MockTransport che imita il contratto 1.1)."""

import io
import json

import httpx
import pytest
from conftest import intestazioni, registra

from capta_cloud.db import fabbrica_sessioni
from capta_cloud.modelli import Azienda, Lead
from capta_cloud.servizi import integrazioni

EVENTO = {"uuid": "evento-0001-abcd", "nome": "Fiera", "luogo": "Bologna", "data_inizio": "2026-11-05", "data_fine": "2026-11-07", "lingua": "it", "linea": "ortopedia",
          "questionario": [{"domanda": "Consenso?", "opzioni": ["Sì", "No"], "consenso": True}]}
LEAD = {"uuid": "lead-0001-abcd", "nome": "Anna", "cognome": "Bianchi", "email": "anna@clinica.it", "risposte": {"Consenso?": "Sì"}}


class PlexusFinto:
    def __init__(self):
        self.eventi: list[dict] = []
        self.lead: list[dict] = []
        self.foto: list[dict] = []
        self.chiamate: list[tuple[str, str]] = []
        self.token_valido = "plx_prova"
        self.prossimi_errori: list[int] = []

    def gestisci(self, richiesta: httpx.Request) -> httpx.Response:
        percorso = richiesta.url.path.replace("/api/v1", "")
        self.chiamate.append((richiesta.method, percorso))
        if richiesta.headers.get("Authorization") != f"Bearer {self.token_valido}":
            return httpx.Response(401, json={"errore": "token non valido"})
        if self.prossimi_errori:
            return httpx.Response(self.prossimi_errori.pop(0), json={"errore": "guasto simulato"})
        if percorso == "/stato":
            return httpx.Response(200, json={"api": "1.1", "piattaforma": "Plexus", "azienda": "SGM (finto)", "utente": {"nome": "N", "email": "n@x.it", "ruolo": "ceo"}, "posta_lead_pronta": True})
        if percorso == "/eventi" and richiesta.method == "POST":
            corpo = json.loads(richiesta.content)
            esistente = next((e for e in self.eventi if e["uuid_app"] == corpo["uuid"]), None)
            if esistente:
                esistente.update({k: v for k, v in corpo.items() if k != "uuid"})
                return httpx.Response(200, json={"evento": esistente, "creato": False})
            evento = {"id": len(self.eventi) + 1, "uuid_app": corpo["uuid"], "archiviato": False, **{k: v for k, v in corpo.items() if k != "uuid"}}
            self.eventi.append(evento)
            return httpx.Response(201, json={"evento": evento, "creato": True})
        if percorso.startswith("/eventi/") and percorso.endswith("/lead") and richiesta.method == "POST":
            eid = int(percorso.split("/")[2])
            if not any(e["id"] == eid for e in self.eventi):
                return httpx.Response(404, json={"errore": "evento inesistente"})
            corpo = json.loads(richiesta.content)
            esistente = next((l for l in self.lead if l["uuid"] == corpo["uuid"]), None)
            if esistente:
                return httpx.Response(200, json={"lead": esistente, "creata": False, "ringraziamento": {"esito": "gia_inviato", "dettaglio": "già spedita"}})
            lead = {"id": len(self.lead) + 1, "evento_id": eid, "stato": "nuova", **corpo}
            self.lead.append(lead)
            return httpx.Response(201, json={"lead": lead, "creata": True, "ringraziamento": {"esito": "inviato", "dettaglio": "mail spedita"}})
        if percorso.startswith("/eventi/") and percorso.endswith("/lead") and richiesta.method == "GET":
            eid = int(percorso.split("/")[2])
            return httpx.Response(200, json={"lead": [{**l, "ringraziamento": {"esito": "inviato", "inviato_il": "2026-10-16T10:21:05"}} for l in self.lead if l["evento_id"] == eid]})
        if percorso.startswith("/eventi/") and richiesta.method == "PUT":
            eid = int(percorso.split("/")[2])
            evento = next((e for e in self.eventi if e["id"] == eid), None)
            if not evento:
                return httpx.Response(404, json={"errore": "evento inesistente"})
            evento.update(json.loads(richiesta.content))
            return httpx.Response(200, json={"evento": evento})
        if percorso.startswith("/lead/") and percorso.endswith("/foto") and richiesta.method == "POST":
            lid = int(percorso.split("/")[2])
            foto = {"id": len(self.foto) + 1, "lead_id": lid, "multipart": richiesta.headers.get("content-type", "").startswith("multipart/form-data")}
            self.foto.append(foto)
            return httpx.Response(201, json={"foto_id": foto["id"], "tipo": "biglietto", "uuid": "x", "creata": True})
        return httpx.Response(404, json={"errore": f"sconosciuto {percorso}"})


@pytest.fixture()
def plexus():
    finto = PlexusFinto()
    integrazioni.usa_trasporto_di_prova(httpx.MockTransport(finto.gestisci))
    yield finto
    integrazioni.usa_trasporto_di_prova(None)


def giro():
    with fabbrica_sessioni()() as db:
        return integrazioni.esegui_una_volta(db)


def test_collegamento_plexus_e_invio_di_eventi_lead_e_foto(client, plexus):
    admin = registra(client)
    h = intestazioni(admin["token"]["token_accesso"])
    # dati creati PRIMA del collegamento: verranno mandati tutti
    evento = client.post("/api/v1/eventi", json=EVENTO, headers=h).json()["evento"]
    lead = client.post(f"/api/v1/eventi/{evento['id']}/lead", json=LEAD, headers=h).json()["lead"]
    client.post(f"/api/v1/lead/{lead['id']}/foto", files={"file": ("b.jpg", io.BytesIO(b"\xff\xd8\xff123"), "image/jpeg")}, data={"tipo": "biglietto", "uuid": "foto-0001-abcd"}, headers=h)
    # codice sbagliato → rifiutato subito
    r = client.put("/api/v1/azienda/integrazioni/plexus", json={"url": "https://plexus.sgm.it", "codice": "plx_sbagliato"}, headers=h)
    assert r.status_code == 400 and r.json()["tipo"] == "verifica_fallita"
    r = client.put("/api/v1/azienda/integrazioni/plexus", json={"url": "https://plexus.sgm.it", "codice": "plx_prova"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["stato"] == "ok" and r.json()["dettagli"]["azienda"] == "SGM (finto)" and r.json()["in_coda"] == 3
    assert client.get("/api/v1/stato", headers=h).json()["posta_lead_pronta"] is True
    assert giro() == 3
    assert [c for c in plexus.chiamate if c[0] == "POST"] == [("POST", "/eventi"), ("POST", "/eventi/1/lead"), ("POST", "/lead/1/foto")]
    assert plexus.eventi[0]["questionario"][0]["consenso"] is True and plexus.foto[0]["multipart"]
    elenco = client.get(f"/api/v1/eventi/{evento['id']}/lead", headers=h).json()["lead"]
    assert elenco[0]["gestionale"] == {"id": 1, "stato": "nuova"} and elenco[0]["ringraziamento"]["esito"] == "inviato"
    assert client.get("/api/v1/azienda/integrazioni", headers=h).json()[0]["in_coda"] == 0
    # una modifica alla lead → rimandata con lo stesso uuid; "gia_inviato" non cambia l'esito
    client.post(f"/api/v1/eventi/{evento['id']}/lead", json={**LEAD, "note": "x"}, headers=h)
    assert giro() == 1
    assert len(plexus.lead) == 1
    assert client.get(f"/api/v1/eventi/{evento['id']}/lead", headers=h).json()["lead"][0]["ringraziamento"]["esito"] == "inviato"
    # archiviazione → PUT
    client.put(f"/api/v1/eventi/{evento['id']}", json={"archiviato": True}, headers=h)
    giro()
    assert plexus.eventi[0]["archiviato"] is True


def test_errori_di_plexus(client, plexus):
    admin = registra(client)
    h = intestazioni(admin["token"]["token_accesso"])
    client.put("/api/v1/azienda/integrazioni/plexus", json={"url": "https://plexus.sgm.it", "codice": "plx_prova"}, headers=h)
    evento = client.post("/api/v1/eventi", json=EVENTO, headers=h).json()["evento"]
    # 500: tentativo contato, riprova dopo
    plexus.prossimi_errori.append(500)
    assert giro() == 0
    ops = client.get("/api/v1/azienda/integrazioni", headers=h).json()[0]
    assert ops["in_errore"] == 1
    with fabbrica_sessioni()() as db:
        from capta_cloud.modelli import OperazioneIntegrazione, adesso

        for op in db.query(OperazioneIntegrazione):
            op.prossimo_tentativo = adesso()
        db.commit()
    assert giro() == 1
    # token revocato: l'integrazione si ferma e lo dice
    plexus.token_valido = "plx_nuovo"
    client.post(f"/api/v1/eventi/{evento['id']}/lead", json=LEAD, headers=h)
    giro()
    integrazione = client.get("/api/v1/azienda/integrazioni", headers=h).json()[0]
    assert integrazione["stato"] == "token_non_valido" and integrazione["in_coda"] == 1
    # nuovo codice → riparte
    r = client.put("/api/v1/azienda/integrazioni/plexus", json={"url": "https://plexus.sgm.it", "codice": "plx_nuovo"}, headers=h)
    assert r.status_code == 200 and r.json()["stato"] == "ok"
    giro()
    assert len(plexus.lead) == 1
    with fabbrica_sessioni()() as db:
        assert db.query(Lead).one().gestionale_id == 1
        assert db.get(Azienda, admin["me"]["azienda"]["id"]).piano == "prova"
