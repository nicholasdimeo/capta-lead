/** Data/ora attuale in formato ISO (sempre UTC, come richiede la coda). */
export function adesso(): string {
  return new Date().toISOString()
}

/** Data di oggi come "AAAA-MM-GG" nel fuso locale (per i campi data degli eventi). */
export function oggiIso(): string {
  const d = new Date()
  const mese = String(d.getMonth() + 1).padStart(2, '0')
  const giorno = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mese}-${giorno}`
}

const LOCALE: Record<string, string> = { it: 'it-IT', en: 'en-GB' }

function locale(lingua: string): string {
  return LOCALE[lingua] ?? lingua
}

/** "2026-11-05" → "5 nov 2026" (o "5 Nov 2026" in inglese). Stringhe vuote o non valide → "". */
export function formattaData(giorno: string, lingua = 'it', opzioni: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!giorno) return ''
  const d = daGiornoIso(giorno)
  if (!d) return giorno
  return new Intl.DateTimeFormat(locale(lingua), opzioni).format(d)
}

/** "2026-11-05", "2026-11-07" → "5–7 nov 2026"; stesso giorno → una sola data. */
export function formattaIntervallo(inizio: string, fine: string, lingua = 'it'): string {
  if (!inizio && !fine) return ''
  if (!fine || fine === inizio) return formattaData(inizio || fine, lingua)
  const a = daGiornoIso(inizio)
  const b = daGiornoIso(fine)
  if (!a || !b) return `${inizio} – ${fine}`
  try {
    return new Intl.DateTimeFormat(locale(lingua), { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(a, b)
  } catch {
    return `${formattaData(inizio, lingua)} – ${formattaData(fine, lingua)}`
  }
}

/** Data e ora leggibili da una stringa ISO ("16 ott 2026, 10:21"). */
export function formattaDataOra(iso: string | null | undefined, lingua = 'it'): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale(lingua), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}

/** Converte "AAAA-MM-GG" in una Date locale a mezzogiorno (evita slittamenti di fuso). */
export function daGiornoIso(giorno: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(giorno)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

/** true se l'evento è in corso oggi, false se passato o futuro. */
export function eventoInCorso(inizio: string, fine: string, oggi = oggiIso()): boolean {
  const da = inizio || fine
  const a = fine || inizio
  if (!da) return false
  return da <= oggi && oggi <= a
}
