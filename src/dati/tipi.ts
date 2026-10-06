// Tipi dei dati salvati sul dispositivo. Nomi in italiano come nel resto del progetto.
// Le date sono stringhe ISO (es. "2026-10-16T10:21:00.000Z"); le date di evento sono "AAAA-MM-GG".

/** Codice lingua, es. "it" o "en" (le lingue disponibili stanno in config/brand.json). */
export type Lingua = string

/** Tipi di foto accettati da Plexus (contratto API 1.0). */
export type TipoFoto = 'biglietto' | 'volto' | 'altro'
export const TIPI_FOTO: TipoFoto[] = ['biglietto', 'volto', 'altro']

/** Da dove nasce un record: creato sull'app oppure arrivato da Plexus. */
export type Origine = 'app' | 'plexus'

/** Traduzione di una domanda del questionario in una lingua. */
export interface TraduzioneDomanda {
  domanda: string
  opzioni: string[]
}

/**
 * Una domanda del questionario a risposta chiusa.
 * Il testo in `domanda` e le `opzioni` sono nella lingua principale (quella inviata a Plexus);
 * `traduzioni` serve solo per mostrarla al visitatore nella sua lingua.
 */
export interface Domanda {
  domanda: string
  opzioni: string[]
  multipla?: boolean
  consenso?: boolean
  traduzioni?: Record<Lingua, TraduzioneDomanda>
}

export interface Evento {
  uuid: string
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
  /** true = evento chiuso: nascosto dall'elenco (in Plexus è "archiviato"). */
  archiviato: boolean
  origine: Origine
  /** Numero assegnato da Plexus dopo la prima sincronizzazione (null = non ancora inviato). */
  plexus_id: number | null
  creato_il: string
  aggiornato_il: string
}

/** Risposta a una domanda: una stringa (singola) o un elenco (multipla). */
export type Risposta = string | string[]

export type EsitoRingraziamento = 'inviato' | 'in_attesa' | 'saltato' | 'errore'

/** Esito della mail di ringraziamento immediata. `inviato_il` arriva da Plexus (1.1). */
export interface Ringraziamento {
  esito: EsitoRingraziamento
  dettaglio: string
  inviato_il?: string | null
}

export interface Lead {
  uuid: string
  evento_uuid: string
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
  origine: Origine
  /** true = arrivata da Plexus senza uuid: si può solo guardare, si modifica da Plexus. */
  solo_lettura: boolean
  plexus_id: number | null
  /** Stato della lead dentro Plexus (nuova, bozza, approvata, inviata, risposta, scartata). */
  plexus_stato: string | null
  /** Ultima volta che Plexus ha confermato di avere questa versione della lead. */
  inviata_il: string | null
  ringraziamento: Ringraziamento | null
  creato_il: string
  aggiornato_il: string
}

export interface Foto {
  uuid: string
  lead_uuid: string
  tipo: TipoFoto
  blob: Blob
  /** Versione piccola (per elenchi e PDF). */
  miniatura: Blob | null
  mime: string
  dimensione: number
  larghezza: number
  altezza: number
  plexus_foto_id: number | null
  creato_il: string
}

/** invia_evento = crea o aggiorna (anche archivia) un evento; aggiorna_questionario resta per compatibilità con code vecchie. */
export type TipoOperazione = 'invia_evento' | 'aggiorna_questionario' | 'invia_lead' | 'carica_foto'
export type StatoOperazione = 'in_attesa' | 'in_corso' | 'completata' | 'errore'

/** Una voce della coda di sincronizzazione verso Plexus. */
export interface Operazione {
  id?: number
  tipo: TipoOperazione
  /** uuid dell'oggetto a cui si riferisce (evento, lead o foto). */
  riferimento: string
  stato: StatoOperazione
  tentativi: number
  /** Quando riprovare (ISO). Le operazioni in attesa con data futura vengono saltate. */
  prossimo_tentativo: string
  ultimo_errore: string | null
  /** Codice HTTP dell'ultimo errore (null se errore di rete). */
  codice_errore: number | null
  creato_il: string
  aggiornato_il: string
  completata_il: string | null
}

/** Coppia chiave/valore per le impostazioni (collegamento a Plexus, lingua, ...). */
export interface Impostazione {
  chiave: string
  valore: unknown
}

export type StatoCollegamento = 'ok' | 'token_non_valido' | 'permesso_negato'

/** Dati del collegamento a Plexus, salvati solo sul dispositivo. */
export interface CollegamentoPlexus {
  url: string
  token: string
  piattaforma: string
  azienda: string
  utente: { nome: string; email: string; ruolo: string }
  posta_lead_pronta: boolean
  ai_pronta: boolean
  lingue: Record<string, string>
  linee: Record<string, string>
  tipi_foto: string[]
  /** Versione dell'API di Plexus ("1.0", "1.1"): alcune funzioni esistono solo dalla 1.1. */
  api: string
  collegato_il: string
  stato: StatoCollegamento
}
