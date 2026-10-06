// Stato del motore di sincronizzazione (collegamento, in corso, ultima sync) e operazioni aperte in coda.
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motore } from '../sync/istanza'
import type { StatoMotore } from '../sync/motore'
import { db } from '../dati/db'
import type { Operazione } from '../dati/tipi'
import { STATI_APERTI } from '../dati/coda'

export function useMotore(): StatoMotore {
  const [stato, setStato] = useState<StatoMotore>(() => motore.leggiStato())
  useEffect(() => motore.iscriviti(setStato), [])
  return stato
}

/** Tutte le operazioni non completate (per gli stati accanto a contatti ed eventi). */
export function useOperazioniAperte(): Operazione[] {
  return useLiveQuery(() => db.coda.where('stato').anyOf([...STATI_APERTI]).toArray(), [], [] as Operazione[])
}

/** true se l'app è collegata a Plexus con un codice valido. */
export function useCollegato(): boolean {
  const { collegamento } = useMotore()
  return collegamento !== null && collegamento.stato === 'ok'
}
