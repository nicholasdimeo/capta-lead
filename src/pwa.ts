// Stato dell'aggiornamento dell'app (service worker): quando è pronta una versione nuova, l'interfaccia
// mostra un avviso con il pulsante "Aggiorna". Piccolo archivio osservabile senza librerie.
import { useSyncExternalStore } from 'react'

type Ascoltatore = () => void
let aggiornaFn: (() => Promise<void>) | null = null
const ascoltatori = new Set<Ascoltatore>()

export function segnalaAggiornamentoPronto(aggiorna: () => Promise<void>): void {
  aggiornaFn = aggiorna
  for (const a of ascoltatori) a()
}

export function useAggiornamentoApp(): { disponibile: boolean; aggiorna: () => Promise<void> } {
  const disponibile = useSyncExternalStore(
    (a) => {
      ascoltatori.add(a)
      return () => ascoltatori.delete(a)
    },
    () => aggiornaFn !== null,
    () => false,
  )
  return { disponibile, aggiorna: () => aggiornaFn?.() ?? Promise.resolve() }
}
