// Chiamate a Capta Cloud che NON fanno parte del contratto di sincronizzazione (quello è in src/plexus/):
// account, azienda, utenti, inviti, dispositivi, integrazioni, personalizzazione.
import type { InfoAccount } from '../dati/tipi'
import { normalizzaUrlPlexus } from '../plexus/client'

export class ErroreCapta extends Error {
  constructor(
    public readonly codice: number | null,
    public readonly tipo: string,
    messaggio: string,
  ) {
    super(messaggio)
    this.name = 'ErroreCapta'
  }
}

export interface TokenCapta {
  token_accesso: string
  token_rinnovo: string
  scade_in_secondi: number
}

export interface RispostaAccesso {
  token: TokenCapta
  me: InfoAccount & { integrazioni: IntegrazioneCapta[] }
}

export interface IntegrazioneCapta {
  tipo: string
  url: string
  attiva: boolean
  stato: string
  ultimo_errore: string
  dettagli: Record<string, unknown>
  ultima_sincronizzazione: string | null
  in_coda: number
  in_errore: number
}

export interface UtenteCapta {
  id: number
  email: string
  nome: string
  ruolo: string
  lingua: string
  verificato: boolean
  attivo: boolean
  ultimo_accesso: string | null
}

export interface InvitoCapta {
  id: number
  email: string
  ruolo: string
  scade_il: string
  usato: boolean
  /** solo alla creazione: il link da condividere (si può rigenerare, non rileggere) */
  link?: string | null
  email_inviata?: boolean | null
}

export interface LinkCapta {
  link: string
  scade_il: string
  email_inviata: boolean
}

export interface DispositivoCapta {
  id: number
  nome: string
  identificativo: string
  utente_id: number
  utente_nome: string
  ultimo_accesso: string
}

export interface DispositivoIn {
  identificativo: string
  nome: string
}

async function chiama<T>(url: string, metodo: string, percorso: string, corpo?: unknown, token?: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<T> {
  const intestazioni: Record<string, string> = { Accept: 'application/json' }
  if (corpo !== undefined) intestazioni['Content-Type'] = 'application/json'
  if (token) intestazioni.Authorization = `Bearer ${token}`
  let risposta: Response
  try {
    risposta = await fetchImpl(`${normalizzaUrlPlexus(url)}${percorso}`, { method: metodo, headers: intestazioni, body: corpo === undefined ? undefined : JSON.stringify(corpo), cache: 'no-store' })
  } catch (e) {
    throw new ErroreCapta(null, e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'rete', 'rete non raggiungibile')
  }
  const testo = await risposta.text()
  let dati: unknown = null
  if (testo) {
    try {
      dati = JSON.parse(testo)
    } catch {
      if (risposta.ok) throw new ErroreCapta(risposta.status, 'risposta', 'risposta non in formato JSON')
    }
  }
  if (!risposta.ok) {
    const d = (dati ?? {}) as { errore?: unknown; tipo?: unknown }
    throw new ErroreCapta(risposta.status, typeof d.tipo === 'string' ? d.tipo : 'http', typeof d.errore === 'string' ? d.errore : `errore ${risposta.status}`)
  }
  return dati as T
}

/** API di Capta Cloud. `url` è l'indirizzo del server (senza /api/v1), `token` il token di accesso corrente. */
export function creaApiCapta(url: string, fetchImpl?: typeof fetch) {
  const c = <T>(metodo: string, percorso: string, corpo?: unknown, token?: string) => chiama<T>(url, metodo, percorso, corpo, token, fetchImpl)
  return {
    // --- senza token ---
    registra: (dati: { azienda_nome: string; nome: string; email: string; password: string; lingua: string; dispositivo?: DispositivoIn }) => c<RispostaAccesso>('POST', '/auth/registrazione', dati),
    accedi: (dati: { email: string; password: string; dispositivo?: DispositivoIn }) => c<RispostaAccesso>('POST', '/auth/accesso', dati),
    rinnova: (token_rinnovo: string) => c<TokenCapta>('POST', '/auth/rinnovo', { token_rinnovo }),
    esci: (token_rinnovo: string) => c<{ ok: boolean }>('POST', '/auth/uscita', { token_rinnovo }),
    verificaEmail: (codice: string) => c<{ ok: boolean }>('POST', '/auth/verifica-email', { codice }),
    passwordDimenticata: (email: string) => c<{ ok: boolean; email_inviata?: boolean }>('POST', '/auth/password-dimenticata', { email }),
    passwordReimposta: (codice: string, password: string) => c<{ ok: boolean }>('POST', '/auth/password-reimposta', { codice, password }),
    invito: (codice: string) => c<{ valido: boolean; azienda?: string; app?: string; email?: string; ruolo?: string }>('GET', `/inviti/${encodeURIComponent(codice)}`),
    accettaInvito: (codice: string, dati: { nome: string; password: string; lingua: string; dispositivo?: DispositivoIn }) => c<RispostaAccesso>('POST', `/inviti/${encodeURIComponent(codice)}/accetta`, dati),
    // --- con token ---
    me: (token: string) => c<InfoAccount & { integrazioni: IntegrazioneCapta[] }>('GET', '/me', undefined, token),
    inviaVerifica: (token: string) => c<{ ok: boolean }>('POST', '/auth/invia-verifica', {}, token),
    utenti: (token: string) => c<UtenteCapta[]>('GET', '/azienda/utenti', undefined, token),
    modificaUtente: (token: string, id: number, dati: { ruolo?: string; attivo?: boolean; nome?: string }) => c<UtenteCapta>('PUT', `/azienda/utenti/${id}`, dati, token),
    inviti: (token: string) => c<InvitoCapta[]>('GET', '/azienda/inviti', undefined, token),
    invita: (token: string, email: string, ruolo: string) => c<InvitoCapta>('POST', '/azienda/inviti', { email, ruolo }, token),
    annullaInvito: (token: string, id: number) => c<{ ok: boolean }>('DELETE', `/azienda/inviti/${id}`, undefined, token),
    nuovoLinkInvito: (token: string, id: number) => c<LinkCapta>('POST', `/azienda/inviti/${id}/link`, {}, token),
    linkPassword: (token: string, utenteId: number) => c<LinkCapta>('POST', `/azienda/utenti/${utenteId}/link-password`, {}, token),
    dispositivi: (token: string) => c<DispositivoCapta[]>('GET', '/azienda/dispositivi', undefined, token),
    scollegaDispositivo: (token: string, id: number) => c<{ ok: boolean }>('DELETE', `/azienda/dispositivi/${id}`, undefined, token),
    integrazioni: (token: string) => c<IntegrazioneCapta[]>('GET', '/azienda/integrazioni', undefined, token),
    salvaPlexus: (token: string, dati: { url: string; codice?: string; attiva: boolean }) => c<IntegrazioneCapta>('PUT', '/azienda/integrazioni/plexus', dati, token),
    rimuoviPlexus: (token: string) => c<{ ok: boolean }>('DELETE', '/azienda/integrazioni/plexus', undefined, token),
    configurazione: (token: string) => c<Record<string, unknown>>('GET', '/azienda/configurazione', undefined, token),
    salvaConfigurazione: (token: string, dati: Record<string, unknown>) => c<Record<string, unknown>>('PUT', '/azienda/configurazione', dati, token),
    modificaAzienda: (token: string, dati: { nome?: string; lingua?: string }) => c<InfoAccount['azienda']>('PUT', '/azienda', dati, token),
  }
}

export type ApiCapta = ReturnType<typeof creaApiCapta>
