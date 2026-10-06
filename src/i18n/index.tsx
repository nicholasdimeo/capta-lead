// Testi dell'interfaccia in più lingue. L'italiano (it.json) è completo e fa da riserva;
// le altre lingue possono anche essere parziali. I testi del questionario e della privacy
// non stanno qui: vengono da config/brand.json e dagli eventi.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import it from './it.json'
import en from './en.json'
import type { Lingua } from '../dati/tipi'
import { brand } from '../config/brand'

export type ChiaveTesto = keyof typeof it
export type Parametri = Record<string, string | number>

const DIZIONARI: Record<string, Partial<Record<ChiaveTesto, string>>> = { it, en }

/** Lingue per cui esiste una traduzione dell'interfaccia. */
export const LINGUE_INTERFACCIA = Object.keys(DIZIONARI)

function sostituisci(testo: string, parametri?: Parametri): string {
  if (!parametri) return testo
  return testo.replace(/\{\{(\w+)\}\}/g, (_, nome: string) => (parametri[nome] !== undefined ? String(parametri[nome]) : `{{${nome}}}`))
}

/** Traduce una chiave nella lingua data (riserva: lingua principale del brand, poi italiano, poi la chiave stessa). */
export function traduci(lingua: Lingua, chiave: ChiaveTesto, parametri?: Parametri): string {
  const voce = DIZIONARI[lingua]?.[chiave] ?? DIZIONARI[brand.lingue.principale]?.[chiave] ?? it[chiave] ?? chiave
  return sostituisci(voce, { piattaforma: brand.plexus.nome_piattaforma, app: brand.app.nome, ...parametri })
}

/** Sceglie tra forma singolare e plurale: chiave base + "_uno" / "_molti" (o i suffissi indicati). */
export function traduciPlurale(lingua: Lingua, base: string, n: number, suffissi: [string, string] = ['_uno', '_molti']): string {
  const chiave = `${base}${n === 1 ? suffissi[0] : suffissi[1]}` as ChiaveTesto
  return traduci(lingua, chiave, { n })
}

export type FunzioneT = (chiave: ChiaveTesto, parametri?: Parametri) => string

export interface ContestoLingua {
  lingua: Lingua
  t: FunzioneT
  tp: (base: string, n: number, suffissi?: [string, string]) => string
}

const Contesto = createContext<ContestoLingua>({
  lingua: brand.lingue.principale,
  t: (chiave, parametri) => traduci(brand.lingue.principale, chiave, parametri),
  tp: (base, n, suffissi) => traduciPlurale(brand.lingue.principale, base, n, suffissi),
})

export function FornitoreLingua({ lingua, children }: { lingua: Lingua; children: ReactNode }) {
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lingua
  }, [lingua])
  const valore = useMemo<ContestoLingua>(
    () => ({
      lingua,
      t: (chiave, parametri) => traduci(lingua, chiave, parametri),
      tp: (base, n, suffissi) => traduciPlurale(lingua, base, n, suffissi),
    }),
    [lingua],
  )
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>
}

/** Hook per usare i testi tradotti nei componenti: const { t } = useT() */
export function useT(): ContestoLingua {
  return useContext(Contesto)
}

/** Crea una funzione t "fissa" per una lingua: utile per il questionario mostrato al visitatore. */
export function tPer(lingua: Lingua): FunzioneT {
  return (chiave, parametri) => traduci(lingua, chiave, parametri)
}
