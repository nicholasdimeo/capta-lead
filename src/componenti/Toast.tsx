// Avvisi brevi in basso ("Contatto salvato"). Uso: const avvisa = useToast(); avvisa('Fatto', 'verde')
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type Tono = 'navy' | 'verde' | 'rosso'
interface Voce { id: number; testo: string; tono: Tono }
type Avvisa = (testo: string, tono?: Tono, durataMs?: number) => void

const Contesto = createContext<Avvisa>(() => {})

export function FornitoreToast({ children }: { children: ReactNode }) {
  const [voci, setVoci] = useState<Voce[]>([])
  const contatore = useRef(0)
  const avvisa = useCallback<Avvisa>((testo, tono = 'navy', durataMs = 2800) => {
    const id = ++contatore.current
    setVoci((v) => [...v.slice(-2), { id, testo, tono }])
    setTimeout(() => setVoci((v) => v.filter((x) => x.id !== id)), durataMs)
  }, [])
  const valore = useMemo(() => avvisa, [avvisa])
  return (
    <Contesto.Provider value={valore}>
      {children}
      <div className="toast-contenitore" aria-live="polite">
        {voci.map((v) => (
          <div key={v.id} className={`toast${v.tono !== 'navy' ? ` toast--${v.tono}` : ''}`} role="status">
            {v.testo}
          </div>
        ))}
      </div>
    </Contesto.Provider>
  )
}

export function useToast(): Avvisa {
  return useContext(Contesto)
}
