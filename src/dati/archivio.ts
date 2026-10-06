// Funzioni per leggere e scrivere eventi, lead e foto nel database locale.
// Ogni scrittura che deve arrivare a Plexus mette anche l'operazione in coda,
// nella stessa transazione: così una lead non può mai essere salvata senza essere accodata.
import { db as dbPredefinito, type ArchivioLocale } from './db'
import { accoda, rimuoviOperazioniDi } from './coda'
import type { Domanda, Evento, Foto, Lead, Lingua, Risposta, TipoFoto } from './tipi'
import { nuovoUuid } from '../utils/uuid'
import { adesso } from '../utils/date'
import { pulisci } from '../utils/testo'
import { segnalaCodaCambiata } from '../sync/segnali'

/** Campi di un evento che l'utente compila. */
export interface CampiEvento {
  nome: string
  luogo: string
  data_inizio: string
  data_fine: string
  note: string
  lingua: Lingua
  linea: string
  questionario: Domanda[]
  categorie_suggerite: string[]
  ringraziamento_attivo: boolean
  archiviato?: boolean
}

/** Campi di una lead che l'utente compila allo stand. */
export interface CampiLead {
  nome: string
  cognome: string
  email: string
  telefono: string
  azienda: string
  professione: string
  citta: string
  provincia: string
  indirizzo: string
  note: string
  categoria: string
  lingua: Lingua
  consenso: boolean | null
  risposte: Record<string, Risposta>
}

export const CAMPI_LEAD_VUOTI: CampiLead = {
  nome: '', cognome: '', email: '', telefono: '', azienda: '', professione: '',
  citta: '', provincia: '', indirizzo: '', note: '', categoria: '', lingua: 'it', consenso: null, risposte: {},
}

function pulisciCampiLead(campi: Partial<CampiLead>): Partial<CampiLead> {
  const esito: Partial<CampiLead> = { ...campi }
  for (const chiave of ['nome', 'cognome', 'email', 'telefono', 'azienda', 'professione', 'citta', 'provincia', 'indirizzo', 'categoria'] as const) {
    if (chiave in campi) esito[chiave] = pulisci(campi[chiave])
  }
  if ('email' in campi) esito.email = pulisci(campi.email).toLowerCase()
  if ('note' in campi) esito.note = (campi.note ?? '').trim()
  return esito
}

/** Trova la risposta alla domanda di consenso e la trasforma in vero/falso (null se non risposta). */
export function consensoDalleRisposte(questionario: Domanda[], risposte: Record<string, Risposta>): boolean | null {
  const domanda = questionario.find((d) => d.consenso)
  if (!domanda) return null
  const r = risposte[domanda.domanda]
  if (r === undefined || r === '' || (Array.isArray(r) && r.length === 0)) return null
  const valore = Array.isArray(r) ? r[0] : r
  return consensoDaTesto(valore, domanda.opzioni)
}

const PAROLE_SI = new Set(['si', 'sì', 'sí', 'yes', 'ja', 'oui', 'sim', 'da'])
const PAROLE_NO = new Set(['no', 'nein', 'non', 'não', 'net'])

/** "Sì"/"Yes" → true, "No" → false (si guarda la prima parola); altrimenti vale la posizione (prima opzione = sì, seconda = no). */
export function consensoDaTesto(valore: string, opzioni: string[]): boolean | null {
  const primaParola = valore.trim().toLowerCase().split(/[^\p{L}]+/u)[0] ?? ''
  if (PAROLE_SI.has(primaParola)) return true
  if (PAROLE_NO.has(primaParola)) return false
  const posizione = opzioni.indexOf(valore)
  if (posizione === 0) return true
  if (posizione === 1) return false
  return null
}

// ---------- Eventi ----------

export async function creaEvento(campi: CampiEvento, archivio: ArchivioLocale = dbPredefinito): Promise<Evento> {
  const ora = adesso()
  const evento: Evento = {
    uuid: nuovoUuid(),
    archiviato: false,
    ...campi,
    nome: pulisci(campi.nome),
    luogo: pulisci(campi.luogo),
    note: campi.note.trim(),
    origine: 'app',
    plexus_id: null,
    creato_il: ora,
    aggiornato_il: ora,
  }
  await archivio.transaction('rw', archivio.eventi, archivio.coda, async () => {
    await archivio.eventi.add(evento)
    await accoda(archivio, 'invia_evento', evento.uuid)
  })
  segnalaCodaCambiata()
  return evento
}

/**
 * Aggiorna un evento e lo rimette in coda per Plexus: il motore fa POST (stesso uuid = aggiornamento) se
 * l'evento non ha ancora un numero di Plexus, altrimenti PUT /eventi/{id} (API 1.1), per qualsiasi origine.
 */
export async function aggiornaEvento(uuid: string, modifiche: Partial<CampiEvento>, archivio: ArchivioLocale = dbPredefinito): Promise<Evento> {
  const esito = await archivio.transaction('rw', archivio.eventi, archivio.coda, async () => {
    const attuale = await archivio.eventi.get(uuid)
    if (!attuale) throw new Error(`Evento ${uuid} non trovato`)
    const pulite: Partial<CampiEvento> = { ...modifiche }
    if (modifiche.nome !== undefined) pulite.nome = pulisci(modifiche.nome)
    if (modifiche.luogo !== undefined) pulite.luogo = pulisci(modifiche.luogo)
    if (modifiche.note !== undefined) pulite.note = modifiche.note.trim()
    const aggiornato: Evento = { ...attuale, ...pulite, aggiornato_il: adesso() }
    if (JSON.stringify(aggiornato) === JSON.stringify({ ...attuale, aggiornato_il: aggiornato.aggiornato_il })) return attuale
    await archivio.eventi.put(aggiornato)
    await accoda(archivio, 'invia_evento', uuid)
    return aggiornato
  })
  segnalaCodaCambiata()
  return esito
}

/** Archivia (o riapre) un evento: sparisce dall'elenco e, su Plexus (1.1), viene chiuso. I dati restano sul dispositivo. */
export function archiviaEvento(uuid: string, archiviato = true, archivio: ArchivioLocale = dbPredefinito): Promise<Evento> {
  return aggiornaEvento(uuid, { archiviato }, archivio)
}

/** Eventi dal più recente al più vecchio (per data di inizio). */
export async function elencoEventi(archivio: ArchivioLocale = dbPredefinito): Promise<Evento[]> {
  const eventi = await archivio.eventi.toArray()
  return eventi.sort((a, b) => (b.data_inizio || '').localeCompare(a.data_inizio || '') || b.creato_il.localeCompare(a.creato_il))
}

export function leggiEvento(uuid: string, archivio: ArchivioLocale = dbPredefinito): Promise<Evento | undefined> {
  return archivio.eventi.get(uuid)
}

/** Cancella un evento con tutte le sue lead, foto e operazioni in coda. Chiedere SEMPRE conferma prima. */
export async function eliminaEvento(uuid: string, archivio: ArchivioLocale = dbPredefinito): Promise<void> {
  await archivio.transaction('rw', archivio.eventi, archivio.lead, archivio.foto, archivio.coda, async () => {
    const lead = await archivio.lead.where('evento_uuid').equals(uuid).toArray()
    for (const l of lead) await eliminaLead(l.uuid, archivio)
    await rimuoviOperazioniDi(archivio, [uuid])
    await archivio.eventi.delete(uuid)
  })
}

/** Quante lead ha ogni evento (uuid evento → numero). */
export async function contaLeadPerEvento(archivio: ArchivioLocale = dbPredefinito): Promise<Map<string, number>> {
  const conteggi = new Map<string, number>()
  await archivio.lead.each((l) => conteggi.set(l.evento_uuid, (conteggi.get(l.evento_uuid) ?? 0) + 1))
  return conteggi
}

// ---------- Lead ----------

/** Una foto da salvare insieme alla lead (stessa transazione: o si salva tutto o niente). */
export interface NuovaFoto {
  tipo: TipoFoto
  dati: DatiFoto
}

export async function creaLead(evento_uuid: string, campi: Partial<CampiLead>, archivio: ArchivioLocale = dbPredefinito, fotoNuove: NuovaFoto[] = []): Promise<Lead> {
  const ora = adesso()
  const lead: Lead = {
    uuid: nuovoUuid(),
    evento_uuid,
    ...CAMPI_LEAD_VUOTI,
    ...pulisciCampiLead(campi),
    origine: 'app',
    solo_lettura: false,
    plexus_id: null,
    plexus_stato: null,
    inviata_il: null,
    ringraziamento: null,
    creato_il: ora,
    aggiornato_il: ora,
  }
  await archivio.transaction('rw', archivio.lead, archivio.foto, archivio.coda, async () => {
    await archivio.lead.add(lead)
    await accoda(archivio, 'invia_lead', lead.uuid)
    for (const f of fotoNuove) await inserisciFoto(archivio, lead.uuid, f.tipo, f.dati)
  })
  segnalaCodaCambiata()
  return lead
}

/** Modifica una lead e la rimette in coda (Plexus la aggiorna grazie allo stesso uuid). */
export async function aggiornaLead(uuid: string, modifiche: Partial<CampiLead>, archivio: ArchivioLocale = dbPredefinito, fotoNuove: NuovaFoto[] = []): Promise<Lead> {
  const esito = await archivio.transaction('rw', archivio.lead, archivio.foto, archivio.coda, async () => {
    const attuale = await archivio.lead.get(uuid)
    if (!attuale) throw new Error(`Lead ${uuid} non trovata`)
    if (attuale.solo_lettura) throw new Error('Questa lead si può modificare solo da Plexus')
    const aggiornata: Lead = { ...attuale, ...pulisciCampiLead(modifiche), aggiornato_il: adesso() }
    await archivio.lead.put(aggiornata)
    await accoda(archivio, 'invia_lead', uuid)
    for (const f of fotoNuove) await inserisciFoto(archivio, uuid, f.tipo, f.dati)
    return aggiornata
  })
  segnalaCodaCambiata()
  return esito
}

/** Lead di un evento, dalla più recente. */
export async function leadDiEvento(evento_uuid: string, archivio: ArchivioLocale = dbPredefinito): Promise<Lead[]> {
  return archivio.lead.where('[evento_uuid+creato_il]').between([evento_uuid, ''], [evento_uuid, '￿']).reverse().toArray()
}

export function leggiLead(uuid: string, archivio: ArchivioLocale = dbPredefinito): Promise<Lead | undefined> {
  return archivio.lead.get(uuid)
}

/** Cancella una lead dal dispositivo con le sue foto e le operazioni in coda. Non la toglie da Plexus. */
export async function eliminaLead(uuid: string, archivio: ArchivioLocale = dbPredefinito): Promise<void> {
  await archivio.transaction('rw', archivio.lead, archivio.foto, archivio.coda, async () => {
    const foto = await archivio.foto.where('lead_uuid').equals(uuid).primaryKeys()
    await rimuoviOperazioniDi(archivio, [uuid, ...foto])
    await archivio.foto.bulkDelete(foto)
    await archivio.lead.delete(uuid)
  })
}

// ---------- Foto ----------

export interface DatiFoto {
  blob: Blob
  miniatura: Blob | null
  mime: string
  larghezza: number
  altezza: number
}

/** Inserisce una foto e ne accoda il caricamento. Da usare DENTRO una transazione su foto + coda. */
async function inserisciFoto(archivio: ArchivioLocale, lead_uuid: string, tipo: TipoFoto, dati: DatiFoto): Promise<Foto> {
  const foto: Foto = {
    uuid: nuovoUuid(),
    lead_uuid,
    tipo,
    blob: dati.blob,
    miniatura: dati.miniatura,
    mime: dati.mime,
    dimensione: dati.blob.size,
    larghezza: dati.larghezza,
    altezza: dati.altezza,
    plexus_foto_id: null,
    creato_il: adesso(),
  }
  await archivio.foto.add(foto)
  await accoda(archivio, 'carica_foto', foto.uuid)
  return foto
}

export async function aggiungiFoto(lead_uuid: string, tipo: TipoFoto, dati: DatiFoto, archivio: ArchivioLocale = dbPredefinito): Promise<Foto> {
  const foto = await archivio.transaction('rw', archivio.foto, archivio.coda, () => inserisciFoto(archivio, lead_uuid, tipo, dati))
  segnalaCodaCambiata()
  return foto
}

export function fotoDiLead(lead_uuid: string, archivio: ArchivioLocale = dbPredefinito): Promise<Foto[]> {
  return archivio.foto.where('lead_uuid').equals(lead_uuid).sortBy('creato_il')
}

/** Cancella una foto dal dispositivo (se era già arrivata a Plexus, lì resta). */
export async function eliminaFoto(uuid: string, archivio: ArchivioLocale = dbPredefinito): Promise<void> {
  await archivio.transaction('rw', archivio.foto, archivio.coda, async () => {
    await rimuoviOperazioniDi(archivio, [uuid])
    await archivio.foto.delete(uuid)
  })
}

// ---------- Impostazioni ----------

export async function leggiImpostazione<T>(chiave: string, predefinito: T, archivio: ArchivioLocale = dbPredefinito): Promise<T> {
  const voce = await archivio.impostazioni.get(chiave)
  return voce === undefined ? predefinito : (voce.valore as T)
}

export async function salvaImpostazione(chiave: string, valore: unknown, archivio: ArchivioLocale = dbPredefinito): Promise<void> {
  await archivio.impostazioni.put({ chiave, valore })
}

export async function cancellaImpostazione(chiave: string, archivio: ArchivioLocale = dbPredefinito): Promise<void> {
  await archivio.impostazioni.delete(chiave)
}

// ---------- Ricerca e filtri ----------

export interface FiltriLead {
  testo?: string
  categoria?: string
  consenso?: 'si' | 'no' | 'nessuno'
}

/** Filtra un elenco di lead (già caricato) per testo libero, categoria e consenso. */
export function filtraLead(lead: Lead[], filtri: FiltriLead, normalizza: (t: string) => string): Lead[] {
  const testo = normalizza(filtri.testo ?? '')
  return lead.filter((l) => {
    if (filtri.categoria && l.categoria !== filtri.categoria) return false
    if (filtri.consenso === 'si' && l.consenso !== true) return false
    if (filtri.consenso === 'no' && l.consenso !== false) return false
    if (filtri.consenso === 'nessuno' && l.consenso !== null) return false
    if (testo) {
      const pagliaio = normalizza([l.nome, l.cognome, l.email, l.telefono, l.azienda, l.professione, l.citta, l.provincia, l.note, l.categoria].join(' '))
      if (!testo.split(' ').every((parola) => pagliaio.includes(parola))) return false
    }
    return true
  })
}
