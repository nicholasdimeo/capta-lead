// Campi dei moduli: etichetta + input/select/textarea + testo di aiuto + errore, e l'interruttore.
// L'aiuto e l'errore stanno FUORI dall'etichetta (collegati con aria-describedby), così il nome del campo
// letto dagli screen reader resta pulito.
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface Base {
  etichetta: ReactNode
  aiuto?: ReactNode
  errore?: ReactNode
}

function Descrizione({ id, aiuto, errore }: { id: string; aiuto?: ReactNode; errore?: ReactNode }) {
  if (errore) return <span id={`${id}-errore`} className="campo__errore" role="alert">{errore}</span>
  if (aiuto) return <span id={`${id}-aiuto`} className="campo__aiuto">{aiuto}</span>
  return null
}

function descrittoDa(id: string, aiuto?: ReactNode, errore?: ReactNode): string | undefined {
  if (errore) return `${id}-errore`
  if (aiuto) return `${id}-aiuto`
  return undefined
}

export function Campo({ etichetta, aiuto, errore, id, className, ...resto }: Base & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId()
  const ident = id ?? autoId
  return (
    <div className="campo">
      <label className="campo__etichetta" htmlFor={ident}>{etichetta}</label>
      <input id={ident} className={`campo__input${errore ? ' campo__input--errore' : ''}${className ? ` ${className}` : ''}`} aria-invalid={errore ? true : undefined} aria-describedby={descrittoDa(ident, aiuto, errore)} {...resto} />
      <Descrizione id={ident} aiuto={aiuto} errore={errore} />
    </div>
  )
}

export function CampoSelect({ etichetta, aiuto, errore, id, children, className, ...resto }: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId()
  const ident = id ?? autoId
  return (
    <div className="campo">
      <label className="campo__etichetta" htmlFor={ident}>{etichetta}</label>
      <select id={ident} className={`campo__select${className ? ` ${className}` : ''}`} aria-describedby={descrittoDa(ident, aiuto, errore)} {...resto}>
        {children}
      </select>
      <Descrizione id={ident} aiuto={aiuto} errore={errore} />
    </div>
  )
}

export function CampoTesto({ etichetta, aiuto, errore, id, ...resto }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId()
  const ident = id ?? autoId
  return (
    <div className="campo">
      <label className="campo__etichetta" htmlFor={ident}>{etichetta}</label>
      <textarea id={ident} className="campo__textarea" aria-invalid={errore ? true : undefined} aria-describedby={descrittoDa(ident, aiuto, errore)} {...resto} />
      <Descrizione id={ident} aiuto={aiuto} errore={errore} />
    </div>
  )
}

export function Interruttore({ etichetta, aiuto, acceso, onChange }: { etichetta: ReactNode; aiuto?: ReactNode; acceso: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <div className="campo campo--riga">
      <div className="campo__testi">
        <label className="campo__etichetta" htmlFor={id}>{etichetta}</label>
        {aiuto && <span id={`${id}-aiuto`} className="campo__aiuto">{aiuto}</span>}
      </div>
      <span className="interruttore">
        <input id={id} type="checkbox" role="switch" aria-checked={acceso} aria-describedby={aiuto ? `${id}-aiuto` : undefined} checked={acceso} onChange={(e) => onChange(e.target.checked)} />
        <span className="interruttore__pista" />
      </span>
    </div>
  )
}
