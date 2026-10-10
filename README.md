# Capta Lead — raccolta contatti allo stand

Capta Lead è un'app per registrare i contatti (lead) che si fermano allo stand in fiera o a un congresso:
anagrafica, questionario a risposta chiusa, consenso privacy, note, categoria e foto del biglietto da visita.
Funziona **anche senza rete**: tutto viene salvato sul tablet o sul telefono e inviato a **Plexus**
appena torna la connessione, senza fare nulla e senza doppioni. Dall'app si scaricano anche i report
Excel e PDF dell'evento.

È una **PWA** (Progressive Web App): un sito che si "installa" sulla schermata Home di iPad, iPhone e
Android, senza passare da un app store. Un solo codice per tutti i dispositivi.

> Nome, logo, colori, lingue, testo della privacy, categorie e questionario predefinito non sono scritti
> nel codice: stanno in `config/brand.json`. Per usare l'app in un'altra azienda vedi
> [docs/ADATTARE_AD_ALTRA_AZIENDA.md](docs/ADATTARE_AD_ALTRA_AZIENDA.md).

## Due modi di usarla

- **Con un account Capta Cloud** (il modo normale): l'azienda ha un suo account, più persone con ruoli
  (amministratore, operatore), i contatti sono condivisi tra tutti i dispositivi e si vede chi ha
  registrato cosa. Il gestionale (Plexus) si collega una volta sola dall'amministrazione e riceve
  tutto dal cloud. Il server sta nella cartella [cloud/](cloud/README.md).
- **Senza account**: l'app funziona da sola, solo su quel dispositivo; volendo si collega direttamente a
  Plexus dalle impostazioni (voce "avanzato"). È il modo in cui è nata ed è ancora supportato.

## Cosa fa, in breve

1. **Eventi**: crei l'evento (nome, luogo, date, linea di prodotti, lingua delle mail, questionario,
   categorie rapide). Gli eventi creati in Plexus arrivano da soli nell'app, e viceversa.
2. **Nuovo contatto** in tre passi, pensato per essere fatto in piedi, con una mano, in 30-60 secondi:
   - *Dati*: nome, cognome, email, azienda, telefono, professione (chip), altri dati facoltativi, lingua del contatto;
   - *Questionario*: informativa privacy e domande a risposta chiusa, nella lingua del visitatore
     (puoi passargli il dispositivo). La domanda del consenso è evidenziata e va risposta;
   - *Note e foto*: categoria (caldo, da ricontattare…), note di chi è allo stand, foto scattate o dal rullino.
3. **Invio a Plexus**: ogni contatto entra in una coda locale e parte appena c'è rete. Accanto a ogni
   contatto vedi lo stato: *Salvato sul dispositivo*, *In coda per Plexus*, *Su Plexus*, *Mail di
   ringraziamento inviata / in attesa*, *2/3 foto caricate*…
4. **Report** per evento, anche offline: Excel (una riga per contatto, una colonna per domanda, foglio
   riepilogo) e PDF (numeri chiave, grafici delle risposte, elenco contatti con miniatura del biglietto).
   Una volta pronto, il file si condivide (AirDrop, mail, WhatsApp…) o si scarica.
5. **Ricerca e filtri** per nome, azienda, email, città, categoria e consenso. Modifica ed eliminazione dei contatti.

## Per chi sviluppa

Serve [Node.js](https://nodejs.org) 20 o più recente; per il server Capta Cloud serve `uv` (vedi
[cloud/README.md](cloud/README.md)).

```bash
npm install            # scarica le librerie (una volta sola)
npm run dev            # avvia l'app in sviluppo su http://localhost:5173
npm run finto-plexus   # avvia il Plexus finto su http://localhost:8787 (in un'altra finestra)
npm test               # test unitari (dati, coda, motore di sincronizzazione, report)
npm run test:e2e       # prove nel browser vero, anche offline (fa da sé la build, avvia il finto Plexus e Capta Cloud)
cd cloud && uv run uvicorn capta_cloud.principale:app --reload   # il server Capta Cloud in locale (porta 8000)
npm run build          # crea la versione da mettere online nella cartella dist/
npm run pacchetto      # impacchetta dist/ in capta-lead-<versione>.zip
npm run icone          # rigenera le icone dell'app da config/logo.svg
```

### Provare senza il Plexus vero

Il **finto Plexus** (`finto-plexus/server.mjs`) imita l'API di Plexus tenendo tutto in memoria.
Avvialo con `npm run finto-plexus`, poi nell'app vai in *Impostazioni → Collega a Plexus* e incolla:

- indirizzo: `http://localhost:8787`
- codice: `plx_prova` (va bene qualsiasi codice che inizia con `plx_`)

Aprendo `http://localhost:8787` nel browser vedi gli eventi, i contatti e le foto ricevuti.
Con `FINTO_PLEXUS_FILE=finto-plexus/dati-prova.json npm run finto-plexus` i dati restano anche
dopo un riavvio. Per provare la rete che manca: in Chrome, *Strumenti per sviluppatori → Network →
Offline*; oppure, nella versione costruita (`npm run build` + `npm run preview`), spegni il Wi-Fi.

### Mettere online l'app

Il modo più semplice, gratuito per un progetto personale, è GitHub + Vercel: istruzioni passo passo in
[docs/PUBBLICARE_SU_VERCEL.md](docs/PUBBLICARE_SU_VERCEL.md). In generale:

```bash
npm run build
```

produce la cartella `dist/`: è un sito statico, basta copiarla su qualsiasi hosting che serva file in
**HTTPS** (Netlify, Vercel, GitHub Pages, un server Nginx aziendale…). HTTPS è obbligatorio: senza, il
browser non permette l'installazione e il funzionamento offline. Non serve nessun server dell'app:
l'unico server con cui parla è Plexus.

```bash
npm run pacchetto
```

crea `capta-lead-<versione>.zip` con il contenuto di `dist/`, comodo da caricare su un hosting o da
passare a chi gestisce il server (va scompattato nella cartella pubblicata: `index.html` alla radice).

L'app è costruita per stare alla **radice del dominio** (es. `https://capta.sgmpharma.it/`). Se invece
deve stare in una sottocartella (es. `https://www.sgmpharma.it/capta-lead/`), costruiscila così:

```bash
CAPTA_BASE=/capta-lead/ npm run build
```

Non serve nessuna regola di "riscrittura" sul server: le pagine interne usano l'indirizzo con `#`.
Il file `sw.js` (il service worker) e `manifest.webmanifest` devono essere serviti dalla stessa cartella di
`index.html`, cosa che qualsiasi hosting statico fa da solo.

Il Plexus vero deve conoscere l'indirizzo da cui è servita l'app (variabile `PLEXUS_API_ORIGINI`
sul server, oppure tutte le origini), altrimenti il browser blocca le chiamate (CORS).

## Installare l'app sul tablet o sul telefono

Apri l'indirizzo dell'app nel browser del dispositivo, poi:

- **iPad / iPhone (Safari)**: tocca *Condividi* (il quadrato con la freccia) → *Aggiungi alla schermata Home*.
- **Android (Chrome)**: menu ⋮ → *Installa app* (o *Aggiungi a schermata Home*).
- **Computer (Chrome / Edge)**: icona "installa" nella barra dell'indirizzo.

Da quel momento l'app si apre dall'icona, a schermo intero, e funziona anche senza rete.
Alla prima apertura **con rete** scarica tutto quello che le serve (circa 3 MB); dopo, non ha più
bisogno di internet se non per parlare con Plexus. Quando pubblichi una versione nuova, l'app avvisa
("È pronta una nuova versione") e si aggiorna con un tocco.

I dati restano **sul dispositivo** finché non li cancelli dall'app. Non cancellare i "dati dei siti"
dal browser senza prima aver verificato che tutto sia arrivato a Plexus (vedi *Impostazioni →
Sincronizzazione*).

## Collegare l'app a Plexus

1. In Plexus: *Lead eventi → App di raccolta lead allo stand → Collega un dispositivo*. Plexus mostra un
   codice che inizia con `plx_` (si vede una volta sola).
2. Nell'app: *Impostazioni → Collega a Plexus*: incolla l'indirizzo di Plexus (es. `https://plexus.tuaazienda.it`)
   e il codice, poi *Collega*. L'app verifica il codice e mostra azienda e utente collegati.
3. Da lì in poi la sincronizzazione è automatica: all'avvio, a ogni salvataggio, al ritorno della rete,
   quando l'app torna in primo piano e ogni minuto. *Sincronizza ora* la forza a mano.

Il codice è salvato solo sul dispositivo: mai in un indirizzo, mai nei log, mai nei report.
Se il codice viene revocato da Plexus, l'app lo dice con un avviso rosso e basta incollarne uno nuovo:
i contatti non ancora inviati restano in coda e partono dopo.

Ogni dispositivo che usa l'app va collegato con un proprio codice. Più dispositivi sullo stesso
evento funzionano: ognuno vede, dopo la sincronizzazione, anche i contatti raccolti dagli altri
(foto comprese, con Plexus 1.1).

## Stati accanto a un contatto

| Pillola | Significato |
| --- | --- |
| Salvato sul dispositivo | È sul dispositivo; l'app non è collegata a Plexus |
| In coda per Plexus | Sta aspettando la rete (o il suo turno) |
| Invio non riuscito, riprovo | Plexus o la rete hanno dato errore: l'app riprova da sola con attese crescenti |
| Rifiutata da Plexus | Plexus ha rifiutato i dati (es. email non valida): correggi il contatto e riparte |
| Su Plexus | Arrivato a Plexus |
| Modifiche da inviare | Era su Plexus, è stato modificato: la nuova versione è in coda |
| Mail di ringraziamento inviata il … / in attesa / non partita | Esito della mail immediata, letto da Plexus (in attesa = la casella di chi firma non è configurata) |
| 2/3 foto caricate | Foto arrivate su Plexus rispetto al totale |

## Struttura delle cartelle

```
config/            brand.json e logo.svg: tutto ciò che è personalizzabile
public/icone/      icone dell'app (generate da config/logo.svg con npm run icone)
src/config/        lettura e controllo di brand.json, tema (variabili CSS)
src/dati/          database locale (IndexedDB con Dexie): eventi, lead, foto, coda, impostazioni
src/sync/          motore di sincronizzazione (coda, ritentativi, allineamento con Plexus)
src/plexus/        client dell'API di Plexus: l'unico punto che parla con il server
src/report/        report Excel (exceljs) e PDF (pdf-lib), con il font del brand
src/i18n/          testi dell'interfaccia (it.json completo, en.json)
src/componenti/    pezzi riusabili dell'interfaccia (barra, campi, foto, questionario, …)
src/schermate/     le schermate (eventi, evento, contatto, impostazioni)
src/tema/          foglio di stile (stile Plexus)
finto-plexus/      server di prova che imita Plexus
e2e/               prove nel browser con Playwright
docs/              guide (adattare a un'altra azienda, richieste a Plexus)
```

## Scelte tecniche e limiti da conoscere

- **Vite + React + TypeScript**, dati locali in **IndexedDB** tramite **Dexie**, service worker con
  **vite-plugin-pwa** (Workbox), CSS semplice con variabili, **exceljs** per l'Excel, **pdf-lib** per il PDF,
  **Vitest** e **Playwright** per i test. Nessun servizio esterno, nessun invio di dati a terzi
  (il font Public Sans è servito dall'app stessa, non da Google).
- Le foto vengono ridotte a 1600 px sul lato lungo e convertite in JPEG prima del salvataggio (restano
  nitide e sotto il limite di 12 MB di Plexus). Nessun riconoscimento automatico: è solo archivio.
- Gli eventi non si cancellano: si **archiviano** (spariscono dall'elenco, qui e in Plexus, e si possono
  riaprire). "Rimuovi dal dispositivo" toglie un evento archiviato, con i suoi contatti e le foto, solo da
  questo tablet; in Plexus resta tutto. Cancellare un contatto lo toglie solo dal dispositivo.
- Gli eventi nati in Plexus si modificano anche dall'app (API 1.1). Le foto scattate da un altro
  dispositivo arrivano anche qui dopo la sincronizzazione.
- Con un Plexus con API 1.0 l'app funziona lo stesso, con qualche limite (niente archiviazione, niente foto
  condivise, eventi nati in Plexus modificabili solo nel questionario); le impostazioni lo segnalano.
- Il motore ritenta gli invii con attese crescenti (5 s, 15 s, 45 s… fino a 10 minuti); gli errori
  "definitivi" (dati rifiutati) aspettano una correzione. Una foto che va in timeout non blocca le altre.
- Mentre si registra un contatto nuovo l'app tiene una **bozza** sul dispositivo: se l'app viene chiusa o
  ricaricata a metà, riaprendo "Nuovo contatto" su quell'evento si riparte da dove si era.
- Ogni foto ha un uuid che viaggia con lei: se la rete cade proprio dopo l'invio, al tentativo successivo
  Plexus (1.1) la riconosce e non la duplica.
- Il contratto con Plexus (API 1.1) e la storia delle richieste: [docs/RICHIESTE_A_PLEXUS.md](docs/RICHIESTE_A_PLEXUS.md).
