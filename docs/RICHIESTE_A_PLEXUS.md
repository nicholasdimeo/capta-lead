# Richieste a Plexus — tutte accolte con l'API 1.1 (06/10/2026)

Il contratto 1.1 di Plexus (compatibile con la 1.0) ha chiuso tutte le richieste fatte da LeadStand.
Questo file resta come memoria e per annotare eventuali richieste future.

| Richiesta | Risposta di Plexus 1.1 | Cosa fa LeadStand |
| --- | --- | --- |
| Categorie suggerite in `POST /eventi` | Accettate in `POST /eventi` e `PUT /eventi/{id}` | Le manda a ogni salvataggio dell'evento |
| Esito della mail in `GET /eventi/{id}/lead` | Campo `ringraziamento` `{esito, inviato_il}` su ogni lead | Lo mostra su ogni dispositivo, con la data |
| Foto idempotenti | `uuid` nel multipart: stesso uuid = stessa foto (`200`, `creata: false`) | Manda l'uuid: niente doppioni anche se la risposta si perde |
| Traduzioni del questionario | Campo `traduzioni` per domanda, conservato da Plexus | Le manda e le legge: tutti i dispositivi hanno il questionario tradotto |
| Esito "mail già spedita" | `gia_inviato` (e `in_attesa` resta `in_attesa`) | Lo tratta come "inviata" |
| `ringraziamento_attivo` modificabile | In `POST /eventi` e `PUT /eventi/{id}` | Interruttore nel modulo evento |
| uuid per le lead nate in Plexus | Prefisso `plexus-` | Quelle lead si modificano anche dall'app |
| Archiviazione | `PUT /eventi/{id}` con `archiviato: true/false`; `GET /eventi?archiviati=1` | "Archivia evento" al posto della cancellazione; "Rimuovi dal dispositivo" solo per gli eventi archiviati |
| Scaricare le foto | `GET /lead/{id}/foto` e `GET /lead/{id}/foto/{foto_id}` | Le foto scattate da altri dispositivi arrivano anche qui |
| Modifica di eventi nati in Plexus | `PUT /eventi/{id}` (nome, luogo, date, note, lingua, linea, questionario) | Tutti i campi sono modificabili dall'app |

## Da ricordare in produzione

- L'indirizzo da cui è servita l'app va messo in `PLEXUS_API_ORIGINI` (CORS), oppure lasciare tutte le origini.
- Il limite di 12 MB per foto è rispettato dall'app (ridimensiona a 1600 px e converte in JPEG), ma i file HEIC
  non convertibili dal browser vengono inviati così come sono: Plexus li accetta (`heic` è tra i formati del contratto).
- Plexus riceve le risposte multiple come lista; l'app, quando le rilegge da `GET .../lead`, ricostruisce la lista
  riconoscendo le opzioni della domanda (anche se contengono virgole).
- Se l'app si collega a un Plexus con API 1.0, continua a funzionare come prima (niente archiviazione, niente foto
  condivise, eventi nati in Plexus modificabili solo nel questionario); lo segnala nelle impostazioni.

## Richieste future

Nessuna, per ora.
