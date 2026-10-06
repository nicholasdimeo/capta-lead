# Nota per la chat di Plexus — stato dell'app di raccolta lead (06/10/2026)

> Da incollare nella chat di Plexus.

## 1. Nome

L'app si chiama **Capta Lead** (prima "LeadStand"). Se in Plexus compare il nome dell'app (pagina
"App di raccolta lead allo stand", pulsante "Collega un dispositivo", etichetta dell'origine `app`),
va bene aggiornarlo, ma non è necessario per il funzionamento.

## 2. L'app è passata al contratto 1.1

Tutte le richieste di `RICHIESTE_A_PLEXUS.md` sono state recepite lato app. In concreto, Capta Lead ora:

- manda in `POST /eventi` anche `ringraziamento_attivo`, `categorie_suggerite` e il `questionario`
  con le `traduzioni`;
- per modificare o archiviare un evento che Plexus conosce usa `PUT /eventi/{id}` con tutti i campi
  (`nome`, `luogo`, `data_inizio`, `data_fine`, `note`, `lingua`, `linea`, `ringraziamento_attivo`,
  `categorie_suggerite`, `questionario`, `archiviato`). Vale anche per gli eventi nati in Plexus.
  Un evento creato offline e archiviato subito arriva come `POST` seguito da `PUT {"archiviato": true}`;
- legge gli eventi con `GET /eventi?archiviati=1` (sempre con gli archiviati, per sapere quali sono);
- manda l'`uuid` nel multipart di `POST /lead/{id}/foto` e accetta sia `201` sia `200 creata:false`;
- quando una lead su Plexus ha più foto di quelle che il dispositivo conosce (`n_foto`), chiama
  `GET /lead/{id}/foto` e scarica le mancanti con `GET /lead/{id}/foto/{foto_id}`;
- legge `ringraziamento` da `GET /eventi/{id}/lead` (esito e `inviato_il`) e tratta `gia_inviato`
  come "mail inviata";
- rimanda le lead con uuid `plexus-…` quando vengono modificate allo stand (stesso uuid);
- continua a mandare `consenso` esplicito (vero/falso) quando la domanda del consenso ha una
  risposta, e le risposte multiple come lista.

Resta compatibile con la 1.0: se `GET /stato` risponde `"api": "1.0"`, l'app non usa niente di tutto
questo e si comporta come prima.

## 3. Da verificare lato Plexus

- **`GET /stato` deve rispondere `"api": "1.1"`.** L'app decide da quel valore se usare le novità
  (nell'esempio della nota 1.1 c'è ancora `"api": "1.0"`). Lo rilegge all'avvio e ogni mezz'ora.
- **CORS**: l'app verrà pubblicata su Vercel. Appena c'è l'indirizzo definitivo (del tipo
  `https://capta-lead-xxxx.vercel.app`, oppure un dominio nostro) lo mando per `PLEXUS_API_ORIGINI`.
  Se possibile, meglio prevedere anche un indirizzo di prova separato (le anteprime di Vercel hanno
  indirizzi diversi per ogni modifica).
- Carico atteso: con l'app aperta, un `GET /eventi?archiviati=1` circa ogni minuto per dispositivo e un
  `GET /eventi/{id}/lead` per evento ogni minuto e mezzo; `GET /stato` ogni mezz'ora. Se è troppo,
  si può allungare.

## 4. Prossimi passi

1. Pubblicazione su Vercel e invio dell'indirizzo per il CORS.
2. Prova vera app ↔ Plexus con un codice `plx_` reale: evento creato dall'app, contatto con foto,
   modifica, archiviazione, lead importata in Plexus che arriva sull'app.
