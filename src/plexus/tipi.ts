// Forme dei dati scambiati con Plexus (contratto API 1.1, compatibile con la 1.0).
// Qui si descrive SOLO ciò che è nel contratto.
import type { Domanda } from '../dati/tipi'

export interface StatoPlexus {
  api: string
  piattaforma: string
  azienda: string
  utente: { nome: string; email: string; ruolo: string }
  posta_lead_pronta: boolean
  ai_pronta: boolean
  lingue: Record<string, string>
  linee: Record<string, string>
  tipi_foto: string[]
  /** (Capta Cloud) gestionale collegato all'azienda, se c'è */
  gestionale?: { tipo: string; stato: string } | null
}

/** Domanda come la conosce Plexus (dalla 1.1 con le traduzioni). */
export interface DomandaPlexus {
  domanda: string
  opzioni: string[]
  multipla?: boolean
  consenso?: boolean
  traduzioni?: Record<string, { domanda: string; opzioni: string[] }>
}

export interface SchedaEvento {
  id: number
  uuid_app: string | null
  nome: string
  luogo: string
  data_inizio: string
  data_fine: string
  note: string
  lingua: string
  linea: string
  ringraziamento_attivo: boolean
  /** (1.1) true = evento chiuso: sparisce dagli elenchi */
  archiviato?: boolean
  questionario: DomandaPlexus[]
  categorie_suggerite: string[]
  conteggi?: Record<string, number>
  totale_lead?: number
}

/** Corpo di POST /eventi (creazione, o aggiornamento se l'uuid esiste già). */
export interface CorpoEvento {
  uuid: string
  nome: string
  luogo: string
  data_inizio: string
  data_fine: string
  note: string
  lingua: string
  linea: string
  ringraziamento_attivo?: boolean
  categorie_suggerite?: string[]
  questionario?: DomandaPlexus[]
}

/** Corpo di PUT /eventi/{id} (1.1): uno o più campi. */
export interface CorpoModificaEvento {
  nome?: string
  luogo?: string
  data_inizio?: string
  data_fine?: string
  note?: string
  lingua?: string
  linea?: string
  ringraziamento_attivo?: boolean
  categorie_suggerite?: string[]
  questionario?: DomandaPlexus[]
  archiviato?: boolean
}

export type EsitoRingraziamentoRisposta = 'inviato' | 'in_attesa' | 'gia_inviato' | 'saltato' | 'errore'

export interface LeadPlexus {
  id: number
  uuid: string | null
  evento_id: number
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
  lingua: string | null
  consenso: 'S' | 'N' | null
  categoria: string
  risposte: Record<string, string>
  stato: string
  origine: string
  creato_il: string
  aggiornato_il: string | null
  n_foto: number
  /** (1.1) esito della mail immediata, visibile da qualunque dispositivo */
  ringraziamento?: { esito: 'inviato' | 'in_attesa' | 'errore' | 'saltato' | null; inviato_il: string | null; dettaglio?: string } | null
  /** (Capta Cloud) chi ha registrato il contatto */
  registrata_da?: { id: number; nome: string } | null
  /** (Capta Cloud) stato della lead nel gestionale collegato all'azienda */
  gestionale?: { id: number | null; stato: string | null } | null
}

export interface CorpoLead {
  uuid: string
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
  lingua?: string
  consenso?: boolean
  risposte: Record<string, string | string[]>
}

export interface EsitoRingraziamentoPlexus {
  esito: EsitoRingraziamentoRisposta
  dettaglio: string
}

export interface RispostaLead {
  lead: LeadPlexus
  creata: boolean
  ringraziamento: EsitoRingraziamentoPlexus
}

export interface RispostaFoto {
  foto_id: number
  tipo: string
  /** (1.1) */
  uuid?: string | null
  /** (1.1) false = la foto c'era già (stesso uuid) */
  creata?: boolean
}

/** (1.1) Una foto nell'elenco GET /lead/{id}/foto. */
export interface FotoPlexus {
  foto_id: number
  tipo: string
  uuid: string | null
  creato_il?: string
}

/** Prepara un questionario per Plexus: dalla 1.1 le traduzioni viaggiano insieme alle domande. */
export function questionarioPerPlexus(questionario: Domanda[], conTraduzioni = true): DomandaPlexus[] {
  return questionario.map((d) => {
    const voce: DomandaPlexus = { domanda: d.domanda, opzioni: [...d.opzioni], multipla: Boolean(d.multipla) }
    if (d.consenso) voce.consenso = true
    if (conTraduzioni && d.traduzioni && Object.keys(d.traduzioni).length > 0) voce.traduzioni = d.traduzioni
    return voce
  })
}

/** "1.1" → [1, 1]; confronta le versioni dell'API ("1.10" > "1.9"). */
export function versioneApiAlmeno(versione: string | undefined, minima: string): boolean {
  const a = String(versione ?? '').split('.').map((n) => parseInt(n, 10) || 0)
  const b = minima.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return true
}
