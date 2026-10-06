// Lettura reattiva delle impostazioni salvate sul dispositivo (lingua dell'app, ecc.).
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../dati/db'
import { salvaImpostazione } from '../dati/archivio'
import { brand } from '../config/brand'
import { LINGUE_INTERFACCIA } from '../i18n'

export const CHIAVE_LINGUA_INTERFACCIA = 'lingua_interfaccia'

export function useImpostazione<T>(chiave: string, predefinito: T): T {
  const voce = useLiveQuery(() => db.impostazioni.get(chiave), [chiave])
  return voce === undefined ? predefinito : (voce.valore as T)
}

export function useLinguaInterfaccia(): [string, (lingua: string) => Promise<void>] {
  const predefinita = LINGUE_INTERFACCIA.includes(brand.lingue.principale) ? brand.lingue.principale : 'it'
  const lingua = useImpostazione<string>(CHIAVE_LINGUA_INTERFACCIA, predefinita)
  return [lingua, (nuova) => salvaImpostazione(CHIAVE_LINGUA_INTERFACCIA, nuova)]
}
