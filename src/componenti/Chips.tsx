// Scelta rapida a "chip" (categoria, professione, lingua) con possibilità di scrivere un valore libero.
import { useState } from 'react'
import { IconaPiu } from './Icone'

export function ChipScelta({ opzioni, valore, onCambia, etichettaAltro, piccole }: { opzioni: string[]; valore: string; onCambia: (v: string) => void; etichettaAltro?: string; piccole?: boolean }) {
  const [altroAperto, setAltroAperto] = useState(false)
  const [testoAltro, setTestoAltro] = useState('')
  const personalizzato = valore && !opzioni.includes(valore) ? valore : ''
  const classe = `chip${piccole ? ' chip--piccolo' : ''}`
  return (
    <div className="chips">
      {opzioni.map((o) => (
        <button key={o} type="button" className={`${classe}${valore === o ? ' chip--attivo' : ''}`} aria-pressed={valore === o} onClick={() => onCambia(valore === o ? '' : o)}>
          {o}
        </button>
      ))}
      {personalizzato && (
        <button type="button" className={`${classe} chip--attivo`} aria-pressed onClick={() => onCambia('')}>
          {personalizzato}
        </button>
      )}
      {etichettaAltro &&
        (altroAperto ? (
          <input
            className="campo__input"
            style={{ flex: 1, minWidth: 160, minHeight: piccole ? 36 : 44 }}
            autoFocus
            value={testoAltro}
            placeholder={etichettaAltro}
            aria-label={etichettaAltro}
            onChange={(e) => setTestoAltro(e.target.value)}
            onBlur={() => {
              const v = testoAltro.trim()
              if (v) onCambia(v)
              setTestoAltro('')
              setAltroAperto(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              }
              if (e.key === 'Escape') setAltroAperto(false)
            }}
          />
        ) : (
          <button type="button" className={classe} onClick={() => setAltroAperto(true)}>
            <IconaPiu dimensione={16} /> {etichettaAltro}
          </button>
        ))}
    </div>
  )
}

/** Scelta della lingua con un tocco (bandierine testuali: "IT", "EN"...). */
export function SceltaLingua({ lingue, valore, onCambia, piccole, etichetta }: { lingue: Record<string, string>; valore: string; onCambia: (l: string) => void; piccole?: boolean; etichetta?: string }) {
  const classe = `chip${piccole ? ' chip--piccolo' : ''}`
  return (
    <div className="chips" role="group" aria-label={etichetta}>
      {Object.entries(lingue).map(([codice, nome]) => (
        <button key={codice} type="button" className={`${classe}${valore === codice ? ' chip--attivo' : ''}`} aria-pressed={valore === codice} onClick={() => onCambia(codice)} title={nome}>
          <span style={{ fontWeight: 800, letterSpacing: '0.04em' }}>{codice.toUpperCase()}</span>
          <span className="mini" style={{ color: 'inherit', opacity: 0.85 }}>{nome}</span>
        </button>
      ))}
    </div>
  )
}
