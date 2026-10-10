# Piano: da appendice di Plexus a prodotto indipendente (Capta Cloud)

Stato: approvato da Nicholas il 10 ottobre 2026. Questo documento è la guida del lavoro: viene
aggiornato man mano.

## Obiettivo

Capta Lead deve diventare un'app a sé, vendibile ad altre aziende: account, aziende con più
persone, dati condivisi tra i dispositivi di un'azienda, "chi ha registrato cosa", personalizzazione
per cliente, integrazioni con i gestionali (Plexus per primo) configurate una volta per azienda.
Piano commerciale: prova interna gratuita in SGM Pharma; poi vendita **per singolo evento**, con
proposta di **abbonamento annuale** a chi l'ha usata.

## Architettura

```
Tablet / telefono (PWA Capta Lead, offline-first, coda di sincronizzazione)
        │  HTTPS, accesso con account (token)
        ▼
Capta Cloud (Python/FastAPI + PostgreSQL, cartella cloud/ di questo repository)
   aziende · utenti · inviti · dispositivi · eventi · lead · foto · piani · integrazioni
        │  (dal server, in sottofondo)
        ▼
Gestionali dei clienti: Plexus (API 1.1) oggi; altri CRM / webhook domani
```

- La PWA continua a funzionare senza rete: salva in locale e sincronizza con Capta Cloud appena può.
  Il motore di sincronizzazione resta quello di oggi; cambia solo la destinazione (prima Plexus,
  ora Capta Cloud) e si aggiunge l'accesso con account.
- Capta Cloud è l'unico server con cui parlano i dispositivi. È lui a inviare a Plexus (o ad altri
  gestionali) i dati dell'azienda che ha configurato l'integrazione, con una coda e ritentativi
  lato server.
- Ospitato all'inizio sullo stesso server di Plexus (processo e database separati), poi su un server
  dedicato quando arriva il primo cliente esterno. Dati in Europa.
- Modalità "senza account" (solo locale) conservata: serve per provare l'app e come piano gratuito.

## Dati (Capta Cloud)

| Tabella | Contenuto |
| --- | --- |
| aziende | nome, slug, piano, limiti, configurazione del marchio (nome app, colori, privacy, questionario e categorie predefiniti, lingue), creata_il |
| utenti | azienda, email, nome, password (hash), ruolo (`amministratore` / `operatore`), verificato, attivo |
| inviti | azienda, email, ruolo, codice, scadenza, usato_il |
| sessioni | utente, dispositivo, refresh token (hash), scadenza, revocata |
| dispositivi | azienda, utente, nome ("iPad stand 1"), ultimo accesso |
| eventi | uuid (dall'app), azienda, campi dell'evento, questionario, categorie, archiviato, creato_da, versione |
| lead | uuid (dall'app), azienda, evento, anagrafica, consenso, risposte, categoria, **registrata_da**, dispositivo, creato_il, aggiornato_il, eliminata |
| foto | uuid, lead, tipo, file, mime, dimensione, caricata_da |
| integrazioni | azienda, tipo (`plexus`), indirizzo, codice (cifrato), stato, ultimo errore |
| integrazioni_coda | operazioni verso il gestionale (evento, lead, foto) con tentativi ed esiti |
| lead_gestionale | lead ↔ id in Plexus, esito della mail di ringraziamento |
| registro | chi ha fatto cosa e quando (accessi, inviti, cancellazioni) |

## API di Capta Cloud (base `/api/v1`)

Stessa forma del contratto Plexus 1.1 per eventi, lead e foto (così l'app cambia poco), più:

- **Accesso**: registrazione (crea azienda + primo amministratore), accesso (email + password →
  token breve + token di rinnovo), rinnovo, uscita, verifica email, password dimenticata/reimposta,
  `GET /me` (utente, azienda, ruolo, piano, configurazione del marchio).
- **Azienda** (solo amministratori): dati, configurazione del marchio, utenti, inviti, dispositivi,
  piano e limiti, integrazioni (Plexus: indirizzo + codice, verifica, stato).
- **Sincronizzazione**: eventi e lead con uuid generati dall'app (rimandare = aggiornare), lead con
  `registrata_da`, foto con uuid, elenco e scaricamento foto, allineamento incrementale
  (`?da=<data>`), stato dell'integrazione per ogni lead (es. "arrivata in Plexus, mail inviata").

## Fasi

### Fase 1 — fondamenta (fatta il 10 ottobre 2026, da pubblicare)

1. Progetto `cloud/`: FastAPI, SQLAlchemy, migrazioni, test automatici; esecuzione locale senza
   Docker (SQLite in sviluppo, PostgreSQL in produzione).
2. Account e aziende: registrazione, accesso, verifica email, recupero password, inviti, ruoli,
   dispositivi; email transazionali (in sviluppo stampate a console, in produzione via SMTP).
3. Eventi, lead, foto per azienda con attribuzione; piani e limiti; configurazione del marchio.
4. Integrazione Plexus lato server (coda + ritentativi), configurata per azienda.
5. App: schermata di accesso (con "continua senza account"), client Capta Cloud, sincronizzazione,
   marchio scaricato dal cloud, "registrata da" e filtri/report per operatore, area
   Amministrazione (utenti, inviti, integrazioni, piano, personalizzazione).
6. Pubblicazione di Capta Cloud sul server, dominio, HTTPS, backup. **← prossimo passo** (servono le
   informazioni sul server di Plexus, un dominio e un servizio per le email).

Stato: punti 1-5 fatti e provati (13 test del server, 80 test dell'app, 8 prove nel browser di cui una
contro il Capta Cloud vero). Rimandato a dopo la pubblicazione: editor completo del questionario
predefinito nell'amministrazione (oggi si imposta per evento), limitazione dei tentativi di accesso,
migrazioni Alembic (oggi le tabelle si creano all'avvio).

### Fase 2 — prodotto

Lettura del badge con QR (vCard/MeCard/testo, con mappatura per organizzatore), mail di ringraziamento
da Capta (collega la tua casella: SMTP, poi Google/Microsoft), cruscotto dell'evento, modalità
visitatore (tablet bloccato sul questionario), strumenti privacy (versioni dell'informativa,
registro consensi, cancellazione/esportazione), gestione dispositivi, assegnazione lead e promemoria.

### Fase 3 — vendita

Pagamenti (per evento e annuale), sito di presentazione, registrazione in autonomia, onboarding,
altre lingue, documentazione per i clienti.

## Prezzi di partenza (da verificare con i primi clienti)

- Gratuito: 1 utente, 1 evento attivo, 50 contatti, report.
- Per evento: 149 € — persone, dispositivi e contatti illimitati, mail di ringraziamento, Excel/PDF.
- Annuale: 990 € — eventi illimitati, integrazioni con il gestionale.

Riferimento: noleggio lettori 350-735 $ per dispositivo per evento; Cvent 200-500 $ per licenza per
evento; iCapture 500-800 $ per evento per dispositivo; Captello da 500 $; Blinq 9,99 $ per contatto.

## Decisioni prese

- Tecnologia del server: Python/FastAPI come Plexus (stesso modo di lavorare per i due prodotti).
- L'app parla solo con Capta Cloud; Plexus riceve dal cloud. La modalità "dispositivo → Plexus
  diretto" di oggi resta disponibile per compatibilità ma non è più la via principale.
- Il contratto dell'API di Capta Cloud ricalca quello di Plexus 1.1 (già collaudato).

## Cose da avere da Nicholas

- Informazioni sul server di Plexus (fornitore, Docker o no, database, proxy HTTPS, backup, versione
  di Python) per decidere la pubblicazione.
- Un dominio per il prodotto (es. `capta-lead.it`): serve per l'indirizzo dell'API e per le email.
- Un servizio per le email transazionali (verifica account, inviti, recupero password): Brevo o
  Resend hanno piani gratuiti; oppure la casella SMTP del dominio.
