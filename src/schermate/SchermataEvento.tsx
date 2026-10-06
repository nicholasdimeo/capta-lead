// Pagina di un evento: numeri chiave, pulsante grande "Nuovo contatto", ricerca e filtri,
// elenco dei contatti con gli stati di invio, report Excel/PDF.
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pagina, Vuoto } from '../componenti/Pagina'
import { Pillola } from '../componenti/Pillola'
import { StatoLead } from '../componenti/StatoLead'
import { useUrlBlob } from '../componenti/Foto'
import { IconaCerca, IconaFoglio, IconaMatita, IconaPersona, IconaPiu, IconaSync } from '../componenti/Icone'
import { useToast } from '../componenti/Toast'
import { useT, type FunzioneT } from '../i18n'
import { brand, testoIn } from '../config/brand'
import { leggiEvento, leadDiEvento, filtraLead, type FiltriLead } from '../dati/archivio'
import { db } from '../dati/db'
import type { Foto, Lead } from '../dati/tipi'
import { useCollegato, useMotore, useOperazioniAperte } from '../hooks/useMotore'
import { useRete } from '../hooks/useRete'
import { motore } from '../sync/istanza'
import { formattaIntervallo } from '../utils/date'
import { iniziali, nomeCompleto, normalizzaPerRicerca } from '../utils/testo'
import { statoInvioLead } from '../sync/motore'
import { condividiFile, scaricaFile, condivisionePossibile } from '../report/condividi'
import { Modale } from '../componenti/Modale'
import { nomeFileReport, raccogliContenuto } from '../report/dati'

export interface ReportPronto {
  blob: Blob
  nome: string
  titolo: string
}

/** Genera un report (Excel o PDF) di un evento. Le librerie pesanti si caricano solo qui. */
export async function generaReport(tipo: 'xlsx' | 'pdf', eventoUuid: string, lingua: string, t: FunzioneT): Promise<ReportPronto> {
  const contenuto = await raccogliContenuto(eventoUuid, lingua)
  const blob = tipo === 'xlsx' ? await (await import('../report/excel')).generaExcel(contenuto, t) : await (await import('../report/pdf')).generaPdf(contenuto, t)
  return { blob, nome: nomeFileReport(contenuto.evento, tipo), titolo: `${t('report.pdf_titolo')} – ${contenuto.evento.nome}` }
}

function Avatar({ lead, foto }: { lead: Lead; foto?: Foto }) {
  const url = useUrlBlob(foto?.miniatura ?? null)
  return <div className="avatar">{url ? <img src={url} alt="" /> : iniziali(lead)}</div>
}

export function SchermataEvento() {
  const { t, tp, lingua } = useT()
  const { uuid = '' } = useParams()
  const avvisa = useToast()
  // undefined = sto caricando; null = non esiste
  const evento = useLiveQuery(() => leggiEvento(uuid).then((e) => e ?? null), [uuid])
  const lead = useLiveQuery(() => leadDiEvento(uuid), [uuid])
  const foto = useLiveQuery(async () => {
    const tutte = await db.foto.where('lead_uuid').anyOf((lead ?? []).map((l) => l.uuid)).toArray()
    const perLead = new Map<string, Foto[]>()
    for (const f of tutte) perLead.set(f.lead_uuid, [...(perLead.get(f.lead_uuid) ?? []), f])
    return perLead
  }, [lead])
  const operazioni = useOperazioniAperte()
  const collegato = useCollegato()
  const online = useRete()
  const { inCorso } = useMotore()
  const [filtri, setFiltri] = useState<FiltriLead>({})
  const [reportInCorso, setReportInCorso] = useState<'xlsx' | 'pdf' | null>(null)
  const [reportPronto, setReportPronto] = useState<ReportPronto | null>(null)

  const categorie = useMemo(() => {
    const presenti = new Set<string>(evento?.categorie_suggerite ?? [])
    for (const l of lead ?? []) if (l.categoria) presenti.add(l.categoria)
    return [...presenti]
  }, [evento, lead])
  const filtrate = useMemo(() => filtraLead(lead ?? [], filtri, normalizzaPerRicerca), [lead, filtri])
  const conConsenso = (lead ?? []).filter((l) => l.consenso === true).length
  const daInviare = (lead ?? []).filter((l) => ['in_coda', 'errore', 'rifiutata', 'modifiche_in_coda', 'in_invio'].includes(statoInvioLead(l, operazioni, collegato).stato)).length

  async function report(tipo: 'xlsx' | 'pdf') {
    if (!evento) return
    setReportInCorso(tipo)
    try {
      // Il file viene generato prima; la condivisione parte da un tocco dell'utente sul pulsante
      // della finestra (iOS accetta "Condividi" solo subito dopo un tocco).
      setReportPronto(await generaReport(tipo, evento.uuid, lingua, t))
    } catch (e) {
      console.error(e)
      avvisa(t('report.errore'), 'rosso')
    } finally {
      setReportInCorso(null)
    }
  }

  async function condividi() {
    if (!reportPronto) return
    const esito = await condividiFile(reportPronto.blob, reportPronto.nome, reportPronto.titolo)
    if (esito === 'non_disponibile') {
      avvisa(t('report.condividi_non_disponibile'))
      scaricaFile(reportPronto.blob, reportPronto.nome)
    }
    if (esito !== 'annullato') setReportPronto(null)
  }

  if (evento === undefined) return <Pagina titolo="…" indietro="/">{null}</Pagina>
  if (evento === null) {
    return (
      <Pagina titolo={t('eventi.titolo')} indietro="/">
        <div className="card">
          <Vuoto titolo={t('eventi.nessuno_titolo')} azione={<Link to="/" className="pulsante">{t('barra.eventi')}</Link>} />
        </div>
      </Pagina>
    )
  }

  return (
    <Pagina
      titolo={evento.nome}
      sottotitolo={[evento.luogo, formattaIntervallo(evento.data_inizio, evento.data_fine, lingua)].filter(Boolean).join(' · ')}
      indietro="/"
      azioni={
        <Link to={`/eventi/${evento.uuid}/modifica`} className="barra__pulsante" aria-label={t('dettaglio.modifica_evento')}>
          <IconaMatita dimensione={20} />
        </Link>
      }
    >
      <div className="card" style={{ padding: 16 }}>
        <div className="griglia-numeri">
          <div className="numero">
            <span className="etichetta">{t('dettaglio.contatti')}</span>
            <div className="valore-grande">{lead?.length ?? 0}</div>
          </div>
          <div className="numero">
            <span className="etichetta">{t('dettaglio.con_consenso')}</span>
            <div className="valore-grande" style={{ color: 'var(--verde)' }}>{conConsenso}</div>
          </div>
          {collegato && (
            <div className="numero">
              <span className="etichetta">{t('dettaglio.da_inviare')}</span>
              <div className="valore-grande" style={{ color: daInviare ? 'var(--ambra)' : 'var(--testo-terziario)' }}>{daInviare}</div>
            </div>
          )}
        </div>
        <div className="riga spazio-sopra" style={{ justifyContent: 'space-between' }}>
          <Pillola tono="blu">{testoIn(brand.linee[evento.linea], lingua) || evento.linea}</Pillola>
          <div className="riga" style={{ gap: 6 }}>
            <button type="button" className="pulsante pulsante--neutro pulsante--piccolo" onClick={() => void report('xlsx')} disabled={reportInCorso !== null || !lead?.length}>
              {reportInCorso === 'xlsx' ? <span className="caricamento caricamento--scuro" /> : <IconaFoglio dimensione={16} />} {t('dettaglio.report_excel')}
            </button>
            <button type="button" className="pulsante pulsante--neutro pulsante--piccolo" onClick={() => void report('pdf')} disabled={reportInCorso !== null || !lead?.length}>
              {reportInCorso === 'pdf' ? <span className="caricamento caricamento--scuro" /> : <IconaFoglio dimensione={16} />} {t('dettaglio.report_pdf')}
            </button>
            {collegato && (
              <button type="button" className="pulsante pulsante--neutro pulsante--piccolo" onClick={() => void motore.sincronizza('manuale')} disabled={inCorso || !online} aria-label={t('dettaglio.sincronizza')} title={t('dettaglio.sincronizza')}>
                {inCorso ? <span className="caricamento caricamento--scuro" /> : <IconaSync dimensione={16} />}
              </button>
            )}
          </div>
        </div>
      </div>

      <Link to={`/eventi/${evento.uuid}/nuovo-contatto`} className="pulsante pulsante--grande pulsante--pieno" style={{ marginTop: 14 }}>
        <IconaPiu dimensione={24} /> {t('dettaglio.nuova_lead')}
      </Link>

      {(lead?.length ?? 0) > 0 && (
        <div className="spazio-sopra-grande">
          <div className="ricerca">
            <span className="ricerca__icona">
              <IconaCerca />
            </span>
            <input type="search" className="campo__input ricerca__input" placeholder={t('dettaglio.cerca')} value={filtri.testo ?? ''} onChange={(e) => setFiltri({ ...filtri, testo: e.target.value })} aria-label={t('comune.cerca')} />
          </div>
          <div className="chips spazio-sopra">
            <button type="button" className={`chip chip--piccolo${!filtri.categoria ? ' chip--attivo' : ''}`} onClick={() => setFiltri({ ...filtri, categoria: undefined })}>
              {t('comune.tutti')}
            </button>
            {categorie.map((c) => (
              <button key={c} type="button" className={`chip chip--piccolo${filtri.categoria === c ? ' chip--attivo' : ''}`} onClick={() => setFiltri({ ...filtri, categoria: filtri.categoria === c ? undefined : c })}>
                {c}
              </button>
            ))}
            <select className="campo__select campo__select--piccolo" value={filtri.consenso ?? ''} onChange={(e) => setFiltri({ ...filtri, consenso: (e.target.value || undefined) as FiltriLead['consenso'] })} aria-label={t('dettaglio.filtro_consenso')}>
              <option value="">{t('dettaglio.filtro_consenso')}: {t('comune.tutti')}</option>
              <option value="si">{t('dettaglio.consenso_si')}</option>
              <option value="no">{t('dettaglio.consenso_no')}</option>
              <option value="nessuno">{t('dettaglio.consenso_nessuno')}</option>
            </select>
          </div>
        </div>
      )}

      {reportPronto && (
        <Modale
          titolo={t('report.pronto')}
          onChiudi={() => setReportPronto(null)}
          azioni={
            <>
              <button type="button" className="pulsante pulsante--neutro" onClick={() => { scaricaFile(reportPronto.blob, reportPronto.nome); setReportPronto(null) }}>
                {t('report.scarica')}
              </button>
              {condivisionePossibile(reportPronto.blob, reportPronto.nome) && (
                <button type="button" className="pulsante" onClick={() => void condividi()}>
                  {t('report.condividi')}
                </button>
              )}
            </>
          }
        >
          <p>{t('report.pronto_testo')}</p>
          <p className="mini spazio-sopra">{reportPronto.nome}</p>
        </Modale>
      )}

      <div className="spazio-sopra-grande">
        {lead === undefined ? null : lead.length === 0 ? (
          <div className="card">
            <Vuoto icona={<IconaPersona dimensione={40} />} titolo={t('dettaglio.nessuna_lead_titolo')} testo={t('dettaglio.nessuna_lead_testo')} />
          </div>
        ) : filtrate.length === 0 ? (
          <div className="card">
            <Vuoto titolo={t('dettaglio.nessun_risultato')} />
          </div>
        ) : (
          <>
            <p className="mini" style={{ marginBottom: 8 }}>
              {filtrate.length === lead.length ? tp('eventi.lead', lead.length) : t('dettaglio.mostrati', { mostrati: filtrate.length, totale: lead.length })}
            </p>
            <div className="elenco">
              {filtrate.map((l) => {
                const fotoLead = foto?.get(l.uuid) ?? []
                const sotto = [l.azienda || l.professione, l.citta, l.email || l.telefono].filter(Boolean).join(' · ')
                return (
                  <Link key={l.uuid} to={`/contatti/${l.uuid}`} className="voce-lead">
                    <Avatar lead={l} foto={fotoLead.find((f) => f.tipo === 'volto') ?? fotoLead[0]} />
                    <div className="voce-lead__corpo">
                      <div className="riga riga--spazio" style={{ flexWrap: 'nowrap' }}>
                        <div className="voce-lead__nome">{nomeCompleto(l, t('lead.senza_nome'))}</div>
                        {l.categoria && <Pillola tono="blu">{l.categoria}</Pillola>}
                      </div>
                      {sotto && <div className="voce-lead__sotto">{sotto}</div>}
                      <div className="voce-lead__stati">
                        <StatoLead lead={l} operazioni={operazioni} collegato={collegato} nFoto={fotoLead.length} nFotoInviate={fotoLead.filter((f) => f.plexus_foto_id !== null).length} />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </Pagina>
  )
}
