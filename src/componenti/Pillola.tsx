import type { ReactNode } from 'react'

export type TonoPillola = 'neutro' | 'verde' | 'ambra' | 'rosso' | 'blu' | 'navy'

export function Pillola({ tono = 'neutro', punto = false, children, title }: { tono?: TonoPillola; punto?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`pillola${tono !== 'neutro' ? ` pillola--${tono}` : ''}`} title={title}>
      {punto && <span className="pillola__punto" />}
      {children}
    </span>
  )
}
