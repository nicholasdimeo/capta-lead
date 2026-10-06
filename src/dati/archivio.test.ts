import { describe, it, expect } from 'vitest'
import { archivioNuovo, CAMPI_EVENTO_PROVA, blobFinto } from '../test/aiuti'
import {
  creaEvento, aggiornaEvento, archiviaEvento, creaLead, aggiornaLead, aggiungiFoto, eliminaLead, eliminaEvento, leadDiEvento, elencoEventi,
  filtraLead, consensoDalleRisposte, fotoDiLead, leggiImpostazione, salvaImpostazione,
} from './archivio'
import { operazioniAperte, accoda, pulisciCompletate } from './coda'
import { normalizzaPerRicerca } from '../utils/testo'
import { brand } from '../config/brand'

describe('archivio locale: eventi', () => {
  it('crea un evento e lo mette in coda per Plexus', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    expect(evento.uuid).toMatch(/^[0-9a-f-]{36}$/)
    expect(evento.origine).toBe('app')
    expect(evento.plexus_id).toBeNull()
    const coda = await operazioniAperte(db)
    expect(coda).toHaveLength(1)
    expect(coda[0]).toMatchObject({ tipo: 'invia_evento', riferimento: evento.uuid, stato: 'in_attesa', tentativi: 0 })
  })

  it('pulisce gli spazi nel nome e nel luogo', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento({ ...CAMPI_EVENTO_PROVA, nome: '  Fiera   X ', luogo: ' Bologna  ' }, db)
    expect(evento.nome).toBe('Fiera X')
    expect(evento.luogo).toBe('Bologna')
  })

  it('ordina gli eventi dal più recente', async () => {
    const db = archivioNuovo()
    await creaEvento({ ...CAMPI_EVENTO_PROVA, nome: 'Vecchio', data_inizio: '2025-01-01', data_fine: '2025-01-02' }, db)
    await creaEvento({ ...CAMPI_EVENTO_PROVA, nome: 'Nuovo', data_inizio: '2026-12-01', data_fine: '2026-12-02' }, db)
    await creaEvento({ ...CAMPI_EVENTO_PROVA, nome: 'Medio', data_inizio: '2026-06-01', data_fine: '2026-06-02' }, db)
    expect((await elencoEventi(db)).map((e) => e.nome)).toEqual(['Nuovo', 'Medio', 'Vecchio'])
  })

  it('modifica di un evento nato sull\'app: rimanda tutto (stessa operazione riusata)', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    await aggiornaEvento(evento.uuid, { nome: 'Rinominato' }, db)
    const coda = await operazioniAperte(db)
    expect(coda).toHaveLength(1)
    expect(coda[0].tipo).toBe('invia_evento')
    expect((await db.eventi.get(evento.uuid))?.nome).toBe('Rinominato')
  })

  it('evento nato in Plexus: ogni modifica va in coda come invia_evento (PUT); senza modifiche niente', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    await db.eventi.update(evento.uuid, { origine: 'plexus', plexus_id: 7 })
    await db.coda.clear()
    await aggiornaEvento(evento.uuid, { nome: 'Fiera di prova', questionario: evento.questionario }, db)
    expect(await operazioniAperte(db)).toHaveLength(0)
    await aggiornaEvento(evento.uuid, { nome: 'Rinominato dall\'app' }, db)
    let coda = await operazioniAperte(db)
    expect(coda).toHaveLength(1)
    expect(coda[0].tipo).toBe('invia_evento')
    await aggiornaEvento(evento.uuid, { questionario: [{ domanda: 'Nuova?', opzioni: ['A', 'B'] }] }, db)
    coda = await operazioniAperte(db)
    expect(coda).toHaveLength(1) // stessa operazione riusata
  })

  it('archiviare un evento lo segna e lo mette in coda; riaprirlo pure', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    await db.coda.clear()
    await archiviaEvento(evento.uuid, true, db)
    expect((await db.eventi.get(evento.uuid))?.archiviato).toBe(true)
    expect((await operazioniAperte(db)).map((o) => o.tipo)).toEqual(['invia_evento'])
    await archiviaEvento(evento.uuid, false, db)
    expect((await db.eventi.get(evento.uuid))?.archiviato).toBe(false)
  })

  it('elimina un evento con lead, foto e operazioni', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const lead = await creaLead(evento.uuid, { nome: 'Anna' }, db)
    await aggiungiFoto(lead.uuid, 'biglietto', { blob: blobFinto(), miniatura: null, mime: 'image/jpeg', larghezza: 10, altezza: 10 }, db)
    await eliminaEvento(evento.uuid, db)
    expect(await db.eventi.count()).toBe(0)
    expect(await db.lead.count()).toBe(0)
    expect(await db.foto.count()).toBe(0)
    expect(await db.coda.count()).toBe(0)
  })
})

describe('archivio locale: lead e foto', () => {
  it('crea una lead e accoda l\'invio; email in minuscolo e senza spazi', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const lead = await creaLead(evento.uuid, { nome: ' Anna ', cognome: 'Bianchi', email: ' Anna@Clinica.IT ', lingua: 'it', risposte: { 'Qual è il suo ruolo?': 'Medico estetico' } }, db)
    expect(lead.nome).toBe('Anna')
    expect(lead.email).toBe('anna@clinica.it')
    expect(lead.plexus_id).toBeNull()
    const coda = await operazioniAperte(db)
    expect(coda.map((o) => o.tipo)).toEqual(['invia_evento', 'invia_lead'])
  })

  it('una modifica riusa l\'operazione in attesa invece di crearne un\'altra', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const lead = await creaLead(evento.uuid, { nome: 'Anna' }, db)
    await aggiornaLead(lead.uuid, { note: 'vuole il listino' }, db)
    await aggiornaLead(lead.uuid, { categoria: 'caldo' }, db)
    const coda = await operazioniAperte(db)
    expect(coda.filter((o) => o.tipo === 'invia_lead')).toHaveLength(1)
    const salvata = await db.lead.get(lead.uuid)
    expect(salvata?.note).toBe('vuole il listino')
    expect(salvata?.categoria).toBe('caldo')
  })

  it('una modifica dopo un errore rimette l\'operazione in attesa e azzera i tentativi', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const lead = await creaLead(evento.uuid, { nome: 'Anna' }, db)
    const op = (await operazioniAperte(db)).find((o) => o.tipo === 'invia_lead')!
    await db.coda.update(op.id!, { stato: 'errore', tentativi: 3, prossimo_tentativo: '2999-01-01T00:00:00.000Z', ultimo_errore: 'email non valida' })
    await aggiornaLead(lead.uuid, { email: 'anna@clinica.it' }, db)
    const dopo = (await operazioniAperte(db)).find((o) => o.tipo === 'invia_lead')!
    expect(dopo.id).toBe(op.id)
    expect(dopo.stato).toBe('in_attesa')
    expect(dopo.tentativi).toBe(0)
    expect(new Date(dopo.prossimo_tentativo).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('una lead in sola lettura non si può modificare', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const lead = await creaLead(evento.uuid, { nome: 'Importata' }, db)
    await db.lead.update(lead.uuid, { solo_lettura: true })
    await expect(aggiornaLead(lead.uuid, { nome: 'X' }, db)).rejects.toThrow()
  })

  it('aggiunge foto (anche come Blob) e accoda il caricamento', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const lead = await creaLead(evento.uuid, { nome: 'Anna' }, db)
    const foto = await aggiungiFoto(lead.uuid, 'biglietto', { blob: blobFinto(2048), miniatura: blobFinto(100), mime: 'image/jpeg', larghezza: 800, altezza: 600 }, db)
    expect(foto.dimensione).toBe(2048)
    const lette = await fotoDiLead(lead.uuid, db)
    expect(lette).toHaveLength(1)
    expect(lette[0].blob.size).toBe(2048)
    expect((await operazioniAperte(db)).map((o) => o.tipo)).toContain('carica_foto')
  })

  it('elimina una lead con le sue foto e operazioni, senza toccare le altre', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const a = await creaLead(evento.uuid, { nome: 'A' }, db)
    const b = await creaLead(evento.uuid, { nome: 'B' }, db)
    await aggiungiFoto(a.uuid, 'volto', { blob: blobFinto(), miniatura: null, mime: 'image/jpeg', larghezza: 1, altezza: 1 }, db)
    await eliminaLead(a.uuid, db)
    expect(await db.lead.count()).toBe(1)
    expect(await db.foto.count()).toBe(0)
    const coda = await operazioniAperte(db)
    expect(coda.map((o) => o.riferimento)).toEqual([evento.uuid, b.uuid])
  })

  it('le lead di un evento arrivano dalla più recente', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const altro = await creaEvento({ ...CAMPI_EVENTO_PROVA, nome: 'Altro' }, db)
    await creaLead(evento.uuid, { nome: 'Prima' }, db)
    await new Promise((r) => setTimeout(r, 5))
    await creaLead(evento.uuid, { nome: 'Seconda' }, db)
    await creaLead(altro.uuid, { nome: 'Altrove' }, db)
    expect((await leadDiEvento(evento.uuid, db)).map((l) => l.nome)).toEqual(['Seconda', 'Prima'])
  })

  it('deduce il consenso dalla domanda di consenso', () => {
    const q = brand.questionario_predefinito
    const domandaConsenso = q.find((d) => d.consenso)!.domanda
    expect(consensoDalleRisposte(q, { [domandaConsenso]: 'Sì' })).toBe(true)
    expect(consensoDalleRisposte(q, { [domandaConsenso]: 'No' })).toBe(false)
    expect(consensoDalleRisposte(q, {})).toBeNull()
    expect(consensoDalleRisposte([], { x: 'Sì' })).toBeNull()
  })

  it('filtra per testo (senza accenti), categoria e consenso', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    await creaLead(evento.uuid, { nome: 'Anna', cognome: 'Bianchi', azienda: 'Clinica Sorriso', categoria: 'caldo', consenso: true, citta: 'Forlì' }, db)
    await creaLead(evento.uuid, { nome: 'Marco', cognome: 'Rossi', categoria: 'curioso', consenso: false }, db)
    await creaLead(evento.uuid, { nome: 'Luca', cognome: 'Verdi', consenso: null }, db)
    const tutte = await leadDiEvento(evento.uuid, db)
    const n = (f: Parameters<typeof filtraLead>[1]) => filtraLead(tutte, f, normalizzaPerRicerca).map((l) => l.nome).sort()
    expect(n({ testo: 'sorriso' })).toEqual(['Anna'])
    expect(n({ testo: 'forli' })).toEqual(['Anna'])
    expect(n({ testo: 'anna bianchi' })).toEqual(['Anna'])
    expect(n({ testo: 'anna rossi' })).toEqual([])
    expect(n({ categoria: 'curioso' })).toEqual(['Marco'])
    expect(n({ consenso: 'si' })).toEqual(['Anna'])
    expect(n({ consenso: 'no' })).toEqual(['Marco'])
    expect(n({ consenso: 'nessuno' })).toEqual(['Luca'])
    expect(n({})).toEqual(['Anna', 'Luca', 'Marco'])
  })
})

describe('coda e impostazioni', () => {
  it('accoda senza doppioni e pulisce le completate vecchie', async () => {
    const db = archivioNuovo()
    const a = await accoda(db, 'invia_lead', 'x')
    const b = await accoda(db, 'invia_lead', 'x')
    expect(b.id).toBe(a.id)
    await db.coda.update(a.id!, { stato: 'completata', completata_il: '2020-01-01T00:00:00.000Z' })
    const c = await accoda(db, 'invia_lead', 'x')
    expect(c.id).not.toBe(a.id)
    expect(await pulisciCompletate(db, 30)).toBe(1)
    expect(await db.coda.count()).toBe(1)
  })

  it('salva e rilegge le impostazioni con un valore di riserva', async () => {
    const db = archivioNuovo()
    expect(await leggiImpostazione('lingua', 'it', db)).toBe('it')
    await salvaImpostazione('lingua', 'en', db)
    expect(await leggiImpostazione('lingua', 'it', db)).toBe('en')
  })
})

describe('correzioni dalla revisione', () => {
  it('il consenso si riconosce dal testo (anche in inglese o in ordine diverso), poi dalla posizione', () => {
    const q = [{ domanda: 'Consenso?', opzioni: ['No', 'Sì'], consenso: true }]
    expect(consensoDalleRisposte(q, { 'Consenso?': 'Sì' })).toBe(true)
    expect(consensoDalleRisposte(q, { 'Consenso?': 'No' })).toBe(false)
    const en = [{ domanda: 'Agree?', opzioni: ['Yes', 'No'], consenso: true }]
    expect(consensoDalleRisposte(en, { 'Agree?': 'Yes' })).toBe(true)
    expect(consensoDalleRisposte(en, { 'Agree?': 'No' })).toBe(false)
    const strano = [{ domanda: 'Ok?', opzioni: ['Va bene', 'Preferisco di no'], consenso: true }]
    expect(consensoDalleRisposte(strano, { 'Ok?': 'Va bene' })).toBe(true)
    expect(consensoDalleRisposte(strano, { 'Ok?': 'Preferisco di no' })).toBe(false)
  })

  it('contatto e foto si salvano in un\'unica transazione', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, db)
    const lead = await creaLead(evento.uuid, { nome: 'Anna' }, db, [
      { tipo: 'biglietto', dati: { blob: blobFinto(), miniatura: null, mime: 'image/jpeg', larghezza: 1, altezza: 1 } },
      { tipo: 'volto', dati: { blob: blobFinto(), miniatura: null, mime: 'image/jpeg', larghezza: 1, altezza: 1 } },
    ])
    expect(await fotoDiLead(lead.uuid, db)).toHaveLength(2)
    expect((await operazioniAperte(db)).map((o) => o.tipo)).toEqual(['invia_evento', 'invia_lead', 'carica_foto', 'carica_foto'])
    await aggiornaLead(lead.uuid, { note: 'x' }, db, [{ tipo: 'altro', dati: { blob: blobFinto(), miniatura: null, mime: 'image/jpeg', larghezza: 1, altezza: 1 } }])
    expect(await fotoDiLead(lead.uuid, db)).toHaveLength(3)
  })
})
