// Report Excel di un evento: foglio "Lead" (una riga per contatto, una colonna per domanda)
// e foglio "Riepilogo" (numeri chiave e conteggi delle risposte). Generato sul dispositivo con exceljs.
import ExcelJS from 'exceljs'
import type { FunzioneT } from '../i18n'
import { brand } from '../config/brand'
import { formattaDataOra, formattaIntervallo } from '../utils/date'
import { calcolaRiepilogo, etichettaLinea, testoConsenso, testoRisposta, type ContenutoReport } from './dati'

const COLORE_NAVY = brand.tema.navy.replace('#', '').toUpperCase()
const COLORE_SFONDO = brand.tema.sfondo.replace('#', '').toUpperCase()

export async function generaExcel(c: ContenutoReport, t: FunzioneT): Promise<Blob> {
  const cartella = new ExcelJS.Workbook()
  cartella.creator = brand.app.nome
  cartella.created = new Date(c.generato_il)
  const riepilogo = calcolaRiepilogo(c)
  const domande = c.evento.questionario

  // ---------- foglio Lead ----------
  const foglio = cartella.addWorksheet(t('report.foglio_lead'), { views: [{ state: 'frozen', ySplit: 1 }] })
  const intestazioni = [
    t('report.col_nome'), t('report.col_cognome'), t('report.col_email'), t('report.col_telefono'), t('report.col_azienda'),
    t('report.col_professione'), t('report.col_citta'), t('report.col_provincia'), t('report.col_indirizzo'), t('report.col_lingua'),
    t('report.col_consenso'), t('report.col_categoria'),
    ...domande.map((d) => d.domanda),
    t('report.col_note'), t('report.col_registrata'), t('report.col_foto'), t('report.col_plexus'),
  ]
  foglio.addRow(intestazioni)
  const riga1 = foglio.getRow(1)
  riga1.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  riga1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORE_NAVY}` } }
  riga1.alignment = { vertical: 'middle', wrapText: true }
  riga1.height = 32

  for (const l of c.lead) {
    foglio.addRow([
      l.nome, l.cognome, l.email, l.telefono, l.azienda, l.professione, l.citta, l.provincia, l.indirizzo, l.lingua,
      testoConsenso(l.consenso, t), l.categoria,
      ...domande.map((d) => testoRisposta(l.risposte[d.domanda])),
      l.note, formattaDataOra(l.creato_il, c.lingua), c.fotoPerLead.get(l.uuid)?.length ?? 0, l.plexus_id !== null ? t('report.si') : t('report.no'),
    ])
  }
  const larghezze = [14, 16, 28, 16, 24, 18, 16, 10, 24, 8, 10, 14, ...domande.map(() => 24), 32, 18, 6, 10]
  foglio.columns.forEach((col, i) => {
    col.width = larghezze[i] ?? 16
  })
  foglio.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: intestazioni.length } }
  foglio.eachRow((riga, n) => {
    if (n === 1) return
    riga.alignment = { vertical: 'top', wrapText: true }
  })

  // ---------- foglio Riepilogo ----------
  const r = cartella.addWorksheet(t('report.foglio_riepilogo'))
  r.getColumn(1).width = 44
  r.getColumn(2).width = 14
  r.getColumn(3).width = 10
  const titolo = (testo: string) => {
    const riga = r.addRow([testo])
    riga.font = { bold: true, size: 13, color: { argb: `FF${COLORE_NAVY}` } }
    return riga
  }
  const intestazioneTabella = (...celle: string[]) => {
    const riga = r.addRow(celle)
    riga.font = { bold: true }
    riga.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORE_SFONDO}` } }
  }
  const percentuale = (n: number, tot: number) => (tot ? Math.round((n / tot) * 100) : 0)

  titolo(c.evento.nome)
  r.addRow([t('report.luogo'), c.evento.luogo])
  r.addRow([t('report.date'), formattaIntervallo(c.evento.data_inizio, c.evento.data_fine, c.lingua)])
  r.addRow([t('report.linea'), etichettaLinea(c.evento.linea, c.lingua)])
  r.addRow([])
  titolo(t('report.totale_contatti'))
  r.addRow([t('report.totale_contatti'), riepilogo.totale])
  r.addRow([t('report.con_consenso'), riepilogo.conConsenso, `${percentuale(riepilogo.conConsenso, riepilogo.totale)}%`])
  r.addRow([t('report.senza_consenso'), riepilogo.senzaConsenso, `${percentuale(riepilogo.senzaConsenso, riepilogo.totale)}%`])
  r.addRow([t('report.consenso_non_risposto'), riepilogo.consensoNonRisposto, `${percentuale(riepilogo.consensoNonRisposto, riepilogo.totale)}%`])
  r.addRow([t('report.con_email'), riepilogo.conEmail, `${percentuale(riepilogo.conEmail, riepilogo.totale)}%`])
  r.addRow([])
  titolo(t('report.per_categoria'))
  intestazioneTabella(t('report.col_categoria'), t('report.numero'), t('report.percentuale'))
  for (const voce of riepilogo.perCategoria) {
    r.addRow([voce.categoria || t('report.senza_categoria'), voce.n, `${percentuale(voce.n, riepilogo.totale)}%`])
  }
  r.addRow([])
  titolo(t('report.risposte_domanda'))
  for (const d of riepilogo.perDomanda) {
    r.addRow([])
    const rigaDomanda = r.addRow([d.domanda.domanda])
    rigaDomanda.font = { bold: true }
    intestazioneTabella(t('report.risposta'), t('report.numero'), t('report.percentuale'))
    for (const o of d.conteggi) r.addRow([o.opzione, o.n, `${percentuale(o.n, riepilogo.totale)}%`])
    r.addRow([t('report.nessuna_risposta'), d.senzaRisposta, `${percentuale(d.senzaRisposta, riepilogo.totale)}%`])
  }
  r.addRow([])
  const nota = r.addRow([t('report.generato_il', { data: formattaDataOra(c.generato_il, c.lingua) })])
  nota.font = { italic: true, color: { argb: 'FF6A7672' } }

  const buffer = await cartella.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
