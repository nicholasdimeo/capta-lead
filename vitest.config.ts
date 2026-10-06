// Configurazione dei test automatici (Vitest).
// - "unitari": logica pura (dati, sincronizzazione, report) in ambiente Node con IndexedDB finto.
// - "componenti": componenti React in un browser simulato (jsdom).
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  define: { __VERSIONE_APP__: JSON.stringify('test') },
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unitari',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          setupFiles: ['src/test/setup-unitari.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'componenti',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test/setup-componenti.ts'],
        },
      },
    ],
  },
})
