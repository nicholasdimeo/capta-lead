/** Genera un identificativo unico (uuid v4). Usa l'API del browser, con riserva per ambienti vecchi. */
export function nuovoUuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const byte = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(byte)
  else for (let i = 0; i < 16; i++) byte[i] = Math.floor(Math.random() * 256)
  byte[6] = (byte[6] & 0x0f) | 0x40
  byte[8] = (byte[8] & 0x3f) | 0x80
  const esa = [...byte].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${esa.slice(0, 8)}-${esa.slice(8, 12)}-${esa.slice(12, 16)}-${esa.slice(16, 20)}-${esa.slice(20)}`
}
