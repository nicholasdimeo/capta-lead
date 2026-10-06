// Registrazione (o modifica) di un contatto allo stand, in tre passi veloci:
//   1. Dati del contatto (nome, email, ...) e lingua
//   2. Informativa privacy + questionario (si può passare il dispositivo al visitatore: testi nella sua lingua)
//   3. Note di chi è allo stand, categoria, foto
// Tutto viene salvato sul dispositivo in un'unica operazione (contatto + foto); l'invio a Plexus lo fa il
// motore di sincronizzazione. Per un contatto nuovo l'app tiene una bozza: se l'app viene chiusa o ricaricata
// a metà, alla riapertura si riparte da dove si era.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useMatch, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pagina } from '../componenti/Pagina'
import { Campo, CampoTesto } from '../componenti/Campo'
import { ChipScelta, SceltaLingua } from '../componenti/Chips'
import { Questionario } from '../componenti/Questionario'
import { FotoInput, GalleriaFoto, type FotoScelta, type VoceGalleria } from '../componenti/Foto'
import { IconaGiu, IconaSu } from '../componenti/Icone'
import { useToast } from '../componenti/Toast'
import { useConferma } from '../componenti/Modale'
import { useT, tPer } from '../i18n'
import { brand, testoIn } from '../config/brand'
import { aggiornaLead, cancellaImpostazione, consensoDalleRisposte, creaLead, leggiEvento, leggiImpostazione, leggiLead, salvaImpostazione, CAMPI_LEAD_VUOTI, type CampiLead } from '../dati/archivio'
import type { Risposta, TipoFoto } from '../dati/tipi'
import { emailValida } from '../utils/testo'

type Passo = 1 | 2 | 3
type FotoNuova = FotoScelta & { chiave: string }

interface Bozza {
  campi: CampiLead
  passo: Passo
  foto: FotoNuova[]
}

const chiaveBozza = (eventoUuid: string) => `bozza_contatto_${eventoUuid}`

export function SchermataLead() {
  const { t, lingua: linguaApp } = useT()
  const { uuid = '' } = useParams()
  const naviga = useNavigate()
  const avvisa = useToast()
  const conferma = useConferma()
  // /eventi/:uuid/nuovo-contatto → uuid è l'evento; /contatti/:uuid/modifica → uuid è la lead
  const modifica = useMatch('/contatti/:uuid/modifica') !== null
  // undefined = sto caricando; null = non esiste
  const leadEsistente = useLiveQuery(() => (modifica ? leggiLead(uuid).then((l) => l ?? null) : Promise.resolve(undefined)), [uuid, modifica])
  const eventoUuid = modifica ? leadEsistente?.evento_uuid : uuid
  const evento = useLiveQuery(() => (eventoUuid ? leggiEvento(eventoUuid).then((e) => e ?? null) : Promise.resolve(undefined)), [eventoUuid])
  const bozzaSalvata = useLiveQuery(() => (!modifica && uuid ? leggiImpostazione<Bozza | null>(chiaveBozza(uuid), null) : Promise.resolve(null)), [uuid, modifica])

  const [passo, setPasso] = useState<Passo>(1)
  const [campi, setCampi] = useState<CampiLead>({ ...CAMPI_LEAD_VUOTI, lingua: brand.lingue.principale })
  const [nuoveFoto, setNuoveFoto] = useState<FotoNuova[]>([])
  const [errori, setErrori] = useState<Partial<Record<'nome' | 'email', string>>>({})
  const [mancanti, setMancanti] = useState<Set<string>>(new Set())
  const [altriDatiAperti, setAltriDatiAperti] = useState(false)
  const [privacyAperta, setPrivacyAperta] = useState(true)
  const [salvataggio, setSalvataggio] = useState(false)
  const caricato = useRef(false)
  const sporco = useRef(false)

  // Carica i dati iniziali una volta sola: la lead da modificare, oppure la bozza, oppure i valori dell'evento.
  useEffect(() => {
    if (caricato.current) return
    if (modifica) {
      if (!leadEsistente) return
      const { nome, cognome, email, telefono, azienda, professione, citta, provincia, indirizzo, note, categoria, lingua, consenso, risposte } = leadEsistente
      setCampi({ nome, cognome, email, telefono, azienda, professione, citta, provincia, indirizzo, note, categoria, lingua, consenso, risposte })
      setAltriDatiAperti(Boolean(citta || provincia || indirizzo))
      caricato.current = true
      return
    }
    if (!evento || bozzaSalvata === undefined) return
    if (bozzaSalvata) {
      setCampi({ ...CAMPI_LEAD_VUOTI, ...bozzaSalvata.campi })
      setPasso(bozzaSalvata.passo)
      setNuoveFoto(bozzaSalvata.foto ?? [])
      setAltriDatiAperti(Boolean(bozzaSalvata.campi.citta || bozzaSalvata.campi.provincia || bozzaSalvata.campi.indirizzo))
      sporco.current = true
      avvisa(t('lead.bozza_ripristinata'))
    } else {
      setCampi((c) => ({ ...c, lingua: evento.lingua }))
    }
    caricato.current = true
  }, [modifica, leadEsistente, evento, bozzaSalvata, avvisa, t])

  // Bozza automatica (solo per i contatti nuovi), con un piccolo ritardo per non scrivere a ogni lettera.
  useEffect(() => {
    if (modifica || !caricato.current || !eventoUuid) return
    if (!sporco.current && nuoveFoto.length === 0) return
    const timer = setTimeout(() => {
      void salvaImpostazione(chiaveBozza(eventoUuid), { campi, passo, foto: nuoveFoto } satisfies Bozza).catch(() => undefined)
    }, 400)
    return () => clearTimeout(timer)
  }, [campi, passo, nuoveFoto, modifica, eventoUuid])

  // Ricarica o chiusura della scheda con dati non salvati: il browser chiede conferma.
  useEffect(() => {
    const avverti = (e: BeforeUnloadEvent) => {
      if (sporco.current || nuoveFoto.length > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', avverti)
    return () => window.removeEventListener('beforeunload', avverti)
  }, [nuoveFoto.length])

  // Ogni passo riparte dall'alto della pagina.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [passo])

  const tVisitatore = useMemo(() => tPer(campi.lingua), [campi.lingua])
  const questionario = evento?.questionario ?? []
  const domandaConsenso = questionario.find((d) => d.consenso)
  const categorie = useMemo(() => {
    const base = evento?.categorie_suggerite.length ? evento.categorie_suggerite : brand.categorie_predefinite
    return campi.categoria && !base.includes(campi.categoria) ? [...base, campi.categoria] : base
  }, [evento, campi.categoria])

  function aggiorna(parziale: Partial<CampiLead>) {
    sporco.current = true
    setCampi((c) => ({ ...c, ...parziale }))
  }

  function controllaPasso1(): boolean {
    const e: typeof errori = {}
    if (!campi.nome.trim() && !campi.cognome.trim() && !campi.email.trim()) e.nome = t('lead.errore_minimo')
    if (campi.email.trim() && !emailValida(campi.email)) e.email = t('lead.errore_email')
    setErrori(e)
    return Object.keys(e).length === 0
  }

  function controllaPasso2(): boolean {
    const m = new Set<string>()
    if (domandaConsenso) {
      const r = campi.risposte[domandaConsenso.domanda]
      if (!r || (Array.isArray(r) && r.length === 0)) m.add(domandaConsenso.domanda)
    }
    setMancanti(m)
    return m.size === 0
  }

  /** Invio sulla tastiera del telefono: passa al campo successivo invece di mandare il modulo. */
  function suInvio(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter') return
    const attuale = e.target as HTMLElement
    if (attuale.tagName !== 'INPUT') return
    e.preventDefault()
    const campiModulo = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([disabled])'))
    const prossimo = campiModulo[campiModulo.indexOf(attuale as HTMLInputElement) + 1]
    if (prossimo) prossimo.focus()
    else if (controllaPasso1()) setPasso(2)
  }

  function rispondi(domanda: string, risposta: Risposta) {
    sporco.current = true
    setCampi((c) => {
      const risposte = { ...c.risposte }
      if (risposta === '' || (Array.isArray(risposta) && risposta.length === 0)) delete risposte[domanda]
      else risposte[domanda] = risposta
      return { ...c, risposte, consenso: consensoDalleRisposte(questionario, risposte) }
    })
    setMancanti((m) => {
      if (!m.has(domanda)) return m
      const n = new Set(m)
      n.delete(domanda)
      return n
    })
  }

  async function salva() {
    if (!controllaPasso1()) {
      setPasso(1)
      return
    }
    if (!controllaPasso2()) {
      setPasso(2)
      return
    }
    if (!eventoUuid) return
    setSalvataggio(true)
    try {
      const dati = { ...campi, consenso: consensoDalleRisposte(questionario, campi.risposte) ?? campi.consenso }
      const fotoNuove = nuoveFoto.map((f) => ({ tipo: f.tipo, dati: f.immagine }))
      const lead = modifica ? await aggiornaLead(uuid, dati, undefined, fotoNuove) : await creaLead(eventoUuid, dati, undefined, fotoNuove)
      sporco.current = false
      if (!modifica) await cancellaImpostazione(chiaveBozza(eventoUuid)).catch(() => undefined)
      avvisa(modifica ? t('lead.aggiornato') : t('lead.salvato'), 'verde')
      naviga(modifica ? `/contatti/${lead.uuid}` : `/eventi/${eventoUuid}`, { replace: true })
    } catch (e) {
      console.error(e)
      avvisa(t('lead.errore_salvataggio'), 'rosso')
    } finally {
      setSalvataggio(false)
    }
  }

  async function annulla() {
    if (sporco.current || nuoveFoto.length) {
      const ok = await conferma({ titolo: t('comune.attenzione'), testo: t('lead.annulla_conferma'), testoConferma: t('comune.conferma'), pericolo: true })
      if (!ok) return
    }
    sporco.current = false
    if (!modifica && eventoUuid) await cancellaImpostazione(chiaveBozza(eventoUuid)).catch(() => undefined)
    naviga(modifica ? `/contatti/${uuid}` : `/eventi/${eventoUuid}`, { replace: true })
  }

  const percorsoIndietro = modifica ? (leadEsistente ? `/contatti/${uuid}` : '/') : `/eventi/${uuid}`

  if ((modifica && leadEsistente === null) || evento === null) {
    return (
      <Pagina titolo={modifica ? t('lead.titolo_modifica') : t('lead.titolo_nuova')} indietro="/">
        <div className="card">
          <p>{modifica ? t('lead.non_trovata') : t('eventi.nessuno_titolo')}</p>
          <Link to="/" className="pulsante spazio-sopra">{t('barra.eventi')}</Link>
        </div>
      </Pagina>
    )
  }
  if (modifica && leadEsistente?.solo_lettura) {
    return (
      <Pagina titolo={t('lead.titolo_modifica')} indietro={percorsoIndietro}>
        <div className="avviso avviso--blu">
          <span className="avviso__testo">{t('lead.solo_lettura')}</span>
        </div>
      </Pagina>
    )
  }
  if (!evento || (modifica && !leadEsistente) || !caricato.current) return <Pagina titolo="…" indietro={percorsoIndietro}>{null}</Pagina>

  const galleria: VoceGalleria[] = nuoveFoto.map((f) => ({ chiave: f.chiave, tipo: f.tipo, blob: f.immagine.blob, miniatura: f.immagine.miniatura }))
  const titoloPasso = passo === 1 ? t('lead.passo_dati') : passo === 2 ? t('lead.passo_questionario') : t('lead.passo_note')

  return (
    <Pagina titolo={modifica ? t('lead.titolo_modifica') : t('lead.titolo_nuova')} sottotitolo={`${t('lead.passo_di', { n: passo, tot: 3 })} · ${titoloPasso}`} indietro={percorsoIndietro} onIndietro={() => void annulla()} senzaAvvisi={passo === 2}>
      <div className="passi" aria-hidden="true">
        {[1, 2, 3].map((p) => (
          <div key={p} className={`passi__tacca${p < passo ? ' passi__tacca--fatta' : p === passo ? ' passi__tacca--attuale' : ''}`} />
        ))}
      </div>

      {passo === 1 && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (controllaPasso1()) setPasso(2)
          }}
          onKeyDown={suInvio}
          noValidate
        >
          <div className="card">
            <div className="griglia-campi griglia-campi--2">
              <Campo etichetta={t('lead.nome')} value={campi.nome} onChange={(e) => aggiorna({ nome: e.target.value })} autoComplete="off" autoCapitalize="words" errore={errori.nome} autoFocus={!modifica && !campi.nome} enterKeyHint="next" />
              <Campo etichetta={t('lead.cognome')} value={campi.cognome} onChange={(e) => aggiorna({ cognome: e.target.value })} autoComplete="off" autoCapitalize="words" enterKeyHint="next" />
            </div>
            <Campo etichetta={t('lead.email')} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="off" value={campi.email} onChange={(e) => aggiorna({ email: e.target.value })} errore={errori.email} enterKeyHint="next" />
            <div className="griglia-campi griglia-campi--2">
              <Campo etichetta={t('lead.azienda')} value={campi.azienda} onChange={(e) => aggiorna({ azienda: e.target.value })} autoComplete="off" enterKeyHint="next" />
              <Campo etichetta={t('lead.telefono')} type="tel" inputMode="tel" value={campi.telefono} onChange={(e) => aggiorna({ telefono: e.target.value })} autoComplete="off" enterKeyHint="next" />
            </div>
            <div className="campo">
              <span className="campo__etichetta">{t('lead.professione')}</span>
              <ChipScelta opzioni={brand.professioni_suggerite} valore={campi.professione} onCambia={(v) => aggiorna({ professione: v })} etichettaAltro={t('lead.professione_altra')} piccole />
            </div>
            <button type="button" className="pulsante pulsante--testo pulsante--piccolo" onClick={() => setAltriDatiAperti(!altriDatiAperti)} style={{ marginLeft: -8 }} aria-expanded={altriDatiAperti}>
              {altriDatiAperti ? <IconaSu dimensione={16} /> : <IconaGiu dimensione={16} />} {t('lead.altri_dati')}
            </button>
            {altriDatiAperti && (
              <div className="spazio-sopra">
                <div className="griglia-campi griglia-campi--2">
                  <Campo etichetta={t('lead.citta')} value={campi.citta} onChange={(e) => aggiorna({ citta: e.target.value })} autoComplete="off" autoCapitalize="words" enterKeyHint="next" />
                  <Campo etichetta={t('lead.provincia')} value={campi.provincia} onChange={(e) => aggiorna({ provincia: e.target.value })} autoComplete="off" autoCapitalize="characters" maxLength={40} enterKeyHint="next" />
                </div>
                <Campo etichetta={t('lead.indirizzo')} value={campi.indirizzo} onChange={(e) => aggiorna({ indirizzo: e.target.value })} autoComplete="off" enterKeyHint="done" />
              </div>
            )}
          </div>
          <div className="card">
            <span className="campo__etichetta" id="etichetta-lingua-contatto">{t('lead.lingua')}</span>
            <SceltaLingua lingue={brand.lingue.disponibili} valore={campi.lingua} onCambia={(l) => aggiorna({ lingua: l })} etichetta={t('lead.lingua')} />
            <p className="campo__aiuto">{t('lead.lingua_aiuto')}</p>
          </div>
          <div className="barra-azioni">
            <button type="button" className="pulsante pulsante--neutro" onClick={() => void annulla()} style={{ flex: '0 0 auto' }}>
              {t('comune.annulla')}
            </button>
            <button type="submit" className="pulsante pulsante--grande">
              {t('comune.avanti')}
            </button>
          </div>
        </form>
      )}

      {passo === 2 && (
        <div>
          <div className="riga riga--spazio" style={{ marginBottom: 12 }}>
            <p className="mini">{t('lead.al_visitatore')}</p>
            <SceltaLingua lingue={brand.lingue.disponibili} valore={campi.lingua} onCambia={(l) => aggiorna({ lingua: l })} piccole etichetta={t('comune.lingua')} />
          </div>
          <div className="card">
            <h1 style={{ fontSize: 24 }}>{tVisitatore('visitatore.saluto')}</h1>
            <p className="secondario" style={{ marginTop: 4 }}>{tVisitatore('visitatore.saluto_aiuto')}</p>
            <div className="spazio-sopra">
              {privacyAperta && (
                <div className="card card--compatta" style={{ background: 'var(--sfondo)', boxShadow: 'none', marginTop: 0 }}>
                  <h3>{testoIn(brand.privacy.titolo, campi.lingua)}</h3>
                  <p className="secondario" style={{ marginTop: 6, fontSize: 14, whiteSpace: 'pre-line' }}>{testoIn(brand.privacy.testo, campi.lingua)}</p>
                </div>
              )}
              <button type="button" className="pulsante pulsante--testo pulsante--piccolo" onClick={() => setPrivacyAperta(!privacyAperta)} style={{ marginLeft: -8 }} aria-expanded={privacyAperta}>
                {privacyAperta ? <IconaSu dimensione={16} /> : <IconaGiu dimensione={16} />} {privacyAperta ? tVisitatore('lead.privacy_nascondi') : tVisitatore('visitatore.privacy_leggi')}
              </button>
            </div>
            <div className="separatore" />
            <Questionario domande={questionario} risposte={campi.risposte} onCambia={rispondi} lingua={campi.lingua} mancanti={mancanti} />
            {mancanti.size > 0 && <p className="campo__errore">{tVisitatore('lead.consenso_obbligatorio')}</p>}
          </div>
          <div className="barra-azioni">
            <button type="button" className="pulsante pulsante--neutro" onClick={() => setPasso(1)} style={{ flex: '0 0 auto' }}>
              {tVisitatore('comune.indietro')}
            </button>
            <button
              type="button"
              className="pulsante pulsante--grande"
              onClick={() => {
                if (controllaPasso2()) setPasso(3)
              }}
            >
              {tVisitatore('comune.avanti')}
            </button>
          </div>
        </div>
      )}

      {passo === 3 && (
        <div>
          <div className="card">
            <span className="campo__etichetta">{t('lead.categoria')}</span>
            <ChipScelta opzioni={categorie} valore={campi.categoria} onCambia={(v) => aggiorna({ categoria: v })} etichettaAltro={t('lead.categoria_altra')} />
            <div className="spazio-sopra-grande">
              <CampoTesto etichetta={t('lead.note')} placeholder={t('lead.note_segnaposto')} value={campi.note} onChange={(e) => aggiorna({ note: e.target.value })} rows={3} />
            </div>
          </div>
          <div className="card">
            <div className="card__titolo">
              <div>
                <h2>{t('lead.foto')}</h2>
                <p className="mini">{t('lead.foto_aiuto')}</p>
              </div>
            </div>
            <FotoInput onScelte={(scelte) => setNuoveFoto((f) => [...f, ...scelte.map((s, i) => ({ ...s, chiave: `${Date.now()}-${i}` }))])} />
            {galleria.length > 0 && (
              <div className="spazio-sopra">
                <GalleriaFoto foto={galleria} lingua={linguaApp} onRimuovi={(chiave) => setNuoveFoto((f) => f.filter((x) => x.chiave !== chiave))} onCambiaTipo={(chiave, tipo: TipoFoto) => setNuoveFoto((f) => f.map((x) => (x.chiave === chiave ? { ...x, tipo } : x)))} />
              </div>
            )}
          </div>
          <div className="barra-azioni">
            <button type="button" className="pulsante pulsante--neutro" onClick={() => setPasso(2)} style={{ flex: '0 0 auto' }}>
              {t('comune.indietro')}
            </button>
            <button type="button" className="pulsante pulsante--grande pulsante--verde" onClick={() => void salva()} disabled={salvataggio}>
              {salvataggio ? <span className="caricamento" /> : t('lead.salva')}
            </button>
          </div>
        </div>
      )}
    </Pagina>
  )
}
