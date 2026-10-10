import io

from conftest import intestazioni, registra

EVENTO = {"uuid": "evento-0001-abcd", "nome": "Congresso SIME", "luogo": "Roma", "data_inizio": "2026-11-05", "data_fine": "2026-11-07", "lingua": "it", "linea": "estetica",
          "questionario": [{"domanda": "Ruolo?", "opzioni": ["Medico", "Altro"], "traduzioni": {"en": {"domanda": "Role?", "opzioni": ["Doctor", "Other"]}}},
                           {"domanda": "Consenso?", "opzioni": ["Sì", "No"], "consenso": True}],
          "categorie_suggerite": ["caldo", "vip"], "ringraziamento_attivo": True}
LEAD = {"uuid": "lead-0001-abcd", "nome": "Anna", "cognome": "Bianchi", "email": "Anna@Clinica.it", "categoria": "caldo", "risposte": {"Ruolo?": "Medico", "Consenso?": "Sì"}}


def test_eventi_e_lead_con_uuid_e_attribuzione(client):
    admin = registra(client)
    h = intestazioni(admin["token"]["token_accesso"])
    r = client.post("/api/v1/eventi", json=EVENTO, headers=h)
    assert r.status_code == 201, r.text
    evento = r.json()["evento"]
    assert evento["uuid_app"] == EVENTO["uuid"] and evento["categorie_suggerite"] == ["caldo", "vip"]
    assert evento["questionario"][0]["traduzioni"]["en"]["domanda"] == "Role?"
    # rimandare lo stesso uuid = aggiornamento (200)
    r = client.post("/api/v1/eventi", json={**EVENTO, "nome": "Congresso SIME 2026"}, headers=h)
    assert r.status_code == 200 and r.json()["creato"] is False
    assert len(client.get("/api/v1/eventi", headers=h).json()["eventi"]) == 1
    # lead
    r = client.post(f"/api/v1/eventi/{evento['id']}/lead", json=LEAD, headers=h)
    assert r.status_code == 201, r.text
    lead = r.json()["lead"]
    assert lead["email"] == "anna@clinica.it" and lead["consenso"] == "S"
    assert lead["registrata_da"] == {"id": admin["me"]["utente"]["id"], "nome": "Anna"}
    assert r.json()["ringraziamento"]["esito"] == "saltato"  # nessun gestionale collegato
    r = client.post(f"/api/v1/eventi/{evento['id']}/lead", json={**LEAD, "note": "vuole il listino"}, headers=h)
    assert r.status_code == 200 and r.json()["creata"] is False
    elenco = client.get(f"/api/v1/eventi/{evento['id']}/lead", headers=h).json()["lead"]
    assert len(elenco) == 1 and elenco[0]["note"] == "vuole il listino"
    # email non valida
    assert client.post(f"/api/v1/eventi/{evento['id']}/lead", json={**LEAD, "uuid": "lead-0002-abcd", "email": "nonvalida"}, headers=h).status_code == 400
    # archiviazione via PUT
    r = client.put(f"/api/v1/eventi/{evento['id']}", json={"archiviato": True}, headers=h)
    assert r.status_code == 200 and r.json()["evento"]["archiviato"] is True
    assert client.get("/api/v1/eventi", headers=h).json()["eventi"] == []
    assert len(client.get("/api/v1/eventi?archiviati=1", headers=h).json()["eventi"]) == 1


def test_le_aziende_non_si_vedono(client):
    a = registra(client, azienda="Azienda A", email="a@a.it")
    b = registra(client, azienda="Azienda B", email="b@b.it")
    ha, hb = intestazioni(a["token"]["token_accesso"]), intestazioni(b["token"]["token_accesso"])
    evento = client.post("/api/v1/eventi", json=EVENTO, headers=ha).json()["evento"]
    assert client.get("/api/v1/eventi", headers=hb).json()["eventi"] == []
    assert client.get(f"/api/v1/eventi/{evento['id']}", headers=hb).status_code == 404
    assert client.post(f"/api/v1/eventi/{evento['id']}/lead", json=LEAD, headers=hb).status_code == 404
    # stesso uuid in due aziende diverse: nessun conflitto
    assert client.post("/api/v1/eventi", json=EVENTO, headers=hb).status_code == 201


def test_limiti_del_piano_prova(client):
    admin = registra(client)
    h = intestazioni(admin["token"]["token_accesso"])
    client.post("/api/v1/eventi", json=EVENTO, headers=h)
    r = client.post("/api/v1/eventi", json={**EVENTO, "uuid": "evento-0002-abcd"}, headers=h)
    assert r.status_code == 402 and r.json()["tipo"] == "limite_piano"
    me = client.get("/api/v1/me", headers=h).json()
    assert me["azienda"]["piano"]["limiti"]["eventi_attivi"] == 1
    assert me["azienda"]["piano"]["utilizzo"]["eventi_attivi"] == 1


def test_foto_con_uuid_idempotente_e_scaricamento(client):
    admin = registra(client)
    h = intestazioni(admin["token"]["token_accesso"])
    evento = client.post("/api/v1/eventi", json=EVENTO, headers=h).json()["evento"]
    lead = client.post(f"/api/v1/eventi/{evento['id']}/lead", json=LEAD, headers=h).json()["lead"]
    contenuto = b"\xff\xd8\xff" + b"0" * 100
    r = client.post(f"/api/v1/lead/{lead['id']}/foto", files={"file": ("biglietto.jpg", io.BytesIO(contenuto), "image/jpeg")}, data={"tipo": "biglietto", "uuid": "foto-0001-abcd"}, headers=h)
    assert r.status_code == 201, r.text
    foto_id = r.json()["foto_id"]
    r = client.post(f"/api/v1/lead/{lead['id']}/foto", files={"file": ("biglietto.jpg", io.BytesIO(contenuto), "image/jpeg")}, data={"tipo": "biglietto", "uuid": "foto-0001-abcd"}, headers=h)
    assert r.status_code == 200 and r.json() == {"foto_id": foto_id, "tipo": "biglietto", "uuid": "foto-0001-abcd", "creata": False}
    elenco = client.get(f"/api/v1/lead/{lead['id']}/foto", headers=h).json()["foto"]
    assert len(elenco) == 1 and elenco[0]["uuid"] == "foto-0001-abcd"
    r = client.get(f"/api/v1/lead/{lead['id']}/foto/{foto_id}", headers=h)
    assert r.status_code == 200 and r.content == contenuto and r.headers["content-type"].startswith("image/jpeg")
    assert client.post(f"/api/v1/lead/{lead['id']}/foto", files={"file": ("x.gif", io.BytesIO(b"GIF"), "image/gif")}, data={"tipo": "altro"}, headers=h).status_code == 400
    assert client.get(f"/api/v1/eventi/{evento['id']}/lead", headers=h).json()["lead"][0]["n_foto"] == 1


def test_stato_e_configurazione(client):
    admin = registra(client)
    h = intestazioni(admin["token"]["token_accesso"])
    stato = client.get("/api/v1/stato", headers=h).json()
    assert stato["piattaforma"] == "Capta Cloud" and stato["api"] == "1.1" and stato["gestionale"] is None
    r = client.put("/api/v1/azienda/configurazione", json={"app": {"nome": "Capta SGM"}, "linee": {"ortopedia": {"it": "Ortopedia"}}, "boh": 1}, headers=h)
    assert r.status_code == 400
    r = client.put("/api/v1/azienda/configurazione", json={"app": {"nome": "Capta SGM"}, "linee": {"ortopedia": {"it": "Ortopedia"}}}, headers=h)
    assert r.status_code == 200
    assert client.get("/api/v1/stato", headers=h).json()["linee"] == {"ortopedia": "Ortopedia"}
    assert client.get("/api/v1/me", headers=h).json()["azienda"]["configurazione"]["app"]["nome"] == "Capta SGM"
