// Icone SVG in linea (nessuna libreria esterna). Tutte accettano `dimensione` in px.
import type { SVGProps } from 'react'

type Props = SVGProps<SVGSVGElement> & { dimensione?: number }

function Icona({ dimensione = 20, children, ...resto }: Props) {
  return (
    <svg width={dimensione} height={dimensione} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...resto}>
      {children}
    </svg>
  )
}

export const IconaIndietro = (p: Props) => <Icona {...p}><path d="M15 18l-6-6 6-6" /></Icona>
export const IconaPiu = (p: Props) => <Icona {...p}><path d="M12 5v14M5 12h14" /></Icona>
export const IconaImpostazioni = (p: Props) => <Icona {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Icona>
export const IconaCerca = (p: Props) => <Icona {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icona>
export const IconaFotocamera = (p: Props) => <Icona {...p}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></Icona>
export const IconaGalleria = (p: Props) => <Icona {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5-8 8" /></Icona>
export const IconaCestino = (p: Props) => <Icona {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icona>
export const IconaMatita = (p: Props) => <Icona {...p}><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4z" /><path d="m13 7 4 4" /></Icona>
export const IconaSpunta = (p: Props) => <Icona {...p}><path d="m5 12 5 5L20 7" /></Icona>
export const IconaX = (p: Props) => <Icona {...p}><path d="M6 6l12 12M18 6 6 18" /></Icona>
export const IconaCondividi = (p: Props) => <Icona {...p}><path d="M12 3v12M8 7l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" /></Icona>
export const IconaScarica = (p: Props) => <Icona {...p}><path d="M12 3v12M8 11l4 4 4-4M5 19h14" /></Icona>
export const IconaFoglio = (p: Props) => <Icona {...p}><path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M8 13h8M8 17h8" /></Icona>
export const IconaSync = (p: Props) => <Icona {...p}><path d="M20 12a8 8 0 0 1-14.5 4.6M4 12a8 8 0 0 1 14.5-4.6" /><path d="M20 4v4h-4M4 20v-4h4" /></Icona>
export const IconaNuvola = (p: Props) => <Icona {...p}><path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7z" /></Icona>
export const IconaNuvolaSpenta = (p: Props) => <Icona {...p}><path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 16.5 7M18 9a4.5 4.5 0 0 1 1 8.9" /><path d="m3 3 18 18" /></Icona>
export const IconaTelefono = (p: Props) => <Icona {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></Icona>
export const IconaEmail = (p: Props) => <Icona {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icona>
export const IconaFiltro = (p: Props) => <Icona {...p}><path d="M4 5h16l-6 8v6l-4-2v-4z" /></Icona>
export const IconaSu = (p: Props) => <Icona {...p}><path d="m6 15 6-6 6 6" /></Icona>
export const IconaGiu = (p: Props) => <Icona {...p}><path d="m6 9 6 6 6-6" /></Icona>
export const IconaCalendario = (p: Props) => <Icona {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icona>
export const IconaPersona = (p: Props) => <Icona {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icona>
export const IconaLingua = (p: Props) => <Icona {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icona>
export const IconaInfo = (p: Props) => <Icona {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icona>
export const IconaAvviso = (p: Props) => <Icona {...p}><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></Icona>
export const IconaOcchio = (p: Props) => <Icona {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icona>
