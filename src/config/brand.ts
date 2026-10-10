// Carica config/brand.json (tutto ciò che è personalizzabile) e lo rende disponibile all'app
// in forma controllata: se nel file manca qualcosa, qui si usano valori di riserva sensati.
import brandGrezzo from '../../config/brand.json'
import logoUrl from '../../config/logo.svg'
import type { Domanda, Lingua } from '../dati/tipi'

/** Testo in più lingue ({ it: "...", en: "..." }) oppure una sola stringa. */
export type TestoMultilingua = string | Record<string, string>

export interface Tema {
  font: string
  sfondo: string
  card: string
  bordo: string
  navy: string
  accento: string
  accento_scuro: string
  accento_chiaro: string
  testo: string
  testo_secondario: string
  testo_terziario: string
  verde: string
  verde_chiaro: string
  ambra: string
  ambra_chiaro: string
  rosso: string
  rosso_chiaro: string
  raggio_card: string
  raggio_pulsante: string
}

export interface Brand {
  app: { nome: string; nome_breve: string; descrizione: string }
  azienda: { nome: string; sito: string }
  logoUrl: string
  tema: Tema
  lingue: { principale: Lingua; disponibili: Record<Lingua, string> }
  linee: Record<string, TestoMultilingua>
  linea_predefinita: string
  categorie_predefinite: string[]
  professioni_suggerite: string[]
  tipi_foto: Record<string, TestoMultilingua>
  privacy: { titolo: TestoMultilingua; testo: TestoMultilingua }
  questionario_predefinito: Domanda[]
  plexus: { nome_piattaforma: string; url_predefinito: string }
  /** Il server degli account (Capta Cloud). L'indirizzo si può anche impostare al momento della build con VITE_CAPTA_CLOUD_URL. */
  cloud: { nome: string; url_predefinito: string }
}

const TEMA_RISERVA: Tema = {
  font: 'Public Sans',
  sfondo: '#eceeed', card: '#ffffff', bordo: '#e8ebe9', navy: '#16244b',
  accento: '#1566db', accento_scuro: '#0f52b3', accento_chiaro: '#e9f1fd',
  testo: '#16201d', testo_secondario: '#6a7672', testo_terziario: '#9aa4a0',
  verde: '#15a34a', verde_chiaro: '#e8f6ec', ambra: '#e08a00', ambra_chiaro: '#fdf3e2',
  rosso: '#d83a34', rosso_chiaro: '#fbeae9', raggio_card: '17px', raggio_pulsante: '10px',
}

type Grezzo = Record<string, unknown>

function oggetto(v: unknown): Grezzo {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Grezzo) : {}
}
function stringa(v: unknown, riserva = ''): string {
  return typeof v === 'string' ? v : riserva
}
function elencoStringhe(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
}
function multilingua(v: unknown, riserva = ''): TestoMultilingua {
  if (typeof v === 'string') return v
  const o = oggetto(v)
  const esito: Record<string, string> = {}
  for (const [k, val] of Object.entries(o)) if (typeof val === 'string') esito[k] = val
  return Object.keys(esito).length ? esito : riserva
}

/** Controlla e completa le domande del questionario (scarta quelle con meno di due opzioni). */
export function normalizzaQuestionario(v: unknown): Domanda[] {
  if (!Array.isArray(v)) return []
  const esito: Domanda[] = []
  for (const voce of v) {
    const o = oggetto(voce)
    const domanda = stringa(o.domanda).trim()
    const opzioni = elencoStringhe(o.opzioni).map((x) => x.trim())
    if (!domanda || opzioni.length < 2) continue
    const d: Domanda = { domanda, opzioni, multipla: o.multipla === true, consenso: o.consenso === true }
    const trad = oggetto(o.traduzioni)
    const traduzioni: Record<string, { domanda: string; opzioni: string[] }> = {}
    for (const [lingua, t] of Object.entries(trad)) {
      const to = oggetto(t)
      const td = stringa(to.domanda).trim()
      const topz = elencoStringhe(to.opzioni)
      if (td && topz.length === opzioni.length) traduzioni[lingua] = { domanda: td, opzioni: topz }
    }
    if (Object.keys(traduzioni).length) d.traduzioni = traduzioni
    esito.push(d)
  }
  return esito
}

export function validaBrand(grezzo: unknown, logo: string): Brand {
  const g = oggetto(grezzo)
  const app = oggetto(g.app)
  const azienda = oggetto(g.azienda)
  const temaGrezzo = oggetto(g.tema)
  const tema = { ...TEMA_RISERVA }
  for (const chiave of Object.keys(TEMA_RISERVA) as (keyof Tema)[]) {
    const v = temaGrezzo[chiave]
    if (typeof v === 'string' && v.trim()) tema[chiave] = v.trim()
  }
  const lingueGrezze = oggetto(g.lingue)
  const disponibiliGrezze = oggetto(lingueGrezze.disponibili)
  const disponibili: Record<string, string> = {}
  for (const [k, v] of Object.entries(disponibiliGrezze)) if (typeof v === 'string') disponibili[k] = v
  if (Object.keys(disponibili).length === 0) disponibili.it = 'Italiano'
  let principale = stringa(lingueGrezze.principale, 'it')
  if (!(principale in disponibili)) principale = Object.keys(disponibili)[0]

  const linee: Record<string, TestoMultilingua> = {}
  for (const [k, v] of Object.entries(oggetto(g.linee))) linee[k] = multilingua(v, k)
  if (Object.keys(linee).length === 0) linee.generale = 'Generale'
  let lineaPredefinita = stringa(g.linea_predefinita)
  if (!(lineaPredefinita in linee)) lineaPredefinita = Object.keys(linee)[0]

  const tipiFoto: Record<string, TestoMultilingua> = {}
  for (const [k, v] of Object.entries(oggetto(g.tipi_foto))) tipiFoto[k] = multilingua(v, k)
  for (const k of ['biglietto', 'volto', 'altro']) if (!(k in tipiFoto)) tipiFoto[k] = k

  const privacy = oggetto(g.privacy)
  const plexus = oggetto(g.plexus)
  const cloud = oggetto(g.cloud)
  const nomeApp = stringa(app.nome, 'Capta Lead')
  return {
    app: { nome: nomeApp, nome_breve: stringa(app.nome_breve, nomeApp), descrizione: stringa(app.descrizione) },
    azienda: { nome: stringa(azienda.nome, nomeApp), sito: stringa(azienda.sito) },
    logoUrl: logo,
    tema,
    lingue: { principale, disponibili },
    linee,
    linea_predefinita: lineaPredefinita,
    categorie_predefinite: elencoStringhe(g.categorie_predefinite),
    professioni_suggerite: elencoStringhe(g.professioni_suggerite),
    tipi_foto: tipiFoto,
    privacy: { titolo: multilingua(privacy.titolo, 'Privacy'), testo: multilingua(privacy.testo, '') },
    questionario_predefinito: normalizzaQuestionario(g.questionario_predefinito),
    plexus: { nome_piattaforma: stringa(plexus.nome_piattaforma, 'Plexus'), url_predefinito: stringa(plexus.url_predefinito) },
    cloud: { nome: stringa(cloud.nome, 'Capta Cloud'), url_predefinito: stringa(cloud.url_predefinito) },
  }
}

/** La configurazione dell'azienda, pronta all'uso. Viene aggiornata da applicaConfigurazione() dopo l'accesso a Capta Cloud. */
export const brand: Brand = validaBrand(brandGrezzo, logoUrl)
/** Copia della configurazione di partenza (dal file), per tornare indietro dopo l'uscita dall'account. */
const brandDiPartenza: Brand = JSON.parse(JSON.stringify(brand))
const urlCloudDaBuild = typeof import.meta.env.VITE_CAPTA_CLOUD_URL === 'string' ? import.meta.env.VITE_CAPTA_CLOUD_URL : ''
if (urlCloudDaBuild) brand.cloud.url_predefinito = urlCloudDaBuild
if (urlCloudDaBuild) brandDiPartenza.cloud.url_predefinito = urlCloudDaBuild

let versioneBrand = 0
const ascoltatoriBrand = new Set<() => void>()

/** Numero che cambia a ogni modifica della configurazione: serve a far ridisegnare l'interfaccia. */
export function versioneDelBrand(): number {
  return versioneBrand
}
export function ascoltaBrand(a: () => void): () => void {
  ascoltatoriBrand.add(a)
  return () => ascoltatoriBrand.delete(a)
}

/**
 * Sovrappone alla configurazione del file quella dell'azienda ricevuta da Capta Cloud (nome, colori, testi,
 * categorie, questionario). Con null torna alla configurazione del file. Il logo resta quello del file.
 */
export function applicaConfigurazione(configurazione: Record<string, unknown> | null | undefined, aziendaNome?: string): void {
  const base = JSON.parse(JSON.stringify(brandDiPartenza)) as Brand
  const grezzoBase: Record<string, unknown> = { ...(brandGrezzo as Record<string, unknown>), cloud: { nome: base.cloud.nome, url_predefinito: base.cloud.url_predefinito } }
  const unito = validaBrand({ ...grezzoBase, ...(configurazione && typeof configurazione === 'object' ? configurazione : {}) }, logoUrl)
  // "app", "azienda" e "tema" si fondono campo per campo, così un'azienda può cambiare solo il nome o solo un colore
  const conf = (configurazione ?? {}) as Record<string, Record<string, unknown> | undefined>
  unito.app = { ...base.app, ...filtraStringhe(conf.app) } as Brand['app']
  unito.azienda = { ...base.azienda, ...(aziendaNome ? { nome: aziendaNome } : {}), ...filtraStringhe(conf.azienda) } as Brand['azienda']
  unito.tema = { ...base.tema, ...filtraStringhe(conf.tema) } as Brand['tema']
  unito.cloud = base.cloud
  Object.assign(brand, unito)
  applicaTema(brand.tema)
  versioneBrand++
  for (const a of ascoltatoriBrand) a()
}

function filtraStringhe(valore: Record<string, unknown> | undefined): Record<string, string> {
  const esito: Record<string, string> = {}
  for (const [k, v] of Object.entries(valore ?? {})) if (typeof v === 'string' && v.trim()) esito[k] = v.trim()
  return esito
}

/** Prende il testo nella lingua richiesta, altrimenti nella principale, altrimenti il primo disponibile. */
export function testoIn(valore: TestoMultilingua | undefined, lingua: Lingua, principale: Lingua = brand.lingue.principale): string {
  if (valore === undefined) return ''
  if (typeof valore === 'string') return valore
  return valore[lingua] ?? valore[principale] ?? Object.values(valore)[0] ?? ''
}

/** Applica i colori del tema come variabili CSS sulla pagina. */
export function applicaTema(tema: Tema = brand.tema, radice: HTMLElement | undefined = typeof document !== 'undefined' ? document.documentElement : undefined): void {
  if (!radice) return
  const mappa: Record<keyof Tema, string> = {
    font: '--font', sfondo: '--sfondo', card: '--card', bordo: '--bordo', navy: '--navy',
    accento: '--accento', accento_scuro: '--accento-scuro', accento_chiaro: '--accento-chiaro',
    testo: '--testo', testo_secondario: '--testo-secondario', testo_terziario: '--testo-terziario',
    verde: '--verde', verde_chiaro: '--verde-chiaro', ambra: '--ambra', ambra_chiaro: '--ambra-chiaro',
    rosso: '--rosso', rosso_chiaro: '--rosso-chiaro', raggio_card: '--raggio-card', raggio_pulsante: '--raggio-pulsante',
  }
  for (const [chiave, variabile] of Object.entries(mappa) as [keyof Tema, string][]) {
    const valore = chiave === 'font' ? `"${tema.font}", system-ui, sans-serif` : tema[chiave]
    radice.style.setProperty(variabile, valore)
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', tema.navy)
  else {
    const m = document.createElement('meta')
    m.name = 'theme-color'
    m.content = tema.navy
    document.head.appendChild(m)
  }
}
