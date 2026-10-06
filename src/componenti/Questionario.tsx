// Il questionario come lo vede il visitatore: domande grandi, risposte a tocco, nella SUA lingua
// quando esiste la traduzione. Le risposte vengono salvate sempre nel testo della lingua principale
// (quello che conosce Plexus): la traduzione serve solo per mostrarle.
import type { Domanda, Risposta } from '../dati/tipi'
import { useT } from '../i18n'
import { IconaSpunta } from './Icone'

export function testoDomanda(d: Domanda, lingua: string): { domanda: string; opzioni: string[] } {
  const trad = d.traduzioni?.[lingua]
  if (trad && trad.opzioni.length === d.opzioni.length) return trad
  return { domanda: d.domanda, opzioni: d.opzioni }
}

export function Questionario({ domande, risposte, onCambia, lingua, mancanti }: { domande: Domanda[]; risposte: Record<string, Risposta>; onCambia: (domanda: string, risposta: Risposta) => void; lingua: string; mancanti?: Set<string> }) {
  const { t } = useT()
  if (domande.length === 0) return <p className="secondario">{t('lead.nessuna_domanda')}</p>
  return (
    <div>
      {domande.map((d, i) => {
        const mostra = testoDomanda(d, lingua)
        const attuale = risposte[d.domanda]
        const scelte = Array.isArray(attuale) ? attuale : attuale ? [attuale] : []
        const manca = mancanti?.has(d.domanda)
        const idTesto = `domanda-${i}`
        return (
          <div key={`${i}-${d.domanda}`} className={`domanda${d.consenso ? ' domanda--consenso' : ''}`} role="group" aria-labelledby={idTesto}>
            {d.consenso && <div className="etichetta" style={{ color: 'var(--accento-scuro)' }}>{t('lead.consenso_evidenza')}</div>}
            <div id={idTesto} className="domanda__testo">
              {mostra.domanda}
            </div>
            <div className="mini" style={{ marginBottom: 8 }}>
              {d.multipla ? t('lead.scelta_multipla') : t('lead.scelta_singola')}
              {manca && <span style={{ color: 'var(--rosso)', fontWeight: 700 }}> · {t('visitatore.obbligatoria')}</span>}
            </div>
            <div className={`opzioni${d.consenso ? ' opzioni--grandi opzioni--larghe' : mostra.opzioni.length > 3 ? ' opzioni--larghe' : ''}`}>
              {mostra.opzioni.map((etichetta, j) => {
                const valore = d.opzioni[j]
                const scelta = scelte.includes(valore)
                return (
                  <button
                    key={valore}
                    type="button"
                    className={`opzione${scelta ? ' opzione--scelta' : ''}`}
                    aria-pressed={scelta}
                    onClick={() => {
                      if (d.multipla) onCambia(d.domanda, scelta ? scelte.filter((s) => s !== valore) : [...scelte, valore])
                      else onCambia(d.domanda, scelta ? '' : valore)
                    }}
                  >
                    <span className={`opzione__segno${d.multipla ? ' opzione__segno--quadro' : ''}`}>{scelta && <IconaSpunta dimensione={14} strokeWidth={3} />}</span>
                    <span>{etichetta}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
