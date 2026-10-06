// Un Plexus finto in memoria con la stessa interfaccia del client vero: lo usano i test del motore.
// Riproduce le regole del contratto (stesso uuid = aggiornamento, mail di ringraziamento, errori).
import type { ClientPlexus } from '../plexus/client'
import { ErrorePlexus } from '../plexus/client'
import type { CorpoEvento, CorpoLead, CorpoModificaEvento, DomandaPlexus, LeadPlexus, RispostaLead, SchedaEvento, StatoPlexus } from '../plexus/tipi'

export interface Chiamata {
  metodo: string
  percorso: string
  corpo?: unknown
}

export interface PlexusFinto {
  client: ClientPlexus
  eventi: SchedaEvento[]
  lead: LeadPlexus[]
  foto: { id: number; lead_id: number; tipo: string; dimensione: number; nome: string; uuid: string | null; byte: Blob }[]
  /** versione dell'API dichiarata da GET /stato ("1.1" o "1.0") */
  api: string
  chiamate: Chiamata[]
  /** Errori da restituire alle prossime chiamate, consumati in ordine (null = quella chiamata va bene). */
  prossimiErrori: (ErrorePlexus | null)[]
  posta_lead_pronta: boolean
  ringraziamentiInviati: Set<number>
  ringraziamenti: Map<number, { esito: 'inviato' | 'in_attesa' | 'errore'; inviato_il: string | null }>
  /** Aggiunge un evento "nato in Plexus" (senza uuid_app). */
  aggiungiEventoPlexus(campi?: Partial<SchedaEvento>): SchedaEvento
  /** Aggiunge una lead "nata in Plexus" (es. importata da Excel). */
  aggiungiLeadPlexus(evento_id: number, campi?: Partial<LeadPlexus>): LeadPlexus
  chiamateA(percorso: string, metodo?: string): Chiamata[]
}

export function creaPlexusFinto(): PlexusFinto {
  let prossimoEvento = 1
  let prossimaLead = 1
  let prossimaFoto = 1

  const finto: PlexusFinto = {
    eventi: [],
    lead: [],
    foto: [],
    chiamate: [],
    prossimiErrori: [],
    posta_lead_pronta: true,
    ringraziamentiInviati: new Set(),
    ringraziamenti: new Map(),
    api: '1.1',
    client: null as unknown as ClientPlexus,
    aggiungiEventoPlexus(campi = {}) {
      const evento: SchedaEvento = {
        id: prossimoEvento++, uuid_app: null, nome: 'Evento da Plexus', luogo: 'Milano', data_inizio: '2026-11-01', data_fine: '2026-11-02',
        note: '', lingua: 'it', linea: 'estetica', ringraziamento_attivo: true, archiviato: false,
        questionario: [
          { domanda: 'Qual è il suo ruolo?', opzioni: ['Medico estetico', 'Altro'], multipla: false },
          { domanda: 'Acconsente a ricevere comunicazioni da SGM Pharma?', opzioni: ['Sì', 'No'], multipla: false, consenso: true },
        ],
        categorie_suggerite: ['caldo', 'curioso'],
        ...campi,
      }
      finto.eventi.push(evento)
      return evento
    },
    aggiungiLeadPlexus(evento_id, campi = {}) {
      const id = prossimaLead++
      const lead: LeadPlexus = {
        id, uuid: `plexus-${id}`, evento_id, nome: 'Importata', cognome: 'Da Excel', email: 'import@esempio.it', telefono: '', azienda: '',
        professione: '', citta: '', provincia: '', indirizzo: '', note: '', lingua: null, consenso: 'S', categoria: '', risposte: {},
        stato: 'nuova', origine: 'import', creato_il: '2026-10-16T10:21:00', aggiornato_il: null, n_foto: 0, ...campi,
      }
      finto.lead.push(lead)
      return lead
    },
    chiamateA(percorso, metodo) {
      return finto.chiamate.filter((c) => c.percorso === percorso && (!metodo || c.metodo === metodo))
    },
  }

  function registra(metodo: string, percorso: string, corpo?: unknown) {
    finto.chiamate.push({ metodo, percorso, corpo })
    if (finto.prossimiErrori.length > 0) {
      const errore = finto.prossimiErrori.shift()
      if (errore) throw errore
    }
  }
  function nFoto(lead_id: number) {
    return finto.foto.filter((f) => f.lead_id === lead_id).length
  }
  function leadInUscita(l: LeadPlexus): LeadPlexus {
    const r = finto.ringraziamenti.get(l.id)
    return { ...l, n_foto: nFoto(l.id), ringraziamento: r ? { esito: r.esito, inviato_il: r.inviato_il } : { esito: null, inviato_il: null } }
  }

  finto.client = {
    async stato(): Promise<StatoPlexus> {
      registra('GET', '/stato')
      return {
        api: finto.api, piattaforma: 'Plexus', azienda: 'SGM Pharma', utente: { nome: 'Nicholas', email: 'n@sgm.it', ruolo: 'ceo' },
        posta_lead_pronta: finto.posta_lead_pronta, ai_pronta: false, lingue: { it: 'italiano', en: 'inglese' },
        linee: { ortopedia: 'Ortopedia', estetica: 'Estetica', entrambe: 'Entrambe' }, tipi_foto: ['biglietto', 'volto', 'altro'],
      }
    },
    async eventi(conArchiviati = false) {
      registra('GET', conArchiviati ? '/eventi?archiviati=1' : '/eventi')
      return finto.eventi.filter((e) => conArchiviati || !e.archiviato).map((e) => ({ ...e, totale_lead: finto.lead.filter((l) => l.evento_id === e.id).length }))
    },
    async evento(id) {
      registra('GET', `/eventi/${id}`)
      const e = finto.eventi.find((x) => x.id === id)
      if (!e) throw new ErrorePlexus('http', 404, 'evento inesistente')
      return e
    },
    async creaEvento(corpo: CorpoEvento) {
      registra('POST', '/eventi', corpo)
      let evento = finto.eventi.find((e) => e.uuid_app === corpo.uuid)
      const campi = { nome: corpo.nome, luogo: corpo.luogo, data_inizio: corpo.data_inizio, data_fine: corpo.data_fine, note: corpo.note, lingua: corpo.lingua, linea: corpo.linea }
      const extra: Partial<SchedaEvento> = {}
      if (typeof corpo.ringraziamento_attivo === 'boolean') extra.ringraziamento_attivo = corpo.ringraziamento_attivo
      if (Array.isArray(corpo.categorie_suggerite)) extra.categorie_suggerite = [...corpo.categorie_suggerite]
      if (evento) {
        Object.assign(evento, campi, extra, corpo.questionario ? { questionario: corpo.questionario } : {})
        return { evento, creato: false }
      }
      evento = { id: prossimoEvento++, uuid_app: corpo.uuid, ...campi, ringraziamento_attivo: true, archiviato: false, questionario: corpo.questionario ?? [], categorie_suggerite: ['caldo', 'da ricontattare'], ...extra }
      finto.eventi.push(evento)
      return { evento, creato: true }
    },
    async modificaEvento(id: number, corpo: CorpoModificaEvento) {
      registra('PUT', `/eventi/${id}`, corpo)
      const e = finto.eventi.find((x) => x.id === id)
      if (!e) throw new ErrorePlexus('http', 404, 'evento inesistente')
      if (corpo.questionario?.some((d) => d.opzioni.length < 2)) throw new ErrorePlexus('http', 400, 'meno di due opzioni')
      for (const campo of ['nome', 'luogo', 'data_inizio', 'data_fine', 'note', 'lingua', 'linea'] as const) if (corpo[campo] !== undefined) e[campo] = corpo[campo] as string
      if (corpo.ringraziamento_attivo !== undefined) e.ringraziamento_attivo = corpo.ringraziamento_attivo
      if (corpo.categorie_suggerite !== undefined) e.categorie_suggerite = [...corpo.categorie_suggerite]
      if (corpo.questionario !== undefined) e.questionario = corpo.questionario
      if (corpo.archiviato !== undefined) e.archiviato = corpo.archiviato
      return e
    },
    async aggiornaQuestionario(id: number, questionario: DomandaPlexus[]) {
      registra('PUT', `/eventi/${id}/questionario`, questionario)
      const e = finto.eventi.find((x) => x.id === id)
      if (!e) throw new ErrorePlexus('http', 404, 'evento inesistente')
      if (questionario.some((d) => d.opzioni.length < 2)) throw new ErrorePlexus('http', 400, 'meno di due opzioni')
      e.questionario = questionario
      return questionario
    },
    async leadDiEvento(id: number) {
      registra('GET', `/eventi/${id}/lead`)
      if (!finto.eventi.some((e) => e.id === id)) throw new ErrorePlexus('http', 404, 'evento inesistente')
      return finto.lead.filter((l) => l.evento_id === id).map(leadInUscita)
    },
    async creaLead(eventoId: number, corpo: CorpoLead): Promise<RispostaLead> {
      registra('POST', `/eventi/${eventoId}/lead`, corpo)
      const evento = finto.eventi.find((e) => e.id === eventoId)
      if (!evento) throw new ErrorePlexus('http', 404, 'evento inesistente')
      if (corpo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(corpo.email)) throw new ErrorePlexus('http', 400, 'email non valida')
      const risposte: Record<string, string> = {}
      for (const [k, v] of Object.entries(corpo.risposte ?? {})) risposte[k] = Array.isArray(v) ? v.join(', ') : String(v)
      const consenso = corpo.consenso === true ? 'S' : corpo.consenso === false ? 'N' : null
      const campi = {
        nome: corpo.nome, cognome: corpo.cognome, email: corpo.email, telefono: corpo.telefono, azienda: corpo.azienda, professione: corpo.professione,
        citta: corpo.citta, provincia: corpo.provincia, indirizzo: corpo.indirizzo, note: corpo.note, lingua: corpo.lingua ?? null, consenso, categoria: corpo.categoria, risposte,
      }
      let lead = finto.lead.find((l) => l.evento_id === eventoId && l.uuid === corpo.uuid)
      let creata = false
      if (lead) Object.assign(lead, campi, { aggiornato_il: '2026-10-16T11:00:00' })
      else {
        lead = { id: prossimaLead++, uuid: corpo.uuid, evento_id: eventoId, ...campi, stato: 'nuova', origine: 'app', creato_il: '2026-10-16T10:21:00', aggiornato_il: null, n_foto: 0 }
        finto.lead.push(lead)
        creata = true
      }
      let ringraziamento: RispostaLead['ringraziamento']
      const v11 = finto.api !== '1.0'
      if (!evento.ringraziamento_attivo) ringraziamento = { esito: 'saltato', dettaglio: 'spento' }
      else if (!lead.email) ringraziamento = { esito: 'saltato', dettaglio: 'lead senza email' }
      else if (finto.ringraziamentiInviati.has(lead.id)) ringraziamento = v11 ? { esito: 'gia_inviato', dettaglio: 'mail già spedita' } : { esito: 'saltato', dettaglio: 'già spedito' }
      else if (!finto.posta_lead_pronta) {
        finto.ringraziamenti.set(lead.id, { esito: 'in_attesa', inviato_il: null })
        ringraziamento = { esito: 'in_attesa', dettaglio: 'casella non configurata' }
      } else {
        finto.ringraziamentiInviati.add(lead.id)
        finto.ringraziamenti.set(lead.id, { esito: 'inviato', inviato_il: '2026-10-16T10:21:05' })
        ringraziamento = { esito: 'inviato', dettaglio: `mail spedita a ${lead.email}` }
      }
      return { lead: leadInUscita(lead), creata, ringraziamento }
    },
    async caricaFoto(leadId: number, file: Blob, tipo: string, nomeFile: string, uuid?: string) {
      registra('POST', `/lead/${leadId}/foto`, { tipo, nomeFile, dimensione: file.size, uuid: uuid ?? null })
      if (!finto.lead.some((l) => l.id === leadId)) throw new ErrorePlexus('http', 404, 'lead inesistente')
      if (file.size > 12 * 1024 * 1024) throw new ErrorePlexus('http', 413, 'foto oltre 12 MB')
      const esistente = uuid && finto.api !== '1.0' ? finto.foto.find((f) => f.lead_id === leadId && f.uuid === uuid) : undefined
      if (esistente) return { foto_id: esistente.id, tipo: esistente.tipo, uuid, creata: false }
      const foto = { id: prossimaFoto++, lead_id: leadId, tipo, dimensione: file.size, nome: nomeFile, uuid: finto.api !== '1.0' ? (uuid ?? null) : null, byte: file }
      finto.foto.push(foto)
      return finto.api !== '1.0' ? { foto_id: foto.id, tipo, uuid: foto.uuid, creata: true } : { foto_id: foto.id, tipo }
    },
    async fotoDiLead(leadId: number) {
      registra('GET', `/lead/${leadId}/foto`)
      if (finto.api === '1.0') throw new ErrorePlexus('http', 404, 'endpoint sconosciuto')
      if (!finto.lead.some((l) => l.id === leadId)) throw new ErrorePlexus('http', 404, 'lead inesistente')
      return finto.foto.filter((f) => f.lead_id === leadId).map((f) => ({ foto_id: f.id, tipo: f.tipo, uuid: f.uuid, creato_il: '2026-10-16T10:30:00' }))
    },
    async scaricaFoto(leadId: number, fotoId: number) {
      registra('GET', `/lead/${leadId}/foto/${fotoId}`)
      const f = finto.foto.find((x) => x.lead_id === leadId && x.id === fotoId)
      if (!f) throw new ErrorePlexus('http', 404, 'foto inesistente')
      return f.byte
    },
  }
  return finto
}
