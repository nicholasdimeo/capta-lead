/** Stessa regola del server: almeno 8 caratteri, senza spazi ai bordi. Restituisce il motivo, o null se va bene. */
export function password_accettabile(password: string): string | null {
  if (password.length < 8) return 'La password deve avere almeno 8 caratteri.'
  if (password.trim() !== password) return 'La password non può iniziare o finire con uno spazio.'
  return null
}
