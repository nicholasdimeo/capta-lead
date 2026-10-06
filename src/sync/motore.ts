// Il motore di sincronizzazione: svuota la coda verso Plexus e riporta indietro ciò che Plexus sa.
// È separato dall'interfaccia: la UI lo osserva (iscriviti) e può chiedergli di partire (sincronizza).
//
// Ciclo di una sincronizzazione:
//   1. se non c'è collegamento o non c'è rete → non fa nulla;
//   2. GET /eventi → allinea gli eventi locali (questionari compresi);
//   3. svuota la coda in ordine: eventi → questionari → lead → foto (ognuno aspetta ciò da cui dipende);
//   4. GET /eventi/{id}/lead per allineare gli stati delle lead (mail partita, ecc.).
// Gli errori di rete fermano il ciclo (si riprova al ritorno della rete); gli errori "definitivi"
// (400, 404, 413) lasciano l'operazione in errore con un'attesa lunga, finché i dati non vengono corretti.
import type { ArchivioLocale } from '../dati/db'
import type { CollegamentoPlexus, Evento, Lead, Operazione, StatoCollegamento } from '../dati/tipi'
import type { LeadPlexus } from '../plexus/tipi'
import { accoda, operazioniAperte } from '../dati/coda'
import { leggiImpostazione, salvaImpostazione, cancellaImpostazione } from '../dati/archivio'
import { creaClientPlexus, ErrorePlexus, type ClientPlexus } from '../plexus/client'
import { questionarioPerPlexus, versioneApiAlmeno, type CorpoLead, type CorpoModificaEvento, type StatoPlexus } from '../plexus/tipi'
import { allineaEventi, allineaFoto, allineaLead } from './allineamento'
import { ascoltaCoda, segnalaCodaCambiata } from './segnali'
import { adesso } from '../utils/date'
import { nomeFileFoto } from '../utils/immagini'

export const CHIAVE_COLLEGAMENTO = 'plexus'
export const CHIAVE_ULTIMA_SYNC = 'ultima_sincronizzazione'

export type MotivoSalto = 'non_collegato' | 'offline' | 'token_non_valido' | 'permesso_negato' | 'gia_in_corso' | 'altra_scheda'

export interface EsitoSync {
  eseguita: boolean
  saltata?: MotivoSalto
  inviate: number
  fallite: number
  errore?: string
}

export interface StatoMotore {
  inCorso: boolean
  ultimaSync: string | null
  ultimoEsito: EsitoSync | null
  collegamento: CollegamentoPlexus | null
}

export interface OpzioniMotore {
  creaClient?: (url: string, token: string) => ClientPlexus
  online?: () => boolean
  attesaPerTentativo?: (tentativi: number, permanente: boolean) => number
  /** ogni quanti ms allineare di nuovo le lead di uno stesso evento (0 = sempre) */
  intervalloAllineamentoLead?: number
  periodoTimerMs?: number
}

/** Attesa crescente: 5 s, 15 s, 45 s, … fino a 10 minuti; per gli errori definitivi 6 ore. */
export function attesaPredefinita(tentativi: number, permanente: boolean): number {
  if (permanente) return 6 * 60 * 60 * 1000
  return Math.min(5000 * 3 ** Math.max(0, tentativi - 1), 10 * 60 * 1000)
}

type Ascoltatore = (stato: StatoMotore) => void

export class MotoreSincronizzazione {
  private stato: StatoMotore = { inCorso: false, ultimaSync: null, ultimoEsito: null, collegamento: null }
  private ascoltatori = new Set<Ascoltatore>()
  private readonly creaClient: (url: string, token: string) => ClientPlexus
  private readonly online: () => boolean
  private readonly attesa: (tentativi: number, permanente: boolean) => number
  private readonly intervalloAllineamentoLead: number
  private readonly periodoTimerMs: number
  private ultimoAllineamentoLead = new Map<string, number>()
  /** quando è stato riletto GET /stato l'ultima volta (versione API, casella pronta): si rinfresca ogni 30 minuti */
  private ultimaLetturaStato = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private pulizie: (() => void)[] = []
  private richiestaInAttesa = false
  private avviato = false
  /** cambia a ogni avvia()/ferma(): un avvio "vecchio" che finisce dopo un ferma() non registra nulla */
  private generazione = 0
  private saltiAltraScheda = 0

  constructor(
    private readonly archivio: ArchivioLocale,
    opzioni: OpzioniMotore = {},
  ) {
    this.creaClient = opzioni.creaClient ?? ((url, token) => creaClientPlexus(url, token))
    this.online = opzioni.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
    this.attesa = opzioni.attesaPerTentativo ?? attesaPredefinita
    this.intervalloAllineamentoLead = opzioni.intervalloAllineamentoLead ?? 90_000
    this.periodoTimerMs = opzioni.periodoTimerMs ?? 60_000
  }

  // ---------- osservazione ----------
  leggiStato(): StatoMotore {
    return this.stato
  }
  iscriviti(a: Ascoltatore): () => void {
    this.ascoltatori.add(a)
    a(this.stato)
    return () => this.ascoltatori.delete(a)
  }
  private aggiorna(parziale: Partial<StatoMotore>): void {
    this.stato = { ...this.stato, ...parziale }
    for (const a of this.ascoltatori) a(this.stato)
  }

  // ---------- avvio / arresto ----------
  /** Carica il collegamento salvato e rimette in attesa le operazioni rimaste "in corso" (app chiusa a metà invio). */
  async prepara(): Promise<void> {
    const collegamento = await leggiImpostazione<CollegamentoPlexus | null>(CHIAVE_COLLEGAMENTO, null, this.archivio)
    const ultimaSync = await leggiImpostazione<string | null>(CHIAVE_ULTIMA_SYNC, null, this.archivio)
    await this.archivio.coda.where('stato').equals('in_corso').modify({ stato: 'in_attesa' })
    this.aggiorna({ collegamento, ultimaSync })
  }

  /** prepara() + automatismi: parte subito, poi a ogni salvataggio, al ritorno della rete, quando l'app torna visibile e a intervalli. */
  async avvia(): Promise<void> {
    if (this.avviato) return
    this.avviato = true
    const generazione = ++this.generazione
    await this.prepara()
    if (!this.avviato || generazione !== this.generazione) return // nel frattempo è arrivato ferma()

    this.pulizie.push(ascoltaCoda(() => void this.sincronizza('coda')))
    if (typeof window !== 'undefined') {
      const suOnline = () => void this.sincronizza('rete')
      const suVisibile = () => {
        if (document.visibilityState === 'visible') void this.sincronizza('ritorno')
      }
      window.addEventListener('online', suOnline)
      document.addEventListener('visibilitychange', suVisibile)
      this.pulizie.push(() => window.removeEventListener('online', suOnline), () => document.removeEventListener('visibilitychange', suVisibile))
    }
    if (this.periodoTimerMs > 0) {
      if (this.timer) clearInterval(this.timer)
      this.timer = setInterval(() => void this.sincronizza('timer'), this.periodoTimerMs)
    }
    void this.sincronizza('avvio')
  }

  ferma(): void {
    this.generazione++
    for (const p of this.pulizie) p()
    this.pulizie = []
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.avviato = false
  }

  // ---------- collegamento ----------
  /** Verifica indirizzo e codice con GET /stato e, se va bene, salva il collegamento sul dispositivo. */
  async collega(url: string, token: string): Promise<StatoPlexus> {
    const client = this.creaClient(url, token)
    const stato = await client.stato()
    const collegamento: CollegamentoPlexus = {
      url: url.trim(),
      token: token.trim(),
      piattaforma: stato.piattaforma ?? 'Plexus',
      azienda: stato.azienda ?? '',
      utente: stato.utente ?? { nome: '', email: '', ruolo: '' },
      posta_lead_pronta: Boolean(stato.posta_lead_pronta),
      ai_pronta: Boolean(stato.ai_pronta),
      lingue: stato.lingue ?? {},
      linee: stato.linee ?? {},
      tipi_foto: stato.tipi_foto ?? [],
      api: typeof stato.api === 'string' && stato.api ? stato.api : '1.0',
      collegato_il: adesso(),
      stato: 'ok',
    }
    await salvaImpostazione(CHIAVE_COLLEGAMENTO, collegamento, this.archivio)
    this.aggiorna({ collegamento })
    this.ultimoAllineamentoLead.clear()
    this.ultimaLetturaStato = Date.now()
    void this.sincronizza('collegamento')
    return stato
  }

  /** Toglie il collegamento dal dispositivo. La coda resta: ripartirà al prossimo collegamento. */
  async scollega(): Promise<void> {
    await cancellaImpostazione(CHIAVE_COLLEGAMENTO, this.archivio)
    this.aggiorna({ collegamento: null })
  }

  /** true se il Plexus collegato ha l'API 1.1 (PUT eventi, foto con uuid, elenco foto, archiviazione). */
  private supporta11(): boolean {
    return versioneApiAlmeno(this.stato.collegamento?.api ?? '1.0', '1.1')
  }

  private async segnaCollegamento(stato: StatoCollegamento): Promise<void> {
    const c = this.stato.collegamento
    if (!c || c.stato === stato) return
    const aggiornato = { ...c, stato }
    await salvaImpostazione(CHIAVE_COLLEGAMENTO, aggiornato, this.archivio)
    this.aggiorna({ collegamento: aggiornato })
  }

  // ---------- sincronizzazione ----------
  private cicloAttuale: Promise<EsitoSync> | null = null
  private cicloSuccessivo: Promise<EsitoSync> | null = null

  /**
   * Fa un ciclo completo e restituisce l'esito. Se un ciclo è già in corso, aspetta che finisca e ne fa
   * un altro subito dopo (più richieste arrivate nel frattempo vengono unite in un solo ciclo).
   */
  sincronizza(motivo = 'manuale', opzioni: { forzaLead?: boolean } = {}): Promise<EsitoSync> {
    const c = this.stato.collegamento
    if (!c) return Promise.resolve({ eseguita: false, saltata: 'non_collegato', inviate: 0, fallite: 0 })
    if (!this.online()) return Promise.resolve({ eseguita: false, saltata: 'offline', inviate: 0, fallite: 0 })
    if ((c.stato === 'token_non_valido' || c.stato === 'permesso_negato') && motivo !== 'manuale' && motivo !== 'collegamento') {
      return Promise.resolve({ eseguita: false, saltata: c.stato, inviate: 0, fallite: 0 })
    }
    if (this.cicloAttuale) {
      if (!this.cicloSuccessivo) {
        this.cicloSuccessivo = this.cicloAttuale
          .catch(() => undefined)
          .then(() => {
            this.cicloSuccessivo = null
            return this.sincronizza(motivo, opzioni)
          })
      }
      return this.cicloSuccessivo
    }
    this.cicloAttuale = this.eseguiCiclo(c, opzioni.forzaLead || motivo === 'manuale').finally(() => {
      this.cicloAttuale = null
    })
    return this.cicloAttuale
  }

  private async eseguiCiclo(c: CollegamentoPlexus, forzaLead: boolean): Promise<EsitoSync> {
    this.aggiorna({ inCorso: true })
    let esito: EsitoSync = { eseguita: false, inviate: 0, fallite: 0 }
    // Se durante il ciclo il motore ha dovuto accodare operazioni mancanti (auto-riparazione),
    // fa subito un altro giro, al massimo tre volte, così chi aspetta trova la coda davvero svuotata.
    for (let giro = 0; giro < 3; giro++) {
      this.richiestaInAttesa = false
      try {
        const parziale = await this.conBloccoTraSchede(() => this.ciclo(c, forzaLead))
        esito = { ...parziale, inviate: esito.inviate + parziale.inviate, fallite: esito.fallite + parziale.fallite }
      } catch (e) {
        esito = { ...esito, eseguita: true, errore: e instanceof Error ? e.message : String(e) }
      }
      if (!this.richiestaInAttesa || !esito.eseguita || esito.errore) break
    }
    if (esito.eseguita && !esito.errore) {
      const ora = adesso()
      await salvaImpostazione(CHIAVE_ULTIMA_SYNC, ora, this.archivio)
      this.aggiorna({ ultimaSync: ora })
    }
    this.aggiorna({ inCorso: false, ultimoEsito: esito })
    return esito
  }

  /**
   * Con più schede aperte dell'app, solo una alla volta sincronizza (Web Locks, se il browser li ha).
   * Se un'altra scheda tiene il blocco troppo a lungo (es. congelata in sottofondo), dopo 5 tentativi lo si prende.
   */
  private async conBloccoTraSchede(lavoro: () => Promise<EsitoSync>): Promise<EsitoSync> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (!locks) return lavoro()
    const opzioni: LockOptions = this.saltiAltraScheda >= 5 ? { steal: true } : { ifAvailable: true }
    return locks.request('leadstand-sincronizzazione', opzioni, async (blocco) => {
      if (!blocco) {
        this.saltiAltraScheda++
        return { eseguita: false, saltata: 'altra_scheda' as MotivoSalto, inviate: 0, fallite: 0 }
      }
      this.saltiAltraScheda = 0
      return lavoro()
    })
  }

  private async ciclo(c: CollegamentoPlexus, forzaLead: boolean): Promise<EsitoSync> {
    const client = this.creaClient(c.url, c.token)
    const esito: EsitoSync = { eseguita: true, inviate: 0, fallite: 0 }

    // 0. ogni tanto rilegge GET /stato: la versione dell'API e la casella di posta possono cambiare lato Plexus
    if (Date.now() - this.ultimaLetturaStato > 30 * 60_000) {
      try {
        const stato = await client.stato()
        this.ultimaLetturaStato = Date.now()
        const aggiornato: CollegamentoPlexus = {
          ...c,
          api: typeof stato.api === 'string' && stato.api ? stato.api : c.api ?? '1.0',
          azienda: stato.azienda ?? c.azienda,
          utente: stato.utente ?? c.utente,
          posta_lead_pronta: Boolean(stato.posta_lead_pronta),
          ai_pronta: Boolean(stato.ai_pronta),
          lingue: stato.lingue ?? c.lingue,
          linee: stato.linee ?? c.linee,
          tipi_foto: stato.tipi_foto ?? c.tipi_foto,
          stato: 'ok',
        }
        if (JSON.stringify(aggiornato) !== JSON.stringify(c)) {
          await salvaImpostazione(CHIAVE_COLLEGAMENTO, aggiornato, this.archivio)
          this.aggiorna({ collegamento: aggiornato })
        }
      } catch (e) {
        const fermati = await this.gestisciErroreGlobale(e)
        if (fermati) return { ...esito, errore: fermati }
      }
    }

    // 1. eventi da Plexus
    try {
      const schede = await client.eventi(this.supporta11())
      await allineaEventi(this.archivio, schede)
      await this.segnaCollegamento('ok')
    } catch (e) {
      const fermati = await this.gestisciErroreGlobale(e)
      if (fermati) return { ...esito, errore: fermati }
    }

    // 2. coda, in ordine di dipendenza: prima gli eventi, poi i questionari, poi le lead, infine le foto
    const aperte = ordinaPerDipendenza(await operazioniAperte(this.archivio))
    const ora = Date.now()
    for (const op of aperte) {
      if (new Date(op.prossimo_tentativo).getTime() > ora) continue
      const risultato = await this.eseguiOperazione(client, op)
      if (risultato === 'ok') esito.inviate++
      else if (risultato === 'fallita') esito.fallite++
      else if (risultato === 'stop') {
        esito.errore = 'interrotta'
        return esito
      }
    }

    // 3. stati delle lead
    await this.allineaStatiLead(client, forzaLead)
    return esito
  }

  /** Per gli errori 401/403 segna il collegamento; per la rete ferma il ciclo. Restituisce il motivo se bisogna fermarsi. */
  private async gestisciErroreGlobale(e: unknown): Promise<string | null> {
    if (e instanceof ErrorePlexus) {
      if (e.codice === 401) {
        await this.segnaCollegamento('token_non_valido')
        return 'token_non_valido'
      }
      if (e.codice === 403) {
        await this.segnaCollegamento('permesso_negato')
        return 'permesso_negato'
      }
      if (e.tipo === 'rete' || e.tipo === 'timeout') return 'rete'
      return null
    }
    return e instanceof Error ? e.message : String(e)
  }

  private async eseguiOperazione(client: ClientPlexus, op: Operazione): Promise<'ok' | 'fallita' | 'saltata' | 'stop'> {
    const id = op.id as number
    // prima di partire, controlla le dipendenze (l'evento deve avere il numero di Plexus, la lead pure)
    try {
      const pronta = await this.dipendenzePronte(op)
      if (!pronta) return 'saltata'
    } catch (e) {
      await this.segnaErrore(op, e)
      return 'fallita'
    }
    await this.archivio.coda.update(id, { stato: 'in_corso', aggiornato_il: adesso() })
    try {
      const fatta = await this.invia(client, op)
      await this.archivio.coda.update(id, { stato: 'completata', completata_il: adesso(), aggiornato_il: adesso(), ultimo_errore: null, codice_errore: null })
      return fatta ? 'ok' : 'saltata'
    } catch (e) {
      // Tempo scaduto su QUESTA operazione (es. foto grande su rete lenta): è un errore suo, con attesa
      // crescente; le altre operazioni proseguono. Diverso dalla rete del tutto assente, che ferma il ciclo.
      if (e instanceof ErrorePlexus && e.tipo === 'timeout') {
        await this.segnaErrore(op, e)
        return 'fallita'
      }
      const fermati = await this.gestisciErroreGlobale(e)
      if (fermati === 'token_non_valido' || fermati === 'permesso_negato' || fermati === 'rete') {
        // non è colpa dell'operazione: la rimettiamo in attesa senza contare il tentativo
        await this.archivio.coda.update(id, { stato: 'in_attesa', aggiornato_il: adesso(), ultimo_errore: e instanceof Error ? e.message : String(e) })
        return 'stop'
      }
      if (e instanceof ErrorePlexus && e.codice === 404 && (await this.riparaDopo404(op))) {
        await this.archivio.coda.update(id, { stato: 'in_attesa', tentativi: op.tentativi + 1, prossimo_tentativo: new Date(Date.now() + this.attesa(1, false)).toISOString(), ultimo_errore: e.message, codice_errore: 404, aggiornato_il: adesso() })
        return 'saltata'
      }
      await this.segnaErrore(op, e)
      return 'fallita'
    }
  }

  /**
   * Plexus non conosce più l'oggetto da cui dipende l'operazione (evento o lead cancellati lì, o numero sbagliato):
   * se l'oggetto è nato sull'app lo si rimanda (stesso uuid → Plexus lo ricrea) e l'operazione aspetta. true se riparato.
   */
  private async riparaDopo404(op: Operazione): Promise<boolean> {
    if (op.tipo === 'invia_lead' || op.tipo === 'aggiorna_questionario') {
      const eventoUuid = op.tipo === 'invia_lead' ? (await this.archivio.lead.get(op.riferimento))?.evento_uuid : op.riferimento
      if (!eventoUuid) return false
      const evento = await this.archivio.eventi.get(eventoUuid)
      if (!evento || evento.origine !== 'app') return false
      await this.archivio.eventi.update(evento.uuid, { plexus_id: null })
      await this.assicuraOperazione('invia_evento', evento.uuid)
      return true
    }
    if (op.tipo === 'carica_foto') {
      const foto = await this.archivio.foto.get(op.riferimento)
      const lead = foto ? await this.archivio.lead.get(foto.lead_uuid) : undefined
      if (!lead || lead.solo_lettura) return false
      await this.archivio.lead.update(lead.uuid, { plexus_id: null })
      await this.assicuraOperazione('invia_lead', lead.uuid)
      return true
    }
    return false
  }

  private async segnaErrore(op: Operazione, e: unknown): Promise<void> {
    const tentativi = op.tentativi + 1
    const permanente = e instanceof ErrorePlexus ? e.permanente : false
    const codice = e instanceof ErrorePlexus ? e.codice : null
    await this.archivio.coda.update(op.id as number, {
      stato: 'errore',
      tentativi,
      prossimo_tentativo: new Date(Date.now() + this.attesa(tentativi, permanente)).toISOString(),
      ultimo_errore: e instanceof Error ? e.message : String(e),
      codice_errore: codice,
      aggiornato_il: adesso(),
    })
  }

  /** true se l'operazione può partire; false se deve aspettare un'altra operazione (che viene accodata se manca). */
  private async dipendenzePronte(op: Operazione): Promise<boolean> {
    if (op.tipo === 'invia_lead') {
      const lead = await this.archivio.lead.get(op.riferimento)
      if (!lead) return true // la lead non c'è più: l'operazione si chiude da sola in invia()
      return this.eventoPronto(lead.evento_uuid)
    }
    if (op.tipo === 'carica_foto') {
      const foto = await this.archivio.foto.get(op.riferimento)
      if (!foto) return true
      const lead = await this.archivio.lead.get(foto.lead_uuid)
      if (!lead) return true
      if (lead.plexus_id !== null) return true
      await this.assicuraOperazione('invia_lead', lead.uuid)
      return false
    }
    if (op.tipo === 'aggiorna_questionario') {
      const evento = await this.archivio.eventi.get(op.riferimento)
      if (!evento) return true
      if (evento.plexus_id !== null) return true
      if (evento.origine === 'app') {
        await this.assicuraOperazione('invia_evento', evento.uuid)
        return false
      }
      throw new ErrorePlexus('http', 404, 'evento non ancora conosciuto da Plexus')
    }
    return true
  }

  private async eventoPronto(eventoUuid: string): Promise<boolean> {
    const evento = await this.archivio.eventi.get(eventoUuid)
    if (!evento) throw new Error('evento della lead non trovato sul dispositivo')
    if (evento.plexus_id !== null) return true
    if (evento.origine === 'app') {
      await this.assicuraOperazione('invia_evento', evento.uuid)
      return false
    }
    throw new ErrorePlexus('http', 404, 'evento non ancora conosciuto da Plexus')
  }

  /** Se manca un'operazione aperta di quel tipo per quell'oggetto, la accoda (auto-riparazione). */
  private async assicuraOperazione(tipo: Operazione['tipo'], riferimento: string): Promise<void> {
    const esistenti = await this.archivio.coda.where('[tipo+riferimento]').equals([tipo, riferimento]).toArray()
    if (esistenti.some((o) => o.stato !== 'completata')) return
    await accoda(this.archivio, tipo, riferimento)
    this.richiestaInAttesa = true
  }

  /** Esegue davvero la chiamata. Restituisce false se non c'era nulla da inviare (oggetto cancellato). */
  private async invia(client: ClientPlexus, op: Operazione): Promise<boolean> {
    switch (op.tipo) {
      case 'invia_evento': {
        const evento = await this.archivio.eventi.get(op.riferimento)
        if (!evento) return false
        const v11 = this.supporta11()
        const campi: CorpoModificaEvento = {
          nome: evento.nome,
          luogo: evento.luogo,
          data_inizio: evento.data_inizio,
          data_fine: evento.data_fine,
          note: evento.note,
          lingua: evento.lingua,
          linea: evento.linea,
          questionario: questionarioPerPlexus(evento.questionario, v11),
        }
        if (v11) {
          campi.ringraziamento_attivo = evento.ringraziamento_attivo
          campi.categorie_suggerite = evento.categorie_suggerite
        }
        if (evento.plexus_id === null || (!v11 && evento.origine === 'app')) {
          // Plexus non conosce ancora l'evento (o è una 1.0: il POST con lo stesso uuid vale come aggiornamento)
          if (evento.origine !== 'app') return false
          const { evento: scheda } = await client.creaEvento({ uuid: evento.uuid, ...campi, nome: evento.nome, luogo: evento.luogo, data_inizio: evento.data_inizio, data_fine: evento.data_fine, note: evento.note, lingua: evento.lingua, linea: evento.linea })
          await this.archivio.eventi.update(evento.uuid, { plexus_id: scheda.id, ringraziamento_attivo: scheda.ringraziamento_attivo !== false })
          if (evento.archiviato && v11) await client.modificaEvento(scheda.id, { archiviato: true })
          return true
        }
        if (!v11) {
          // 1.0, evento nato in Plexus: l'unica modifica possibile è il questionario
          await client.aggiornaQuestionario(evento.plexus_id, questionarioPerPlexus(evento.questionario, false))
          return true
        }
        const scheda = await client.modificaEvento(evento.plexus_id, { ...campi, archiviato: evento.archiviato })
        await this.archivio.eventi.update(evento.uuid, { ringraziamento_attivo: scheda.ringraziamento_attivo !== false })
        return true
      }
      case 'aggiorna_questionario': {
        const evento = await this.archivio.eventi.get(op.riferimento)
        if (!evento || evento.plexus_id === null) return false
        await client.aggiornaQuestionario(evento.plexus_id, questionarioPerPlexus(evento.questionario, this.supporta11()))
        return true
      }
      case 'invia_lead': {
        const lead = await this.archivio.lead.get(op.riferimento)
        if (!lead) return false
        const evento = await this.archivio.eventi.get(lead.evento_uuid)
        if (!evento || evento.plexus_id === null) throw new Error('evento non pronto')
        const risposta = await client.creaLead(evento.plexus_id, corpoLead(lead))
        // Esito della mail: "gia_inviato" (1.1) vuol dire che era già partita. Con una 1.0 l'invio ripetuto
        // risponde "saltato: già spedito": non deve cancellare il ricordo della mail partita la prima volta.
        let ringraziamento = lead.ringraziamento
        const r = risposta.ringraziamento
        if (r && r.esito === 'gia_inviato') {
          ringraziamento = { esito: 'inviato', dettaglio: lead.ringraziamento?.esito === 'inviato' ? lead.ringraziamento.dettaglio : (r.dettaglio ?? ''), inviato_il: lead.ringraziamento?.inviato_il ?? null }
        } else if (r && r.esito !== 'gia_inviato' && !(r.esito === 'saltato' && lead.ringraziamento?.esito === 'inviato')) {
          ringraziamento = { esito: r.esito, dettaglio: r.dettaglio ?? '', inviato_il: r.esito === 'inviato' ? adesso() : null }
        }
        await this.archivio.lead.update(lead.uuid, {
          plexus_id: risposta.lead?.id ?? lead.plexus_id,
          plexus_stato: risposta.lead?.stato ?? lead.plexus_stato,
          inviata_il: adesso(),
          ringraziamento,
        })
        this.ultimoAllineamentoLead.delete(evento.uuid)
        return true
      }
      case 'carica_foto': {
        const foto = await this.archivio.foto.get(op.riferimento)
        if (!foto) return false
        if (foto.plexus_foto_id !== null) return false
        const lead = await this.archivio.lead.get(foto.lead_uuid)
        if (!lead || lead.plexus_id === null) throw new Error('lead non pronta')
        // l'uuid della foto (1.1) fa sì che un invio ripetuto non crei doppioni: Plexus risponde con lo stesso numero
        const { foto_id } = await client.caricaFoto(lead.plexus_id, foto.blob, foto.tipo, nomeFileFoto(foto.mime, foto.uuid), foto.uuid)
        await this.archivio.foto.update(foto.uuid, { plexus_foto_id: foto_id })
        return true
      }
    }
  }

  /**
   * (1.1) Per le lead che su Plexus hanno più foto di quelle che conosciamo, chiede l'elenco e scarica le mancanti
   * (foto scattate da un altro dispositivo, o da questo prima di una reinstallazione).
   */
  private async allineaFotoMancanti(client: ClientPlexus, evento: Evento, remote: LeadPlexus[]): Promise<void> {
    for (const remota of remote) {
      if (!remota.n_foto) continue
      const lead = await this.archivio.lead.where('evento_uuid').equals(evento.uuid).filter((l) => l.plexus_id === remota.id).first()
      if (!lead) continue
      const locali = await this.archivio.foto.where('lead_uuid').equals(lead.uuid).toArray()
      const conNumero = locali.filter((f) => f.plexus_foto_id !== null).length
      if (conNumero >= remota.n_foto) continue
      const elenco = await client.fotoDiLead(remota.id)
      await allineaFoto(this.archivio, lead, elenco, (fotoId) => client.scaricaFoto(remota.id, fotoId))
    }
  }

  /** GET /eventi/{id}/lead per gli eventi conosciuti da Plexus (non più spesso di intervalloAllineamentoLead). */
  private async allineaStatiLead(client: ClientPlexus, forza: boolean): Promise<void> {
    const eventi = (await this.archivio.eventi.toArray()).filter((e) => e.plexus_id !== null)
    if (eventi.length === 0) return
    const ora = Date.now()
    for (const evento of eventi) {
      const ultimo = this.ultimoAllineamentoLead.get(evento.uuid) ?? 0
      if (!forza && this.intervalloAllineamentoLead > 0 && ora - ultimo < this.intervalloAllineamentoLead) continue
      try {
        const lead = await client.leadDiEvento(evento.plexus_id as number)
        await allineaLead(this.archivio, evento, lead)
        if (this.supporta11()) await this.allineaFotoMancanti(client, evento, lead)
        this.ultimoAllineamentoLead.set(evento.uuid, Date.now())
      } catch (e) {
        const fermati = await this.gestisciErroreGlobale(e)
        if (fermati) return
      }
    }
  }
}

const PRIORITA: Record<Operazione['tipo'], number> = { invia_evento: 0, aggiorna_questionario: 1, invia_lead: 2, carica_foto: 3 }

/** Ordina le operazioni così che ciò da cui dipendono le altre venga sempre prima (a parità, per ordine di creazione). */
export function ordinaPerDipendenza(operazioni: Operazione[]): Operazione[] {
  return [...operazioni].sort((a, b) => PRIORITA[a.tipo] - PRIORITA[b.tipo] || (a.id ?? 0) - (b.id ?? 0))
}

/** Costruisce il corpo di POST /eventi/{id}/lead a partire da una lead locale (solo campi del contratto). */
export function corpoLead(lead: Lead): CorpoLead {
  const corpo: CorpoLead = {
    uuid: lead.uuid,
    nome: lead.nome,
    cognome: lead.cognome,
    email: lead.email,
    telefono: lead.telefono,
    azienda: lead.azienda,
    professione: lead.professione,
    citta: lead.citta,
    provincia: lead.provincia,
    indirizzo: lead.indirizzo,
    note: lead.note,
    categoria: lead.categoria,
    risposte: { ...lead.risposte },
  }
  if (lead.lingua) corpo.lingua = lead.lingua
  if (lead.consenso !== null) corpo.consenso = lead.consenso
  return corpo
}

/** Stato "umano" di una lead rispetto a Plexus, calcolato da lead + operazioni aperte. */
export type StatoInvioLead = 'locale' | 'in_coda' | 'in_invio' | 'errore' | 'rifiutata' | 'inviata' | 'modifiche_in_coda'

export function statoInvioLead(lead: Lead, operazioni: Operazione[], collegato: boolean): { stato: StatoInvioLead; errore: string | null } {
  const op = operazioni.find((o) => o.tipo === 'invia_lead' && o.riferimento === lead.uuid && o.stato !== 'completata')
  if (!collegato && lead.plexus_id === null) return { stato: 'locale', errore: null }
  if (!op) return { stato: lead.plexus_id !== null ? 'inviata' : 'locale', errore: null }
  if (op.stato === 'in_corso') return { stato: 'in_invio', errore: null }
  if (op.stato === 'errore') {
    const permanente = op.codice_errore !== null && [400, 404, 413, 422].includes(op.codice_errore)
    return { stato: permanente ? 'rifiutata' : 'errore', errore: op.ultimo_errore }
  }
  return { stato: lead.plexus_id !== null ? 'modifiche_in_coda' : 'in_coda', errore: null }
}

/** Stato di un evento rispetto a Plexus. */
export type StatoInvioEvento = 'locale' | 'in_coda' | 'errore' | 'inviato' | 'da_plexus'

export function statoInvioEvento(evento: Evento, operazioni: Operazione[], collegato: boolean): StatoInvioEvento {
  if (evento.origine === 'plexus') return 'da_plexus'
  const op = operazioni.find((o) => (o.tipo === 'invia_evento' || o.tipo === 'aggiorna_questionario') && o.riferimento === evento.uuid && o.stato !== 'completata')
  if (!collegato && evento.plexus_id === null) return 'locale'
  if (!op) return evento.plexus_id !== null ? 'inviato' : 'locale'
  if (op.stato === 'errore') return 'errore'
  return 'in_coda'
}

export { segnalaCodaCambiata }
