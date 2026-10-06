// Impostazioni: collegamento a Plexus (indirizzo + codice), stato della sincronizzazione e della coda,
// lingua dell'app, dati sul dispositivo, istruzioni per l'installazione.
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pagina } from '../componenti/Pagina'
import { Campo } from '../componenti/Campo'
import { Pillola } from '../componenti/Pillola'
import { SceltaLingua } from '../componenti/Chips'
import { IconaNuvola, IconaSync } from '../componenti/Icone'
import { useToast } from '../componenti/Toast'
import { useConferma } from '../componenti/Modale'
import { useT, LINGUE_INTERFACCIA } from '../i18n'
import { brand } from '../config/brand'
import { db } from '../dati/db'
import { accoda } from '../dati/coda'
import { useMotore, useOperazioniAperte } from '../hooks/useMotore'
import { useLinguaInterfaccia } from '../hooks/useImpostazioni'
import { useRete } from '../hooks/useRete'
import { motore } from '../sync/istanza'
import { ErrorePlexus, problemaUrlPlexus } from '../plexus/client'
import { versioneApiAlmeno } from '../plexus/tipi'
import { formattaDataOra } from '../utils/date'
import { formattaByte } from '../utils/immagini'
import { nomeCompleto } from '../utils/testo'

export function SchermataImpostazioni() {
  const { t, tp, lingua } = useT()
  const avvisa = useToast()
  const conferma = useConferma()
  const online = useRete()
  const { collegamento, inCorso, ultimaSync, ultimoEsito } = useMotore()
  const operazioni = useOperazioniAperte()
  const [linguaApp, impostaLingua] = useLinguaInterfaccia()
  const [url, setUrl] = useState('')
  const [codice, setCodice] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [verifica, setVerifica] = useState(false)
  const conteggi = useLiveQuery(async () => ({ eventi: await db.eventi.count(), lead: await db.lead.count(), foto: await db.foto.count() }), [])
  const [spazio, setSpazio] = useState<{ usato: number; totale: number } | null>(null)

  useEffect(() => {
    if (collegamento) setUrl(collegamento.url)
    else if (!url && brand.plexus.url_predefinito) setUrl(brand.plexus.url_predefinito)
  }, [collegamento])

  useEffect(() => {
    navigator.storage?.estimate?.().then((s) => setSpazio({ usato: s.usage ?? 0, totale: s.quota ?? 0 })).catch(() => undefined)
  }, [conteggi])

  async function collega() {
    const problema = problemaUrlPlexus(url)
    if (problema === 'vuoto' || problema === 'non_valido') return setErrore(t('impostazioni.errore_url'))
    if (problema === 'non_sicuro') return setErrore(t('impostazioni.errore_https'))
    if (!codice.trim().startsWith('plx_')) return setErrore(t('impostazioni.errore_codice'))
    setErrore(null)
    setVerifica(true)
    try {
      await motore.collega(url.trim(), codice.trim())
      setCodice('')
      avvisa(t('impostazioni.collegato'), 'verde')
    } catch (e) {
      if (e instanceof ErrorePlexus) {
        if (e.codice === 401) setErrore(t('impostazioni.errore_401'))
        else if (e.codice === 403) setErrore(t('impostazioni.errore_403'))
        else if (e.tipo === 'rete') setErrore(t('impostazioni.errore_rete'))
        else setErrore(t('impostazioni.errore_risposta', { dettaglio: e.message }))
      } else setErrore(t('comune.errore_generico'))
    } finally {
      setVerifica(false)
    }
  }

  async function scollega() {
    const ok = await conferma({ titolo: t('impostazioni.scollega'), testo: t('impostazioni.scollega_conferma'), testoConferma: t('impostazioni.scollega'), pericolo: true })
    if (!ok) return
    await motore.scollega()
    setCodice('')
  }

  const inAttesa = operazioni.filter((o) => o.stato !== 'errore').length
  const inErrore = operazioni.filter((o) => o.stato === 'errore')
  const collegato = collegamento !== null && collegamento.stato === 'ok'

  return (
    <Pagina titolo={t('impostazioni.titolo')} indietro="/">
      <div className="card">
        <div className="card__titolo">
          <h2>{t('impostazioni.plexus_titolo')}</h2>
          {collegamento && <Pillola tono={collegato ? 'verde' : 'rosso'} punto>{collegato ? t('impostazioni.collegato') : t('impostazioni.ricollega_titolo')}</Pillola>}
        </div>
        {collegamento && collegato ? (
          <div>
            <div className="riga" style={{ gap: 12 }}>
              <IconaNuvola dimensione={28} />
              <div>
                <div className="grassetto">{collegamento.azienda}</div>
                <div className="mini">
                  {nomeCompleto({ nome: collegamento.utente.nome }, collegamento.utente.email)} · {collegamento.utente.email} · {collegamento.url}
                </div>
              </div>
            </div>
            <p className="pillole spazio-sopra">
              <Pillola tono={collegamento.posta_lead_pronta ? 'verde' : 'ambra'}>{collegamento.posta_lead_pronta ? t('impostazioni.posta_pronta') : t('impostazioni.posta_non_pronta')}</Pillola>
              <Pillola tono={versioneApiAlmeno(collegamento.api, '1.1') ? 'blu' : 'ambra'}>{t('impostazioni.versione_api', { versione: collegamento.api ?? '1.0' })}</Pillola>
            </p>
            {!versioneApiAlmeno(collegamento.api, '1.1') && <p className="mini spazio-sopra">{t('impostazioni.api_vecchia', { versione: collegamento.api ?? '1.0' })}</p>}
            <div className="riga spazio-sopra-grande">
              <button type="button" className="pulsante pulsante--pericolo pulsante--piccolo" onClick={() => void scollega()}>
                {t('impostazioni.scollega')}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void collega()
            }}
            noValidate
          >
            {collegamento && collegamento.stato !== 'ok' && (
              <div className="avviso avviso--rosso" style={{ marginBottom: 12 }}>
                <span className="avviso__testo">{collegamento.stato === 'permesso_negato' ? t('impostazioni.permesso_negato') : t('impostazioni.token_revocato')}</span>
              </div>
            )}
            <p className="secondario" style={{ marginBottom: 12 }}>{t('impostazioni.plexus_aiuto')}</p>
            <Campo etichetta={t('impostazioni.indirizzo')} placeholder={t('impostazioni.indirizzo_segnaposto')} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Campo etichetta={t('impostazioni.codice')} placeholder={t('impostazioni.codice_segnaposto')} type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" value={codice} onChange={(e) => setCodice(e.target.value)} errore={errore} />
            <div className="riga">
              <button type="submit" className="pulsante" disabled={verifica}>
                {verifica ? <span className="caricamento" /> : null} {verifica ? t('impostazioni.collegamento_in_corso') : t('impostazioni.collega')}
              </button>
              {collegamento && (
                <button type="button" className="pulsante pulsante--pericolo pulsante--piccolo" onClick={() => void scollega()}>
                  {t('impostazioni.scollega')}
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <div className="card__titolo">
          <h2>{t('impostazioni.sync_titolo')}</h2>
          {collegato && (
            <button type="button" className="pulsante pulsante--secondario pulsante--piccolo" onClick={() => void motore.sincronizza('manuale')} disabled={inCorso || !online}>
              {inCorso ? <span className="caricamento caricamento--scuro" /> : <IconaSync dimensione={16} />} {t('impostazioni.sincronizza_ora')}
            </button>
          )}
        </div>
        {!collegamento ? (
          <p className="secondario">{t('impostazioni.sync_non_collegato')}</p>
        ) : (
          <div className="colonna">
            <div>{inCorso ? t('impostazioni.sync_in_corso') : operazioni.length === 0 ? t('impostazioni.sync_niente') : tp('impostazioni.sync_in_attesa', inAttesa, ['_uno', '_molte'])}</div>
            {inErrore.length > 0 && <div className="secondario">{tp('impostazioni.sync_errori', inErrore.length, ['_uno', '_molti'])}</div>}
            <div className="mini">{ultimaSync ? t('impostazioni.sync_ultima', { data: formattaDataOra(ultimaSync, lingua) }) : t('impostazioni.sync_mai')}</div>
            {ultimoEsito?.errore && ultimoEsito.errore !== 'interrotta' && <div className="mini" style={{ color: 'var(--rosso)' }}>{ultimoEsito.errore === 'rete' ? t('impostazioni.errore_rete') : ultimoEsito.errore}</div>}
            {inErrore.length > 0 && (
              <div>
                <span className="etichetta">{t('impostazioni.coda_titolo')}</span>
                <div className="elenco">
                  {inErrore.map((o) => (
                    <div key={o.id} className="card card--compatta" style={{ margin: 0, boxShadow: 'none', background: 'var(--sfondo)' }}>
                      <div className="riga riga--spazio">
                        <div>
                          <Pillola tono="rosso">{t(`impostazioni.op_${o.tipo}` as const)}</Pillola>
                          <div className="mini spazio-sopra">
                            {o.ultimo_errore} · {t('impostazioni.op_tentativi', { n: o.tentativi })}
                          </div>
                        </div>
                        <button type="button" className="pulsante pulsante--neutro pulsante--piccolo" onClick={() => void accoda(db, o.tipo, o.riferimento).then(() => motore.sincronizza('manuale'))} disabled={!online}>
                          {t('impostazioni.op_riprova')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {LINGUE_INTERFACCIA.length > 1 && (
        <div className="card">
          <div className="card__titolo">
            <h2>{t('impostazioni.lingua_titolo')}</h2>
          </div>
          <SceltaLingua lingue={Object.fromEntries(LINGUE_INTERFACCIA.map((l) => [l, brand.lingue.disponibili[l] ?? l.toUpperCase()]))} valore={linguaApp} onCambia={(l) => void impostaLingua(l)} />
        </div>
      )}

      <div className="card">
        <div className="card__titolo">
          <h2>{t('impostazioni.dati_titolo')}</h2>
        </div>
        <p>{conteggi ? t('impostazioni.dati_riepilogo', { eventi: conteggi.eventi, lead: conteggi.lead, foto: conteggi.foto }) : '…'}</p>
        {spazio && spazio.totale > 0 && <p className="mini">{t('impostazioni.spazio', { usato: formattaByte(spazio.usato, lingua), totale: formattaByte(spazio.totale, lingua) })}</p>}
        <p className="mini spazio-sopra">{t('impostazioni.dati_aiuto')}</p>
      </div>

      <div className="card">
        <div className="card__titolo">
          <h2>{t('impostazioni.installa_titolo')}</h2>
        </div>
        <p className="secondario">{t('impostazioni.installa_aiuto')}</p>
        <p className="mini spazio-sopra-grande">{t('impostazioni.versione', { versione: __VERSIONE_APP__ })}</p>
      </div>
    </Pagina>
  )
}
