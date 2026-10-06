// Piccolo "campanello" interno: chi scrive nella coda lo suona, il motore di sincronizzazione lo ascolta.
// Serve a far partire l'invio subito dopo un salvataggio, senza legare i dati al motore.
type Ascoltatore = () => void
const ascoltatori = new Set<Ascoltatore>()

export function segnalaCodaCambiata(): void {
  for (const a of ascoltatori) {
    try {
      a()
    } catch {
      // un ascoltatore rotto non deve bloccare gli altri
    }
  }
}

export function ascoltaCoda(ascoltatore: Ascoltatore): () => void {
  ascoltatori.add(ascoltatore)
  return () => ascoltatori.delete(ascoltatore)
}
