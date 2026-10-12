// Schermata iniziale: elenco degli eventi con numero di contatti e stato rispetto a Plexus.
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CHIAVE_SENZA_ACCOUNT } from './SchermataAccesso'
import { useLiveQuery as useLiveQueryImpostazione } from 'dexie-react-hooks'
import { db } from '../dati/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pagina, Vuoto } from '../componenti/Pagina'
import { Pillola } from '../componenti/Pillola'
import { IconaPiu, IconaCalendario } from '../componenti/Icone'
import { useT } from '../i18n'
import { brand, lineeAttive, testoIn } from '../config/brand'
import { contaLeadPerEvento, elencoEventi } from '../dati/archivio'
import { useCollegato, useMotore, useOperazioniAperte } from '../hooks/useMotore'
import { statoInvioEvento } from '../sync/motore'
import { eventoInCorso, formattaIntervallo, oggiIso } from '../utils/date'

export function SchermataEventi() {
  const { t, tp, lingua } = useT()
  const eventi = useLiveQuery(() => elencoEventi(), [])
  const conteggi = useLiveQuery(() => contaLeadPerEvento(), [])
  const operazioni = useOperazioniAperte()
  const collegato = useCollegato()
  const { collegamento, pronto } = useMotore()
  // undefined = sto leggendo; la scelta "senza account" fatta in passato
  const sceltaSenzaAccount = useLiveQueryImpostazione(async () => ((await db.impostazioni.get(CHIAVE_SENZA_ACCOUNT))?.valore as boolean | undefined) ?? false, [])
  const oggi = oggiIso()
  const [mostraArchiviati, setMostraArchiviati] = useState(false)
  const archiviati = (eventi ?? []).filter((e) => e.archiviato)
  const visibili = (eventi ?? []).filter((e) => mostraArchiviati || !e.archiviato)

  // Prima apertura, senza account e senza aver scelto di farne a meno: si parte dalla schermata di accesso.
  // Chi ha già dati sul dispositivo (versioni precedenti dell'app) resta sugli eventi.
  // Finché non si sa (collegamento salvato, scelta, eventi), non si mostra nulla: niente sfarfallio.
  if (!pronto || sceltaSenzaAccount === undefined || eventi === undefined) return null
  if (!collegamento && sceltaSenzaAccount === false && eventi.length === 0) return <Navigate to="/accesso" replace />

  return (
    <Pagina titolo={brand.app.nome} sottotitolo={brand.azienda.nome} mostraImpostazioni>
      <div className="intestazione">
        <div className="intestazione__testi">
          <h1>{t('eventi.titolo')}</h1>
        </div>
        <div className="intestazione__azioni">
          <Link to="/eventi/nuovo" className="pulsante">
            <IconaPiu /> {t('eventi.nuovo')}
          </Link>
        </div>
      </div>

      {!collegamento && eventi !== undefined && (
        <div className="avviso avviso--blu" style={{ marginBottom: 14 }}>
          <span className="avviso__testo">{t('account.senza_account_aiuto')}</span>
          <Link to="/accesso" className="pulsante pulsante--piccolo">
            {t('account.accedi')}
          </Link>
        </div>
      )}
      {eventi === undefined ? null : visibili.length === 0 && archiviati.length === 0 ? (
        <div className="card">
          <Vuoto
            icona={<IconaCalendario dimensione={40} />}
            titolo={t('eventi.nessuno_titolo')}
            testo={t('eventi.nessuno_testo')}
            azione={
              <Link to="/eventi/nuovo" className="pulsante pulsante--grande">
                <IconaPiu /> {t('eventi.nuovo')}
              </Link>
            }
          />
        </div>
      ) : (
        <div className="griglia griglia--2">
          {visibili.map((e) => {
            const n = conteggi?.get(e.uuid) ?? 0
            const inCorso = eventoInCorso(e.data_inizio, e.data_fine, oggi)
            const futuro = !inCorso && (e.data_inizio || e.data_fine) > oggi
            const stato = statoInvioEvento(e, operazioni, collegato)
            return (
              <Link key={e.uuid} to={`/eventi/${e.uuid}`} className={`card card--tocco${inCorso && !e.archiviato ? ' card--evidenza' : ''}`} style={{ marginTop: 0, opacity: e.archiviato ? 0.7 : 1 }}>
                <div className="riga riga--spazio" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ overflowWrap: 'anywhere' }}>{e.nome}</h2>
                    <p className="secondario" style={{ marginTop: 4 }}>
                      {[e.luogo, formattaIntervallo(e.data_inizio, e.data_fine, lingua)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="valore-grande" style={{ color: 'var(--navy)' }}>{n}</div>
                </div>
                <div className="pillole spazio-sopra">
                  <Pillola>{tp('eventi.lead', n)}</Pillola>
                  {lineeAttive() && <Pillola tono="blu">{testoIn(brand.linee[e.linea], lingua) || e.linea}</Pillola>}
                  {inCorso && <Pillola tono="verde" punto>{t('eventi.in_corso')}</Pillola>}
                  {futuro && <Pillola tono="ambra">{t('eventi.futuro')}</Pillola>}
                  {!inCorso && !futuro && (e.data_inizio || e.data_fine) && <Pillola>{t('eventi.passato')}</Pillola>}
                  {e.archiviato && <Pillola tono="navy">{t('eventi.archiviato')}</Pillola>}
                  {stato === 'da_plexus' && <Pillola tono="navy">{t('eventi.da_plexus')}</Pillola>}
                  {stato === 'inviato' && <Pillola tono="verde">{t('eventi.inviato')}</Pillola>}
                  {(stato === 'in_coda' || stato === 'errore') && <Pillola tono="ambra" punto>{t('eventi.da_inviare')}</Pillola>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
      {archiviati.length > 0 && (
        <div className="riga" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button type="button" className="pulsante pulsante--testo pulsante--piccolo" onClick={() => setMostraArchiviati(!mostraArchiviati)}>
            {mostraArchiviati ? t('eventi.nascondi_archiviati') : t('eventi.mostra_archiviati', { n: archiviati.length })}
          </button>
        </div>
      )}
    </Pagina>
  )
}
