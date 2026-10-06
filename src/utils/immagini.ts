// Preparazione delle foto prima di salvarle: le riduce (max 1600 px sul lato lungo) e le converte
// in JPEG, così occupano poco e restano sotto il limite di Plexus (12 MB). Crea anche una miniatura
// per gli elenchi e il PDF. Se il browser non riesce a leggere l'immagine (es. HEIC su alcuni
// dispositivi), la salva com'è, senza miniatura.

export interface ImmaginePreparata {
  blob: Blob
  miniatura: Blob | null
  mime: string
  larghezza: number
  altezza: number
}

export interface OpzioniImmagine {
  latoMax: number
  qualita: number
  latoMiniatura: number
  qualitaMiniatura: number
}

export const OPZIONI_IMMAGINE_PREDEFINITE: OpzioniImmagine = { latoMax: 1600, qualita: 0.85, latoMiniatura: 256, qualitaMiniatura: 0.75 }

/** Limite massimo accettato da Plexus per una foto. */
export const LIMITE_FOTO_BYTE = 12 * 1024 * 1024

function creaTela(larghezza: number, altezza: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(larghezza, altezza)
  const tela = document.createElement('canvas')
  tela.width = larghezza
  tela.height = altezza
  return tela
}

async function telaInBlob(tela: OffscreenCanvas | HTMLCanvasElement, qualita: number): Promise<Blob> {
  if ('convertToBlob' in tela) return tela.convertToBlob({ type: 'image/jpeg', quality: qualita })
  return new Promise((risolvi, rifiuta) => {
    ;(tela as HTMLCanvasElement).toBlob((b) => (b ? risolvi(b) : rifiuta(new Error('toBlob ha restituito null'))), 'image/jpeg', qualita)
  })
}

interface Decodificata {
  sorgente: CanvasImageSource
  larghezza: number
  altezza: number
  chiudi: () => void
}

/**
 * Decodifica l'immagine. Nel browser usa un <img>: Safari e Chrome applicano da soli l'orientamento EXIF
 * (foto scattate in verticale) sia alle dimensioni sia al disegno su canvas. Altrove usa createImageBitmap.
 */
async function decodifica(file: Blob): Promise<Decodificata> {
  if (typeof document !== 'undefined' && typeof Image !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      await img.decode()
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('immagine vuota')
      return { sorgente: img, larghezza: img.naturalWidth, altezza: img.naturalHeight, chiudi: () => URL.revokeObjectURL(url) }
    } catch (e) {
      URL.revokeObjectURL(url)
      if (typeof createImageBitmap !== 'function') throw e
    }
  }
  if (typeof createImageBitmap !== 'function') throw new Error('decodifica immagini non disponibile')
  const bitmap = await createImageBitmap(file)
  return { sorgente: bitmap, larghezza: bitmap.width, altezza: bitmap.height, chiudi: () => bitmap.close() }
}

function disegnaRidotta(sorgente: Decodificata, latoMax: number, qualita: number): Promise<{ blob: Blob; larghezza: number; altezza: number }> {
  const scala = Math.min(1, latoMax / Math.max(sorgente.larghezza, sorgente.altezza))
  const larghezza = Math.max(1, Math.round(sorgente.larghezza * scala))
  const altezza = Math.max(1, Math.round(sorgente.altezza * scala))
  const tela = creaTela(larghezza, altezza)
  const ctx = tela.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
  if (!ctx) throw new Error('canvas non disponibile')
  ctx.fillStyle = '#ffffff' // sfondo bianco per i PNG trasparenti
  ctx.fillRect(0, 0, larghezza, altezza)
  ctx.drawImage(sorgente.sorgente, 0, 0, larghezza, altezza)
  return telaInBlob(tela, qualita).then((blob) => ({ blob, larghezza, altezza }))
}

/** Legge un file immagine e restituisce la versione ridotta + miniatura. Non lancia mai: in caso di problemi restituisce l'originale. */
export async function preparaImmagine(file: Blob, opzioni: Partial<OpzioniImmagine> = {}): Promise<ImmaginePreparata> {
  const o = { ...OPZIONI_IMMAGINE_PREDEFINITE, ...opzioni }
  let decodificata: Decodificata | null = null
  try {
    decodificata = await decodifica(file)
    const principale = await disegnaRidotta(decodificata, o.latoMax, o.qualita)
    const mini = await disegnaRidotta(decodificata, o.latoMiniatura, o.qualitaMiniatura)
    return { blob: principale.blob, miniatura: mini.blob, mime: 'image/jpeg', larghezza: principale.larghezza, altezza: principale.altezza }
  } catch {
    return { blob: file, miniatura: null, mime: file.type || 'application/octet-stream', larghezza: 0, altezza: 0 }
  } finally {
    decodificata?.chiudi()
  }
}

/** Nome di file per l'invio a Plexus (jpg per le immagini convertite, estensione originale altrimenti). */
export function nomeFileFoto(mime: string, uuid: string): string {
  const estensioni: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }
  return `${uuid}.${estensioni[mime] ?? 'jpg'}`
}

/** Formatta i byte in modo leggibile ("1,2 MB"). */
export function formattaByte(n: number, lingua = 'it'): string {
  if (!Number.isFinite(n) || n < 0) return ''
  const unita = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < unita.length - 1) {
    v /= 1024
    i++
  }
  return `${new Intl.NumberFormat(lingua === 'it' ? 'it-IT' : 'en-GB', { maximumFractionDigits: i === 0 ? 0 : 1 }).format(v)} ${unita[i]}`
}
