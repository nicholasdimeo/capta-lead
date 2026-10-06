// Struttura di ogni schermata: barra in alto (logo/titolo, indietro, azioni), avvisi globali
// (senza rete, aggiornamento disponibile, collegamento da rifare) e contenuto.
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { brand } from '../config/brand'
import { useT } from '../i18n'
import { useRete } from '../hooks/useRete'
import { useMotore } from '../hooks/useMotore'
import { useAggiornamentoApp } from '../pwa'
import { IconaIndietro, IconaImpostazioni, IconaNuvola, IconaNuvolaSpenta } from './Icone'

interface Props {
  titolo: ReactNode
  sottotitolo?: ReactNode
  indietro?: string | true
  /** se presente, il pulsante indietro chiama questa funzione invece di navigare (es. per chiedere conferma) */
  onIndietro?: () => void
  azioni?: ReactNode
  children: ReactNode
  /** nasconde gli avvisi globali (es. nella schermata visitatore) */
  senzaAvvisi?: boolean
  mostraImpostazioni?: boolean
}

export function Pagina({ titolo, sottotitolo, indietro, onIndietro, azioni, children, senzaAvvisi, mostraImpostazioni }: Props) {
  const { t } = useT()
  const naviga = useNavigate()
  const online = useRete()
  const { collegamento, inCorso } = useMotore()
  const aggiornamento = useAggiornamentoApp()
  const collegato = collegamento !== null && collegamento.stato === 'ok'
  const tornaIndietro = () => {
    if (onIndietro) onIndietro()
    else if (indietro === true) naviga(-1)
    else if (typeof indietro === 'string') naviga(indietro)
  }
  return (
    <div className="app">
      <header className="barra">
        <div className="barra__interno">
          {indietro ? (
            <button type="button" className="barra__pulsante" onClick={tornaIndietro} aria-label={t('comune.indietro')}>
              <IconaIndietro dimensione={22} />
            </button>
          ) : (
            <img className="barra__logo" src={brand.logoUrl} alt="" />
          )}
          <div className="barra__titolo">
            {titolo}
            {sottotitolo && <span className="barra__sotto">{sottotitolo}</span>}
          </div>
          <div className="barra__azioni">
            {azioni}
            {collegamento && (
              <span className="barra__pulsante" role="img" title={collegato ? `${brand.plexus.nome_piattaforma}: ${collegamento.azienda}` : t('barra.ricollega')} aria-label={collegato ? t('comune.online') : t('barra.ricollega')} style={{ opacity: online ? 1 : 0.6 }}>
                {collegato && online ? <IconaNuvola dimensione={20} /> : <IconaNuvolaSpenta dimensione={20} />}
                {inCorso && <span className="caricamento" aria-hidden="true" />}
              </span>
            )}
            {mostraImpostazioni && (
              <Link to="/impostazioni" className="barra__pulsante" aria-label={t('barra.impostazioni')}>
                <IconaImpostazioni dimensione={20} />
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="contenuto">
        {!senzaAvvisi && (
          <div className="colonna" style={{ marginBottom: 14 }}>
            {!online && (
              <div className="avviso avviso--ambra" role="status">
                <IconaNuvolaSpenta dimensione={18} />
                <span className="avviso__testo">{t('barra.offline')}</span>
              </div>
            )}
            {collegamento && collegamento.stato !== 'ok' && (
              <div className="avviso avviso--rosso" role="alert">
                <span className="avviso__testo">{t('barra.ricollega')}</span>
                <Link to="/impostazioni" className="pulsante pulsante--piccolo pulsante--pericolo">
                  {t('barra.vai_impostazioni')}
                </Link>
              </div>
            )}
            {aggiornamento.disponibile && (
              <div className="avviso avviso--blu" role="status">
                <span className="avviso__testo">{t('barra.aggiornamento')}</span>
                <button type="button" className="pulsante pulsante--piccolo" onClick={() => void aggiornamento.aggiorna()}>
                  {t('barra.aggiorna')}
                </button>
              </div>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

export function Vuoto({ icona, titolo, testo, azione }: { icona?: ReactNode; titolo: ReactNode; testo?: ReactNode; azione?: ReactNode }) {
  return (
    <div className="vuoto">
      {icona && <div className="vuoto__icona">{icona}</div>}
      <div className="vuoto__titolo">{titolo}</div>
      {testo && <p>{testo}</p>}
      {azione && <div style={{ marginTop: 16 }}>{azione}</div>}
    </div>
  )
}
