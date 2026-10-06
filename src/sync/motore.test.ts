import { describe, it, expect } from 'vitest'
import { ambienteMotore, CAMPI_EVENTO_PROVA, blobFinto, COLLEGAMENTO_PROVA } from '../test/aiuti'
import { creaEvento, creaLead, aggiornaLead, aggiungiFoto, aggiornaEvento, archiviaEvento, leggiImpostazione } from '../dati/archivio'
import { accoda as accodaDiNuovo } from '../dati/coda'
import { operazioniAperte } from '../dati/coda'
import { ErrorePlexus } from '../plexus/client'
import { CHIAVE_COLLEGAMENTO, statoInvioLead, corpoLead } from './motore'
import type { CollegamentoPlexus } from '../dati/tipi'

const FOTO = { blob: blobFinto(3000), miniatura: blobFinto(200), mime: 'image/jpeg', larghezza: 100, altezza: 80 }

describe('motore di sincronizzazione', () => {
  it('lead registrata offline: al ritorno della rete arriva a Plexus una sola volta, con le foto', async () => {
    const { archivio, plexus, motore, rete } = await ambienteMotore({ online: false })
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const lead = await creaLead(evento.uuid, { nome: 'Anna', cognome: 'Bianchi', email: 'anna@clinica.it', consenso: true, risposte: { 'Cosa le interessa ricevere?': ['Un campione', 'Il listino'] } }, archivio)
    await aggiungiFoto(lead.uuid, 'biglietto', FOTO, archivio)
    await aggiungiFoto(lead.uuid, 'volto', FOTO, archivio)

    const offline = await motore.sincronizza()
    expect(offline).toMatchObject({ eseguita: false, saltata: 'offline' })
    expect(plexus.chiamate).toHaveLength(0)

    rete.online = true
    const esito = await motore.sincronizza()
    expect(esito.eseguita).toBe(true)
    expect(esito.errore).toBeUndefined()
    // un solo POST evento, un solo POST lead, due POST foto
    expect(plexus.chiamateA('/eventi', 'POST')).toHaveLength(1)
    expect(plexus.chiamateA('/eventi/1/lead', 'POST')).toHaveLength(1)
    expect(plexus.chiamateA('/lead/1/foto', 'POST')).toHaveLength(2)
    expect(plexus.foto.map((f) => f.tipo)).toEqual(['biglietto', 'volto'])
    // il corpo rispetta il contratto: uuid, risposte multiple come lista, consenso booleano
    const corpo = plexus.chiamateA('/eventi/1/lead', 'POST')[0].corpo as ReturnType<typeof corpoLead>
    expect(corpo.uuid).toBe(lead.uuid)
    expect(corpo.consenso).toBe(true)
    expect(corpo.risposte['Cosa le interessa ricevere?']).toEqual(['Un campione', 'Il listino'])
    expect(Object.keys(corpo).sort()).toEqual(['azienda', 'categoria', 'citta', 'cognome', 'consenso', 'email', 'indirizzo', 'lingua', 'nome', 'note', 'professione', 'provincia', 'risposte', 'telefono', 'uuid'])

    const salvata = (await archivio.lead.get(lead.uuid))!
    expect(salvata.plexus_id).toBe(1)
    expect(salvata.ringraziamento?.esito).toBe('inviato')
    expect(salvata.inviata_il).not.toBeNull()
    expect((await archivio.eventi.get(evento.uuid))?.plexus_id).toBe(1)
    const foto = await archivio.foto.where('lead_uuid').equals(lead.uuid).toArray()
    expect(foto.map((f) => f.plexus_foto_id).sort()).toEqual([1, 2])
    expect(await operazioniAperte(archivio)).toHaveLength(0)

    // una seconda sincronizzazione non rimanda nulla
    const prima = plexus.chiamate.length
    await motore.sincronizza()
    expect(plexus.chiamate.slice(prima).filter((c) => c.metodo === 'POST')).toHaveLength(0)
  })

  it('modifica dopo l\'invio: rimanda con lo stesso uuid, Plexus aggiorna senza doppioni e la mail resta "inviata"', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const lead = await creaLead(evento.uuid, { nome: 'Anna', email: 'anna@clinica.it' }, archivio)
    await motore.sincronizza()
    await aggiornaLead(lead.uuid, { note: 'vuole il listino', categoria: 'caldo' }, archivio)
    await motore.sincronizza()
    expect(plexus.lead).toHaveLength(1)
    expect(plexus.lead[0].note).toBe('vuole il listino')
    expect(plexus.chiamateA('/eventi/1/lead', 'POST')).toHaveLength(2)
    const salvata = (await archivio.lead.get(lead.uuid))!
    expect(salvata.ringraziamento?.esito).toBe('inviato')
    expect(await operazioniAperte(archivio)).toHaveLength(0)
  })

  it('errore di rete a metà: l\'operazione resta in attesa senza contare il tentativo e riparte dopo', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await creaLead(evento.uuid, { nome: 'Anna' }, archivio)
    plexus.prossimiErrori.push(null, null) // GET /stato e GET /eventi vanno bene
    plexus.prossimiErrori.push(new ErrorePlexus('rete', null, 'rete non raggiungibile')) // il POST /eventi cade
    const esito = await motore.sincronizza()
    expect(esito.errore).toBe('interrotta')
    expect(plexus.eventi).toHaveLength(0)
    const coda = await operazioniAperte(archivio)
    expect(coda.every((o) => o.stato === 'in_attesa' && o.tentativi === 0)).toBe(true)
    await motore.sincronizza()
    expect(await operazioniAperte(archivio)).toHaveLength(0)
    expect(plexus.lead).toHaveLength(1)
  })

  it('errore 500: conta il tentativo e aspetta prima di riprovare', async () => {
    const { archivio, plexus, motore } = await ambienteMotore({ attesa: 60_000 })
    await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    plexus.prossimiErrori.push(null, null, new ErrorePlexus('http', 500, 'guasto')) // GET /stato e GET /eventi ok, POST /eventi guasto
    await motore.sincronizza()
    let op = (await operazioniAperte(archivio))[0]
    expect(op.stato).toBe('errore')
    expect(op.tentativi).toBe(1)
    expect(op.ultimo_errore).toBe('guasto')
    expect(new Date(op.prossimo_tentativo).getTime()).toBeGreaterThan(Date.now() + 30_000)
    await motore.sincronizza()
    expect(plexus.chiamateA('/eventi', 'POST')).toHaveLength(1) // non ritentata: è ancora in attesa
    await archivio.coda.update(op.id!, { prossimo_tentativo: new Date(0).toISOString() })
    await motore.sincronizza()
    op = (await operazioniAperte(archivio))[0]
    expect(op).toBeUndefined()
    expect(plexus.eventi).toHaveLength(1)
  })

  it('errore 400 (email rifiutata): resta "rifiutata" finché la lead non viene corretta', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const lead = await creaLead(evento.uuid, { nome: 'Anna', email: 'anna@clinica' }, archivio)
    // la email passa il controllo locale? no: il modulo la blocca; qui simuliamo il rifiuto di Plexus
    await motore.sincronizza()
    const ops = await operazioniAperte(archivio)
    const op = ops.find((o) => o.tipo === 'invia_lead')!
    expect(op.stato).toBe('errore')
    expect(op.codice_errore).toBe(400)
    expect(new Date(op.prossimo_tentativo).getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000)
    expect(statoInvioLead((await archivio.lead.get(lead.uuid))!, ops, true)).toEqual({ stato: 'rifiutata', errore: 'email non valida' })
    await aggiornaLead(lead.uuid, { email: 'anna@clinica.it' }, archivio)
    await motore.sincronizza()
    expect(await operazioniAperte(archivio)).toHaveLength(0)
    expect(plexus.lead[0].email).toBe('anna@clinica.it')
  })

  it('401: segna il collegamento da rifare, ferma il ciclo e non perde nulla', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await creaLead(evento.uuid, { nome: 'Anna' }, archivio)
    plexus.prossimiErrori.push(new ErrorePlexus('http', 401, 'token revocato'))
    const esito = await motore.sincronizza()
    expect(esito.errore).toBe('token_non_valido')
    expect(motore.leggiStato().collegamento?.stato).toBe('token_non_valido')
    expect((await leggiImpostazione<CollegamentoPlexus | null>(CHIAVE_COLLEGAMENTO, null, archivio))?.stato).toBe('token_non_valido')
    expect(await operazioniAperte(archivio)).toHaveLength(2)
    // le sincronizzazioni automatiche vengono saltate finché non si ricollega
    expect(await motore.sincronizza('timer')).toMatchObject({ eseguita: false, saltata: 'token_non_valido' })
    // ricollegamento → tutto riparte
    await motore.collega('https://plexus.prova.it', 'plx_nuovo')
    await motore.sincronizza()
    expect(motore.leggiStato().collegamento?.stato).toBe('ok')
    expect(await operazioniAperte(archivio)).toHaveLength(0)
    expect(plexus.lead).toHaveLength(1)
  })

  it('senza collegamento non chiama nulla, ma la coda si accumula e parte quando ci si collega', async () => {
    const { archivio, plexus, motore } = await ambienteMotore({ collegato: false })
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await creaLead(evento.uuid, { nome: 'Anna' }, archivio)
    expect(await motore.sincronizza()).toMatchObject({ eseguita: false, saltata: 'non_collegato' })
    expect(plexus.chiamate).toHaveLength(0)
    const stato = await motore.collega('https://plexus.prova.it', 'plx_prova')
    expect(stato.azienda).toBe('SGM Pharma')
    expect(motore.leggiStato().collegamento?.token).toBe('plx_prova')
    await motore.sincronizza()
    expect(plexus.lead).toHaveLength(1)
    expect(await operazioniAperte(archivio)).toHaveLength(0)
  })

  it('eventi nati in Plexus arrivano nell\'app; le lead registrate lì usano il numero di Plexus', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const remoto = plexus.aggiungiEventoPlexus({ nome: 'Congresso SIME' })
    await motore.sincronizza()
    const locali = await archivio.eventi.toArray()
    expect(locali).toHaveLength(1)
    expect(locali[0]).toMatchObject({ nome: 'Congresso SIME', origine: 'plexus', plexus_id: remoto.id })
    // il questionario di Plexus riceve le traduzioni del brand (stesso testo)
    const consenso = locali[0].questionario.find((d) => d.consenso)!
    expect(consenso.traduzioni?.en?.domanda).toContain('Do you agree')
    await creaLead(locali[0].uuid, { nome: 'Marco' }, archivio)
    await motore.sincronizza()
    expect(plexus.chiamateA('/eventi', 'POST')).toHaveLength(0) // nessun evento creato: era già di Plexus
    expect(plexus.lead[0].evento_id).toBe(remoto.id)
  })

  it('modifica di un evento nato in Plexus → PUT /eventi/{id} con tutti i campi (1.1)', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const remoto = plexus.aggiungiEventoPlexus()
    await motore.sincronizza()
    const locale = (await archivio.eventi.toArray())[0]
    await aggiornaEvento(locale.uuid, { nome: 'Rinominato dall\'app', questionario: [{ domanda: 'Nuova domanda?', opzioni: ['A', 'B'], multipla: false, traduzioni: { en: { domanda: 'New question?', opzioni: ['A', 'B'] } } }], categorie_suggerite: ['vip'] }, archivio)
    await motore.sincronizza()
    const put = plexus.chiamateA(`/eventi/${remoto.id}`, 'PUT')
    expect(put).toHaveLength(1)
    expect(plexus.eventi[0].nome).toBe('Rinominato dall\'app')
    expect(plexus.eventi[0].questionario[0].traduzioni?.en.domanda).toBe('New question?')
    expect(plexus.eventi[0].categorie_suggerite).toEqual(['vip'])
    // e un nuovo GET /eventi non sovrascrive quanto appena inviato
    await motore.sincronizza()
    const riletto = (await archivio.eventi.get(locale.uuid))!
    expect(riletto.questionario[0].domanda).toBe('Nuova domanda?')
    expect(riletto.questionario[0].traduzioni?.en.domanda).toBe('New question?')
  })

  it('con un Plexus 1.0: evento nato in Plexus → solo PUT questionario; evento nato sull\'app → di nuovo POST', async () => {
    const { archivio, plexus, motore } = await ambienteMotore({ api: '1.0' })
    const remoto = plexus.aggiungiEventoPlexus()
    const mio = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await motore.sincronizza()
    const locale = (await archivio.eventi.toArray()).find((e) => e.origine === 'plexus')!
    await aggiornaEvento(locale.uuid, { questionario: [{ domanda: 'Nuova?', opzioni: ['A', 'B'] }] }, archivio)
    await aggiornaEvento(mio.uuid, { nome: 'Rinominato' }, archivio)
    await motore.sincronizza()
    expect(plexus.chiamateA(`/eventi/${remoto.id}/questionario`, 'PUT')).toHaveLength(1)
    expect(plexus.chiamateA(`/eventi/${remoto.id}`, 'PUT')).toHaveLength(0)
    expect(plexus.chiamateA('/eventi', 'POST')).toHaveLength(2)
    expect(plexus.eventi.find((e) => e.uuid_app === mio.uuid)?.nome).toBe('Rinominato')
  })

  it('le modifiche fatte in Plexus a un evento arrivano nell\'app (se non ci sono modifiche locali in attesa)', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await motore.sincronizza()
    plexus.eventi[0].nome = 'Rinominato in Plexus'
    plexus.eventi[0].ringraziamento_attivo = false
    await motore.sincronizza()
    const locale = (await archivio.eventi.get(evento.uuid))!
    expect(locale.nome).toBe('Rinominato in Plexus')
    expect(locale.ringraziamento_attivo).toBe(false)
    // le traduzioni locali del questionario sopravvivono al giro
    expect(locale.questionario[0].traduzioni?.en).toBeDefined()
  })

  it('lead nate in Plexus: con uuid "plexus-…" si modificano dall\'app (1.1); senza uuid (1.0) in sola lettura', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const mia = await creaLead(evento.uuid, { nome: 'Anna', email: 'anna@clinica.it' }, archivio)
    await motore.sincronizza()
    plexus.aggiungiLeadPlexus(1, { nome: 'Importata', risposte: { 'Cosa le interessa ricevere?': 'Un campione, Il listino' } })
    plexus.aggiungiLeadPlexus(1, { nome: 'Vecchia', uuid: null })
    plexus.lead[0].stato = 'inviata'
    await motore.sincronizza()
    const locali = await archivio.lead.where('evento_uuid').equals(evento.uuid).toArray()
    expect(locali).toHaveLength(3)
    const importata = locali.find((l) => l.nome === 'Importata')!
    expect(importata.solo_lettura).toBe(false)
    expect(importata.uuid).toMatch(/^plexus-/)
    expect(importata.consenso).toBe(true)
    expect(importata.risposte['Cosa le interessa ricevere?']).toEqual(['Un campione', 'Il listino'])
    expect(locali.find((l) => l.nome === 'Vecchia')?.solo_lettura).toBe(true)
    expect((await archivio.lead.get(mia.uuid))?.plexus_stato).toBe('inviata')
    expect(await operazioniAperte(archivio)).toHaveLength(0) // le importate non vengono rimandate da sole
    // modifica dall'app della lead importata: rimandata con lo stesso uuid plexus-…
    await aggiornaLead(importata.uuid, { note: 'completata allo stand' }, archivio)
    await motore.sincronizza()
    expect(plexus.lead.filter((l) => l.nome === 'Importata')).toHaveLength(1)
    expect(plexus.lead.find((l) => l.nome === 'Importata')?.note).toBe('completata allo stand')
  })

  it('foto aggiunta prima che la lead sia inviata: aspetta la lead e poi parte', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const lead = await creaLead(evento.uuid, { nome: 'Anna' }, archivio)
    await aggiungiFoto(lead.uuid, 'biglietto', FOTO, archivio)
    // cancelliamo l'operazione della lead per simulare uno stato incoerente: il motore la ricrea da solo
    await archivio.coda.where('[tipo+riferimento]').equals(['invia_lead', lead.uuid]).delete()
    await motore.sincronizza()
    expect(plexus.lead).toHaveLength(1)
    expect(plexus.foto).toHaveLength(1)
    expect(await operazioniAperte(archivio)).toHaveLength(0)
  })

  it('operazioni rimaste "in corso" (app chiusa a metà) ripartono all\'avvio', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await archivio.coda.toCollection().modify({ stato: 'in_corso' })
    await motore.prepara()
    expect((await operazioniAperte(archivio))[0].stato).toBe('in_attesa')
    await motore.sincronizza()
    expect(plexus.eventi).toHaveLength(1)
  })

  it('oggetti cancellati prima dell\'invio: l\'operazione si chiude senza chiamare Plexus', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const lead = await creaLead(evento.uuid, { nome: 'Anna' }, archivio)
    await archivio.lead.delete(lead.uuid) // cancellazione "grezza", senza passare da eliminaLead
    await motore.sincronizza()
    expect(plexus.lead).toHaveLength(0)
    expect(await operazioniAperte(archivio)).toHaveLength(0)
  })

  it('mail in attesa quando la casella non è pronta; stato calcolato per l\'interfaccia', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    plexus.posta_lead_pronta = false
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const lead = await creaLead(evento.uuid, { nome: 'Anna', email: 'anna@clinica.it' }, archivio)
    let ops = await operazioniAperte(archivio)
    expect(statoInvioLead((await archivio.lead.get(lead.uuid))!, ops, true).stato).toBe('in_coda')
    expect(statoInvioLead((await archivio.lead.get(lead.uuid))!, ops, false).stato).toBe('locale')
    await motore.sincronizza()
    ops = await operazioniAperte(archivio)
    const salvata = (await archivio.lead.get(lead.uuid))!
    expect(salvata.ringraziamento?.esito).toBe('in_attesa')
    expect(statoInvioLead(salvata, ops, true).stato).toBe('inviata')
    await aggiornaLead(lead.uuid, { note: 'x' }, archivio)
    expect(statoInvioLead((await archivio.lead.get(lead.uuid))!, await operazioniAperte(archivio), true).stato).toBe('modifiche_in_coda')
  })

  it('scollegare non cancella la coda; ricollegare la fa ripartire', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await creaLead(evento.uuid, { nome: 'Anna' }, archivio)
    await motore.scollega()
    expect(motore.leggiStato().collegamento).toBeNull()
    expect(await motore.sincronizza()).toMatchObject({ saltata: 'non_collegato' })
    expect(await operazioniAperte(archivio)).toHaveLength(2)
    await motore.collega(COLLEGAMENTO_PROVA.url, COLLEGAMENTO_PROVA.token)
    await motore.sincronizza()
    expect(plexus.lead).toHaveLength(1)
  })
})

describe('motore: correzioni dalla revisione', () => {
  it('una modifica fatta durante lo scaricamento delle lead non viene sovrascritta dai dati di Plexus', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const lead = await creaLead(evento.uuid, { nome: 'Anna', note: 'prima' }, archivio)
    await motore.sincronizza()
    // Plexus risponde lentamente a GET /eventi/1/lead: nel frattempo l'operatore modifica la lead
    const originale = plexus.client.leadDiEvento
    plexus.client.leadDiEvento = async (id) => {
      const esito = await originale(id)
      await aggiornaLead(lead.uuid, { note: 'modificata mentre scarico' }, archivio)
      return esito
    }
    await motore.sincronizza()
    expect((await archivio.lead.get(lead.uuid))?.note).toBe('modificata mentre scarico')
    plexus.client.leadDiEvento = originale
    await motore.sincronizza()
    expect(plexus.lead[0].note).toBe('modificata mentre scarico')
  })

  it('tempo scaduto su una foto: conta il tentativo e le altre operazioni proseguono', async () => {
    const { archivio, plexus, motore } = await ambienteMotore({ attesa: 60_000 })
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const a = await creaLead(evento.uuid, { nome: 'A' }, archivio)
    await aggiungiFoto(a.uuid, 'biglietto', FOTO, archivio)
    const b = await creaLead(evento.uuid, { nome: 'B' }, archivio)
    await motore.sincronizza() // evento + lead partono, poi le foto...
    expect(plexus.lead).toHaveLength(2)
    // riproviamo con un timeout sulla prossima foto
    await aggiungiFoto(b.uuid, 'volto', FOTO, archivio)
    const prima = plexus.foto.length
    plexus.prossimiErrori.push(null, new ErrorePlexus('timeout', null, 'tempo scaduto')) // GET /eventi ok, prima foto in timeout
    const esito = await motore.sincronizza()
    expect(esito.errore).toBeUndefined() // il ciclo NON si è fermato
    const ops = await operazioniAperte(archivio)
    expect(ops.filter((o) => o.stato === 'errore')).toHaveLength(1)
    expect(ops[0].tentativi).toBe(1)
    expect(plexus.foto.length).toBeGreaterThanOrEqual(prima) // l'altra foto è partita o partirà
  })

  it('404 sulla lead (evento sparito da Plexus): l\'evento nato sull\'app viene rimandato e la lead segue', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await motore.sincronizza()
    plexus.eventi.length = 0 // cancellato in Plexus
    await creaLead(evento.uuid, { nome: 'Anna' }, archivio)
    await motore.sincronizza()
    await archivio.coda.toCollection().modify({ prossimo_tentativo: new Date(0).toISOString() })
    await motore.sincronizza()
    expect(plexus.eventi).toHaveLength(1)
    expect(plexus.eventi[0].uuid_app).toBe(evento.uuid)
    expect(plexus.lead).toHaveLength(1)
    expect(await operazioniAperte(archivio)).toHaveLength(0)
  })

  it('permesso negato (403): le sincronizzazioni automatiche vengono saltate', async () => {
    const { motore, plexus } = await ambienteMotore()
    plexus.prossimiErrori.push(new ErrorePlexus('http', 403, 'nessun permesso'))
    await motore.sincronizza()
    expect(motore.leggiStato().collegamento?.stato).toBe('permesso_negato')
    expect(await motore.sincronizza('timer')).toMatchObject({ saltata: 'permesso_negato' })
  })
})

describe('motore: API 1.1', () => {
  it('foto con uuid: un invio ripetuto (app chiusa a metà) non crea doppioni', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const lead = await creaLead(evento.uuid, { nome: 'Anna' }, archivio)
    const foto = await aggiungiFoto(lead.uuid, 'biglietto', FOTO, archivio)
    await motore.sincronizza()
    expect(plexus.foto).toHaveLength(1)
    expect(plexus.chiamateA('/lead/1/foto', 'POST')[0].corpo).toMatchObject({ uuid: foto.uuid })
    // simuliamo la risposta persa: l'operazione risulta ancora da fare
    await archivio.foto.update(foto.uuid, { plexus_foto_id: null })
    await accodaDiNuovo(archivio, 'carica_foto', foto.uuid)
    await motore.sincronizza()
    expect(plexus.foto).toHaveLength(1)
    expect((await archivio.foto.get(foto.uuid))?.plexus_foto_id).toBe(1)
  })

  it('foto scattate da un altro dispositivo vengono scaricate e collegate', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const lead = await creaLead(evento.uuid, { nome: 'Anna' }, archivio)
    await motore.sincronizza()
    plexus.foto.push({ id: 99, lead_id: 1, tipo: 'volto', dimensione: 5000, nome: 'altro.jpg', uuid: 'foto-altro-dispositivo', byte: blobFinto(5000) })
    await motore.sincronizza()
    const locali = await archivio.foto.where('lead_uuid').equals(lead.uuid).toArray()
    expect(locali).toHaveLength(1)
    expect(locali[0]).toMatchObject({ uuid: 'foto-altro-dispositivo', plexus_foto_id: 99, tipo: 'volto' })
    expect(locali[0].blob.size).toBe(5000)
    expect(plexus.chiamateA('/lead/1/foto/99', 'GET')).toHaveLength(1)
    // un secondo giro non la riscarica
    await motore.sincronizza()
    expect(plexus.chiamateA('/lead/1/foto/99', 'GET')).toHaveLength(1)
  })

  it('esito della mail letto da Plexus: visibile anche su un altro dispositivo, e "gia_inviato" resta "inviato"', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    const mia = await creaLead(evento.uuid, { nome: 'Anna', email: 'anna@clinica.it' }, archivio)
    await motore.sincronizza()
    // una lead nata altrove, la cui mail è partita
    const altra = plexus.aggiungiLeadPlexus(1, { nome: 'Altrove', email: 'altrove@x.it' })
    plexus.ringraziamenti.set(altra.id, { esito: 'inviato', inviato_il: '2026-10-16T12:00:00' })
    await motore.sincronizza()
    const locale = (await archivio.lead.toArray()).find((l) => l.nome === 'Altrove')!
    expect(locale.ringraziamento).toMatchObject({ esito: 'inviato', inviato_il: '2026-10-16T12:00:00' })
    // rimando la mia: Plexus risponde gia_inviato → resta "inviato"
    await aggiornaLead(mia.uuid, { note: 'x' }, archivio)
    await motore.sincronizza()
    expect((await archivio.lead.get(mia.uuid))?.ringraziamento?.esito).toBe('inviato')
  })

  it('archiviare un evento: PUT con archiviato=true, l\'evento resta archiviato dopo il GET con gli archiviati', async () => {
    const { archivio, plexus, motore } = await ambienteMotore()
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await motore.sincronizza()
    await archiviaEvento(evento.uuid, true, archivio)
    await motore.sincronizza()
    expect(plexus.eventi[0].archiviato).toBe(true)
    expect(plexus.chiamateA('/eventi?archiviati=1', 'GET').length).toBeGreaterThan(0)
    expect((await archivio.eventi.get(evento.uuid))?.archiviato).toBe(true)
    // archiviato in Plexus da un altro dispositivo → arriva anche qui
    const altro = plexus.aggiungiEventoPlexus({ nome: 'Chiuso altrove', archiviato: true })
    await motore.sincronizza()
    expect((await archivio.eventi.toArray()).find((e) => e.plexus_id === altro.id)?.archiviato).toBe(true)
  })

  it('un evento creato offline e subito archiviato: POST e poi PUT archiviato', async () => {
    const { archivio, plexus, motore, rete } = await ambienteMotore({ online: false })
    const evento = await creaEvento(CAMPI_EVENTO_PROVA, archivio)
    await archiviaEvento(evento.uuid, true, archivio)
    rete.online = true
    await motore.sincronizza()
    expect(plexus.eventi).toHaveLength(1)
    expect(plexus.eventi[0].archiviato).toBe(true)
    expect(plexus.chiamateA('/eventi', 'POST')[0].corpo).toMatchObject({ ringraziamento_attivo: true, categorie_suggerite: CAMPI_EVENTO_PROVA.categorie_suggerite })
  })
})

describe('motore: stato di Plexus rinfrescato', () => {
  it('un collegamento salvato come 1.0 scopre da solo che Plexus è passato alla 1.1', async () => {
    const { motore, plexus } = await ambienteMotore({ api: '1.0' })
    expect(motore.leggiStato().collegamento?.api).toBe('1.0')
    plexus.api = '1.1'
    plexus.posta_lead_pronta = false
    await motore.sincronizza()
    expect(motore.leggiStato().collegamento?.api).toBe('1.1')
    expect(motore.leggiStato().collegamento?.posta_lead_pronta).toBe(false)
    expect(plexus.chiamateA('/stato', 'GET')).toHaveLength(1)
    await motore.sincronizza()
    expect(plexus.chiamateA('/stato', 'GET')).toHaveLength(1) // non a ogni ciclo
  })
})
