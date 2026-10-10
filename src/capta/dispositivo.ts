// Identificativo di questa installazione dell'app (uno per dispositivo), creato una volta e salvato in locale.
import { leggiImpostazione, salvaImpostazione } from '../dati/archivio'
import type { ArchivioLocale } from '../dati/db'
import { nuovoUuid } from '../utils/uuid'

export const CHIAVE_DISPOSITIVO = 'dispositivo'

export interface Dispositivo {
  identificativo: string
  nome: string
}

export async function dispositivoLocale(archivio?: ArchivioLocale): Promise<Dispositivo> {
  const salvato = await leggiImpostazione<Dispositivo | null>(CHIAVE_DISPOSITIVO, null, archivio)
  if (salvato?.identificativo) return salvato
  const nuovo: Dispositivo = { identificativo: nuovoUuid(), nome: nomePredefinito() }
  await salvaImpostazione(CHIAVE_DISPOSITIVO, nuovo, archivio)
  return nuovo
}

export async function rinominaDispositivo(nome: string, archivio?: ArchivioLocale): Promise<Dispositivo> {
  const attuale = await dispositivoLocale(archivio)
  const nuovo = { ...attuale, nome: nome.trim() }
  await salvaImpostazione(CHIAVE_DISPOSITIVO, nuovo, archivio)
  return nuovo
}

function nomePredefinito(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo'
  const ua = navigator.userAgent
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Telefono Android' : 'Tablet Android'
  if (/Windows/.test(ua)) return 'Computer Windows'
  if (/Macintosh/.test(ua)) return 'Mac'
  return 'Dispositivo'
}
