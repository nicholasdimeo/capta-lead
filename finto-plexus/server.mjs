// Finto Plexus: un piccolo server che imita l'API di Plexus (contratto 1.1, compatibile 1.0) tenendo tutto in memoria.
// Serve per sviluppare e provare l'app senza il Plexus vero. Non ha dipendenze: basta Node 20+.
//
//   node finto-plexus/server.mjs            → http://localhost:8787  (codice valido: qualsiasi "plx_...")
//   FINTO_PLEXUS_PORTA=9000 node ...        → altra porta
//   FINTO_PLEXUS_FILE=finto-plexus/dati-prova.json node ...  → salva i dati su file tra un avvio e l'altro
//
// Oltre agli endpoint del contratto espone alcuni endpoint di servizio sotto /_test/ (usati dalle prove
// automatiche): /_test/dump, /_test/reset, /_test/config, /_test/registro, /_test/foto/{id}, /_test/eventi.
import http from 'node:http'
import { Readable } from 'node:stream'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const PORTA = Number(process.env.FINTO_PLEXUS_PORTA || 8787)
const SILENZIOSO = process.env.FINTO_PLEXUS_SILENZIOSO === '1'
const FILE_DATI = process.env.FINTO_PLEXUS_FILE || ''
const TOKEN_RICHIESTO = process.env.FINTO_PLEXUS_TOKEN || '' // vuoto = accetta qualsiasi plx_...
const LIMITE_CORPO = 25 * 1024 * 1024
const LIMITE_FOTO = 12 * 1024 * 1024

const QUESTIONARIO_PREDEFINITO = [
  { domanda: 'Qual è il suo ruolo?', opzioni: ['Medico estetico', 'Ortopedico / Fisiatra', 'Farmacista', 'Distributore', 'Altro'], multipla: false },
  { domanda: 'Cosa le interessa ricevere?', opzioni: ['Un campione', 'Il listino', 'Una visita del nostro agente', 'Materiale scientifico'], multipla: true },
  { domanda: 'Acconsente a ricevere comunicazioni da SGM Pharma?', opzioni: ['Sì', 'No'], multipla: false, consenso: true },
]
const CATEGORIE_PREDEFINITE = ['caldo', 'da ricontattare', 'distributore', 'curioso']

function statoIniziale() {
  return {
    azienda: 'SGM Pharma (finto)',
    utente: { nome: 'Nicholas Di Meo', email: 'nicholas@sgmpharma.it', ruolo: 'ceo' },
    posta_lead_pronta: true,
    ai_pronta: false,
    token_revocati: [],
    eventi: [],
    lead: [],
    foto: [], // { id, lead_id, tipo, nome_file, mime, dimensione, byte (Buffer, non salvato su file) }
    ringraziamenti_inviati: [], // id delle lead a cui è già partita la mail (compatibilità)
    ringraziamenti: {}, // (1.1) id lead → { esito, inviato_il }
    prossimo_id: { evento: 1, lead: 1, foto: 1 },
    guasti: { prossimi_errori: 0, codice: 503, ritardo_ms: 0 },
    registro: [], // richieste ricevute (per le prove)
  }
}

let stato = statoIniziale()

function carica() {
  if (FILE_DATI && existsSync(FILE_DATI)) {
    try {
      const salvato = JSON.parse(readFileSync(FILE_DATI, 'utf8'))
      stato = { ...statoIniziale(), ...salvato, foto: (salvato.foto || []).map((f) => ({ ...f, byte: null })), registro: [] }
      log(`dati caricati da ${FILE_DATI}: ${stato.eventi.length} eventi, ${stato.lead.length} lead`)
    } catch (e) {
      log(`impossibile leggere ${FILE_DATI}: ${e.message}`)
    }
  }
}
function salva() {
  if (!FILE_DATI) return
  const { registro, ...resto } = stato
  writeFileSync(FILE_DATI, JSON.stringify({ ...resto, foto: stato.foto.map(({ byte, ...f }) => f) }, null, 2))
}
function log(...args) {
  if (!SILENZIOSO) console.log(new Date().toISOString().slice(11, 19), '[finto-plexus]', ...args)
}

// ---------- utilità http ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '600',
}
function json(res, codice, corpo) {
  const testo = JSON.stringify(corpo)
  res.writeHead(codice, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(testo) })
  res.end(testo)
}
function errore(res, codice, spiegazione) {
  json(res, codice, { errore: spiegazione })
}
async function leggiCorpo(req) {
  const pezzi = []
  let totale = 0
  for await (const pezzo of req) {
    totale += pezzo.length
    if (totale > LIMITE_CORPO) throw Object.assign(new Error('corpo oltre 25 MB'), { codice: 413 })
    pezzi.push(pezzo)
  }
  return Buffer.concat(pezzi)
}
async function leggiJson(req) {
  const corpo = await leggiCorpo(req)
  if (!corpo.length) return {}
  try {
    return JSON.parse(corpo.toString('utf8'))
  } catch {
    throw Object.assign(new Error('JSON non valido'), { codice: 400 })
  }
}
function dormi(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
/** Data/ora locale senza fuso, come la scrive Plexus ("2026-10-16T10:21:00"). */
function oraPlexus() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// ---------- logica del contratto ----------
function schedaEvento(e) {
  const { _interno, ...scheda } = e
  return scheda
}
function conteggi(evento_id) {
  const c = { nuova: 0, bozza: 0, approvata: 0, inviata: 0, risposta: 0, scartata: 0 }
  for (const l of stato.lead) if (l.evento_id === evento_id) c[l.stato] = (c[l.stato] || 0) + 1
  return c
}
function validaQuestionario(q) {
  if (!Array.isArray(q)) return 'il questionario deve essere una lista'
  for (const d of q) {
    if (!d || typeof d.domanda !== 'string' || !d.domanda.trim()) return 'ogni domanda deve avere un testo'
    if (!Array.isArray(d.opzioni) || d.opzioni.length < 2) return `la domanda "${d.domanda}" ha meno di due opzioni`
  }
  return null
}
function normalizzaQuestionario(q) {
  return q.map((d) => {
    const voce = { domanda: d.domanda.trim(), opzioni: d.opzioni.map(String), multipla: Boolean(d.multipla), ...(d.consenso ? { consenso: true } : {}) }
    // (1.1) le traduzioni si conservano se hanno lo stesso numero di opzioni
    if (d.traduzioni && typeof d.traduzioni === 'object') {
      const traduzioni = {}
      for (const [lingua, t] of Object.entries(d.traduzioni)) {
        if (t && typeof t.domanda === 'string' && Array.isArray(t.opzioni) && t.opzioni.length === voce.opzioni.length) traduzioni[lingua] = { domanda: t.domanda, opzioni: t.opzioni.map(String) }
      }
      if (Object.keys(traduzioni).length) voce.traduzioni = traduzioni
    }
    return voce
  })
}
const LINEE = ['ortopedia', 'estetica', 'entrambe']
/** (1.1) Applica a un evento i campi modificabili; restituisce un messaggio di errore o null. */
function applicaCampiEvento(evento, corpo) {
  for (const campo of ['nome', 'luogo', 'data_inizio', 'data_fine', 'note', 'lingua', 'linea']) {
    if (corpo[campo] !== undefined) {
      if (typeof corpo[campo] !== 'string') return `${campo} deve essere un testo`
      if (campo === 'nome' && !corpo[campo].trim()) return 'nome evento mancante'
      if (campo === 'linea' && !LINEE.includes(corpo[campo])) return `linea non ammessa: ${corpo[campo]}`
      evento[campo] = corpo[campo]
    }
  }
  if (corpo.ringraziamento_attivo !== undefined) {
    if (typeof corpo.ringraziamento_attivo !== 'boolean') return 'ringraziamento_attivo deve essere true o false'
    evento.ringraziamento_attivo = corpo.ringraziamento_attivo
  }
  if (corpo.categorie_suggerite !== undefined) {
    if (!Array.isArray(corpo.categorie_suggerite)) return 'categorie_suggerite deve essere una lista'
    evento.categorie_suggerite = corpo.categorie_suggerite.map(String).filter(Boolean)
  }
  if (corpo.questionario !== undefined) {
    const problema = validaQuestionario(corpo.questionario)
    if (problema) return problema
    evento.questionario = normalizzaQuestionario(corpo.questionario)
  }
  if (corpo.archiviato !== undefined) {
    if (typeof corpo.archiviato !== 'boolean') return 'archiviato deve essere true o false'
    evento.archiviato = corpo.archiviato
  }
  return null
}
function fotoInUscita(f) {
  return { foto_id: f.id, tipo: f.tipo, uuid: f.uuid ?? null, creato_il: f.creato_il }
}
function emailValida(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}
function consensoDaValore(v) {
  if (v === true || v === 'S' || v === 's' || v === 'true') return 'S'
  if (v === false || v === 'N' || v === 'n' || v === 'false') return 'N'
  return null
}
function consensoDaRisposte(evento, risposte) {
  const domanda = (evento.questionario || []).find((d) => d.consenso)
  if (!domanda) return null
  const r = risposte[domanda.domanda]
  if (r === undefined || r === null || r === '') return null
  const valore = Array.isArray(r) ? r[0] : String(r)
  if (valore === domanda.opzioni[0] || /^(s[iì]|yes)$/i.test(valore)) return 'S'
  if (valore === domanda.opzioni[1] || /^no$/i.test(valore)) return 'N'
  return null
}
function nFoto(lead_id) {
  return stato.foto.filter((f) => f.lead_id === lead_id).length
}
function leadInUscita(l) {
  const r = stato.ringraziamenti[l.id]
  return { ...l, n_foto: nFoto(l.id), ringraziamento: r ? { esito: r.esito, inviato_il: r.inviato_il ?? null } : { esito: null, inviato_il: null } }
}

// ---------- gestione richieste ----------
async function gestisci(req, res) {
  const url = new URL(req.url, `http://localhost:${PORTA}`)
  const percorso = url.pathname.replace(/\/+$/, '') || '/'
  const metodo = req.method

  if (metodo === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }

  // --- endpoint di servizio per le prove (senza token) ---
  if (percorso.startsWith('/_test/')) return gestisciTest(req, res, percorso, metodo, url)
  if (percorso === '/' && metodo === 'GET') return paginaRiepilogo(res)

  if (!percorso.startsWith('/api/v1/')) return errore(res, 404, 'percorso sconosciuto')
  const via = percorso.slice('/api/v1'.length)

  stato.registro.push({ quando: new Date().toISOString(), metodo, percorso: via })

  // guasti simulati
  if (stato.guasti.ritardo_ms) await dormi(stato.guasti.ritardo_ms)
  if (stato.guasti.prossimi_errori > 0) {
    stato.guasti.prossimi_errori -= 1
    log(`guasto simulato (${stato.guasti.codice}) su ${metodo} ${via}`)
    return errore(res, stato.guasti.codice, 'guasto simulato dal finto Plexus')
  }

  // autenticazione
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token || !token.startsWith('plx_') || stato.token_revocati.includes(token) || (TOKEN_RICHIESTO && token !== TOKEN_RICHIESTO)) {
    return errore(res, 401, 'token mancante, non valido o revocato')
  }
  if (token === 'plx_senza_permesso') return errore(res, 403, "l'account non ha il permesso gestisci_lead")

  const lunghezza = Number(req.headers['content-length'] || 0)
  if (lunghezza > LIMITE_CORPO) return errore(res, 413, 'corpo oltre 25 MB')

  try {
    // GET /stato
    if (via === '/stato' && metodo === 'GET') {
      return json(res, 200, {
        api: '1.1', piattaforma: 'Plexus', azienda: stato.azienda, utente: stato.utente,
        posta_lead_pronta: stato.posta_lead_pronta, ai_pronta: stato.ai_pronta,
        lingue: { it: 'italiano', en: 'inglese' },
        linee: { ortopedia: 'Ortopedia (REGENFLEX)', estetica: 'Medicina estetica (TIADERM)', entrambe: 'Entrambe' },
        tipi_foto: ['biglietto', 'volto', 'altro'],
      })
    }

    // GET /eventi (solo aperti; ?archiviati=1 anche quelli archiviati)
    if (via === '/eventi' && metodo === 'GET') {
      const anche = url.searchParams.get('archiviati') === '1'
      return json(res, 200, {
        eventi: stato.eventi.filter((e) => anche || !e.archiviato).map((e) => ({ ...schedaEvento(e), conteggi: conteggi(e.id), totale_lead: stato.lead.filter((l) => l.evento_id === e.id).length })),
      })
    }

    // POST /eventi
    if (via === '/eventi' && metodo === 'POST') {
      const corpo = await leggiJson(req)
      if (!corpo.nome || typeof corpo.nome !== 'string') return errore(res, 400, 'nome evento mancante')
      let questionario = null // null = non indicato: nuovo evento → predefinito; evento esistente → resta quello che ha
      if (corpo.questionario !== undefined) {
        const problema = validaQuestionario(corpo.questionario)
        if (problema) return errore(res, 400, problema)
        questionario = normalizzaQuestionario(corpo.questionario)
      }
      const campi = {
        nome: corpo.nome, luogo: corpo.luogo || '', data_inizio: corpo.data_inizio || '', data_fine: corpo.data_fine || '',
        note: corpo.note || '', lingua: corpo.lingua || 'it', linea: corpo.linea || 'entrambe',
      }
      let evento = corpo.uuid ? stato.eventi.find((e) => e.uuid_app === corpo.uuid) : null
      let creato = false
      const extra = {}
      if (typeof corpo.ringraziamento_attivo === 'boolean') extra.ringraziamento_attivo = corpo.ringraziamento_attivo
      if (Array.isArray(corpo.categorie_suggerite)) extra.categorie_suggerite = corpo.categorie_suggerite.map(String).filter(Boolean)
      if (evento) {
        Object.assign(evento, campi, extra, questionario ? { questionario } : {})
        log(`evento aggiornato #${evento.id} "${evento.nome}"`)
      } else {
        evento = {
          id: stato.prossimo_id.evento++, uuid_app: corpo.uuid || null, ...campi, ringraziamento_attivo: true, archiviato: false,
          questionario: questionario ?? QUESTIONARIO_PREDEFINITO, categorie_suggerite: [...CATEGORIE_PREDEFINITE], ...extra,
        }
        stato.eventi.push(evento)
        creato = true
        log(`evento creato #${evento.id} "${evento.nome}"`)
      }
      salva()
      return json(res, creato ? 201 : 200, { evento: schedaEvento(evento), creato })
    }

    let m
    // GET /eventi/{id}
    if ((m = via.match(/^\/eventi\/(\d+)$/)) && metodo === 'GET') {
      const evento = stato.eventi.find((e) => e.id === Number(m[1]))
      if (!evento) return errore(res, 404, 'evento inesistente')
      return json(res, 200, { evento: schedaEvento(evento) })
    }

    // PUT /eventi/{id}  (1.1)
    if ((m = via.match(/^\/eventi\/(\d+)$/)) && metodo === 'PUT') {
      const evento = stato.eventi.find((e) => e.id === Number(m[1]))
      if (!evento) return errore(res, 404, 'evento inesistente')
      const corpo = await leggiJson(req)
      const problema = applicaCampiEvento(evento, corpo)
      if (problema) return errore(res, 400, problema)
      salva()
      log(`evento modificato #${evento.id} "${evento.nome}"${evento.archiviato ? ' (archiviato)' : ''}`)
      return json(res, 200, { evento: schedaEvento(evento) })
    }

    // PUT /eventi/{id}/questionario
    if ((m = via.match(/^\/eventi\/(\d+)\/questionario$/)) && metodo === 'PUT') {
      const evento = stato.eventi.find((e) => e.id === Number(m[1]))
      if (!evento) return errore(res, 404, 'evento inesistente')
      const corpo = await leggiJson(req)
      const problema = validaQuestionario(corpo.questionario)
      if (problema) return errore(res, 400, problema)
      evento.questionario = normalizzaQuestionario(corpo.questionario)
      salva()
      log(`questionario aggiornato per evento #${evento.id}`)
      return json(res, 200, { questionario: evento.questionario })
    }

    // GET /eventi/{id}/lead
    if ((m = via.match(/^\/eventi\/(\d+)\/lead$/)) && metodo === 'GET') {
      const evento = stato.eventi.find((e) => e.id === Number(m[1]))
      if (!evento) return errore(res, 404, 'evento inesistente')
      return json(res, 200, { lead: stato.lead.filter((l) => l.evento_id === evento.id).map(leadInUscita) })
    }

    // POST /eventi/{id}/lead
    if ((m = via.match(/^\/eventi\/(\d+)\/lead$/)) && metodo === 'POST') {
      const evento = stato.eventi.find((e) => e.id === Number(m[1]))
      if (!evento) return errore(res, 404, 'evento inesistente')
      const corpo = await leggiJson(req)
      const email = (corpo.email || '').trim()
      if (email && !emailValida(email)) return errore(res, 400, 'email non valida')
      const risposteGrezze = corpo.risposte && typeof corpo.risposte === 'object' ? corpo.risposte : {}
      const risposte = {}
      for (const [k, v] of Object.entries(risposteGrezze)) risposte[k] = Array.isArray(v) ? v.join(', ') : String(v)
      const consenso = consensoDaValore(corpo.consenso) ?? consensoDaRisposte(evento, risposteGrezze)
      const campi = {
        nome: corpo.nome || '', cognome: corpo.cognome || '', email, telefono: corpo.telefono || '', azienda: corpo.azienda || '',
        professione: corpo.professione || '', citta: corpo.citta || '', provincia: corpo.provincia || '', indirizzo: corpo.indirizzo || '',
        note: corpo.note || '', lingua: corpo.lingua || null, consenso, categoria: corpo.categoria || '', risposte,
      }
      let lead = null
      if (corpo.uuid) lead = stato.lead.find((l) => l.evento_id === evento.id && l.uuid === corpo.uuid)
      if (!lead && !corpo.uuid && email) lead = stato.lead.find((l) => l.evento_id === evento.id && l.email === email)
      let creata = false
      if (lead) {
        Object.assign(lead, campi, { aggiornato_il: oraPlexus() })
        log(`lead aggiornata #${lead.id} ${lead.nome} ${lead.cognome}`)
      } else {
        const id = stato.prossimo_id.lead++
        lead = {
          id, uuid: corpo.uuid || `plexus-${id}`, evento_id: evento.id, ...campi, stato: 'nuova', origine: 'app',
          creato_il: oraPlexus(), aggiornato_il: null,
        }
        stato.lead.push(lead)
        creata = true
        log(`lead creata #${lead.id} ${lead.nome} ${lead.cognome} <${lead.email}>`)
      }
      // mail di ringraziamento (esiti 1.1: gia_inviato se già partita; in_attesa resta in_attesa)
      let ringraziamento
      const precedente = stato.ringraziamenti[lead.id]
      if (!evento.ringraziamento_attivo) ringraziamento = { esito: 'saltato', dettaglio: "ringraziamento spento per l'evento" }
      else if (!lead.email) ringraziamento = { esito: 'saltato', dettaglio: 'lead senza email' }
      else if (precedente?.esito === 'inviato') ringraziamento = { esito: 'gia_inviato', dettaglio: `mail già spedita il ${precedente.inviato_il}` }
      else if (!stato.posta_lead_pronta) {
        stato.ringraziamenti[lead.id] = { esito: 'in_attesa', inviato_il: null }
        ringraziamento = { esito: 'in_attesa', dettaglio: 'casella di chi firma non configurata' }
      } else {
        stato.ringraziamenti_inviati.push(lead.id)
        stato.ringraziamenti[lead.id] = { esito: 'inviato', inviato_il: oraPlexus() }
        ringraziamento = { esito: 'inviato', dettaglio: `mail di ringraziamento spedita a ${lead.email}` }
      }
      salva()
      return json(res, creata ? 201 : 200, { lead: leadInUscita(lead), creata, ringraziamento })
    }

    // POST /lead/{id}/foto
    if ((m = via.match(/^\/lead\/(\d+)\/foto$/)) && metodo === 'POST') {
      const lead = stato.lead.find((l) => l.id === Number(m[1]))
      if (!lead) return errore(res, 404, 'lead inesistente')
      const tipoContenuto = req.headers['content-type'] || ''
      if (!tipoContenuto.startsWith('multipart/form-data')) return errore(res, 400, 'atteso multipart/form-data')
      const richiesta = new Request('http://finto/', { method: 'POST', headers: { 'content-type': tipoContenuto }, body: Readable.toWeb(req), duplex: 'half' })
      const form = await richiesta.formData()
      const file = form.get('file')
      const tipo = String(form.get('tipo') || 'altro')
      if (!file || typeof file === 'string') return errore(res, 400, 'file mancante')
      if (!['biglietto', 'volto', 'altro'].includes(tipo)) return errore(res, 400, 'tipo foto non valido')
      if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type || '')) return errore(res, 400, `formato non accettato: ${file.type || 'sconosciuto'}`)
      const byte = Buffer.from(await file.arrayBuffer())
      if (byte.length > LIMITE_FOTO) return errore(res, 413, 'foto oltre 12 MB')
      const uuid = form.get('uuid') ? String(form.get('uuid')) : null
      // (1.1) stessa foto rimandata (stesso uuid): nessun doppione
      const esistente = uuid ? stato.foto.find((f) => f.lead_id === lead.id && f.uuid === uuid) : null
      if (esistente) {
        log(`foto #${esistente.id} già presente per lead #${lead.id} (uuid ${uuid})`)
        return json(res, 200, { foto_id: esistente.id, tipo: esistente.tipo, uuid, creata: false })
      }
      const foto = { id: stato.prossimo_id.foto++, lead_id: lead.id, tipo, uuid, nome_file: file.name || '', mime: file.type, dimensione: byte.length, creato_il: oraPlexus(), byte }
      stato.foto.push(foto)
      salva()
      log(`foto #${foto.id} (${tipo}, ${byte.length} byte) per lead #${lead.id}`)
      return json(res, 201, { foto_id: foto.id, tipo, uuid, creata: true })
    }

    // GET /lead/{id}/foto  (1.1)
    if ((m = via.match(/^\/lead\/(\d+)\/foto$/)) && metodo === 'GET') {
      const lead = stato.lead.find((l) => l.id === Number(m[1]))
      if (!lead) return errore(res, 404, 'lead inesistente')
      return json(res, 200, { foto: stato.foto.filter((f) => f.lead_id === lead.id).map(fotoInUscita) })
    }

    // GET /lead/{id}/foto/{foto_id}  (1.1) → l'immagine
    if ((m = via.match(/^\/lead\/(\d+)\/foto\/(\d+)$/)) && metodo === 'GET') {
      const foto = stato.foto.find((f) => f.lead_id === Number(m[1]) && f.id === Number(m[2]))
      if (!foto) return errore(res, 404, 'foto inesistente')
      if (!foto.byte) return errore(res, 410, 'immagine non più disponibile (server riavviato)')
      res.writeHead(200, { ...CORS, 'Content-Type': foto.mime, 'Content-Length': foto.byte.length })
      return res.end(foto.byte)
    }

    // GET /eventi/{id}/export.xlsx
    if (via.match(/^\/eventi\/(\d+)\/export\.xlsx$/) && metodo === 'GET') {
      return errore(res, 501, 'export non disponibile nel finto Plexus')
    }

    return errore(res, 404, 'endpoint sconosciuto')
  } catch (e) {
    const codice = e.codice || 500
    log(`errore ${codice}: ${e.message}`)
    return errore(res, codice, e.message)
  }
}

async function gestisciTest(req, res, percorso, metodo, url) {
  let m
  if (percorso === '/_test/dump' && metodo === 'GET') {
    return json(res, 200, { ...stato, foto: stato.foto.map(({ byte, ...f }) => f) })
  }
  if (percorso === '/_test/reset' && metodo === 'POST') {
    stato = statoIniziale()
    salva()
    log('stato azzerato')
    return json(res, 200, { ok: true })
  }
  if (percorso === '/_test/config' && metodo === 'POST') {
    const corpo = await leggiJson(req)
    if (typeof corpo.posta_lead_pronta === 'boolean') stato.posta_lead_pronta = corpo.posta_lead_pronta
    if (typeof corpo.prossimi_errori === 'number') stato.guasti.prossimi_errori = corpo.prossimi_errori
    if (typeof corpo.codice_errore === 'number') stato.guasti.codice = corpo.codice_errore
    if (typeof corpo.ritardo_ms === 'number') stato.guasti.ritardo_ms = corpo.ritardo_ms
    if (typeof corpo.revoca_token === 'string') stato.token_revocati.push(corpo.revoca_token)
    if (corpo.azzera_revoche) stato.token_revocati = []
    return json(res, 200, { ok: true, guasti: stato.guasti, posta_lead_pronta: stato.posta_lead_pronta, token_revocati: stato.token_revocati })
  }
  if (percorso === '/_test/registro' && metodo === 'GET') {
    const filtro = url.searchParams.get('percorso')
    return json(res, 200, { registro: filtro ? stato.registro.filter((r) => r.percorso.includes(filtro)) : stato.registro })
  }
  if (percorso === '/_test/eventi' && metodo === 'POST') {
    // crea un evento "nato in Plexus" (senza uuid_app), per provare l'arrivo degli eventi nell'app
    const corpo = await leggiJson(req)
    const evento = {
      id: stato.prossimo_id.evento++, uuid_app: null, nome: corpo.nome || 'Evento da Plexus', luogo: corpo.luogo || '',
      data_inizio: corpo.data_inizio || '', data_fine: corpo.data_fine || '', note: corpo.note || '', lingua: corpo.lingua || 'it',
      linea: corpo.linea || 'entrambe', ringraziamento_attivo: corpo.ringraziamento_attivo !== false, archiviato: corpo.archiviato === true,
      questionario: corpo.questionario ? normalizzaQuestionario(corpo.questionario) : QUESTIONARIO_PREDEFINITO,
      categorie_suggerite: corpo.categorie_suggerite || [...CATEGORIE_PREDEFINITE],
    }
    stato.eventi.push(evento)
    salva()
    return json(res, 201, { evento })
  }
  if (percorso === '/_test/lead' && metodo === 'POST') {
    // crea una lead "nata in Plexus" (es. importata da Excel, senza uuid)
    const corpo = await leggiJson(req)
    const evento = stato.eventi.find((e) => e.id === Number(corpo.evento_id))
    if (!evento) return errore(res, 404, 'evento inesistente')
    const id = stato.prossimo_id.lead++
    const lead = {
      id, uuid: corpo.uuid === null ? null : corpo.uuid || `plexus-${id}`, evento_id: evento.id, nome: corpo.nome || '', cognome: corpo.cognome || '',
      email: corpo.email || '', telefono: '', azienda: corpo.azienda || '', professione: '', citta: '', provincia: '', indirizzo: '',
      note: '', lingua: null, consenso: corpo.consenso || null, categoria: corpo.categoria || '', risposte: {}, stato: corpo.stato || 'nuova',
      origine: 'import', creato_il: oraPlexus(), aggiornato_il: null,
    }
    stato.lead.push(lead)
    salva()
    return json(res, 201, { lead: leadInUscita(lead) })
  }
  if ((m = percorso.match(/^\/_test\/foto\/(\d+)$/)) && metodo === 'GET') {
    const foto = stato.foto.find((f) => f.id === Number(m[1]))
    if (!foto || !foto.byte) return errore(res, 404, 'foto inesistente')
    res.writeHead(200, { ...CORS, 'Content-Type': foto.mime, 'Content-Length': foto.byte.length })
    return res.end(foto.byte)
  }
  if ((m = percorso.match(/^\/_test\/lead\/(\d+)\/stato$/)) && metodo === 'POST') {
    // cambia lo stato di una lead (per provare l'allineamento degli stati nell'app)
    const lead = stato.lead.find((l) => l.id === Number(m[1]))
    if (!lead) return errore(res, 404, 'lead inesistente')
    const corpo = await leggiJson(req)
    lead.stato = corpo.stato || lead.stato
    salva()
    return json(res, 200, { lead: leadInUscita(lead) })
  }
  return errore(res, 404, 'endpoint di prova sconosciuto')
}

function paginaRiepilogo(res) {
  const scappa = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const eventi = stato.eventi.map((e) => {
    const lead = stato.lead.filter((l) => l.evento_id === e.id)
    const righe = lead.map((l) => `<tr><td>${l.id}</td><td>${scappa(l.nome)} ${scappa(l.cognome)}</td><td>${scappa(l.email)}</td><td>${scappa(l.categoria)}</td><td>${l.consenso ?? '—'}</td><td>${scappa(JSON.stringify(l.risposte))}</td><td>${nFoto(l.id)}</td><td>${stato.ringraziamenti[l.id] ? `${stato.ringraziamenti[l.id].esito}${stato.ringraziamenti[l.id].inviato_il ? ' ' + stato.ringraziamenti[l.id].inviato_il : ''}` : '—'}</td></tr>`).join('')
    return `<h2>#${e.id} ${scappa(e.nome)}${e.archiviato ? ' <small>[ARCHIVIATO]</small>' : ''} <small>${scappa(e.luogo)} ${scappa(e.data_inizio)}→${scappa(e.data_fine)} · ${scappa(e.linea)} · ${scappa(e.lingua)} · ringraziamento ${e.ringraziamento_attivo ? 'on' : 'off'} · categorie ${scappa((e.categorie_suggerite || []).join(', '))} · uuid_app ${scappa(e.uuid_app)}</small></h2>
      <table border="1" cellpadding="6" cellspacing="0"><tr><th>id</th><th>nome</th><th>email</th><th>categoria</th><th>consenso</th><th>risposte</th><th>foto</th><th>mail ringraziamento</th></tr>${righe || '<tr><td colspan="8">nessuna lead</td></tr>'}</table>`
  }).join('')
  const html = `<!doctype html><html lang="it"><meta charset="utf-8"><title>Finto Plexus</title>
    <style>body{font-family:system-ui;padding:20px;max-width:1100px;margin:auto}table{border-collapse:collapse;font-size:14px;width:100%}small{color:#666;font-weight:normal}</style>
    <h1>Finto Plexus</h1><p>Server di prova in memoria (API 1.1). Codice valido: qualsiasi codice che inizia con <code>plx_</code> (es. <code>plx_prova</code>). Indirizzo da incollare nell'app: <code>http://localhost:${PORTA}</code>.</p>
    <p>Casella ringraziamenti: <b>${stato.posta_lead_pronta ? 'pronta' : 'NON pronta'}</b> · Richieste ricevute: ${stato.registro.length}</p>
    ${eventi || '<p>Nessun evento ancora.</p>'}</html>`
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

carica()
const server = http.createServer((req, res) => {
  gestisci(req, res).catch((e) => {
    log('errore inatteso', e)
    if (!res.headersSent) errore(res, 500, e.message)
  })
})
server.listen(PORTA, () => {
  log(`in ascolto su http://localhost:${PORTA}  (API: http://localhost:${PORTA}/api/v1)`)
})
