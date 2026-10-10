/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_CAPTA_CLOUD_URL?: string
}

/** Versione dell'app (da package.json), inserita da Vite al momento della build. */
declare const __VERSIONE_APP__: string
