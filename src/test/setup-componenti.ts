// Prepara l'ambiente dei test dei componenti React (jsdom + IndexedDB finto + matcher aggiuntivi).
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// jsdom non ha matchMedia né scrollTo: versioni innocue per i componenti che le usano.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }) as MediaQueryList
  }
  if (!window.scrollTo) window.scrollTo = () => {}
  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:finto'
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {}
}
