// Client isolato per l'API di Plexus. È l'UNICO punto dell'app che parla con il server:
// per collegare un altro gestionale basta scrivere un client diverso con la stessa interfaccia.
// Regole: il codice (token) viaggia solo nell'intestazione Authorization, mai in URL o log.
import type { CorpoEvento, CorpoLead, CorpoModificaEvento, FotoPlexus, LeadPlexus, RispostaFoto, RispostaLead, SchedaEvento, StatoPlexus, DomandaPlexus } from './tipi'

/** rete = non raggiungibile; timeout = troppo lenta; http = risposta di errore; risposta = contenuto inatteso */
export type TipoErrorePlexus = 'rete' | 'timeout' | 'http' | 'risposta'

/** Errore nelle chiamate a Plexus: `codice` è lo stato HTTP (null se la rete non ha risposto). */
export class ErrorePlexus extends Error {
  constructor(
    public readonly tipo: TipoErrorePlexus,
    public readonly codice: number | null,
    messaggio: string,
  ) {
    super(messaggio)
    this.name = 'ErrorePlexus'
  }
  /** true per 401: il token non è più valido e serve ricollegare l'app. */
  get tokenNonValido(): boolean {
    return this.codice === 401
  }
  /** true per gli errori che non ha senso ritentare con gli stessi dati (400, 403, 404, 413). */
  get permanente(): boolean {
    return this.codice !== null && [400, 403, 404, 413, 422].includes(this.codice)
  }
}

export interface ClientPlexus {
  stato(): Promise<StatoPlexus>
  /** Tutti gli eventi; con `conArchiviati` anche quelli chiusi (1.1; la 1.0 ignora il parametro). */
  eventi(conArchiviati?: boolean): Promise<SchedaEvento[]>
  evento(id: number): Promise<SchedaEvento>
  creaEvento(corpo: CorpoEvento): Promise<{ evento: SchedaEvento; creato: boolean }>
  /** (1.1) PUT /eventi/{id}: modifica campi, questionario, archiviazione. */
  modificaEvento(id: number, corpo: CorpoModificaEvento): Promise<SchedaEvento>
  aggiornaQuestionario(id: number, questionario: DomandaPlexus[]): Promise<DomandaPlexus[]>
  leadDiEvento(id: number): Promise<LeadPlexus[]>
  creaLead(eventoId: number, corpo: CorpoLead): Promise<RispostaLead>
  /** Carica una foto; `uuid` (1.1) evita i doppioni se la risposta si perde. */
  caricaFoto(leadId: number, file: Blob, tipo: string, nomeFile: string, uuid?: string): Promise<RispostaFoto>
  /** (1.1) Elenco delle foto di una lead. */
  fotoDiLead(leadId: number): Promise<FotoPlexus[]>
  /** (1.1) Scarica l'immagine di una foto. */
  scaricaFoto(leadId: number, fotoId: number): Promise<Blob>
}

export interface OpzioniClient {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Se presente, il token viene chiesto a ogni chiamata (Capta Cloud: può cambiare quando viene rinnovato). */
  token?: () => Promise<string>
  /** Se presente, dopo un 401 viene chiamata per ottenere un token nuovo; se restituisce null l'errore 401 resta. */
  rinnova?: () => Promise<string | null>
}

/** "https://plexus.azienda.it/" → "https://plexus.azienda.it/api/v1" */
export function normalizzaUrlPlexus(url: string): string {
  let u = url.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  if (!/\/api\/v1$/.test(u)) u = `${u}/api/v1`
  return u
}

/** Controlla l'indirizzo scritto dall'utente: deve essere https (http solo per localhost / reti locali di prova). */
export function problemaUrlPlexus(url: string): 'vuoto' | 'non_valido' | 'non_sicuro' | null {
  const u = url.trim()
  if (!u) return 'vuoto'
  let parsata: URL
  try {
    parsata = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`)
  } catch {
    return 'non_valido'
  }
  if (!parsata.hostname) return 'non_valido'
  if (parsata.protocol === 'http:') {
    const h = parsata.hostname
    const locale = h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === '[::1]'
    if (!locale) return 'non_sicuro'
  }
  return null
}

export function creaClientPlexus(urlBase: string, token: string, opzioni: OpzioniClient = {}): ClientPlexus {
  const base = normalizzaUrlPlexus(urlBase)
  const fetchImpl = opzioni.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const timeoutMs = opzioni.timeoutMs ?? 30_000

  async function richiestaGrezza(metodo: string, percorso: string, corpo: BodyInit | undefined, intestazioni: Record<string, string>, attesaMs: number, accetta: string, tokenAttuale: string): Promise<Response> {
    const controllo = new AbortController()
    const timer = setTimeout(() => controllo.abort(), attesaMs)
    try {
      return await fetchImpl(`${base}${percorso}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${tokenAttuale}`, Accept: accetta, ...intestazioni },
        body: corpo,
        signal: controllo.signal,
        cache: 'no-store',
      })
    } catch (e) {
      const nome = e instanceof Error ? e.name : ''
      if (nome === 'AbortError') throw new ErrorePlexus('timeout', null, 'tempo scaduto')
      throw new ErrorePlexus('rete', null, 'rete non raggiungibile')
    } finally {
      clearTimeout(timer)
    }
  }

  /** Come richiestaGrezza, ma con il token dinamico e un solo nuovo tentativo dopo un 401 se c'è un rinnovo. */
  async function richiesta(metodo: string, percorso: string, corpo: BodyInit | undefined, intestazioni: Record<string, string>, attesaMs: number, accetta: string): Promise<Response> {
    const tokenAttuale = opzioni.token ? await opzioni.token() : token
    const risposta = await richiestaGrezza(metodo, percorso, corpo, intestazioni, attesaMs, accetta, tokenAttuale)
    if (risposta.status !== 401 || !opzioni.rinnova || corpo instanceof FormData) {
      if (risposta.status === 401 && opzioni.rinnova && corpo instanceof FormData) {
        // il multipart non si può rimandare così com'è: si rinnova il token e si lascia riprovare alla coda
        const nuovo = await opzioni.rinnova()
        if (nuovo) return richiestaGrezza(metodo, percorso, corpo, intestazioni, attesaMs, accetta, nuovo)
      }
      return risposta
    }
    const nuovo = await opzioni.rinnova()
    if (!nuovo) return risposta
    return richiestaGrezza(metodo, percorso, corpo, intestazioni, attesaMs, accetta, nuovo)
  }

  async function chiama<T>(metodo: string, percorso: string, corpo?: BodyInit, intestazioni: Record<string, string> = {}, attesaMs = timeoutMs): Promise<T> {
    const risposta = await richiesta(metodo, percorso, corpo, intestazioni, attesaMs, 'application/json')
    let dati: unknown = null
    const testo = await risposta.text()
    if (testo) {
      try {
        dati = JSON.parse(testo)
      } catch {
        if (risposta.ok) throw new ErrorePlexus('risposta', risposta.status, 'risposta non in formato JSON')
      }
    }
    if (!risposta.ok) {
      const spiegazione = dati && typeof dati === 'object' && typeof (dati as { errore?: unknown }).errore === 'string' ? (dati as { errore: string }).errore : `errore ${risposta.status}`
      throw new ErrorePlexus('http', risposta.status, spiegazione)
    }
    return dati as T
  }

  const JSON_INTESTAZIONI = { 'Content-Type': 'application/json' }

  async function binario(percorso: string): Promise<Blob> {
    const risposta = await richiesta('GET', percorso, undefined, {}, timeoutMs * 4, '*/*')
    if (!risposta.ok) {
      let spiegazione = `errore ${risposta.status}`
      try {
        const dati = (await risposta.json()) as { errore?: unknown }
        if (typeof dati.errore === 'string') spiegazione = dati.errore
      } catch {
        // corpo non JSON: va bene la spiegazione generica
      }
      throw new ErrorePlexus('http', risposta.status, spiegazione)
    }
    return risposta.blob()
  }

  return {
    stato: () => chiama<StatoPlexus>('GET', '/stato'),
    eventi: async (conArchiviati = false) => (await chiama<{ eventi: SchedaEvento[] }>('GET', conArchiviati ? '/eventi?archiviati=1' : '/eventi')).eventi ?? [],
    evento: async (id) => (await chiama<{ evento: SchedaEvento }>('GET', `/eventi/${id}`)).evento,
    creaEvento: (corpo) => chiama<{ evento: SchedaEvento; creato: boolean }>('POST', '/eventi', JSON.stringify(corpo), JSON_INTESTAZIONI),
    modificaEvento: async (id, corpo) => (await chiama<{ evento: SchedaEvento }>('PUT', `/eventi/${id}`, JSON.stringify(corpo), JSON_INTESTAZIONI)).evento,
    aggiornaQuestionario: async (id, questionario) =>
      (await chiama<{ questionario: DomandaPlexus[] }>('PUT', `/eventi/${id}/questionario`, JSON.stringify({ questionario }), JSON_INTESTAZIONI)).questionario,
    leadDiEvento: async (id) => (await chiama<{ lead: LeadPlexus[] }>('GET', `/eventi/${id}/lead`)).lead ?? [],
    creaLead: (eventoId, corpo) => chiama<RispostaLead>('POST', `/eventi/${eventoId}/lead`, JSON.stringify(corpo), JSON_INTESTAZIONI),
    caricaFoto: (leadId, file, tipo, nomeFile, uuid) => {
      const form = new FormData()
      form.append('file', file, nomeFile)
      form.append('tipo', tipo)
      if (uuid) form.append('uuid', uuid)
      // una foto grande su rete lenta ha bisogno di più tempo: 60 s + 20 s per ogni MB (max 5 minuti)
      const attesa = Math.min(5 * 60_000, Math.max(timeoutMs, 60_000 + Math.ceil(file.size / (1024 * 1024)) * 20_000))
      return chiama<RispostaFoto>('POST', `/lead/${leadId}/foto`, form, {}, attesa)
    },
    fotoDiLead: async (leadId) => (await chiama<{ foto: FotoPlexus[] }>('GET', `/lead/${leadId}/foto`)).foto ?? [],
    scaricaFoto: (leadId, fotoId) => binario(`/lead/${leadId}/foto/${fotoId}`),
  }
}
