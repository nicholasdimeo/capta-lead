// Il motore con un account Capta Cloud: accesso, rinnovo automatico del token, sessione scaduta.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ambienteMotore, CAMPI_EVENTO_PROVA } from '../test/aiuti'
import { creaEvento, creaLead } from '../dati/archivio'
import { creaClientPlexus, ErrorePlexus } from '../plexus/client'
import { MotoreSincronizzazione } from './motore'
import { creaPlexusFinto } from '../test/plexus-finto'
import { archivioNuovo } from '../test/aiuti'

/** Un Capta Cloud finto per le chiamate di account (fetch globale): accesso, rinnovo, me. */
function cloudFinto() {
  const stato = { tokenAccessoValido: 'acc-1', tokenRinnovoValido: 'rin-1', contatore: 1, chiamate: [] as string[], rinnovoFallisce: false }
  const me = { utente: { id: 7, email: 'anna@sgm.it', nome: 'Anna', ruolo: 'amministratore', lingua: 'it', verificato: true }, azienda: { id: 1, nome: 'SGM Pharma', slug: 'sgm', lingua: 'it', piano: { nome: 'interno', scadenza: null, crediti_eventi: 0, limiti: {}, utilizzo: {} }, configurazione: { app: { nome: 'Capta SGM' } } }, integrazioni: [{ tipo: 'plexus', url: 'https://plexus', attiva: true, stato: 'ok', ultimo_errore: '', dettagli: { posta_lead_pronta: true }, ultima_sincronizzazione: null, in_coda: 0, in_errore: 0 }] }
  const fetchFinto = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    const percorso = u.replace(/^https?:\/\/[^/]+\/api\/v1/, '')
    stato.chiamate.push(`${init?.method ?? 'GET'} ${percorso}`)
    const corpo = init?.body ? JSON.parse(String(init.body)) : {}
    const json = (codice: number, dati: unknown) => new Response(JSON.stringify(dati), { status: codice, headers: { 'content-type': 'application/json' } })
    if (percorso === '/auth/accesso') {
      if (corpo.password !== 'segreta123') return json(401, { errore: 'Email o password non corretti.', tipo: 'credenziali_errate' })
      return json(200, { token: { token_accesso: stato.tokenAccessoValido, token_rinnovo: stato.tokenRinnovoValido, scade_in_secondi: 1800 }, me })
    }
    if (percorso === '/auth/rinnovo') {
      if (stato.rinnovoFallisce || corpo.token_rinnovo !== stato.tokenRinnovoValido) return json(401, { errore: 'Sessione scaduta', tipo: 'sessione_scaduta' })
      stato.contatore++
      stato.tokenAccessoValido = `acc-${stato.contatore}`
      stato.tokenRinnovoValido = `rin-${stato.contatore}`
      return json(200, { token_accesso: stato.tokenAccessoValido, token_rinnovo: stato.tokenRinnovoValido, scade_in_secondi: 1800 })
    }
    if (percorso === '/me') return json(200, me)
    if (percorso === '/auth/uscita') return json(200, { ok: true })
    return json(404, { errore: 'sconosciuto' })
  })
  return { stato, fetchFinto }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('motore: account Capta Cloud', () => {
  it('accesso con email e password: collegamento di tipo capta con i dati dell\'azienda', async () => {
    const cloud = cloudFinto()
    vi.stubGlobal('fetch', cloud.fetchFinto)
    const { motore } = await ambienteMotore({ collegato: false })
    await expect(motore.accedi('https://cloud.capta', 'anna@sgm.it', 'sbagliata')).rejects.toMatchObject({ tipo: 'credenziali_errate' })
    const c = await motore.accedi('https://cloud.capta', 'anna@sgm.it', 'segreta123')
    expect(c.tipo).toBe('capta')
    expect(c.token).toBe('acc-1')
    expect(c.account?.azienda.nome).toBe('SGM Pharma')
    expect(c.gestionale).toEqual({ tipo: 'plexus', stato: 'ok' })
    expect(c.posta_lead_pronta).toBe(true)
    expect(motore.leggiStato().collegamento?.account?.utente.nome).toBe('Anna')
    // il dispositivo viene mandato con l'accesso
    const corpo = JSON.parse(String(cloud.fetchFinto.mock.calls.at(-1)?.[1]?.body))
    expect(corpo.dispositivo.identificativo).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('token scaduto durante la sincronizzazione: rinnovo automatico e nuovo tentativo, senza perdere nulla', async () => {
    const cloud = cloudFinto()
    vi.stubGlobal('fetch', cloud.fetchFinto)
    const archivio = archivioNuovo()
    const plexus = creaPlexusFinto()
    // il client di sincronizzazione "vero": controlla il token come farebbe Capta Cloud
    let tokenAccettato = 'acc-1'
    const fetchSync = async (url: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.Authorization ?? ''
      if (auth !== `Bearer ${tokenAccettato}`) return new Response(JSON.stringify({ errore: 'token scaduto' }), { status: 401, headers: { 'content-type': 'application/json' } })
      const percorso = String(url).replace(/^https?:\/\/[^/]+\/api\/v1/, '')
      const metodo = init?.method ?? 'GET'
      const corpo = init?.body && !(init.body instanceof FormData) ? JSON.parse(String(init.body)) : undefined
      let dati: unknown
      if (percorso === '/stato') dati = await plexus.client.stato()
      else if (percorso.startsWith('/eventi?')) dati = { eventi: await plexus.client.eventi(true) }
      else if (percorso === '/eventi' && metodo === 'POST') dati = await plexus.client.creaEvento(corpo)
      else if (/^\/eventi\/\d+\/lead$/.test(percorso) && metodo === 'POST') dati = await plexus.client.creaLead(Number(percorso.split('/')[2]), corpo)
      else if (/^\/eventi\/\d+\/lead$/.test(percorso)) dati = { lead: await plexus.client.leadDiEvento(Number(percorso.split('/')[2])) }
      else dati = {}
      return new Response(JSON.stringify(dati), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const motore = new MotoreSincronizzazione(archivio, {
      creaClient: (c, m) => creaClientPlexus(c.url, c.token, { fetchImpl: fetchSync as typeof fetch, token: () => m.tokenValido(), rinnova: () => m.rinnovaToken() }),
      online: () => true,
      intervalloAllineamentoLead: 0,
      periodoTimerMs: 0,
    })
    await motore.prepara()
    await motore.accedi('https://cloud.capta', 'anna@sgm.it', 'segreta123')
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await creaLead(evento.uuid, { nome: 'Anna' }, archivio)
    // il server non accetta più il vecchio token: la sincronizzazione lo rinnova da sola
    tokenAccettato = 'acc-2'
    const esito = await motore.sincronizza('manuale')
    expect(esito.errore).toBeUndefined()
    expect(plexus.lead).toHaveLength(1)
    expect(cloud.stato.chiamate.filter((c) => c === 'POST /auth/rinnovo')).toHaveLength(1)
    expect(motore.leggiStato().collegamento?.token).toBe('acc-2')
    expect(motore.leggiStato().collegamento?.token_rinnovo).toBe('rin-2')
    // sessione davvero scaduta: il rinnovo fallisce → collegamento da rifare
    tokenAccettato = 'acc-3'
    cloud.stato.rinnovoFallisce = true
    await creaLead(evento.uuid, { nome: 'Marco' }, archivio)
    const esito2 = await motore.sincronizza('manuale')
    expect(esito2.errore).toBe('token_non_valido')
    expect(motore.leggiStato().collegamento?.stato).toBe('token_non_valido')
    expect(plexus.lead).toHaveLength(1) // Marco aspetta in coda
    // nuovo accesso → tutto riparte
    cloud.stato.rinnovoFallisce = false
    cloud.stato.tokenAccessoValido = 'acc-3'
    await motore.accedi('https://cloud.capta', 'anna@sgm.it', 'segreta123')
    await motore.sincronizza('manuale')
    expect(plexus.lead).toHaveLength(2)
  })

  it('uscita: chiude la sessione sul server e toglie il collegamento; la coda resta', async () => {
    const cloud = cloudFinto()
    vi.stubGlobal('fetch', cloud.fetchFinto)
    const { motore, archivio } = await ambienteMotore({ collegato: false })
    await motore.accedi('https://cloud.capta', 'anna@sgm.it', 'segreta123')
    await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await motore.scollega()
    expect(cloud.stato.chiamate).toContain('POST /auth/uscita')
    expect(motore.leggiStato().collegamento).toBeNull()
    expect(await archivio.coda.count()).toBe(1)
  })

  it('il rinnovo senza rete non viene scambiato per una sessione scaduta', async () => {
    const cloud = cloudFinto()
    vi.stubGlobal('fetch', cloud.fetchFinto)
    const { motore } = await ambienteMotore({ collegato: false })
    await motore.accedi('https://cloud.capta', 'anna@sgm.it', 'segreta123')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(motore.rinnovaToken()).rejects.toBeInstanceOf(ErrorePlexus)
    expect(motore.leggiStato().collegamento?.stato).toBe('ok')
  })
})
