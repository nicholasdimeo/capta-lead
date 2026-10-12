# Mettere online Capta Cloud gratis (fase di test)

Per la fase di test tutto gira su piani gratuiti, senza carta di credito:

| Pezzo | Servizio | Costo | Limiti che contano |
| --- | --- | --- | --- |
| App (PWA) | Vercel (già online: `https://capta-lead.vercel.app`) | 0 € | uso personale/non commerciale |
| Server Capta Cloud | Render, piano Free | 0 € | si addormenta dopo 15 minuti senza richieste e ci mette circa un minuto a risvegliarsi; 750 ore al mese (bastano per 24 ore su 24) |
| Database | Neon, piano Free | 0 € | 1 GB (foto comprese: qualche migliaio); non scade |
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

## Email: non servono

Capta Lead non manda email ai contatti: la mail di ringraziamento e i follow-up li fa Plexus. Le uniche
email di Capta Cloud sarebbero quelle di servizio per chi usa l'app (conferma dell'account, invito, nuova
password). In fase di test sono spente: l'account nasce già confermato, e i link d'invito e di nuova
password li genera l'amministratore e li manda lui (WhatsApp, email, messaggio). Quando si venderà a
clienti esterni si attiverà un servizio email (Brevo o Resend sono già previsti nel codice).

## 2. Render (server)

1. Su render.com: *Get Started* con GitHub, e dai a Render accesso al repository `capta-lead`.
2. *New → Blueprint*, scegli il repository `capta-lead`: Render trova il file `render.yaml` e propone il
   servizio `capta-cloud` (piano Free, Frankfurt).
3. Ti chiede i valori mancanti:
   - `CAPTA_DATABASE_URL`: la connection string di Neon.
   - `CAPTA_EMAIL_PIANO_INTERNO`: le email che non devono avere limiti durante il test, per esempio
     `@sgmpharma.it, nicholas.dimeoo@gmail.com`.
4. *Apply*. Dopo qualche minuto il servizio è online a un indirizzo del tipo
   `https://capta-cloud.onrender.com`. Aprendo `https://capta-cloud.onrender.com/api/v1/salute` deve
   comparire `{"ok":"sì",…}`.

## 3. Dire all'app dov'è Capta Cloud

L'indirizzo del server sta in `config/brand.json`, alla voce `cloud.url_predefinito`
(oggi `https://capta-cloud.onrender.com`). Se cambia, si modifica lì e si fa il push: Vercel ripubblica
l'app da solo. In alternativa si può impostare la variabile `VITE_CAPTA_CLOUD_URL` nelle impostazioni del
progetto su Vercel (ha la precedenza sul file).

## 4. Primo accesso

1. Apri l'app, *Impostazioni → Crea un account*: nome dell'azienda, il tuo nome, email e password.
   Diventi amministratore; con un'email dell'elenco del punto 2 il piano è "uso interno", senza limiti.
2. *Amministrazione → Utenti → Invita un collega*: compare un link da copiare o condividere; il collega
   lo apre sul suo telefono o tablet e sceglie la password.
3. Se qualcuno dimentica la password: *Amministrazione → Utenti → Link password* accanto al suo nome.
4. *Amministrazione → Gestionale*: collega Plexus (indirizzo e codice `plx_`), quando Plexus sarà online
   su internet. Da lì in poi è Capta Cloud a mandare i contatti a Plexus: i tablet non parlano più con Plexus.
