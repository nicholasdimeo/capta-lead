import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { archivioNuovo, CAMPI_EVENTO_PROVA, blobFinto, QUESTIONARIO_PROVA } from '../test/aiuti'
import { creaEvento, creaLead, aggiungiFoto } from '../dati/archivio'
import { calcolaRiepilogo, raccogliContenuto, nomeFileReport, opzioniScelte, coloreRgb } from './dati'
import { generaExcel } from './excel'
import { generaPdf } from './pdf'
import { tPer } from '../i18n'

const t = tPer('it')
const DOMANDA_RUOLO = QUESTIONARIO_PROVA[0].domanda
const DOMANDA_MULTI = QUESTIONARIO_PROVA[1].domanda
const DOMANDA_CONSENSO = QUESTIONARIO_PROVA.find((d) => d.consenso)!.domanda

// un JPEG minuscolo ma valido (1x1 pixel) per provare le miniature nel PDF
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)

beforeAll(() => {
  // nel browser i font del PDF si scaricano con fetch; nei test li leggiamo da disco
  const radice = path.resolve(__dirname, 'fonts')
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url)
    const nome = u.includes('Bold') ? 'PublicSans-Bold.ttf' : 'PublicSans-Regular.ttf'
    return new Response(readFileSync(path.join(radice, nome)))
  }) as typeof fetch
})

async function contenutoDiProva() {
  const db = archivioNuovo()
  const evento = await creaEvento({ ...CAMPI_EVENTO_PROVA, nome: 'Congresso SIME 2026', luogo: 'Roma' }, db)
  const anna = await creaLead(evento.uuid, { nome: 'Anna', cognome: 'Bianchi', email: 'anna@clinica.it', azienda: 'Clinica Sorriso', professione: 'Medico estetico', categoria: 'caldo', consenso: true, risposte: { [DOMANDA_RUOLO]: 'Medico estetico', [DOMANDA_MULTI]: ['Un campione', 'Il listino'], [DOMANDA_CONSENSO]: 'Sì' } }, db)
  await creaLead(evento.uuid, { nome: 'Łukasz', cognome: 'Żółć', email: 'l@firma.pl', lingua: 'en', categoria: 'distributore', consenso: false, risposte: { [DOMANDA_RUOLO]: 'Distributore', [DOMANDA_CONSENSO]: 'No' }, note: 'Nota con\nuna riga nuova' }, db)
  await creaLead(evento.uuid, { nome: 'Senza', cognome: 'Risposte' }, db)
  await aggiungiFoto(anna.uuid, 'biglietto', { blob: new Blob([JPEG_1PX], { type: 'image/jpeg' }), miniatura: new Blob([JPEG_1PX], { type: 'image/jpeg' }), mime: 'image/jpeg', larghezza: 1, altezza: 1 }, db)
  await aggiungiFoto(anna.uuid, 'altro', { blob: blobFinto(), miniatura: null, mime: 'image/heic', larghezza: 0, altezza: 0 }, db)
  return raccogliContenuto(evento.uuid, 'it', db)
}

describe('report: conteggi', () => {
  it('conta consensi, email, categorie e risposte per domanda (multiple comprese)', async () => {
    const c = await contenutoDiProva()
    const r = calcolaRiepilogo(c)
    expect(r.totale).toBe(3)
    expect(r.conConsenso).toBe(1)
    expect(r.senzaConsenso).toBe(1)
    expect(r.consensoNonRisposto).toBe(1)
    expect(r.conEmail).toBe(2)
    expect(r.perCategoria).toEqual([
      { categoria: '', n: 1 },
      { categoria: 'caldo', n: 1 },
      { categoria: 'distributore', n: 1 },
    ])
    const ruolo = r.perDomanda.find((d) => d.domanda.domanda === DOMANDA_RUOLO)!
    expect(ruolo.conteggi.find((o) => o.opzione === 'Medico estetico')?.n).toBe(1)
    expect(ruolo.conteggi.find((o) => o.opzione === 'Distributore')?.n).toBe(1)
    expect(ruolo.senzaRisposta).toBe(1)
    const multi = r.perDomanda.find((d) => d.domanda.domanda === DOMANDA_MULTI)!
    expect(multi.conteggi.find((o) => o.opzione === 'Un campione')?.n).toBe(1)
    expect(multi.conteggi.find((o) => o.opzione === 'Il listino')?.n).toBe(1)
    expect(multi.senzaRisposta).toBe(2)
    const anna = c.lead.find((l) => l.nome === 'Anna')!
    expect(c.fotoPerLead.get(anna.uuid)).toHaveLength(2)
    expect(nomeFileReport(c.evento, 'xlsx')).toBe('report-congresso-sime-2026.xlsx')
    expect(opzioniScelte(['a', '', 'b'])).toEqual(['a', 'b'])
    expect(opzioniScelte(null)).toEqual([])
    expect(coloreRgb('#1566db')).toEqual([21 / 255, 102 / 255, 219 / 255])
  })
})

describe('report: Excel', () => {
  it('crea un file Excel con il foglio Lead (una colonna per domanda) e il foglio Riepilogo', async () => {
    const c = await contenutoDiProva()
    const blob = await generaExcel(c, t)
    expect(blob.size).toBeGreaterThan(1000)
    const cartella = new ExcelJS.Workbook()
    await cartella.xlsx.load(await blob.arrayBuffer())
    const lead = cartella.getWorksheet('Lead')!
    const intestazioni = (lead.getRow(1).values as (string | undefined)[]).slice(1)
    expect(intestazioni).toContain(DOMANDA_RUOLO)
    expect(intestazioni).toContain(DOMANDA_MULTI)
    expect(lead.rowCount).toBe(4) // intestazione + 3 lead
    const colonnaMulti = intestazioni.indexOf(DOMANDA_MULTI) + 1
    const colonnaConsenso = intestazioni.indexOf('Consenso') + 1
    const colonnaFoto = intestazioni.indexOf('Foto') + 1
    const rigaDi = (nome: string) => {
      for (let i = 2; i <= lead.rowCount; i++) if (lead.getRow(i).getCell(1).value === nome) return lead.getRow(i)
      throw new Error(`riga di ${nome} non trovata`)
    }
    expect(rigaDi('Anna').getCell(colonnaMulti).value).toBe('Un campione, Il listino')
    expect(rigaDi('Anna').getCell(colonnaConsenso).value).toBe('Sì')
    expect(rigaDi('Anna').getCell(colonnaFoto).value).toBe(2)
    expect(rigaDi('Łukasz').getCell(colonnaConsenso).value).toBe('No')
    expect(rigaDi('Senza').getCell(colonnaConsenso).value).toBe('—')
    const riepilogo = cartella.getWorksheet('Riepilogo')!
    const testi: string[] = []
    riepilogo.eachRow((r) => testi.push(String(r.getCell(1).value ?? '')))
    expect(testi).toContain('Congresso SIME 2026')
    expect(testi).toContain(DOMANDA_RUOLO)
    expect(testi).toContain('Medico estetico')
    expect(testi).toContain('(nessuna risposta)')
  })
})

describe('report: PDF', () => {
  it('crea un PDF con più pagine, caratteri stranieri e miniatura del biglietto', async () => {
    const c = await contenutoDiProva()
    const blob = await generaPdf(c, t)
    expect(blob.type).toBe('application/pdf')
    const byte = Buffer.from(await blob.arrayBuffer())
    expect(byte.subarray(0, 5).toString()).toBe('%PDF-')
    const letto = await PDFDocument.load(byte)
    expect(letto.getPageCount()).toBeGreaterThanOrEqual(2)
    expect(letto.getTitle()).toContain('Congresso SIME 2026')
    const oggetti = letto.context.enumerateIndirectObjects().map(([, o]) => o.toString())
    expect(oggetti.some((o) => o.includes('/Subtype /Image'))).toBe(true) // la miniatura JPEG è incorporata
    expect(oggetti.some((o) => o.includes('/FontFile2'))).toBe(true) // il font del brand è incorporato
  })

  it('non si rompe con un evento senza contatti né questionario', async () => {
    const db = archivioNuovo()
    const evento = await creaEvento({ ...CAMPI_EVENTO_PROVA, questionario: [] }, db)
    const c = await raccogliContenuto(evento.uuid, 'en', db)
    const pdf = await generaPdf(c, tPer('en'))
    expect(pdf.size).toBeGreaterThan(500)
    const xlsx = await generaExcel(c, tPer('en'))
    expect(xlsx.size).toBeGreaterThan(500)
  })
})
