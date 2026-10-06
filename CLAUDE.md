# LeadStand — note per chi lavora sul codice (anche Claude)

- Lingua: codice, commenti, nomi di file/funzioni e testi in **italiano**, semplici (progetto gemello: Plexus).
- Tutto ciò che è personalizzabile sta in `config/brand.json` (+ `config/logo.svg`): niente nomi, colori, testi o domande cablati nel codice.
- Verso Plexus si usa SOLO il contratto API 1.0 (vedi `src/plexus/`). Niente campi o endpoint inventati: le richieste di modifica vanno in `docs/RICHIESTE_A_PLEXUS.md`.
- Il codice `plx_...` non va mai in URL, log, screenshot o file esportati.
- Ogni scrittura che deve arrivare a Plexus accoda l'operazione **nella stessa transazione** Dexie (`src/dati/archivio.ts`); la coda si svuota solo dopo la risposta positiva di Plexus (`src/sync/motore.ts`).
- Non cancellare dati locali senza conferma esplicita dell'utente (`useConferma`).
- Prima di dichiarare finito qualcosa: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` (usa Chromium di Playwright: `npx playwright install chromium` la prima volta).
- Schema del database: mai modificare `version(1)` in `src/dati/db.ts`; aggiungere `version(2)` con migrazione.
- Versioni: TypeScript 7, Vite 8, Vitest 5, vite-plugin-pwa 2, React 19, react-router 7, Dexie 4.
