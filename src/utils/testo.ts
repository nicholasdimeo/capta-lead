/** Funzioni di aiuto per i testi. */

/** Toglie spazi doppi e ai bordi. */
export function pulisci(testo: string | null | undefined): string {
  return (testo ?? '').replace(/\s+/g, ' ').trim()
}

/** Controllo email semplice ma sufficiente per lo stand (Plexus fa il controllo definitivo). */
export function emailValida(email: string): boolean {
  const e = pulisci(email)
  if (!e) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)
}

/** Nome completo "Nome Cognome", oppure l'email, oppure l'azienda, oppure un testo di riserva. */
export function nomeCompleto(lead: { nome?: string; cognome?: string; email?: string; azienda?: string }, riserva = ''): string {
  const n = pulisci(`${lead.nome ?? ''} ${lead.cognome ?? ''}`)
  return n || pulisci(lead.email) || pulisci(lead.azienda) || riserva
}

/** Iniziali per l'avatar ("Anna Bianchi" → "AB"). */
export function iniziali(lead: { nome?: string; cognome?: string; email?: string }): string {
  const n = pulisci(lead.nome)
  const c = pulisci(lead.cognome)
  const i = `${n.charAt(0)}${c.charAt(0)}`.toUpperCase()
  if (i) return i
  return pulisci(lead.email).charAt(0).toUpperCase() || '?'
}

/** Normalizza per la ricerca: minuscolo, senza accenti. */
export function normalizzaPerRicerca(testo: string): string {
  return pulisci(testo).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Rende sicuro un nome di file (per i report). */
export function nomeFileSicuro(testo: string): string {
  const base = normalizzaPerRicerca(testo).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return base || 'report'
}
