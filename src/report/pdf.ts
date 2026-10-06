// Report PDF di un evento: intestazione, numeri chiave, grafici a barre delle risposte ed elenco contatti
// (con la miniatura del biglietto da visita, se c'è). Generato sul dispositivo con pdf-lib e il font del brand.
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fontRegolareUrl from './fonts/PublicSans-Regular.ttf?url'
import fontGrassettoUrl from './fonts/PublicSans-Bold.ttf?url'
import type { FunzioneT } from '../i18n'
import { brand } from '../config/brand'
import { formattaDataOra, formattaIntervallo } from '../utils/date'
import { nomeCompleto } from '../utils/testo'
import { calcolaRiepilogo, coloreRgb, etichettaLinea, testoConsenso, type ContenutoReport } from './dati'

const A4 = { larghezza: 595.28, altezza: 841.89 }
const MARGINE = 40
const LARGHEZZA_UTILE = A4.larghezza - 2 * MARGINE

const NAVY = rgb(...coloreRgb(brand.tema.navy))
const ACCENTO = rgb(...coloreRgb(brand.tema.accento))
const ACCENTO_CHIARO = rgb(...coloreRgb(brand.tema.accento_chiaro))
const TESTO = rgb(...coloreRgb(brand.tema.testo))
const SECONDARIO = rgb(...coloreRgb(brand.tema.testo_secondario))
const BORDO = rgb(...coloreRgb(brand.tema.bordo))
const SFONDO = rgb(...coloreRgb(brand.tema.sfondo))
const VERDE = rgb(...coloreRgb(brand.tema.verde))
const ROSSO = rgb(...coloreRgb(brand.tema.rosso))
const BIANCO = rgb(1, 1, 1)

async function caricaFont(url: string): Promise<ArrayBuffer> {
  const risposta = await fetch(url)
  if (!risposta.ok) throw new Error(`font non caricato: ${url}`)
  return risposta.arrayBuffer()
}

/** Toglie caratteri che il PDF non può mostrare (a capo, tab, controlli). */
function pulisciTesto(testo: string): string {
  return (testo ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim()
}

/** Spezza un testo in righe che stanno in `larghezza` punti. */
function spezza(testo: string, font: PDFFont, dimensione: number, larghezza: number): string[] {
  const parole = pulisciTesto(testo).split(' ').filter(Boolean)
  const righe: string[] = []
  let riga = ''
  const misura = (s: string) => {
    try {
      return font.widthOfTextAtSize(s, dimensione)
    } catch {
      return s.length * dimensione * 0.55
    }
  }
  for (const parola of parole) {
    const prova = riga ? `${riga} ${parola}` : parola
    if (misura(prova) <= larghezza) {
      riga = prova
      continue
    }
    if (riga) righe.push(riga)
    // parola più lunga della riga: la taglia
    let pezzo = parola
    while (misura(pezzo) > larghezza && pezzo.length > 1) {
      let i = pezzo.length - 1
      while (i > 1 && misura(pezzo.slice(0, i)) > larghezza) i--
      righe.push(pezzo.slice(0, i))
      pezzo = pezzo.slice(i)
    }
    riga = pezzo
  }
  if (riga) righe.push(riga)
  return righe.length ? righe : ['']
}

function tronca(testo: string, font: PDFFont, dimensione: number, larghezza: number): string {
  const t = pulisciTesto(testo)
  const misura = (s: string) => {
    try {
      return font.widthOfTextAtSize(s, dimensione)
    } catch {
      return s.length * dimensione * 0.55
    }
  }
  if (misura(t) <= larghezza) return t
  let fine = t.length
  while (fine > 0 && misura(`${t.slice(0, fine)}…`) > larghezza) fine--
  return `${t.slice(0, fine)}…`
}

class Impaginatore {
  pagina!: PDFPage
  y = 0
  numeroPagina = 0
  constructor(
    readonly doc: PDFDocument,
    readonly regolare: PDFFont,
    readonly grassetto: PDFFont,
    readonly piePagina: string,
  ) {}

  nuovaPagina(): void {
    this.pagina = this.doc.addPage([A4.larghezza, A4.altezza])
    this.numeroPagina++
    this.y = A4.altezza - MARGINE
  }

  /** Garantisce spazio verticale, altrimenti cambia pagina. */
  spazio(altezza: number): void {
    if (this.y - altezza < MARGINE + 24) this.nuovaPagina()
  }

  testo(testo: string, opzioni: { x?: number; dimensione?: number; font?: PDFFont; colore?: ReturnType<typeof rgb>; larghezza?: number; interlinea?: number } = {}): number {
    const font = opzioni.font ?? this.regolare
    const dimensione = opzioni.dimensione ?? 10
    const larghezza = opzioni.larghezza ?? LARGHEZZA_UTILE
    const interlinea = opzioni.interlinea ?? dimensione * 1.35
    const righe = spezza(testo, font, dimensione, larghezza)
    for (const riga of righe) {
      this.spazio(interlinea)
      this.y -= interlinea
      this.pagina.drawText(riga, { x: opzioni.x ?? MARGINE, y: this.y + (interlinea - dimensione) / 2, size: dimensione, font, color: opzioni.colore ?? TESTO })
    }
    return righe.length * interlinea
  }

  rigaVuota(altezza = 8): void {
    this.y -= altezza
  }

  rettangolo(x: number, y: number, larghezza: number, altezza: number, colore: ReturnType<typeof rgb>, bordo?: ReturnType<typeof rgb>): void {
    this.pagina.drawRectangle({ x, y, width: larghezza, height: altezza, color: colore, borderColor: bordo, borderWidth: bordo ? 0.6 : 0 })
  }

  /** Scrive il piè di pagina ("Pagina n di tot") su tutte le pagine, alla fine. */
  chiudi(t: FunzioneT): void {
    const pagine = this.doc.getPages()
    pagine.forEach((p, i) => {
      p.drawText(this.piePagina, { x: MARGINE, y: MARGINE - 18, size: 8, font: this.regolare, color: SECONDARIO })
      const numero = t('report.pagina', { n: i + 1, tot: pagine.length })
      const l = this.regolare.widthOfTextAtSize(numero, 8)
      p.drawText(numero, { x: A4.larghezza - MARGINE - l, y: MARGINE - 18, size: 8, font: this.regolare, color: SECONDARIO })
    })
  }
}

export async function generaPdf(c: ContenutoReport, t: FunzioneT): Promise<Blob> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(`${t('report.pdf_titolo')} – ${c.evento.nome}`)
  doc.setCreator(brand.app.nome)
  doc.setProducer(brand.app.nome)
  const [regolareByte, grassettoByte] = await Promise.all([caricaFont(fontRegolareUrl), caricaFont(fontGrassettoUrl)])
  const regolare = await doc.embedFont(regolareByte, { subset: true })
  const grassetto = await doc.embedFont(grassettoByte, { subset: true })
  const riepilogo = calcolaRiepilogo(c)
  const imp = new Impaginatore(doc, regolare, grassetto, t('report.generato_il', { data: formattaDataOra(c.generato_il, c.lingua) }))
  imp.nuovaPagina()

  // ---------- intestazione ----------
  const altezzaBanda = 86
  imp.rettangolo(0, A4.altezza - altezzaBanda, A4.larghezza, altezzaBanda, NAVY)
  imp.pagina.drawText(brand.azienda.nome.toUpperCase(), { x: MARGINE, y: A4.altezza - 30, size: 9, font: grassetto, color: rgb(0.8, 0.85, 0.95) })
  imp.pagina.drawText(tronca(c.evento.nome, grassetto, 20, LARGHEZZA_UTILE), { x: MARGINE, y: A4.altezza - 54, size: 20, font: grassetto, color: BIANCO })
  const sotto = [c.evento.luogo, formattaIntervallo(c.evento.data_inizio, c.evento.data_fine, c.lingua), etichettaLinea(c.evento.linea, c.lingua)].filter(Boolean).join('  ·  ')
  imp.pagina.drawText(tronca(sotto, regolare, 10, LARGHEZZA_UTILE), { x: MARGINE, y: A4.altezza - 72, size: 10, font: regolare, color: rgb(0.85, 0.88, 0.95) })
  imp.y = A4.altezza - altezzaBanda - 22

  // ---------- numeri chiave ----------
  const tessere = [
    [t('report.totale_contatti'), riepilogo.totale],
    [t('report.con_consenso'), riepilogo.conConsenso],
    [t('report.senza_consenso'), riepilogo.senzaConsenso],
    [t('report.con_email'), riepilogo.conEmail],
  ] as const
  const larghezzaTessera = (LARGHEZZA_UTILE - 10 * (tessere.length - 1)) / tessere.length
  const altezzaTessera = 54
  imp.spazio(altezzaTessera)
  tessere.forEach(([etichetta, valore], i) => {
    const x = MARGINE + i * (larghezzaTessera + 10)
    imp.rettangolo(x, imp.y - altezzaTessera, larghezzaTessera, altezzaTessera, SFONDO)
    imp.pagina.drawText(tronca(etichetta.toUpperCase(), grassetto, 7, larghezzaTessera - 20), { x: x + 10, y: imp.y - 18, size: 7, font: grassetto, color: SECONDARIO })
    imp.pagina.drawText(String(valore), { x: x + 10, y: imp.y - 44, size: 22, font: grassetto, color: NAVY })
  })
  imp.y -= altezzaTessera + 18

  // ---------- categorie ----------
  if (riepilogo.perCategoria.length > 0) {
    imp.testo(t('report.per_categoria'), { font: grassetto, dimensione: 13, colore: NAVY })
    imp.rigaVuota(4)
    disegnaBarre(imp, riepilogo.perCategoria.map((v) => ({ etichetta: v.categoria || t('report.senza_categoria'), n: v.n })), riepilogo.totale)
    imp.rigaVuota(14)
  }

  // ---------- domande ----------
  if (riepilogo.perDomanda.length > 0) {
    imp.testo(t('report.risposte_domanda'), { font: grassetto, dimensione: 13, colore: NAVY })
    imp.rigaVuota(4)
    for (const d of riepilogo.perDomanda) {
      imp.spazio(40)
      imp.testo(d.domanda.domanda, { font: grassetto, dimensione: 10.5 })
      imp.rigaVuota(3)
      disegnaBarre(imp, [...d.conteggi.map((o) => ({ etichetta: o.opzione, n: o.n })), { etichetta: t('report.nessuna_risposta'), n: d.senzaRisposta, tenue: true }], riepilogo.totale)
      imp.rigaVuota(12)
    }
  }

  // ---------- elenco contatti ----------
  imp.nuovaPagina()
  imp.testo(t('report.elenco_contatti'), { font: grassetto, dimensione: 13, colore: NAVY })
  imp.rigaVuota(6)
  const colonne = { foto: 36, nome: 150, azienda: 130, categoria: 80, consenso: 50 }
  const xFoto = MARGINE
  const xNome = xFoto + colonne.foto + 8
  const xAzienda = xNome + colonne.nome + 6
  const xCategoria = xAzienda + colonne.azienda + 6
  const xConsenso = xCategoria + colonne.categoria + 6
  const altezzaRiga = 40
  const intestazione = () => {
    imp.spazio(18)
    imp.rettangolo(MARGINE, imp.y - 16, LARGHEZZA_UTILE, 16, SFONDO)
    const yT = imp.y - 11.5
    imp.pagina.drawText(t('report.col_nome'), { x: xNome, y: yT, size: 7.5, font: grassetto, color: SECONDARIO })
    imp.pagina.drawText(t('report.col_azienda'), { x: xAzienda, y: yT, size: 7.5, font: grassetto, color: SECONDARIO })
    imp.pagina.drawText(t('report.col_categoria'), { x: xCategoria, y: yT, size: 7.5, font: grassetto, color: SECONDARIO })
    imp.pagina.drawText(t('report.col_consenso'), { x: xConsenso, y: yT, size: 7.5, font: grassetto, color: SECONDARIO })
    imp.y -= 18
  }
  intestazione()
  const cacheImmagini = new Map<string, PDFImage | null>()
  for (const l of c.lead) {
    if (imp.y - altezzaRiga < MARGINE + 24) {
      imp.nuovaPagina()
      intestazione()
    }
    const yBase = imp.y - altezzaRiga
    imp.pagina.drawLine({ start: { x: MARGINE, y: yBase }, end: { x: MARGINE + LARGHEZZA_UTILE, y: yBase }, thickness: 0.5, color: BORDO })
    // miniatura: prima il biglietto da visita, altrimenti la prima foto
    const foto = c.fotoPerLead.get(l.uuid) ?? []
    const scelta = foto.find((f) => f.tipo === 'biglietto') ?? foto[0]
    if (scelta?.miniatura) {
      let immagine = cacheImmagini.get(scelta.uuid)
      if (immagine === undefined) {
        try {
          immagine = await doc.embedJpg(await scelta.miniatura.arrayBuffer())
        } catch {
          immagine = null
        }
        cacheImmagini.set(scelta.uuid, immagine)
      }
      if (immagine) {
        const scala = Math.min(colonne.foto / immagine.width, (altezzaRiga - 8) / immagine.height)
        const w = immagine.width * scala
        const h = immagine.height * scala
        imp.pagina.drawImage(immagine, { x: xFoto + (colonne.foto - w) / 2, y: yBase + (altezzaRiga - h) / 2, width: w, height: h })
      }
    }
    const nome = nomeCompleto(l, t('lead.senza_nome'))
    imp.pagina.drawText(tronca(nome, grassetto, 10, colonne.nome), { x: xNome, y: yBase + 24, size: 10, font: grassetto, color: TESTO })
    const sotto = [l.professione, l.email || l.telefono].filter(Boolean).join(' · ')
    if (sotto) imp.pagina.drawText(tronca(sotto, regolare, 8, colonne.nome), { x: xNome, y: yBase + 11, size: 8, font: regolare, color: SECONDARIO })
    imp.pagina.drawText(tronca(l.azienda, regolare, 9, colonne.azienda), { x: xAzienda, y: yBase + 24, size: 9, font: regolare, color: TESTO })
    const luogo = [l.citta, l.provincia].filter(Boolean).join(' ')
    if (luogo) imp.pagina.drawText(tronca(luogo, regolare, 8, colonne.azienda), { x: xAzienda, y: yBase + 11, size: 8, font: regolare, color: SECONDARIO })
    if (l.categoria) {
      const etichetta = tronca(l.categoria, grassetto, 8, colonne.categoria - 12)
      const lw = grassetto.widthOfTextAtSize(etichetta, 8) + 12
      imp.rettangolo(xCategoria, yBase + 18, lw, 14, ACCENTO_CHIARO)
      imp.pagina.drawText(etichetta, { x: xCategoria + 6, y: yBase + 22, size: 8, font: grassetto, color: ACCENTO })
    }
    const testoC = testoConsenso(l.consenso, t)
    imp.pagina.drawText(testoC, { x: xConsenso, y: yBase + 22, size: 9, font: grassetto, color: l.consenso === true ? VERDE : l.consenso === false ? ROSSO : SECONDARIO })
    imp.y = yBase
  }
  if (c.lead.length === 0) imp.testo(t('dettaglio.nessuna_lead_titolo'), { colore: SECONDARIO })

  imp.chiudi(t)
  const byte = await doc.save()
  const copia = new Uint8Array(byte.length)
  copia.set(byte)
  return new Blob([copia.buffer], { type: 'application/pdf' })
}

/** Grafico a barre orizzontali: etichetta, barra proporzionale, numero. */
function disegnaBarre(imp: Impaginatore, voci: { etichetta: string; n: number; tenue?: boolean }[], totale: number): void {
  const massimo = Math.max(1, ...voci.map((v) => v.n))
  const larghezzaEtichetta = 190
  const xBarra = MARGINE + larghezzaEtichetta + 8
  const larghezzaBarra = LARGHEZZA_UTILE - larghezzaEtichetta - 8 - 50
  const altezza = 14
  for (const v of voci) {
    imp.spazio(altezza + 4)
    imp.y -= altezza + 4
    imp.pagina.drawText(tronca(v.etichetta, imp.regolare, 9, larghezzaEtichetta), { x: MARGINE, y: imp.y + 3.5, size: 9, font: imp.regolare, color: v.tenue ? SECONDARIO : TESTO })
    imp.rettangolo(xBarra, imp.y, larghezzaBarra, altezza, SFONDO)
    const l = (v.n / massimo) * larghezzaBarra
    if (l > 0) imp.rettangolo(xBarra, imp.y, l, altezza, v.tenue ? BORDO : ACCENTO)
    const perc = totale ? Math.round((v.n / totale) * 100) : 0
    imp.pagina.drawText(`${v.n} (${perc}%)`, { x: xBarra + larghezzaBarra + 6, y: imp.y + 3.5, size: 8.5, font: imp.grassetto, color: SECONDARIO })
  }
}
