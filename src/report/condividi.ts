// Consegna di un file all'utente: su telefono/tablet il foglio "Condividi" (AirDrop, mail, WhatsApp…),
// altrimenti il download. La condivisione va chiamata subito dopo un tocco dell'utente (regola di iOS):
// per questo l'app prima genera il file e poi mostra i pulsanti "Condividi" / "Scarica".
export type EsitoCondivisione = 'condiviso' | 'annullato' | 'non_disponibile'

type NavigatorCondivisione = Navigator & { canShare?: (dati: ShareData) => boolean; share?: (dati: ShareData) => Promise<void> }

export function scaricaFile(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** true se questo browser sa condividere file (Safari iOS, Chrome Android, Edge/Chrome su Windows). */
export function condivisionePossibile(blob: Blob, nome: string): boolean {
  const nav = navigator as NavigatorCondivisione
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
  try {
    return nav.canShare({ files: [new File([blob], nome, { type: blob.type })] })
  } catch {
    return false
  }
}

export async function condividiFile(blob: Blob, nome: string, titolo: string): Promise<EsitoCondivisione> {
  if (!condivisionePossibile(blob, nome)) return 'non_disponibile'
  const nav = navigator as NavigatorCondivisione
  try {
    await nav.share?.({ files: [new File([blob], nome, { type: blob.type })], title: titolo })
    return 'condiviso'
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'annullato'
    return 'non_disponibile' // es. NotAllowedError: si passa al download
  }
}
