// Funzioni comode per i test: un archivio nuovo per ogni test e un motore collegato al Plexus finto.
import { nuovoArchivioDiProva, type ArchivioLocale } from '../dati/db'
import { MotoreSincronizzazione, CHIAVE_COLLEGAMENTO } from '../sync/motore'
import { salvaImpostazione, type CampiEvento } from '../dati/archivio'
import type { CollegamentoPlexus } from '../dati/tipi'
import { creaPlexusFinto, type PlexusFinto } from './plexus-finto'
import { brand, normalizzaQuestionario } from '../config/brand'
import configurazioneSgm from '../../config/aziende/sgm-pharma.json'

/** Questionario di prova (quello di SGM Pharma): i test non dipendono da quello neutro di brand.json. */
export const QUESTIONARIO_PROVA = normalizzaQuestionario(configurazioneSgm.questionario_predefinito)

let contatore = 0

export function archivioNuovo(): ArchivioLocale {
  contatore++
  return nuovoArchivioDiProva(`prova-${Date.now()}-${contatore}`)
}

export const CAMPI_EVENTO_PROVA: CampiEvento = {
  nome: 'Fiera di prova',
  luogo: 'Bologna',
  data_inizio: '2026-11-05',
  data_fine: '2026-11-07',
  note: '',
  lingua: 'it',
  linea: 'ortopedia',
  questionario: QUESTIONARIO_PROVA,
  categorie_suggerite: [...brand.categorie_predefinite],
  ringraziamento_attivo: true,
  archiviato: false,
}

export const COLLEGAMENTO_PROVA: CollegamentoPlexus = {
  url: 'https://plexus.prova.it',
  token: 'plx_prova',
  piattaforma: 'Plexus',
  azienda: 'SGM Pharma',
  utente: { nome: 'Nicholas', email: 'n@sgm.it', ruolo: 'ceo' },
  posta_lead_pronta: true,
  ai_pronta: false,
  lingue: { it: 'italiano', en: 'inglese' },
  linee: {},
  tipi_foto: ['biglietto', 'volto', 'altro'],
  api: '1.1',
  collegato_il: '2026-10-01T00:00:00.000Z',
  stato: 'ok',
}

export interface AmbienteMotore {
  archivio: ArchivioLocale
  plexus: PlexusFinto
  motore: MotoreSincronizzazione
  rete: { online: boolean }
}

/** Archivio + Plexus finto + motore già collegato (senza timer né ascoltatori automatici). */
export async function ambienteMotore(opzioni: { collegato?: boolean; online?: boolean; attesa?: number; api?: string } = {}): Promise<AmbienteMotore> {
  const archivio = archivioNuovo()
  const plexus = creaPlexusFinto()
  if (opzioni.api) plexus.api = opzioni.api
  const rete = { online: opzioni.online ?? true }
  if (opzioni.collegato !== false) await salvaImpostazione(CHIAVE_COLLEGAMENTO, { ...COLLEGAMENTO_PROVA, api: opzioni.api ?? COLLEGAMENTO_PROVA.api }, archivio)
  const motore = new MotoreSincronizzazione(archivio, {
    creaClient: () => plexus.client,
    online: () => rete.online,
    attesaPerTentativo: opzioni.attesa !== undefined ? () => opzioni.attesa as number : undefined,
    intervalloAllineamentoLead: 0,
    periodoTimerMs: 0,
  })
  await motore.prepara() // niente automatismi nei test: chiamiamo sincronizza() a mano
  return { archivio, plexus, motore, rete }
}

export function blobFinto(byte = 1000, tipo = 'image/jpeg'): Blob {
  return new Blob([new Uint8Array(byte)], { type: tipo })
}

export function attendi(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
