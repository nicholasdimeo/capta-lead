// Gestione della coda di sincronizzazione (solo lato dati; il motore che la svuota è in src/sync).
import type { ArchivioLocale } from './db'
import type { Operazione, TipoOperazione } from './tipi'
import { adesso } from '../utils/date'

/** Operazioni ancora da fare (in attesa o in errore, che verranno ritentate). */
export const STATI_APERTI = ['in_attesa', 'in_corso', 'errore'] as const

/**
 * Mette in coda un'operazione. Se per lo stesso oggetto c'è già un'operazione dello stesso tipo
 * non ancora completata, non ne crea una seconda: la riporta "in attesa" e la fa ripartire subito
 * (verrà inviata la versione più recente dei dati, perché i dati si leggono al momento dell'invio).
 * Va chiamata DENTRO la stessa transazione che salva i dati, così non si perde nulla.
 */
export async function accoda(archivio: ArchivioLocale, tipo: TipoOperazione, riferimento: string): Promise<Operazione> {
  const ora = adesso()
  const esistenti = await archivio.coda.where('[tipo+riferimento]').equals([tipo, riferimento]).toArray()
  const aperta = esistenti.find((o) => o.stato === 'in_attesa' || o.stato === 'errore')
  if (aperta) {
    const aggiornata: Operazione = { ...aperta, stato: 'in_attesa', tentativi: 0, prossimo_tentativo: ora, aggiornato_il: ora }
    await archivio.coda.put(aggiornata)
    return aggiornata
  }
  const nuova: Operazione = {
    tipo,
    riferimento,
    stato: 'in_attesa',
    tentativi: 0,
    prossimo_tentativo: ora,
    ultimo_errore: null,
    codice_errore: null,
    creato_il: ora,
    aggiornato_il: ora,
    completata_il: null,
  }
  const id = await archivio.coda.add(nuova)
  return { ...nuova, id }
}

/** Tutte le operazioni non completate, nell'ordine in cui sono state create. */
export async function operazioniAperte(archivio: ArchivioLocale): Promise<Operazione[]> {
  const tutte = await archivio.coda.where('stato').anyOf([...STATI_APERTI]).toArray()
  return tutte.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
}

/** Operazioni aperte che riguardano un oggetto (per mostrare lo stato accanto a un contatto). */
export async function operazioniPer(archivio: ArchivioLocale, riferimento: string): Promise<Operazione[]> {
  const tutte = await archivio.coda.where('riferimento').equals(riferimento).toArray()
  return tutte.filter((o) => o.stato !== 'completata')
}

/** Elimina le operazioni (di qualsiasi stato) legate a un oggetto: si usa quando l'oggetto viene cancellato. */
export async function rimuoviOperazioniDi(archivio: ArchivioLocale, riferimenti: string[]): Promise<void> {
  if (riferimenti.length === 0) return
  await archivio.coda.where('riferimento').anyOf(riferimenti).delete()
}

/** Cancella le operazioni completate più vecchie di `giorni` giorni (pulizia, non tocca quelle aperte). */
export async function pulisciCompletate(archivio: ArchivioLocale, giorni = 30): Promise<number> {
  const limite = new Date(Date.now() - giorni * 86_400_000).toISOString()
  const vecchie = await archivio.coda.where('stato').equals('completata').filter((o) => (o.completata_il ?? o.aggiornato_il) < limite).primaryKeys()
  await archivio.coda.bulkDelete(vecchie)
  return vecchie.length
}
