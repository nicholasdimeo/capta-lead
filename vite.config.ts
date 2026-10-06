// Configurazione di Vite (lo strumento che impacchetta l'app) e della PWA.
// Il manifest dell'app (nome, colori, icone) viene letto da config/brand.json:
// cambiando azienda basta modificare quel file e ricostruire (npm run build).
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const brand = JSON.parse(readFileSync(new URL('./config/brand.json', import.meta.url), 'utf8'))
const pacchetto = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/** Sostituisce %NOME_APP% in index.html con il nome scelto in brand.json. */
function nomeAppInHtml() {
  return {
    name: 'nome-app-in-html',
    transformIndexHtml(html: string) {
      return html.replaceAll('%NOME_APP%', String(brand.app.nome))
    },
  }
}

export default defineConfig({
  define: { __VERSIONE_APP__: JSON.stringify(pacchetto.version) },
  plugins: [
    react(),
    nomeAppInHtml(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icone/*.png', 'icone/*.svg', 'favicon.svg'],
      manifest: {
        name: brand.app.nome,
        short_name: brand.app.nome_breve,
        description: brand.app.descrizione,
        lang: brand.lingue.principale,
        theme_color: brand.tema.navy,
        background_color: brand.tema.sfondo,
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icone/icona-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone/icona-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone/icona-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tutto ciò che serve all'app viene salvato sul dispositivo alla prima apertura,
        // così funziona anche senza rete (font e file del report compresi).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Le librerie pesanti dei report stanno in file separati, caricati solo quando servono.
        manualChunks(id: string) {
          if (id.includes('node_modules/exceljs')) return 'excel'
          if (id.includes('node_modules/pdf-lib') || id.includes('node_modules/@pdf-lib')) return 'pdf'
          return undefined
        },
      },
    },
  },
})
