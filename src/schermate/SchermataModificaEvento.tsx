// Creazione e modifica di un evento: dati generali, questionario (con traduzioni facoltative) e categorie rapide.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pagina } from '../componenti/Pagina'
import { Campo, CampoSelect, CampoTesto, Interruttore } from '../componenti/Campo'
import { IconaCestino, IconaGiu, IconaPiu, IconaSu } from '../componenti/Icone'
import { useToast } from '../componenti/Toast'
import { useConferma } from '../componenti/Modale'
import { useT } from '../i18n'
import { brand, lineeAttive, testoIn } from '../config/brand'
import { creaEvento, aggiornaEvento, archiviaEvento, eliminaEvento, leggiEvento, type CampiEvento } from '../dati/archivio'
import { useCollegato, useOperazioniAperte } from '../hooks/useMotore'
import { Pillola } from '../componenti/Pillola'
import { db } from '../dati/db'
import type { Domanda } from '../dati/tipi'
import { oggiIso } from '../utils/date'

/** Versione "da modulo" di una domanda: le opzioni sono testo con una riga per opzione. */
interface DomandaModulo {
  chiave: number
  domanda: string
  opzioni: string
  multipla: boolean
  consenso: boolean
  traduzioni: Record<string, { domanda: string; opzioni: string }>
  traduzioniAperte: boolean
}

let contatoreChiavi = 1

function daDomanda(d: Domanda): DomandaModulo {
  const traduzioni: DomandaModulo['traduzioni'] = {}
  for (const [l, tr] of Object.entries(d.traduzioni ?? {})) traduzioni[l] = { domanda: tr.domanda, opzioni: tr.opzioni.join('\n') }
  return { chiave: contatoreChiavi++, domanda: d.domanda, opzioni: d.opzioni.join('\n'), multipla: Boolean(d.multipla), consenso: Boolean(d.consenso), traduzioni, traduzioniAperte: false }
}

function righe(testo: string): string[] {
  return testo.split('\n').map((r) => r.trim()).filter(Boolean)
}

function aDomanda(m: DomandaModulo): Domanda {
  const d: Domanda = { domanda: m.domanda.trim(), opzioni: righe(m.opzioni), multipla: m.multipla, consenso: m.consenso }
  const traduzioni: Domanda['traduzioni'] = {}
  for (const [l, tr] of Object.entries(m.traduzioni)) {
    const td = tr.domanda.trim()
    const to = righe(tr.opzioni)
    if (td && to.length === d.opzioni.length) traduzioni[l] = { domanda: td, opzioni: to }
  }
  if (Object.keys(traduzioni).length) d.traduzioni = traduzioni
  return d
}

export function SchermataModificaEvento() {
  const { t, tp, lingua } = useT()
  const { uuid } = useParams()
  const naviga = useNavigate()
  const avvisa = useToast()
  const conferma = useConferma()
  // undefined = sto caricando (o nuovo evento); null = l'evento richiesto non esiste
  const esistente = useLiveQuery(() => (uuid ? leggiEvento(uuid).then((e) => e ?? null) : Promise.resolve(undefined)), [uuid])
  const nLead = useLiveQuery(() => (uuid ? db.lead.where('evento_uuid').equals(uuid).count() : Promise.resolve(0)), [uuid])
  const modifica = Boolean(uuid)
  const altreLingue = useMemo(() => Object.keys(brand.lingue.disponibili).filter((l) => l !== brand.lingue.principale), [])

  const collegato = useCollegato()
  const operazioni = useOperazioniAperte()
  const [campi, setCampi] = useState<Omit<CampiEvento, 'questionario'>>({
    nome: '', luogo: '', data_inizio: oggiIso(), data_fine: oggiIso(), note: '', lingua: brand.lingue.principale, linea: brand.linea_predefinita,
    categorie_suggerite: [...brand.categorie_predefinite], ringraziamento_attivo: true, archiviato: false,
  })
  const [domande, setDomande] = useState<DomandaModulo[]>(() => brand.questionario_predefinito.map(daDomanda))
  const [errori, setErrori] = useState<string[]>([])
  const [salvataggio, setSalvataggio] = useState(false)
  const [caricato, setCaricato] = useState(false)
  const sporco = useRef(false)

  useEffect(() => {
    if (esistente === null) naviga('/', { replace: true })
  }, [esistente, naviga])

  useEffect(() => {
    if (!esistente || caricato) return
    const { questionario, uuid: _u, origine: _o, plexus_id: _p, creato_il: _c, aggiornato_il: _a, ...resto } = esistente
    setCampi({ ...resto, archiviato: resto.archiviato === true })
    setDomande(questionario.map(daDomanda))
    setCaricato(true)
  }, [esistente, caricato])

  const archiviato = esistente?.archiviato === true
  const daInviare = Boolean(esistente) && operazioni.some((o) => o.riferimento === esistente?.uuid || (o.tipo !== 'invia_evento' && o.tipo !== 'aggiorna_questionario'))

  // Qualsiasi modifica ai campi o alle domande segna il modulo come "da salvare".
  const primoRender = useRef(true)
  useEffect(() => {
    if (primoRender.current) {
      primoRender.current = false
      return
    }
    if (caricato || !modifica) sporco.current = true
    // eslint: campi/domande sono proprio ciò che vogliamo osservare
  }, [campi, domande]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const avverti = (e: BeforeUnloadEvent) => {
      if (sporco.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', avverti)
    return () => window.removeEventListener('beforeunload', avverti)
  }, [])

  async function annulla() {
    if (sporco.current) {
      const ok = await conferma({ titolo: t('comune.attenzione'), testo: t('evento.annulla_conferma'), testoConferma: t('comune.conferma'), pericolo: true })
      if (!ok) return
    }
    sporco.current = false
    naviga(uuid ? `/eventi/${uuid}` : '/', { replace: true })
  }

  function aggiornaDomanda(chiave: number, modifiche: Partial<DomandaModulo>) {
    setDomande((d) => d.map((x) => (x.chiave === chiave ? { ...x, ...modifiche } : x)))
  }
  function sposta(indice: number, verso: -1 | 1) {
    setDomande((d) => {
      const nuovo = [...d]
      const a = indice
      const b = indice + verso
      if (b < 0 || b >= nuovo.length) return d
      ;[nuovo[a], nuovo[b]] = [nuovo[b], nuovo[a]]
      return nuovo
    })
  }

  function controlla(): string[] {
    const problemi: string[] = []
    if (!campi.nome.trim()) problemi.push(t('evento.errore_nome'))
    if (campi.data_inizio && campi.data_fine && campi.data_fine < campi.data_inizio) problemi.push(t('evento.errore_date'))
    if (domande.some((d) => !d.domanda.trim() || righe(d.opzioni).length < 2)) problemi.push(t('evento.errore_opzioni'))
    if (domande.some((d) => new Set(righe(d.opzioni)).size !== righe(d.opzioni).length)) problemi.push(t('evento.errore_opzioni_doppie'))
    if (domande.filter((d) => d.consenso).length > 1) problemi.push(t('evento.errore_consenso_doppio'))
    if (domande.some((d) => d.consenso && righe(d.opzioni).length !== 2)) problemi.push(t('evento.errore_consenso_opzioni'))
    for (const d of domande) {
      for (const tr of Object.values(d.traduzioni)) {
        const to = righe(tr.opzioni)
        if ((tr.domanda.trim() || to.length) && to.length !== righe(d.opzioni).length) {
          problemi.push(t('evento.errore_traduzione'))
          break
        }
      }
    }
    return [...new Set(problemi)]
  }

  async function salva() {
    const problemi = controlla()
    setErrori(problemi)
    if (problemi.length) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSalvataggio(true)
    try {
      const questionario = domande.map(aDomanda)
      if (uuid) {
        await aggiornaEvento(uuid, { ...campi, questionario })
        sporco.current = false
        avvisa(t('evento.salvato'), 'verde')
        naviga(`/eventi/${uuid}`, { replace: true })
      } else {
        const evento = await creaEvento({ ...campi, questionario })
        sporco.current = false
        avvisa(t('evento.creato'), 'verde')
        naviga(`/eventi/${evento.uuid}`, { replace: true })
      }
    } catch {
      avvisa(t('comune.errore_generico'), 'rosso')
    } finally {
      setSalvataggio(false)
    }
  }

  /** Archivia (o riapre) l'evento: sparisce dall'elenco e, se collegati, viene chiuso anche in Plexus. */
  async function archivia(valore: boolean) {
    if (!uuid) return
    if (valore) {
      const ok = await conferma({ titolo: t('evento.archivia'), testo: t('evento.archivia_conferma'), testoConferma: t('evento.archivia') })
      if (!ok) return
    }
    try {
      await archiviaEvento(uuid, valore)
      sporco.current = false
      naviga(valore ? '/' : `/eventi/${uuid}`, { replace: true })
    } catch {
      avvisa(t('comune.errore_generico'), 'rosso')
    }
  }

  /** Toglie l'evento (con i suoi contatti e le foto) solo da questo dispositivo. */
  async function rimuoviDalDispositivo() {
    if (!uuid) return
    const ok = await conferma({ titolo: t('evento.rimuovi_dispositivo'), testo: tp('evento.rimuovi_conferma', nLead ?? 0), testoConferma: t('evento.rimuovi_dispositivo'), pericolo: true })
    if (!ok) return
    try {
      await eliminaEvento(uuid)
      sporco.current = false
      naviga('/', { replace: true })
    } catch {
      avvisa(t('comune.errore_generico'), 'rosso')
    }
  }

  const [nuovaCategoria, setNuovaCategoria] = useState('')

  return (
    <Pagina titolo={modifica ? t('evento.modifica_titolo') : t('evento.nuovo_titolo')} indietro={uuid ? `/eventi/${uuid}` : '/'} onIndietro={() => void annulla()}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void salva()
        }}
        noValidate
      >
        {errori.length > 0 && (
          <div className="avviso avviso--rosso" role="alert" style={{ marginBottom: 14 }}>
            <div className="avviso__testo">
              {errori.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          </div>
        )}
        {archiviato && (
          <div className="avviso avviso--blu" style={{ marginBottom: 14 }}>
            <span className="avviso__testo">{t('evento.archiviato_avviso')}</span>
            <button type="button" className="pulsante pulsante--piccolo" onClick={() => void archivia(false)}>
              {t('evento.riapri')}
            </button>
          </div>
        )}

        <div className="card">
          <Campo etichetta={t('evento.nome')} placeholder={t('evento.nome_segnaposto')} value={campi.nome} onChange={(e) => setCampi({ ...campi, nome: e.target.value })} required autoFocus={!modifica} />
          <Campo etichetta={t('evento.luogo')} placeholder={t('evento.luogo_segnaposto')} value={campi.luogo} onChange={(e) => setCampi({ ...campi, luogo: e.target.value })} />
          <div className="griglia-campi griglia-campi--2">
            <Campo etichetta={t('evento.data_inizio')} type="date" value={campi.data_inizio} onChange={(e) => setCampi({ ...campi, data_inizio: e.target.value, data_fine: campi.data_fine < e.target.value ? e.target.value : campi.data_fine })} />
            <Campo etichetta={t('evento.data_fine')} type="date" value={campi.data_fine} min={campi.data_inizio || undefined} onChange={(e) => setCampi({ ...campi, data_fine: e.target.value })} />
          </div>
          <div className="griglia-campi griglia-campi--2">
{lineeAttive() && (
            <CampoSelect etichetta={t('evento.linea')} value={campi.linea} onChange={(e) => setCampi({ ...campi, linea: e.target.value })}>
              {Object.keys(brand.linee).map((k) => (
                <option key={k} value={k}>
                  {testoIn(brand.linee[k], lingua)}
                </option>
              ))}
            </CampoSelect>
            )}
            <CampoSelect etichetta={t('evento.lingua')} value={campi.lingua} onChange={(e) => setCampi({ ...campi, lingua: e.target.value })}>
              {Object.entries(brand.lingue.disponibili).map(([k, nome]) => (
                <option key={k} value={k}>
                  {nome}
                </option>
              ))}
            </CampoSelect>
          </div>
          <CampoTesto etichetta={t('evento.note')} placeholder={t('evento.note_segnaposto')} value={campi.note} onChange={(e) => setCampi({ ...campi, note: e.target.value })} rows={2} />
          <Interruttore etichetta={t('evento.ringraziamento')} aiuto={t('evento.ringraziamento_aiuto')} acceso={campi.ringraziamento_attivo} onChange={(v) => setCampi({ ...campi, ringraziamento_attivo: v })} />
        </div>

        <div className="card">
          <div className="card__titolo">
            <div>
              <h2>{t('evento.categorie')}</h2>
              <p className="mini">{t('evento.categorie_aiuto')}</p>
            </div>
          </div>
          <div className="chips">
            {campi.categorie_suggerite.map((c) => (
              <span key={c} className="chip chip--piccolo" style={{ gap: 8 }}>
                {c}
                <button type="button" className="pulsante-nudo pulsante-nudo--tocco" onClick={() => setCampi({ ...campi, categorie_suggerite: campi.categorie_suggerite.filter((x) => x !== c) })} aria-label={`${t('comune.rimuovi')} ${c}`}>
                  <IconaCestino dimensione={16} />
                </button>
              </span>
            ))}
            <input
              className="campo__input"
              style={{ flex: 1, minWidth: 180, minHeight: 36 }}
              placeholder={t('evento.categoria_nuova')}
              aria-label={t('evento.categoria_nuova')}
              value={nuovaCategoria}
              onChange={(e) => setNuovaCategoria(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const v = nuovaCategoria.trim()
                  if (v && !campi.categorie_suggerite.includes(v)) setCampi({ ...campi, categorie_suggerite: [...campi.categorie_suggerite, v] })
                  setNuovaCategoria('')
                }
              }}
              onBlur={() => {
                const v = nuovaCategoria.trim()
                if (v && !campi.categorie_suggerite.includes(v)) setCampi({ ...campi, categorie_suggerite: [...campi.categorie_suggerite, v] })
                setNuovaCategoria('')
              }}
            />
          </div>
        </div>

        <div className="card">
          <div className="card__titolo">
            <div>
              <h2>{t('evento.questionario')}</h2>
              <p className="mini">{t('evento.questionario_aiuto')}</p>
            </div>
          </div>
          {domande.map((d, i) => (
            <div key={d.chiave} className="card card--compatta" style={{ background: 'var(--sfondo)', boxShadow: 'none', marginTop: i === 0 ? 0 : 12 }}>
              <div className="riga riga--spazio" style={{ marginBottom: 8 }}>
                <span className="etichetta" style={{ margin: 0 }}>{t('evento.domanda_n', { n: i + 1 })}{d.consenso ? ` · ${t('lead.consenso_evidenza')}` : ''}</span>
                <span className="riga" style={{ gap: 4 }}>
                  <button type="button" className="pulsante pulsante--neutro pulsante--piccolo pulsante--icona" style={{ width: 44 }} onClick={() => sposta(i, -1)} disabled={i === 0} aria-label={t('evento.sposta_su')}>
                    <IconaSu dimensione={16} />
                  </button>
                  <button type="button" className="pulsante pulsante--neutro pulsante--piccolo pulsante--icona" style={{ width: 44 }} onClick={() => sposta(i, 1)} disabled={i === domande.length - 1} aria-label={t('evento.sposta_giu')}>
                    <IconaGiu dimensione={16} />
                  </button>
                  <button type="button" className="pulsante pulsante--pericolo pulsante--piccolo pulsante--icona" style={{ width: 44 }} onClick={() => setDomande((x) => x.filter((y) => y.chiave !== d.chiave))} aria-label={t('evento.rimuovi_domanda')}>
                    <IconaCestino dimensione={16} />
                  </button>
                </span>
              </div>
              <Campo etichetta={t('evento.domanda')} placeholder={t('evento.domanda_segnaposto')} value={d.domanda} onChange={(e) => aggiornaDomanda(d.chiave, { domanda: e.target.value })} />
              <CampoTesto etichetta={t('evento.opzioni')} placeholder={t('evento.opzioni_segnaposto')} value={d.opzioni} onChange={(e) => aggiornaDomanda(d.chiave, { opzioni: e.target.value })} rows={Math.min(10, Math.max(3, d.opzioni.split('\n').length + 1))} />
              <Interruttore etichetta={t('evento.multipla')} acceso={d.multipla} onChange={(v) => aggiornaDomanda(d.chiave, { multipla: v })} />
              <Interruttore etichetta={t('evento.consenso_domanda')} aiuto={d.consenso ? t('evento.consenso_aiuto') : undefined} acceso={d.consenso} onChange={(v) => aggiornaDomanda(d.chiave, { consenso: v, multipla: v ? false : d.multipla })} />
              {altreLingue.length > 0 && (
                <div>
                  <button type="button" className="pulsante pulsante--testo pulsante--piccolo" onClick={() => aggiornaDomanda(d.chiave, { traduzioniAperte: !d.traduzioniAperte })}>
                    {d.traduzioniAperte ? <IconaSu dimensione={16} /> : <IconaGiu dimensione={16} />} {altreLingue.map((l) => t('evento.traduzione', { lingua: brand.lingue.disponibili[l] })).join(' · ')}
                  </button>
                  {d.traduzioniAperte &&
                    altreLingue.map((l) => (
                      <div key={l} style={{ marginTop: 8 }}>
                        <Campo etichetta={t('evento.traduzione', { lingua: brand.lingue.disponibili[l] })} value={d.traduzioni[l]?.domanda ?? ''} onChange={(e) => aggiornaDomanda(d.chiave, { traduzioni: { ...d.traduzioni, [l]: { domanda: e.target.value, opzioni: d.traduzioni[l]?.opzioni ?? '' } } })} />
                        <CampoTesto etichetta={t('evento.traduzione_opzioni')} value={d.traduzioni[l]?.opzioni ?? ''} onChange={(e) => aggiornaDomanda(d.chiave, { traduzioni: { ...d.traduzioni, [l]: { domanda: d.traduzioni[l]?.domanda ?? '', opzioni: e.target.value } } })} rows={Math.min(10, Math.max(3, (d.traduzioni[l]?.opzioni ?? '').split('\n').length + 1))} />
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
          <button type="button" className="pulsante pulsante--secondario spazio-sopra" onClick={() => setDomande((d) => [...d, { chiave: contatoreChiavi++, domanda: '', opzioni: '', multipla: false, consenso: false, traduzioni: {}, traduzioniAperte: false }])}>
            <IconaPiu /> {t('evento.aggiungi_domanda')}
          </button>
        </div>

        {modifica && (
          <div className="card">
            <div className="riga" style={{ gap: 10 }}>
              {!archiviato && (
                <button type="button" className="pulsante pulsante--neutro" onClick={() => void archivia(true)}>
                  {t('evento.archivia')}
                </button>
              )}
              {archiviato && (
                <button type="button" className="pulsante pulsante--secondario" onClick={() => void archivia(false)}>
                  {t('evento.riapri')}
                </button>
              )}
              {(archiviato || !collegato) && (
                <button type="button" className="pulsante pulsante--pericolo" onClick={() => void rimuoviDalDispositivo()} disabled={collegato && daInviare} title={collegato && daInviare ? t('evento.rimuovi_bloccato') : undefined}>
                  <IconaCestino /> {t('evento.rimuovi_dispositivo')}
                </button>
              )}
            </div>
            {collegato && daInviare && archiviato && <p className="mini spazio-sopra">{t('evento.rimuovi_bloccato')}</p>}
            {archiviato && esistente?.plexus_id !== null && collegato && !daInviare && (
              <p className="mini spazio-sopra">
                <Pillola tono="verde">{t('evento.archiviato_il_plexus')}</Pillola>
              </p>
            )}
          </div>
        )}
        <div className="barra-azioni">
          <button type="submit" className="pulsante pulsante--grande" disabled={salvataggio}>
            {salvataggio ? <span className="caricamento" /> : t('comune.salva')}
          </button>
        </div>
      </form>
    </Pagina>
  )
}
