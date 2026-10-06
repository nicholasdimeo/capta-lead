import { describe, it, expect } from 'vitest'
import { arricchisciQuestionario, risposteDaPlexus, allineaEventi, allineaLead } from './allineamento'
import { archivioNuovo, CAMPI_EVENTO_PROVA } from '../test/aiuti'
import { creaEvento, creaLead } from '../dati/archivio'
import type { Domanda } from '../dati/tipi'

const DOMANDA: Domanda = { domanda: 'Cosa vuole?', opzioni: ['Campione', 'Listino, completo'], multipla: true, traduzioni: { en: { domanda: 'What?', opzioni: ['Sample', 'Full price list'] } } }

describe('allineamento: questionari e risposte', () => {
  it('riattacca le traduzioni solo se le opzioni sono rimaste le stesse', () => {
    const uguale = arricchisciQuestionario([{ domanda: 'Cosa vuole?', opzioni: ['Campione', 'Listino, completo'], multipla: true }], [DOMANDA], [])
    expect(uguale[0].traduzioni?.en.domanda).toBe('What?')
    const diversa = arricchisciQuestionario([{ domanda: 'Cosa vuole?', opzioni: ['Campione', 'Listino', 'Visita'], multipla: true }], [DOMANDA], [])
    expect(diversa[0].traduzioni).toBeUndefined()
    const sconosciuta = arricchisciQuestionario([{ domanda: 'Altro?', opzioni: ['A', 'B'] }], [DOMANDA], [])
    expect(sconosciuta[0]).toEqual({ domanda: 'Altro?', opzioni: ['A', 'B'], multipla: false, consenso: false })
  })

  it('rifà l\'elenco delle risposte multiple solo se ogni pezzo è un\'opzione', () => {
    expect(risposteDaPlexus({ 'Cosa vuole?': 'Campione' }, [DOMANDA])).toEqual({ 'Cosa vuole?': ['Campione'] })
    // l'opzione "Listino, completo" contiene una virgola: va riconosciuta intera
    expect(risposteDaPlexus({ 'Cosa vuole?': 'Campione, Listino, completo' }, [DOMANDA])).toEqual({ 'Cosa vuole?': ['Campione', 'Listino, completo'] })
    expect(risposteDaPlexus({ 'Cosa vuole?': 'Listino, completo' }, [DOMANDA])).toEqual({ 'Cosa vuole?': ['Listino, completo'] })
    expect(risposteDaPlexus({ 'Cosa vuole?': 'Campione, Boh' }, [DOMANDA])).toEqual({ 'Cosa vuole?': 'Campione, Boh' })
    expect(risposteDaPlexus({ 'Domanda ignota': 'x, y' }, [DOMANDA])).toEqual({ 'Domanda ignota': 'x, y' })
  })
})

describe('allineamento: eventi', () => {
  it('collega un evento di Plexus a quello locale tramite uuid_app e non sovrascrive chi ha modifiche in coda', async () => {
    const db = archivioNuovo()
    const locale = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const scheda = { id: 42, uuid_app: locale.uuid, nome: 'Nome da Plexus', luogo: 'Roma', data_inizio: '2026-01-01', data_fine: '2026-01-02', note: '', lingua: 'en', linea: 'estetica', ringraziamento_attivo: true, questionario: [], categorie_suggerite: ['vip'] }
    await allineaEventi(db, [scheda], new Set([locale.uuid]))
    let letto = (await db.eventi.get(locale.uuid))!
    expect(letto.plexus_id).toBe(42)
    expect(letto.nome).toBe('Fiera di prova') // modifiche locali in coda: non toccato
    await allineaEventi(db, [scheda], new Set())
    letto = (await db.eventi.get(locale.uuid))!
    expect(letto.nome).toBe('Nome da Plexus')
    expect(letto.lingua).toBe('en')
    expect(letto.categorie_suggerite).toEqual(['vip']) // dalla 1.1 le categorie dell'evento sono quelle di Plexus
    expect(letto.origine).toBe('app')
  })

  it('un evento creato da un altro dispositivo (con uuid_app) arriva con origine app e quell\'uuid', async () => {
    const db = archivioNuovo()
    await allineaEventi(db, [{ id: 7, uuid_app: 'altro-dispositivo', nome: 'X', luogo: '', data_inizio: '', data_fine: '', note: '', lingua: 'it', linea: 'ortopedia', ringraziamento_attivo: false, questionario: [], categorie_suggerite: [] }], new Set())
    const letto = (await db.eventi.get('altro-dispositivo'))!
    expect(letto.origine).toBe('app')
    expect(letto.plexus_id).toBe(7)
    expect(letto.ringraziamento_attivo).toBe(false)
  })
})

describe('allineamento: numeri di Plexus riusati', () => {
  it('se un numero di Plexus ora appartiene a un evento con un altro uuid, l\'evento locale perde il numero', async () => {
    const db = archivioNuovo()
    const locale = await creaEvento(CAMPI_EVENTO_PROVA, db)
    await db.eventi.update(locale.uuid, { plexus_id: 1 })
    await allineaEventi(db, [{ id: 1, uuid_app: 'altro-uuid', nome: 'Altro evento', luogo: '', data_inizio: '', data_fine: '', note: '', lingua: 'it', linea: 'ortopedia', ringraziamento_attivo: true, questionario: [], categorie_suggerite: [] }], new Set())
    expect((await db.eventi.get(locale.uuid))?.plexus_id).toBeNull()
    expect((await db.eventi.get(locale.uuid))?.nome).toBe('Fiera di prova')
    expect((await db.eventi.get('altro-uuid'))?.plexus_id).toBe(1)
  })
})

describe('allineamento: lead', () => {
  it('aggiorna stato e numero; i campi solo se non ci sono modifiche locali in coda', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const lead = await creaLead(evento.uuid, { nome: 'Anna', note: 'nota locale' }, db)
    const remota = { id: 3, uuid: lead.uuid, evento_id: 1, nome: 'Anna', cognome: 'Bianchi', email: '', telefono: '', azienda: '', professione: '', citta: '', provincia: '', indirizzo: '', note: 'nota da Plexus', lingua: null, consenso: 'N' as const, categoria: 'caldo', risposte: {}, stato: 'approvata', origine: 'app', creato_il: '2026-10-16T10:21:00', aggiornato_il: null, n_foto: 0 }
    await allineaLead(db, evento, [remota], new Set([lead.uuid]))
    let letta = (await db.lead.get(lead.uuid))!
    expect(letta.plexus_id).toBe(3)
    expect(letta.plexus_stato).toBe('approvata')
    expect(letta.note).toBe('nota locale')
    await allineaLead(db, evento, [remota], new Set())
    letta = (await db.lead.get(lead.uuid))!
    expect(letta.note).toBe('nota da Plexus')
    expect(letta.cognome).toBe('Bianchi')
    expect(letta.consenso).toBe(false)
    expect(letta.categoria).toBe('caldo')
  })
})
