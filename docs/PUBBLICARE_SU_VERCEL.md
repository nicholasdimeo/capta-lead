# Pubblicare Capta Lead su Vercel (piano gratuito)

Serve un account GitHub e un account Vercel (si può creare entrando con GitHub). Tutto quello che
segue si fa una volta sola: da quel momento ogni modifica caricata su GitHub viene pubblicata da sola.

## 1. Caricare il codice su GitHub

1. Su github.com: **New repository**, nome `capta-lead`, privato o pubblico come preferisci, **senza**
   aggiungere README o .gitignore (ci sono già). Crea.
2. Nel terminale, dentro la cartella del progetto:

```bash
git remote add origin https://github.com/TUO-NOME-UTENTE/capta-lead.git
```

```bash
git push -u origin main --tags
```

GitHub chiederà di accedere (la prima volta apre il browser o chiede un token).

## 2. Collegare Vercel

1. Su vercel.com: **Add New → Project**, scegli il repository `capta-lead`.
2. Vercel riconosce da solo che è un progetto Vite (lo legge dal file `vercel.json`): comando di build
   `npm run build`, cartella da pubblicare `dist`. Non serve cambiare nulla. **Deploy**.
3. Dopo un minuto l'app è online a un indirizzo del tipo `https://capta-lead-xxxx.vercel.app`.

Per un indirizzo tuo (es. `capta.tuodominio.it`): nel progetto Vercel, **Settings → Domains**, e
segui le istruzioni per il DNS del dominio. HTTPS è automatico in entrambi i casi.

## 3. Dire a Plexus l'indirizzo dell'app

Chi gestisce Plexus deve inserire l'indirizzo (es. `https://capta-lead-xxxx.vercel.app`) nella variabile
`PLEXUS_API_ORIGINI`, altrimenti il browser blocca le chiamate dall'app a Plexus (regola CORS).

## 4. Installare sui tablet

Apri l'indirizzo in Safari (iPad/iPhone) → Condividi → "Aggiungi alla schermata Home". Su Android, in
Chrome: menu ⋮ → "Installa app". Poi, nell'app: Impostazioni → Collega a Plexus.

## Aggiornare l'app

Dopo una modifica al progetto:

```bash
git add -A
```

```bash
git commit -m "descrizione della modifica"
```

```bash
git push
```

Vercel ricostruisce e pubblica in automatico. Sui tablet, alla prossima apertura con rete, compare
l'avviso "È pronta una nuova versione" con il pulsante Aggiorna.

## Cose da sapere

- Il piano gratuito di Vercel ("Hobby") è pensato per progetti personali e non commerciali. Se l'app
  diventa un prodotto commerciale, si passa al piano Pro dalle impostazioni dell'account.
- Le "anteprime": ogni ramo o pull request su GitHub produce un indirizzo di prova separato. Per
  l'uso allo stand conta solo l'indirizzo del ramo `main` (quello "Production").
- I dati dei contatti non passano mai da Vercel: restano sui tablet e vanno direttamente a Plexus.
