# Capta Cloud

Il server di Capta Lead: account, aziende con più utenti, eventi, contatti e foto condivisi tra i
dispositivi di un'azienda, integrazioni con i gestionali (Plexus). Python 3.12 + FastAPI + SQLAlchemy.
Il piano generale è in [../docs/PIANO_CAPTA_CLOUD.md](../docs/PIANO_CAPTA_CLOUD.md).

## Avviare in locale

Serve [uv](https://docs.astral.sh/uv/) (installa da solo Python 3.12):

```bash
uv sync
```

```bash
uv run uvicorn capta_cloud.principale:app --reload --port 8000
```

- API: `http://localhost:8000/api/v1` (documentazione interattiva su `/api/v1/documentazione`).
- In sviluppo non serve configurare nulla: database SQLite in `dati/capta.db`, foto in `dati/foto/`,
  email stampate nel terminale (il link di verifica o di invito si copia da lì).
- Test: `uv run pytest`

## Impostazioni (variabili d'ambiente, prefisso `CAPTA_`, oppure file `.env`)

| Variabile | Significato | Predefinito |
| --- | --- | --- |
| `CAPTA_AMBIENTE` | `sviluppo`, `produzione`, `test` | `sviluppo` |
| `CAPTA_DATABASE_URL` | es. `postgresql+psycopg://utente:password@localhost/capta` | SQLite in `dati/` |
| `CAPTA_CARTELLA_FOTO` | dove salvare le foto | `dati/foto` |
| `CAPTA_CHIAVE_SEGRETA` | firma dei token di accesso (**obbligatoria in produzione**, lunga e casuale) | casuale a ogni avvio |
| `CAPTA_CHIAVE_CIFRATURA` | chiave Fernet per i codici dei gestionali (consigliata in produzione) | derivata dalla segreta |
| `CAPTA_URL_APP` | indirizzo dell'app, per i link nelle email | `http://localhost:5173` |
| `CAPTA_ORIGINI` | origini ammesse (CORS), separate da virgola | `*` |
| `CAPTA_POSTA` | `console` oppure `smtp` | `console` |
| `CAPTA_POSTA_MITTENTE`, `CAPTA_SMTP_HOST`, `CAPTA_SMTP_PORTA`, `CAPTA_SMTP_UTENTE`, `CAPTA_SMTP_PASSWORD`, `CAPTA_SMTP_TLS` | invio email in produzione | |
| `CAPTA_INTEGRAZIONI_ATTIVE` | lavoratore che manda ai gestionali | `true` |

Per generare le chiavi: `uv run python -c "import secrets;print(secrets.token_urlsafe(48))"` e
`uv run python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`.

## Come è fatto

```
capta_cloud/
  principale.py      l'applicazione FastAPI (CORS, errori, avvio del lavoratore)
  impostazioni.py    variabili d'ambiente
  db.py, modelli.py  database e tabelle (ogni riga ha la sua azienda_id)
  sicurezza.py       password (argon2), token (JWT), codici monouso, cifratura
  posta.py           email transazionali (console / SMTP), testi it/en
  schemi.py          forme dei dati dell'API
  dipendenze.py      chi sta chiamando (token) e con quale ruolo
  api/accesso.py     registrazione, accesso, rinnovo, verifica email, password, inviti, /me
  api/azienda.py     amministrazione: dati, personalizzazione, utenti, inviti, dispositivi, integrazioni, registro
  api/dati.py        eventi, lead, foto (stessa forma del contratto Plexus 1.1 + registrata_da)
  servizi/piani.py   piani e limiti
  servizi/account.py sessioni, codici, risposte /me
  servizi/plexus_client.py  client verso Plexus
  servizi/integrazioni.py   coda e lavoratore che manda ai gestionali
test/                test automatici (pytest), con un Plexus finto
```

## Regole

- Ogni query filtra per `azienda_id`: nessun dato di un'azienda è raggiungibile da un'altra.
- Gli errori sono sempre `{"errore": "spiegazione", "tipo": "..."}`.
- I codici dei gestionali sono cifrati nel database e non escono mai dalle API.
- Lingua di codice, commenti e testi: italiano.
