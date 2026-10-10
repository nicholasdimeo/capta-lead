// Raccolta e conteggi per i report (Excel e PDF). Lavora solo sui dati locali: funziona anche offline.
import { db as dbPredefinito, type ArchivioLocale } from '../dati/db'
import type { Domanda, Evento, Foto, Lead, Lingua } from '../dati/tipi'
import { brand, testoIn } from '../config/brand'
import { nomeFileSicuro } from '../utils/testo'
import { adesso } from '../utils/date'
import type { FunzioneT } from '../i18n'

export interface ContenutoReport {
  evento: Evento
  lead: Lead[]
  fotoPerLead: Map<string, Foto[]>
  lingua: Lingua
  generato_il: string
}

export interface ConteggioOpzione {
  opzione: string
  n: number
}

export interface ConteggioDomanda {
  domanda: Domanda
  conteggi: ConteggioOpzione[]
  senzaRisposta: number
}

export interface Riepilogo {
  totale: number
  conConsenso: number
  senzaConsenso: number
  consensoNonRisposto: number
  conEmail: number
  inPlexus: number
  perCategoria: { categoria: string; n: number }[]
  perOperatore: { operatore: string; n: number }[]
  perDomanda: ConteggioDomanda[]
}

/** Legge dal database tutto ciò che serve per il report di un evento (lead dalla più vecchia, con foto). */
export async function raccogliContenuto(eventoUuid: string, lingua: Lingua, archivio: ArchivioLocale = dbPredefinito): Promise<ContenutoReport> {
  const evento = await archivio.eventi.get(eventoUuid)
  if (!evento) throw new Error('Evento non trovato')
  const lead = await archivio.lead.where('evento_uuid').equals(eventoUuid).sortBy('creato_il')
  const fotoPerLead = new Map<string, Foto[]>()
  const tutte = await archivio.foto.where('lead_uuid').anyOf(lead.map((l) => l.uuid)).toArray()
  for (const f of tutte.sort((a, b) => a.creato_il.localeCompare(b.creato_il))) {
    const elenco = fotoPerLead.get(f.lead_uuid) ?? []
    elenco.push(f)
    fotoPerLead.set(f.lead_uuid, elenco)
  }
  return { evento, lead, fotoPerLead, lingua, generato_il: adesso() }
}

/** Trasforma una risposta (stringa o elenco) in elenco di opzioni scelte. */
export function opzioniScelte(risposta: unknown): string[] {
  if (Array.isArray(risposta)) return risposta.map(String).filter(Boolean)
  if (typeof risposta === 'string' && risposta.trim()) return [risposta]
  return []
}

export function calcolaRiepilogo(c: ContenutoReport): Riepilogo {
  const perCategoria = new Map<string, number>()
  const perOperatore = new Map<string, number>()
  let conConsenso = 0
  let senzaConsenso = 0
  let consensoNonRisposto = 0
  let conEmail = 0
  let inPlexus = 0
  for (const l of c.lead) {
    if (l.consenso === true) conConsenso++
    else if (l.consenso === false) senzaConsenso++
    else consensoNonRisposto++
    if (l.email) conEmail++
    if (l.plexus_id !== null) inPlexus++
    const cat = l.categoria || ''
    perCategoria.set(cat, (perCategoria.get(cat) ?? 0) + 1)
    if (l.registrata_da?.nome) perOperatore.set(l.registrata_da.nome, (perOperatore.get(l.registrata_da.nome) ?? 0) + 1)
  }
  const perDomanda: ConteggioDomanda[] = c.evento.questionario.map((domanda) => {
    const conteggi = new Map<string, number>(domanda.opzioni.map((o) => [o, 0]))
    let senzaRisposta = 0
    for (const l of c.lead) {
      const scelte = opzioniScelte(l.risposte[domanda.domanda])
      if (scelte.length === 0) senzaRisposta++
      for (const s of scelte) conteggi.set(s, (conteggi.get(s) ?? 0) + 1)
    }
    return { domanda, conteggi: [...conteggi.entries()].map(([opzione, n]) => ({ opzione, n })), senzaRisposta }
  })
  return {
    totale: c.lead.length,
    conConsenso,
    senzaConsenso,
    consensoNonRisposto,
    conEmail,
    inPlexus,
    perCategoria: [...perCategoria.entries()].map(([categoria, n]) => ({ categoria, n })).sort((a, b) => b.n - a.n || a.categoria.localeCompare(b.categoria)),
    perOperatore: [...perOperatore.entries()].map(([operatore, n]) => ({ operatore, n })).sort((a, b) => b.n - a.n || a.operatore.localeCompare(b.operatore)),
    perDomanda,
  }
}

export function etichettaLinea(linea: string, lingua: Lingua): string {
  return testoIn(brand.linee[linea], lingua) || linea
}

export function etichettaTipoFoto(tipo: string, lingua: Lingua): string {
  return testoIn(brand.tipi_foto[tipo], lingua) || tipo
}

export function testoConsenso(consenso: boolean | null, t: FunzioneT): string {
  if (consenso === true) return t('report.si')
  if (consenso === false) return t('report.no')
  return t('report.vuoto')
}

/** Nome del file di report: "report-congresso-sime-2026.xlsx" */
export function nomeFileReport(evento: Evento, estensione: 'xlsx' | 'pdf'): string {
  return `report-${nomeFileSicuro(evento.nome)}.${estensione}`
}

/** Testo di una risposta per le tabelle (elenco → "A, B"). */
export function testoRisposta(risposta: unknown): string {
  return opzioniScelte(risposta).join(', ')
}

/** Converte un colore "#rrggbb" in componenti 0-1 (per il PDF). */
export function coloreRgb(esadecimale: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(esadecimale.trim())
  if (!m) return [0, 0, 0]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
