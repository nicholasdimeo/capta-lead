// Finestra modale generica e finestra di conferma ("Eliminare?"), usabile con una promessa:
//   const conferma = useConferma(); if (await conferma({ titolo, testo, pericolo: true })) { ... }
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'

export function Modale({ titolo, children, onChiudi, azioni }: { titolo: ReactNode; children?: ReactNode; onChiudi: () => void; azioni?: ReactNode }) {
  const primo = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi()
    }
    document.addEventListener('keydown', suTasto)
    // porta il focus sul primo pulsante della finestra (per le conferme è "Annulla": la scelta sicura)
    const pulsante = primo.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')
    ;(pulsante ?? primo.current)?.focus()
    return () => document.removeEventListener('keydown', suTasto)
  }, [onChiudi])
  return (
    <div className="modale-sfondo" onClick={onChiudi} role="presentation">
      <div className="modale" role="dialog" aria-modal="true" aria-label={typeof titolo === 'string' ? titolo : undefined} onClick={(e) => e.stopPropagation()} tabIndex={-1} ref={primo}>
        <div className="modale__titolo">{titolo}</div>
        <div className="modale__testo">{children}</div>
        {azioni && <div className="modale__azioni">{azioni}</div>}
      </div>
    </div>
  )
}

export interface RichiestaConferma {
  titolo: string
  testo?: string
  testoConferma?: string
  testoAnnulla?: string
  pericolo?: boolean
}

type Conferma = (richiesta: RichiestaConferma) => Promise<boolean>
const ContestoConferma = createContext<Conferma>(() => Promise.resolve(false))

export function FornitoreConferma({ children }: { children: ReactNode }) {
  const { t } = useT()
  const [attuale, setAttuale] = useState<(RichiestaConferma & { risolvi: (v: boolean) => void }) | null>(null)
  const conferma = useCallback<Conferma>(
    (richiesta) =>
      new Promise((risolvi) =>
        setAttuale((precedente) => {
          precedente?.risolvi(false) // una conferma aperta su un'altra: la prima vale come "annulla"
          return { ...richiesta, risolvi }
        }),
      ),
    [],
  )
  const valore = useMemo(() => conferma, [conferma])
  const chiudi = useCallback(
    (esito: boolean) => {
      attuale?.risolvi(esito)
      setAttuale(null)
    },
    [attuale],
  )
  const annulla = useCallback(() => chiudi(false), [chiudi])
  return (
    <ContestoConferma.Provider value={valore}>
      {children}
      {attuale && (
        <Modale
          titolo={attuale.titolo}
          onChiudi={annulla}
          azioni={
            <>
              <button type="button" className="pulsante pulsante--neutro" onClick={annulla}>
                {attuale.testoAnnulla ?? t('comune.annulla')}
              </button>
              <button type="button" className={`pulsante${attuale.pericolo ? ' pulsante--pericolo' : ''}`} onClick={() => chiudi(true)}>
                {attuale.testoConferma ?? t('comune.conferma')}
              </button>
            </>
          }
        >
          {attuale.testo}
        </Modale>
      )}
    </ContestoConferma.Provider>
  )
}

export function useConferma(): Conferma {
  return useContext(ContestoConferma)
}
