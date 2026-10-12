from conftest import DISPOSITIVO, intestazioni, leggi_link, registra


def test_registrazione_crea_azienda_amministratore_e_manda_la_verifica(client, posta):
    dati = registra(client)
    assert dati["me"]["utente"]["ruolo"] == "amministratore"
    assert dati["me"]["utente"]["verificato"] is False
    assert dati["me"]["azienda"]["nome"] == "SGM Pharma"
    assert dati["me"]["azienda"]["piano"]["nome"] == "prova"
    assert dati["token"]["token_accesso"] and dati["token"]["token_rinnovo"]
    assert len(posta.inviate) == 1 and posta.inviate[0].a == "anna@sgm.it"
    codice = leggi_link(posta.inviate[0].testo)
    assert client.post("/api/v1/auth/verifica-email", json={"codice": codice}).status_code == 200
    me = client.get("/api/v1/me", headers=intestazioni(dati["token"]["token_accesso"])).json()
    assert me["utente"]["verificato"] is True
    # il codice vale una volta sola
    assert client.post("/api/v1/auth/verifica-email", json={"codice": codice}).status_code == 400


def test_password_debole_ed_email_doppia(client):
    r = client.post("/api/v1/auth/registrazione", json={"azienda_nome": "Azienda X", "nome": "A", "email": "a@x.it", "password": "corta"})
    assert r.status_code == 400 and r.json()["tipo"] == "password_debole"
    registra(client, email="a@x.it")
    r = client.post("/api/v1/auth/registrazione", json={"azienda_nome": "Azienda Y", "nome": "B", "email": "A@X.IT", "password": "segreta123"})
    assert r.status_code == 409


def test_accesso_rinnovo_e_uscita(client):
    registra(client)
    assert client.post("/api/v1/auth/accesso", json={"email": "anna@sgm.it", "password": "sbagliata"}).status_code == 401
    r = client.post("/api/v1/auth/accesso", json={"email": "ANNA@sgm.it", "password": "segreta123", "dispositivo": DISPOSITIVO})
    assert r.status_code == 200
    token = r.json()["token"]
    # rinnovo: nuovo token di accesso, vecchio token di rinnovo non più valido
    r2 = client.post("/api/v1/auth/rinnovo", json={"token_rinnovo": token["token_rinnovo"]})
    assert r2.status_code == 200
    nuovo = r2.json()
    assert client.post("/api/v1/auth/rinnovo", json={"token_rinnovo": token["token_rinnovo"]}).status_code == 401
    assert client.get("/api/v1/me", headers=intestazioni(nuovo["token_accesso"])).status_code == 200
    # uscita: il token di rinnovo è revocato
    assert client.post("/api/v1/auth/uscita", json={"token_rinnovo": nuovo["token_rinnovo"]}).status_code == 200
    assert client.post("/api/v1/auth/rinnovo", json={"token_rinnovo": nuovo["token_rinnovo"]}).status_code == 401


def test_senza_token_o_con_token_falso(client):
    assert client.get("/api/v1/me").status_code == 401
    assert client.get("/api/v1/me", headers=intestazioni("falso")).status_code == 401
    assert client.get("/api/v1/eventi", headers=intestazioni("falso")).json()["tipo"] == "token_non_valido"


def test_password_dimenticata(client, posta):
    registra(client)
    posta.inviate.clear()
    assert client.post("/api/v1/auth/password-dimenticata", json={"email": "nessuno@x.it"}).status_code == 200
    assert posta.inviate == []
    assert client.post("/api/v1/auth/password-dimenticata", json={"email": "anna@sgm.it"}).status_code == 200
    codice = leggi_link(posta.inviate[0].testo)
    assert client.post("/api/v1/auth/password-reimposta", json={"codice": codice, "password": "nuovissima1"}).status_code == 200
    assert client.post("/api/v1/auth/accesso", json={"email": "anna@sgm.it", "password": "segreta123"}).status_code == 401
    assert client.post("/api/v1/auth/accesso", json={"email": "anna@sgm.it", "password": "nuovissima1"}).status_code == 200


def test_invito_e_ruoli(client, posta):
    admin = registra(client)
    h = intestazioni(admin["token"]["token_accesso"])
    # piano prova: un solo utente
    r = client.post("/api/v1/azienda/inviti", json={"email": "marco@sgm.it", "ruolo": "operatore"}, headers=h)
    assert r.status_code == 402 and r.json()["tipo"] == "limite_piano"
    # con il piano interno si può invitare
    from capta_cloud.db import fabbrica_sessioni
    from capta_cloud.modelli import Azienda

    with fabbrica_sessioni()() as db:
        a = db.get(Azienda, admin["me"]["azienda"]["id"])
        a.piano = "interno"
        db.commit()
    posta.inviate.clear()
    r = client.post("/api/v1/azienda/inviti", json={"email": "marco@sgm.it", "ruolo": "operatore"}, headers=h)
    assert r.status_code == 201, r.text
    codice = leggi_link(posta.inviate[0].testo)
    info = client.get(f"/api/v1/inviti/{codice}").json()
    assert info == {"valido": True, "azienda": "SGM Pharma", "app": "Capta Lead", "email": "marco@sgm.it", "ruolo": "operatore"}
    r = client.post(f"/api/v1/inviti/{codice}/accetta", json={"nome": "Marco", "password": "segreta123"})
    assert r.status_code == 201
    marco = r.json()
    assert marco["me"]["utente"]["ruolo"] == "operatore" and marco["me"]["utente"]["verificato"] is True
    assert marco["me"]["azienda"]["id"] == admin["me"]["azienda"]["id"]
    # l'operatore non entra nell'amministrazione
    hm = intestazioni(marco["token"]["token_accesso"])
    assert client.get("/api/v1/azienda/utenti", headers=hm).status_code == 403
    assert client.get("/api/v1/eventi", headers=hm).status_code == 200
    # l'amministratore vede due utenti e può disattivare Marco, ma non se stesso
    utenti = client.get("/api/v1/azienda/utenti", headers=h).json()
    assert [u["email"] for u in utenti] == ["anna@sgm.it", "marco@sgm.it"]
    assert client.put(f"/api/v1/azienda/utenti/{admin['me']['utente']['id']}", json={"attivo": False}, headers=h).status_code == 400
    assert client.put(f"/api/v1/azienda/utenti/{marco['me']['utente']['id']}", json={"attivo": False}, headers=h).status_code == 200
    assert client.get("/api/v1/me", headers=hm).status_code == 401
    assert client.post("/api/v1/auth/rinnovo", json={"token_rinnovo": marco["token"]["token_rinnovo"]}).status_code == 401


def test_senza_servizio_email_link_da_condividere(client, posta, monkeypatch):
    from capta_cloud.impostazioni import impostazioni

    monkeypatch.setattr(impostazioni(), "posta", "nessuna")
    monkeypatch.setattr(impostazioni(), "verifica_email", False)
    monkeypatch.setattr(impostazioni(), "email_piano_interno", "@sgm.it")
    admin = registra(client)
    assert admin["me"]["utente"]["verificato"] is True  # nessuna conferma richiesta
    h = intestazioni(admin["token"]["token_accesso"])
    # invito: il link torna all'amministratore, nessuna email
    posta.inviate.clear()
    r = client.post("/api/v1/azienda/inviti", json={"email": "marco@sgm.it", "ruolo": "operatore"}, headers=h)
    assert r.status_code == 201, r.text
    invito = r.json()
    assert invito["email_inviata"] is False and invito["link"].startswith("https://app.prova/#/invito/")
    assert invito["link"].endswith("?server=http%3A%2F%2Ftestserver")  # il link porta l'indirizzo del server
    assert posta.inviate == []
    # nuovo link: il vecchio non vale più
    r = client.post(f"/api/v1/azienda/inviti/{invito['id']}/link", headers=h)
    assert r.status_code == 200
    vecchio, nuovo = invito["link"].split("?")[0].rsplit("/", 1)[-1], r.json()["link"].split("?")[0].rsplit("/", 1)[-1]
    assert client.get(f"/api/v1/inviti/{vecchio}").json()["valido"] is False
    assert client.get(f"/api/v1/inviti/{nuovo}").json()["valido"] is True
    marco = client.post(f"/api/v1/inviti/{nuovo}/accetta", json={"nome": "Marco", "password": "segreta123"}).json()
    # password dimenticata: il server dice che non manda email
    assert client.post("/api/v1/auth/password-dimenticata", json={"email": "marco@sgm.it"}).json() == {"ok": True, "email_inviata": False}
    # l'amministratore genera il link per Marco
    r = client.post(f"/api/v1/azienda/utenti/{marco['me']['utente']['id']}/link-password", headers=h)
    assert r.status_code == 200 and r.json()["email_inviata"] is False
    codice = r.json()["link"].split("?")[0].rsplit("/", 1)[-1]
    assert client.post("/api/v1/auth/password-reimposta", json={"codice": codice, "password": "nuovissima1"}).status_code == 200
    assert client.post("/api/v1/auth/accesso", json={"email": "marco@sgm.it", "password": "nuovissima1"}).status_code == 200
    # un operatore non può generare link
    hm = intestazioni(client.post("/api/v1/auth/accesso", json={"email": "marco@sgm.it", "password": "nuovissima1"}).json()["token"]["token_accesso"])
    assert client.post(f"/api/v1/azienda/utenti/{marco['me']['utente']['id']}/link-password", headers=hm).status_code == 403
