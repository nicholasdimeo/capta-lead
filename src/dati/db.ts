// Il database locale (IndexedDB tramite Dexie). Qui vivono eventi, lead, foto,
// la coda di sincronizzazione e le impostazioni: tutto resta sul dispositivo.
import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Evento, Foto, Impostazione, Lead, Operazione } from './tipi'

export class ArchivioLocale extends Dexie {
  eventi!: Table<Evento, string>
  lead!: Table<Lead, string>
  foto!: Table<Foto, string>
  coda!: EntityTable<Operazione, 'id'>
  impostazioni!: Table<Impostazione, string>

  // Il nome interno del database resta "leadstand" anche se l'app si chiama diversamente: cambiarlo
  // farebbe perdere i dati già salvati sui dispositivi.
  constructor(nome = 'leadstand') {
    super(nome)
    // Gli indici (dopo la virgola) servono solo per cercare in fretta; i campi non elencati
    // vengono comunque salvati. Attenzione: aggiungere una versione nuova, mai modificare questa.
    this.version(1).stores({
      eventi: 'uuid, plexus_id, data_inizio, aggiornato_il',
      lead: 'uuid, evento_uuid, plexus_id, creato_il, [evento_uuid+creato_il]',
      foto: 'uuid, lead_uuid, plexus_foto_id',
      coda: '++id, stato, tipo, riferimento, prossimo_tentativo, [tipo+riferimento], [stato+prossimo_tentativo]',
      impostazioni: 'chiave',
    })
    // Versione 2 (API Plexus 1.1): gli eventi hanno il campo "archiviato". Gli indici non cambiano.
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('eventi')
          .toCollection()
          .modify((e: { archiviato?: boolean }) => {
            if (e.archiviato === undefined) e.archiviato = false
          }),
      )
  }
}

export const db = new ArchivioLocale()

/** Crea un database separato (usato dai test per partire ogni volta da zero). */
export function nuovoArchivioDiProva(nome: string): ArchivioLocale {
  return new ArchivioLocale(nome)
}
