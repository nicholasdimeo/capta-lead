// Punto di partenza dell'app: carica font e tema, registra il service worker (per l'uso offline) e avvia React.
// Font del brand, servito dall'app stessa (niente chiamate a Google): solo i sottoinsiemi latino e latino esteso.
import '@fontsource/public-sans/latin-400.css'
import '@fontsource/public-sans/latin-ext-400.css'
import '@fontsource/public-sans/latin-500.css'
import '@fontsource/public-sans/latin-ext-500.css'
import '@fontsource/public-sans/latin-600.css'
import '@fontsource/public-sans/latin-ext-600.css'
import '@fontsource/public-sans/latin-700.css'
import '@fontsource/public-sans/latin-ext-700.css'
import '@fontsource/public-sans/latin-800.css'
import '@fontsource/public-sans/latin-ext-800.css'
import './tema/tema.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { applicaTema } from './config/brand'
import { segnalaAggiornamentoPronto } from './pwa'
import { App } from './App'

applicaTema()

const aggiornaSW = registerSW({
  onNeedRefresh() {
    segnalaAggiornamentoPronto(() => aggiornaSW(true))
  },
})

createRoot(document.getElementById('radice') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
