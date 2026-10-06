// Allineamento dei dati che ARRIVANO da Plexus (eventi, questionari, stato delle lead) con l'archivio locale.
// Regola: ciò che ha modifiche locali ancora da inviare non viene sovrascritto; il resto segue Plexus.
import type { ArchivioLocale } from '../dati/db'
import type { Domanda, Evento, Foto, Lead, Risposta } from '../dati/tipi'
import { TIPI_FOTO, type TipoFoto } from '../dati/tipi'
import type { FotoPlexus, LeadPlexus, SchedaEvento, DomandaPlexus } from '../plexus/tipi'
import { normalizzaQuestionario } from '../config/brand'
import { preparaImmagine } from '../utils/immagini'
import { brand } from '../config/brand'
import { nuovoUuid } from '../utils/uuid'
import { STATI_APERTI } from '../dati/coda'
import { adesso } from '../utils/date'

/**
 * Prende il questionario di Plexus e completa le traduzioni: quelle che Plexus manda (1.1) hanno la precedenza;
 * se mancano, si riattaccano quelle conosciute (evento locale, poi questionario predefinito del brand, stesso testo).
 */
export function arricchisciQuestionario(daPlexus: DomandaPlexus[], locale: Domanda[] = [], predefinito: Domanda[] = brand.questionario_predefinito): Domanda[] {
  const conosciute = new Map<string, Domanda>()
  for (const d of predefinito) conosciute.set(d.domanda, d)
  for (const d of locale) conosciute.set(d.domanda, d)
  return daPlexus.map((d) => {
    const voce: Domanda = { domanda: d.domanda, opzioni: [...d.opzioni], multipla: Boolean(d.multipla), consenso: Boolean(d.consenso) }
    if (d.traduzioni && Object.keys(d.traduzioni).length > 0) {
      const [normalizzata] = normalizzaQuestionario([d])
      if (normalizzata?.traduzioni) {
        voce.traduzioni = normalizzata.traduzioni
        return voce
      }
    }
    const nota = conosciute.get(d.domanda)
    if (nota?.traduzioni) {
      // le traduzioni valgono solo se le opzioni sono rimaste le stesse (stesso numero e stesso ordine)
      const stesseOpzioni = nota.opzioni.length === d.opzioni.length && nota.opzioni.every((o, i) => o === d.opzioni[i])
      if (stesseOpzioni) voce.traduzioni = nota.traduzioni
    }
    return voce
  })
}

function unione(a: string[], b: string[]): string[] {
  const esito: string[] = []
  for (const x of [...a, ...b]) if (x && !esito.includes(x)) esito.push(x)
  return esito
}

export interface EsitoAllineamentoEventi {
  creati: number
  aggiornati: number
}

/** uuid degli oggetti che hanno operazioni di quei tipi ancora da inviare (da chiamare DENTRO la transazione, così è aggiornato). */
async function conOperazioniAperte(archivio: ArchivioLocale, tipi: string[]): Promise<Set<string>> {
  const aperte = await archivio.coda.where('stato').anyOf([...STATI_APERTI]).toArray()
  return new Set(aperte.filter((o) => tipi.includes(o.tipo)).map((o) => o.riferimento))
}

/**
 * Inserisce/aggiorna in locale gli eventi ricevuti da GET /eventi.
 * Gli eventi con operazioni ancora da inviare (calcolati dentro la transazione, così una modifica fatta
 * un attimo prima non viene persa) ricevono solo il numero di Plexus, non i contenuti.
 * `conModificheLocali` permette ai test di forzare quell'insieme.
 */
export async function allineaEventi(archivio: ArchivioLocale, schede: SchedaEvento[], conModificheLocali?: Set<string>): Promise<EsitoAllineamentoEventi> {
  const esito: EsitoAllineamentoEventi = { creati: 0, aggiornati: 0 }
  await archivio.transaction('rw', archivio.eventi, archivio.coda, async () => {
    const conModifiche = conModificheLocali ?? (await conOperazioniAperte(archivio, ['invia_evento', 'aggiorna_questionario']))
    const locali = await archivio.eventi.toArray()
    const perPlexusId = new Map<number, Evento>()
    const perUuid = new Map<string, Evento>()
    for (const e of locali) {
      if (e.plexus_id !== null) perPlexusId.set(e.plexus_id, e)
      perUuid.set(e.uuid, e)
    }
    for (const scheda of schede) {
      // Abbinamento: prima per uuid (eventi nati sull'app); per numero solo se l'evento è nato in Plexus (senza uuid).
      let locale = scheda.uuid_app ? perUuid.get(scheda.uuid_app) : undefined
      const perNumero = perPlexusId.get(scheda.id)
      if (!locale && perNumero) {
        if (!scheda.uuid_app) locale = perNumero
        else {
          // quel numero ora appartiene a un altro evento (uuid diverso): l'evento locale lo perde
          await archivio.eventi.update(perNumero.uuid, { plexus_id: null })
          perPlexusId.delete(scheda.id)
        }
      }
      if (!locale) {
        const ora = adesso()
        const nuovo: Evento = {
          uuid: scheda.uuid_app ?? nuovoUuid(),
          nome: scheda.nome ?? '',
          luogo: scheda.luogo ?? '',
          data_inizio: scheda.data_inizio ?? '',
          data_fine: scheda.data_fine ?? '',
          note: scheda.note ?? '',
          lingua: scheda.lingua || brand.lingue.principale,
          linea: scheda.linea || brand.linea_predefinita,
          questionario: arricchisciQuestionario(scheda.questionario ?? []),
          categorie_suggerite: unione(scheda.categorie_suggerite ?? [], []),
          ringraziamento_attivo: scheda.ringraziamento_attivo !== false,
          archiviato: scheda.archiviato === true,
          origine: scheda.uuid_app ? 'app' : 'plexus',
          plexus_id: scheda.id,
          creato_il: ora,
          aggiornato_il: ora,
        }
        await archivio.eventi.add(nuovo)
        esito.creati++
        continue
      }
      if (conModifiche.has(locale.uuid)) {
        if (locale.plexus_id !== scheda.id) await archivio.eventi.update(locale.uuid, { plexus_id: scheda.id })
        continue
      }
      const aggiornato: Evento = {
        ...locale,
        plexus_id: scheda.id,
        nome: scheda.nome ?? locale.nome,
        luogo: scheda.luogo ?? locale.luogo,
        data_inizio: scheda.data_inizio ?? locale.data_inizio,
        data_fine: scheda.data_fine ?? locale.data_fine,
        note: scheda.note ?? locale.note,
        lingua: scheda.lingua || locale.lingua,
        linea: scheda.linea || locale.linea,
        ringraziamento_attivo: scheda.ringraziamento_attivo !== false,
        // Plexus 1.1 dice se l'evento è archiviato; una 1.0 non lo sa: si tiene il valore locale
        archiviato: scheda.archiviato === undefined ? locale.archiviato : scheda.archiviato === true,
        questionario: arricchisciQuestionario(scheda.questionario ?? [], locale.questionario),
        // le categorie dell'evento sono quelle di Plexus (dalla 1.1 le riceve dall'app e le conserva)
        categorie_suggerite: Array.isArray(scheda.categorie_suggerite) ? unione(scheda.categorie_suggerite, []) : locale.categorie_suggerite,
      }
      if (JSON.stringify(aggiornato) !== JSON.stringify(locale)) {
        aggiornato.aggiornato_il = adesso()
        await archivio.eventi.put(aggiornato)
        esito.aggiornati++
      }
    }
  })
  return esito
}

/** "2026-10-16T10:21:00" (ora locale di Plexus, senza fuso) → ISO; stringhe strane restano com'erano. */
function dataPlexusInIso(valore: string | null | undefined): string | null {
  if (!valore) return null
  const d = new Date(valore)
  return Number.isNaN(d.getTime()) ? valore : d.toISOString()
}

/**
 * Plexus salva le risposte multiple unite da virgola. Qui si prova a rifare l'elenco riconoscendo le opzioni
 * della domanda una dopo l'altra (prima le più lunghe, così "Listino, completo" non viene spezzata).
 * Se qualcosa non torna, la stringa resta com'è.
 */
export function spezzaRisposteMultiple(valore: string, opzioni: string[]): string[] | null {
  const perLunghezza = [...opzioni].sort((a, b) => b.length - a.length)
  const esito: string[] = []
  let resto = valore.trim()
  while (resto.length > 0) {
    const trovata = perLunghezza.find((o) => resto === o || resto.startsWith(`${o},`))
    if (!trovata) return null
    esito.push(trovata)
    resto = resto.slice(trovata.length).replace(/^,\s*/, '')
  }
  return esito.length ? esito : null
}

export function risposteDaPlexus(risposte: Record<string, string>, questionario: Domanda[]): Record<string, Risposta> {
  const esito: Record<string, Risposta> = {}
  for (const [domanda, valore] of Object.entries(risposte ?? {})) {
    const def = questionario.find((d) => d.domanda === domanda)
    if (def?.multipla && typeof valore === 'string') {
      const pezzi = spezzaRisposteMultiple(valore, def.opzioni)
      if (pezzi) {
        esito[domanda] = pezzi
        continue
      }
    }
    esito[domanda] = valore
  }
  return esito
}

export interface EsitoAllineamentoLead {
  importate: number
  aggiornate: number
}

const CAMPI_DA_PLEXUS = ['nome', 'cognome', 'email', 'telefono', 'azienda', 'professione', 'citta', 'provincia', 'indirizzo', 'note', 'categoria'] as const

/**
 * Allinea le lead di un evento con l'elenco ricevuto da GET /eventi/{id}/lead:
 * - lead già note: aggiorna numero e stato in Plexus; se non hanno modifiche in coda prende anche gli altri campi;
 * - lead sconosciute (es. importate in Plexus da Excel o raccolte da un altro dispositivo): le aggiunge in locale,
 *   in sola lettura se Plexus non ha un uuid per loro (non si potrebbero rimandare senza fare doppioni).
 */
export async function allineaLead(archivio: ArchivioLocale, evento: Evento, daPlexus: LeadPlexus[], conModificheLocali?: Set<string>): Promise<EsitoAllineamentoLead> {
  const esito: EsitoAllineamentoLead = { importate: 0, aggiornate: 0 }
  await archivio.transaction('rw', archivio.lead, archivio.coda, async () => {
    const conModifiche = conModificheLocali ?? (await conOperazioniAperte(archivio, ['invia_lead']))
    const locali = await archivio.lead.where('evento_uuid').equals(evento.uuid).toArray()
    const perPlexusId = new Map<number, Lead>()
    const perUuid = new Map<string, Lead>()
    for (const l of locali) {
      if (l.plexus_id !== null) perPlexusId.set(l.plexus_id, l)
      perUuid.set(l.uuid, l)
    }
    for (const remota of daPlexus) {
      const locale = perPlexusId.get(remota.id) ?? (remota.uuid ? perUuid.get(remota.uuid) : undefined)
      if (!locale) {
        const creato = dataPlexusInIso(remota.creato_il) ?? adesso()
        const nuova: Lead = {
          uuid: remota.uuid ?? nuovoUuid(),
          evento_uuid: evento.uuid,
          nome: remota.nome ?? '',
          cognome: remota.cognome ?? '',
          email: remota.email ?? '',
          telefono: remota.telefono ?? '',
          azienda: remota.azienda ?? '',
          professione: remota.professione ?? '',
          citta: remota.citta ?? '',
          provincia: remota.provincia ?? '',
          indirizzo: remota.indirizzo ?? '',
          note: remota.note ?? '',
          categoria: remota.categoria ?? '',
          lingua: remota.lingua || evento.lingua,
          consenso: remota.consenso === 'S' ? true : remota.consenso === 'N' ? false : null,
          risposte: risposteDaPlexus(remota.risposte ?? {}, evento.questionario),
          origine: 'plexus',
          solo_lettura: !remota.uuid,
          plexus_id: remota.id,
          plexus_stato: remota.stato ?? null,
          inviata_il: creato,
          ringraziamento: remota.ringraziamento?.esito ? { esito: remota.ringraziamento.esito, dettaglio: '', inviato_il: remota.ringraziamento.inviato_il ?? null } : null,
          creato_il: creato,
          aggiornato_il: dataPlexusInIso(remota.aggiornato_il) ?? creato,
        }
        await archivio.lead.add(nuova)
        esito.importate++
        continue
      }
      const aggiornata: Lead = { ...locale, plexus_id: remota.id, plexus_stato: remota.stato ?? locale.plexus_stato }
      // (1.1) l'esito della mail di ringraziamento arriva da Plexus: vale per ogni dispositivo
      const rem = remota.ringraziamento
      if (rem && rem.esito) {
        const stessoEsito = locale.ringraziamento?.esito === rem.esito
        aggiornata.ringraziamento = { esito: rem.esito, dettaglio: stessoEsito ? (locale.ringraziamento?.dettaglio ?? '') : '', inviato_il: rem.inviato_il ?? null }
      }
      if (!conModifiche.has(locale.uuid)) {
        for (const campo of CAMPI_DA_PLEXUS) {
          const v = remota[campo]
          if (typeof v === 'string') aggiornata[campo] = v
        }
        if (remota.lingua) aggiornata.lingua = remota.lingua
        if (remota.consenso === 'S') aggiornata.consenso = true
        else if (remota.consenso === 'N') aggiornata.consenso = false
      }
      if (JSON.stringify(aggiornata) !== JSON.stringify(locale)) {
        await archivio.lead.put(aggiornata)
        esito.aggiornate++
      }
    }
  })
  return esito
}

export interface EsitoAllineamentoFoto {
  collegate: number
  scaricate: number
}

function tipoFotoValido(tipo: string): TipoFoto {
  return (TIPI_FOTO as string[]).includes(tipo) ? (tipo as TipoFoto) : 'altro'
}

/**
 * (1.1) Allinea le foto di una lead con l'elenco di Plexus: le foto locali ricevono il numero di Plexus
 * (abbinamento per uuid) e quelle scattate da altri dispositivi vengono scaricate e salvate in locale.
 * `scarica` restituisce l'immagine di una foto di Plexus.
 */
export async function allineaFoto(archivio: ArchivioLocale, lead: Lead, daPlexus: FotoPlexus[], scarica: (fotoId: number) => Promise<Blob>): Promise<EsitoAllineamentoFoto> {
  const esito: EsitoAllineamentoFoto = { collegate: 0, scaricate: 0 }
  const locali = await archivio.foto.where('lead_uuid').equals(lead.uuid).toArray()
  const perUuid = new Map(locali.map((f) => [f.uuid, f]))
  const perNumero = new Map(locali.filter((f) => f.plexus_foto_id !== null).map((f) => [f.plexus_foto_id as number, f]))
  const mancanti: FotoPlexus[] = []
  for (const remota of daPlexus) {
    const locale = (remota.uuid ? perUuid.get(remota.uuid) : undefined) ?? perNumero.get(remota.foto_id)
    if (locale) {
      if (locale.plexus_foto_id !== remota.foto_id) {
        await archivio.foto.update(locale.uuid, { plexus_foto_id: remota.foto_id })
        esito.collegate++
      }
      continue
    }
    mancanti.push(remota)
  }
  for (const remota of mancanti) {
    // scaricata fuori da ogni transazione (è una chiamata di rete), poi salvata
    const blob = await scarica(remota.foto_id)
    const preparata = await preparaImmagine(blob)
    const foto: Foto = {
      uuid: remota.uuid ?? nuovoUuid(),
      lead_uuid: lead.uuid,
      tipo: tipoFotoValido(remota.tipo),
      blob: preparata.blob,
      miniatura: preparata.miniatura,
      mime: preparata.mime,
      dimensione: preparata.blob.size,
      larghezza: preparata.larghezza,
      altezza: preparata.altezza,
      plexus_foto_id: remota.foto_id,
      creato_il: remota.creato_il ? (dataPlexusInIso(remota.creato_il) ?? adesso()) : adesso(),
    }
    // se nel frattempo la stessa foto è comparsa (es. caricata da questo dispositivo), non si duplica
    const giaPresente = await archivio.foto.get(foto.uuid)
    if (giaPresente) {
      if (giaPresente.plexus_foto_id === null) await archivio.foto.update(foto.uuid, { plexus_foto_id: remota.foto_id })
      continue
    }
    await archivio.foto.add(foto)
    esito.scaricate++
  }
  return esito
}
