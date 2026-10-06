// Dice se il dispositivo ha rete (navigator.onLine + eventi online/offline).
import { useSyncExternalStore } from 'react'

function iscriviti(a: () => void) {
  window.addEventListener('online', a)
  window.addEventListener('offline', a)
  return () => {
    window.removeEventListener('online', a)
    window.removeEventListener('offline', a)
  }
}

export function useRete(): boolean {
  return useSyncExternalStore(iscriviti, () => navigator.onLine !== false, () => true)
}
