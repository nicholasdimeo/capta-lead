import { describe, it, expect, vi } from 'vitest'
import { creaClientPlexus, normalizzaUrlPlexus, problemaUrlPlexus, ErrorePlexus } from './client'

type RispostaFinta = { status: number; corpo?: unknown; testo?: string } | Error

function fetchFinto(risposte: RispostaFinta[]) {
  const chiamate: { url: string; init: RequestInit }[] = []
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    chiamate.push({ url: String(url), init: init ?? {} })
    const r = risposte.shift()
    if (!r) throw new Error('nessuna risposta prevista')
    if (r instanceof Error) throw r
    return new Response(r.testo ?? JSON.stringify(r.corpo ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } })
  })
  return { fn: fn as unknown as typeof fetch, chiamate }
}

describe('client Plexus: indirizzi', () => {
  it('normalizza l\'indirizzo aggiungendo /api/v1 e togliendo le barre finali', () => {
    expect(normalizzaUrlPlexus('https://plexus.sgm.it')).toBe('https://plexus.sgm.it/api/v1')
    expect(normalizzaUrlPlexus('https://plexus.sgm.it/')).toBe('https://plexus.sgm.it/api/v1')
    expect(normalizzaUrlPlexus('https://plexus.sgm.it/api/v1/')).toBe('https://plexus.sgm.it/api/v1')
    expect(normalizzaUrlPlexus('plexus.sgm.it')).toBe('https://plexus.sgm.it/api/v1')
    expect(normalizzaUrlPlexus('http://localhost:8787')).toBe('http://localhost:8787/api/v1')
  })

  it('segnala indirizzi vuoti, non validi o non sicuri', () => {
    expect(problemaUrlPlexus('')).toBe('vuoto')
    expect(problemaUrlPlexus('   ')).toBe('vuoto')
    expect(problemaUrlPlexus('non un indirizzo')).toBe('non_valido')
    expect(problemaUrlPlexus('http://plexus.sgm.it')).toBe('non_sicuro')
    expect(problemaUrlPlexus('http://localhost:8787')).toBeNull()
    expect(problemaUrlPlexus('http://192.168.1.20:8787')).toBeNull()
    expect(problemaUrlPlexus('https://plexus.sgm.it')).toBeNull()
    expect(problemaUrlPlexus('plexus.sgm.it')).toBeNull()
  })
})

describe('client Plexus: chiamate', () => {
  it('manda il codice solo nell\'intestazione Authorization, mai nell\'indirizzo', async () => {
    const { fn, chiamate } = fetchFinto([{ status: 200, corpo: { api: '1.0', azienda: 'SGM' } }])
    const client = creaClientPlexus('https://plexus.sgm.it', 'plx_segreto', { fetchImpl: fn })
    const stato = await client.stato()
    expect(stato.azienda).toBe('SGM')
    expect(chiamate[0].url).toBe('https://plexus.sgm.it/api/v1/stato')
    expect(chiamate[0].url).not.toContain('plx_')
    expect((chiamate[0].init.headers as Record<string, string>).Authorization).toBe('Bearer plx_segreto')
  })

  it('traduce gli errori HTTP in ErrorePlexus con codice e spiegazione', async () => {
    const { fn } = fetchFinto([{ status: 401, corpo: { errore: 'token revocato' } }, { status: 400, corpo: { errore: 'email non valida' } }, { status: 500, testo: 'Internal Server Error' }])
    const client = creaClientPlexus('https://plexus.sgm.it', 'plx_x', { fetchImpl: fn })
    const e1 = await client.stato().catch((e) => e)
    expect(e1).toBeInstanceOf(ErrorePlexus)
    expect(e1.codice).toBe(401)
    expect(e1.message).toBe('token revocato')
    expect(e1.tokenNonValido).toBe(true)
    expect(e1.permanente).toBe(false)
    const e2 = await client.stato().catch((e) => e)
    expect(e2.codice).toBe(400)
    expect(e2.permanente).toBe(true)
    const e3 = await client.stato().catch((e) => e)
    expect(e3.codice).toBe(500)
    expect(e3.message).toBe('errore 500')
  })

  it('errore di rete → tipo "rete" senza codice; tempo scaduto → "tempo scaduto"', async () => {
    const { fn } = fetchFinto([new TypeError('Failed to fetch')])
    const client = creaClientPlexus('https://plexus.sgm.it', 'plx_x', { fetchImpl: fn })
    const e = await client.eventi().catch((x) => x)
    expect(e.tipo).toBe('rete')
    expect(e.codice).toBeNull()

    const lento = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, rifiuta) => {
        init?.signal?.addEventListener('abort', () => rifiuta(Object.assign(new Error('abortito'), { name: 'AbortError' })))
      })) as typeof fetch
    const clientLento = creaClientPlexus('https://plexus.sgm.it', 'plx_x', { fetchImpl: lento, timeoutMs: 20 })
    const e2 = await clientLento.eventi().catch((x) => x)
    expect(e2.tipo).toBe('timeout')
    expect(e2.message).toBe('tempo scaduto')
  })

  it('risposta OK ma non JSON → errore di tipo "risposta"', async () => {
    const { fn } = fetchFinto([{ status: 200, testo: '<html>pagina di login</html>' }])
    const client = creaClientPlexus('https://plexus.sgm.it', 'plx_x', { fetchImpl: fn })
    const e = await client.stato().catch((x) => x)
    expect(e.tipo).toBe('risposta')
  })

  it('crea una lead con corpo JSON e carica una foto in multipart', async () => {
    const { fn, chiamate } = fetchFinto([
      { status: 201, corpo: { lead: { id: 5 }, creata: true, ringraziamento: { esito: 'inviato', dettaglio: '' } } },
      { status: 201, corpo: { foto_id: 9, tipo: 'biglietto' } },
    ])
    const client = creaClientPlexus('https://plexus.sgm.it/', 'plx_x', { fetchImpl: fn })
    const r = await client.creaLead(3, { uuid: 'u', nome: 'Anna', cognome: '', email: '', telefono: '', azienda: '', professione: '', citta: '', provincia: '', indirizzo: '', note: '', categoria: '', risposte: {} })
    expect(r.lead.id).toBe(5)
    expect(chiamate[0].url).toBe('https://plexus.sgm.it/api/v1/eventi/3/lead')
    expect(chiamate[0].init.method).toBe('POST')
    expect(JSON.parse(chiamate[0].init.body as string).nome).toBe('Anna')
    const foto = await client.caricaFoto(5, new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), 'biglietto', 'x.jpg')
    expect(foto.foto_id).toBe(9)
    expect(chiamate[1].url).toBe('https://plexus.sgm.it/api/v1/lead/5/foto')
    const form = chiamate[1].init.body as FormData
    expect(form.get('tipo')).toBe('biglietto')
    expect((form.get('file') as File).name).toBe('x.jpg')
    // niente Content-Type manuale per il multipart: lo mette il browser con il boundary giusto
    expect((chiamate[1].init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })
})
