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
uv run capta-cloud
```

- Porta fissa **8100** (la 8000 è di Plexus sullo stesso Mac); si cambia con `CAPTA_PORTA`.
- API: `http://localhost:8100/api/v1` (documentazione interattiva su `/api/v1/documentazione`).
- L'app in sviluppo (`npm run dev`) propone già `http://localhost:8100` come indirizzo di Capta Cloud.
- In sviluppo non serve configurare nulla: database SQLite in `dati/capta.db`, foto in `dati/foto/`,
  email stampate nel terminale (il link di verifica o di invito si copia da lì).
- Test: `uv run pytest`

## Impostazioni (variabili d'ambiente, prefisso `CAPTA_`, oppure file `.env`)

| Variabile | Significato | Predefinito |
| --- | --- | --- |
| `CAPTA_PORTA` | porta di `uv run capta-cloud` in locale | `8100` |
| `CAPTA_AMBIENTE` | `sviluppo`, `produzione`, `test` | `sviluppo` |
| `CAPTA_DATABASE_URL` | es. `postgresql+psycopg://utente:password@localhost/capta` | SQLite in `dati/` |
| `CAPTA_CARTELLA_FOTO` | dove salvare le foto | `dati/foto` |
| `CAPTA_CHIAVE_SEGRETA` | firma dei token di accesso (**obbligatoria in produzione**, lunga e casuale) | casuale a ogni avvio |
| `CAPTA_CHIAVE_CIFRATURA` | chiave Fernet per i codici dei gestionali (consigliata in produzione) | derivata dalla segreta |
| `CAPTA_URL_APP` | indirizzo dell'app, per i link nelle email | `http://localhost:5173` |
| `CAPTA_ORIGINI` | origini ammesse (CORS), separate da virgola | `*` |
| `CAPTA_POSTA` | `console` (sviluppo: email nel terminale), `nessuna` (link da condividere a mano), `smtp`, `brevo`, `resend` | `console` |
| `CAPTA_VERIFICA_EMAIL` | chiedere la conferma dell'email alla registrazione (spegnerla con `nessuna`) | `true` |
| `CAPTA_POSTA_MITTENTE`, `CAPTA_SMTP_HOST`, `CAPTA_SMTP_PORTA`, `CAPTA_SMTP_UTENTE`, `CAPTA_SMTP_PASSWORD`, `CAPTA_SMTP_TLS` | invio email in produzione | |
| `CAPTA_INTEGRAZIONI_ATTIVE` | lavoratore che manda ai gestionali | `true` |
| `CAPTA_ARCHIVIO_FOTO` | `disco` (cartella locale), `s3` (Object Storage, obbligatorio con più server) oppure `database` (hosting gratuiti senza disco) | `disco` |
| `CAPTA_EMAIL_PIANO_INTERNO` | email o domini (`@azienda.it`) con piano "interno" senza limiti, separati da virgola | |
| `CAPTA_S3_BUCKET`, `CAPTA_S3_ENDPOINT`, `CAPTA_S3_REGIONE`, `CAPTA_S3_CHIAVE`, `CAPTA_S3_SEGRETO`, `CAPTA_S3_PREFISSO` | dati dell'Object Storage compatibile S3 | |
| `CAPTA_POSTA` = `brevo` + `CAPTA_BREVO_API_KEY`, oppure `resend` + `CAPTA_RESEND_API_KEY` | email tramite API HTTPS (consigliato: nessuna porta SMTP da sbloccare) | |

Per generare le chiavi: `uv run python -c "import secrets;print(secrets.token_urlsafe(48))"` e
`uv run python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`.

## Pubblicare

C'è un `Dockerfile`: va bene per Railway, Fly.io, Render o un server con Docker. Il contenitore ascolta
sulla porta `PORT` (8100 se non impostata). In produzione servono almeno: `CAPTA_CHIAVE_SEGRETA`,
`CAPTA_CHIAVE_CIFRATURA`, `CAPTA_DATABASE_URL` (PostgreSQL), `CAPTA_URL_APP`, `CAPTA_ORIGINI`,
`CAPTA_POSTA` con la sua chiave, e, con più istanze, `CAPTA_ARCHIVIO_FOTO=s3` con i dati del bucket.

Per la fase di test gratuita (Render + Neon + Brevo) c'è il file `render.yaml` nella cartella principale
e la guida [../docs/PUBBLICARE_CAPTA_CLOUD_GRATIS.md](../docs/PUBBLICARE_CAPTA_CLOUD_GRATIS.md).

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
