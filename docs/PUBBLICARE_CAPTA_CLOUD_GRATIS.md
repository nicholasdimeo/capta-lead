# Mettere online Capta Cloud gratis (fase di test)

Per la fase di test tutto gira su piani gratuiti, senza carta di credito:

| Pezzo | Servizio | Costo | Limiti che contano |
| --- | --- | --- | --- |
| App (PWA) | Vercel (già online: `https://capta-lead.vercel.app`) | 0 € | uso personale/non commerciale |
| Server Capta Cloud | Render, piano Free | 0 € | si addormenta dopo 15 minuti senza richieste e ci mette circa un minuto a risvegliarsi; 750 ore al mese (bastano per 24 ore su 24) |
| Database | Neon, piano Free | 0 € | 1 GB (foto comprese: qualche migliaio); non scade |
| Email (verifica, inviti, password) | Brevo, piano Free | 0 € | 300 email al giorno |
| Codice | GitHub | 0 € | |

Il risveglio di Render non è un problema allo stand: l'app salva tutto sul tablet e sincronizza da sola;
al primo invio dopo una pausa il contatto resta "In coda" per circa un minuto, poi parte.

Le foto, su questi piani, si salvano dentro il database (non c'è un disco permanente). Quando il
prodotto verrà venduto si passerà a piani a pagamento e alle foto su Object Storage (già pronto nel codice).

## 1. Neon (database)

1. Su neon.com: *Sign up* con GitHub.
2. Crea un progetto: nome `capta`, versione Postgres più recente, regione **Europa (Frankfurt)**.
3. Nella pagina del progetto premi *Connect*: copia la **connection string** (inizia con `postgresql://`).
   Tienila da parte, serve al punto 3. Non incollarla in chat.

## 2. Brevo (email)

1. Su brevo.com crea l'account gratuito.
2. *Senders, Domains & Dedicated IPs → Senders → Add a sender*: aggiungi il tuo indirizzo email (es. la tua
   Gmail) e confermalo dal link che ricevi. Sarà il mittente delle email di Capta Lead.
3. *SMTP & API → API Keys → Generate a new API key*: copiala e tienila da parte (non in chat).

## 3. Render (server)

1. Su render.com: *Get Started* con GitHub, e dai a Render accesso al repository `capta-lead`.
2. *New → Blueprint*, scegli il repository `capta-lead`: Render trova il file `render.yaml` e propone il
   servizio `capta-cloud` (piano Free, Frankfurt).
3. Ti chiede i valori mancanti:
   - `CAPTA_DATABASE_URL`: la connection string di Neon.
   - `CAPTA_BREVO_API_KEY`: la chiave API di Brevo.
   - `CAPTA_POSTA_MITTENTE`: `Capta Lead <il-tuo-indirizzo@gmail.com>` (lo stesso confermato su Brevo).
   - `CAPTA_EMAIL_PIANO_INTERNO`: le email che non devono avere limiti durante il test, per esempio
     `@sgmpharma.it, nicholas.dimeoo@gmail.com`.
4. *Apply*. Dopo qualche minuto il servizio è online a un indirizzo del tipo
   `https://capta-cloud.onrender.com`. Aprendo `https://capta-cloud.onrender.com/api/v1/salute` deve
   comparire `{"ok":"sì",…}`.

## 4. Vercel (dire all'app dov'è Capta Cloud)

1. Su vercel.com, progetto `capta-lead` → *Settings → Environment Variables*.
2. Aggiungi `VITE_CAPTA_CLOUD_URL` con l'indirizzo di Render (es. `https://capta-cloud.onrender.com`).
3. *Deployments* → sull'ultimo deploy, menu ⋯ → *Redeploy*.

## 5. Primo accesso

1. Apri l'app, *Impostazioni → Crea un account*: nome dell'azienda, il tuo nome, email e password.
   Diventi amministratore; con un'email dell'elenco del punto 3 il piano è "uso interno", senza limiti.
2. Conferma l'email dal link che ricevi.
3. *Amministrazione → Utenti*: invita i colleghi che saranno allo stand.
4. *Amministrazione → Gestionale*: collega Plexus (indirizzo e codice `plx_`), quando Plexus sarà online
   su internet. Da lì in poi è Capta Cloud a mandare i contatti a Plexus: i tablet non parlano più con Plexus.
