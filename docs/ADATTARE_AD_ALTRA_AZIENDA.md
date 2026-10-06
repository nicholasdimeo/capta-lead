# Adattare Capta Lead a un'altra azienda

L'app è costruita per essere "white label": per cambiare azienda non si tocca il codice, ma solo la
cartella `config/` (più, se vuoi, i testi dell'interfaccia). Poi si ricostruisce l'app.

## 1. `config/brand.json`

| Chiave | A cosa serve |
| --- | --- |
| `app.nome`, `app.nome_breve`, `app.descrizione` | Nome dell'app (barra in alto, titolo della pagina, icona sulla Home) |
| `azienda.nome`, `azienda.sito` | Nome dell'azienda (sotto il titolo, nei report) |
| `tema.*` | Colori e raggi (vedi sotto) |
| `lingue.principale` | Lingua in cui sono scritti questionario e categorie e in cui si parla con il gestionale (es. `it`) |
| `lingue.disponibili` | Lingue tra cui scegliere per il contatto, es. `{ "it": "Italiano", "en": "English", "de": "Deutsch" }` |
| `linee` | Linee di prodotti selezionabili per un evento, con etichetta per lingua. Le chiavi (`ortopedia`, `estetica`, `entrambe`) sono quelle che il gestionale si aspetta |
| `linea_predefinita` | Linea proposta per un nuovo evento |
| `categorie_predefinite` | Chip rapidi proposti per i nuovi eventi (ogni evento può poi avere le sue) |
| `professioni_suggerite` | Chip per il campo "Professione" |
| `tipi_foto` | Etichette per lingua dei tipi di foto (`biglietto`, `volto`, `altro`: le chiavi sono fisse, le richiede Plexus) |
| `privacy.titolo`, `privacy.testo` | Informativa mostrata al visitatore prima del questionario, per lingua |
| `questionario_predefinito` | Domande proposte per un nuovo evento (vedi sotto) |
| `plexus.nome_piattaforma` | Come chiamare il gestionale nell'interfaccia ("Plexus") |
| `plexus.url_predefinito` | Indirizzo precompilato nelle impostazioni (facoltativo) |

### Colori (`tema`)

I colori sono applicati come variabili CSS all'avvio (`src/config/brand.ts`, funzione `applicaTema`).
Le chiavi: `sfondo`, `card`, `bordo`, `navy` (barra e titoli), `accento` (pulsanti), `accento_scuro`
(hover), `accento_chiaro`, `testo`, `testo_secondario`, `testo_terziario`, `verde`/`verde_chiaro`,
`ambra`/`ambra_chiaro`, `rosso`/`rosso_chiaro`, `raggio_card`, `raggio_pulsante`, `font`.
I colori `navy` e `sfondo` finiscono anche nel manifest della PWA (colore della barra di sistema).
Se cambi il font, ricorda che il PDF usa i file in `src/report/fonts/` (Public Sans): per un altro font
sostituisci quei due `.ttf` e i relativi `import` in `src/main.tsx` e `src/report/pdf.ts`.

### Questionario predefinito

Ogni domanda ha: `domanda` (testo nella lingua principale), `opzioni` (almeno due), `multipla`
(più risposte ammesse), `consenso` (true per LA domanda del consenso alle comunicazioni: la prima
opzione vale "Sì", la seconda "No") e `traduzioni` facoltative per le altre lingue, con lo stesso
numero di opzioni nello stesso ordine:

```json
{
  "domanda": "Qual è il suo ruolo?",
  "opzioni": ["Medico", "Farmacista", "Altro"],
  "multipla": false,
  "traduzioni": { "en": { "domanda": "What is your role?", "opzioni": ["Doctor", "Pharmacist", "Other"] } }
}
```

Le risposte vengono sempre salvate e inviate al gestionale nel testo della lingua principale; le
traduzioni servono solo a mostrarle al visitatore. Ogni evento può poi modificare il suo questionario
dall'app (anche le traduzioni).

Se nel file manca qualcosa, l'app usa valori di riserva sensati (vedi `validaBrand` in `src/config/brand.ts`):
non si rompe, ma controlla con `npm test` che il file sia valido (c'è un test apposta).

## 2. Logo e icone

- Sostituisci `config/logo.svg` con il logo dell'azienda (SVG quadrato, senza margini).
- Lancia `npm run icone`: genera le icone PNG in `public/icone/` (192, 512, 512 "maskable" con sfondo
  `tema.navy`, 180 per iOS). Copia anche il logo in `public/favicon.svg` se vuoi la stessa icona nella
  scheda del browser.

## 3. Testi dell'interfaccia

I testi dei pulsanti, delle etichette e degli avvisi stanno in `src/i18n/it.json` (completo) e
`src/i18n/en.json`. Per aggiungere una lingua dell'interfaccia: copia `it.json` in `xx.json`, traduci,
e aggiungila in `src/i18n/index.tsx` (`DIZIONARI`). Se una chiave manca in una lingua, l'app usa
quella principale e poi l'italiano.

I testi che vede il visitatore (questionario e informativa) seguono invece la lingua del contatto,
scelta con un tocco nella registrazione, tra quelle in `lingue.disponibili`.

## 4. Ricostruire e pubblicare

```bash
npm run build
```

La cartella `dist/` è l'app pronta: caricala su un hosting HTTPS. Chi ha già installato l'app vedrà
l'avviso "È pronta una nuova versione" alla prossima apertura con rete.

## 5. Collegare un gestionale diverso da Plexus

Tutte le chiamate al server stanno in `src/plexus/client.ts` (interfaccia `ClientPlexus`) e le forme
dei dati in `src/plexus/tipi.ts`. Il motore di sincronizzazione (`src/sync/motore.ts`) usa solo
quell'interfaccia. Per un altro gestionale basta scrivere un client con gli stessi metodi (`stato`,
`eventi`, `creaEvento`, `aggiornaQuestionario`, `leadDiEvento`, `creaLead`, `caricaFoto`) e passarlo
al motore in `src/sync/istanza.ts`. Le regole da rispettare: ogni evento e ogni lead hanno un `uuid`
generato dall'app, e rimandare lo stesso `uuid` deve aggiornare invece di duplicare.

Per provarlo senza il server vero, `finto-plexus/server.mjs` è un esempio completo dell'API attesa.
