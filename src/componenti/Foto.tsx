// Foto: pulsanti "Scatta" / "Dal rullino" (fotocamera e galleria del dispositivo tramite il browser),
// griglia delle miniature con tipo e stato di invio, e visualizzazione a schermo intero.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { TipoFoto } from '../dati/tipi'
import { TIPI_FOTO } from '../dati/tipi'
import { preparaImmagine, LIMITE_FOTO_BYTE, type ImmaginePreparata } from '../utils/immagini'
import { brand, testoIn } from '../config/brand'
import { useT } from '../i18n'
import { IconaFotocamera, IconaGalleria, IconaX } from './Icone'
import { Pillola } from './Pillola'

/** Crea (e libera) un URL temporaneo per mostrare un Blob in un <img>. */
export function useUrlBlob(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export interface FotoScelta {
  immagine: ImmaginePreparata
  tipo: TipoFoto
}

/** Due pulsanti grandi: scatta (fotocamera posteriore) e carica dal rullino (anche più immagini). */
export function FotoInput({ onScelte, tipoPredefinito = 'biglietto', disabilitato }: { onScelte: (foto: FotoScelta[]) => void | Promise<void>; tipoPredefinito?: TipoFoto; disabilitato?: boolean }) {
  const { t } = useT()
  const inputScatta = useRef<HTMLInputElement>(null)
  const inputCarica = useRef<HTMLInputElement>(null)
  const [lavoro, setLavoro] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function gestisci(file: FileList | null) {
    if (!file || file.length === 0) return
    setLavoro(true)
    setErrore(null)
    try {
      const esito: FotoScelta[] = []
      for (const f of Array.from(file)) {
        const immagine = await preparaImmagine(f)
        if (immagine.blob.size > LIMITE_FOTO_BYTE) {
          setErrore(t('lead.foto_troppo_grande', { mb: Math.round(LIMITE_FOTO_BYTE / 1024 / 1024) }))
          continue
        }
        esito.push({ immagine, tipo: tipoPredefinito })
      }
      if (esito.length) await onScelte(esito)
    } catch {
      setErrore(t('lead.errore_salvataggio'))
    } finally {
      setLavoro(false)
    }
  }

  return (
    <div>
      <div className="foto-azioni">
        <button type="button" className="pulsante pulsante--secondario" onClick={() => inputScatta.current?.click()} disabled={disabilitato || lavoro}>
          <IconaFotocamera /> {t('lead.scatta')}
        </button>
        <button type="button" className="pulsante pulsante--secondario" onClick={() => inputCarica.current?.click()} disabled={disabilitato || lavoro}>
          <IconaGalleria /> {t('lead.carica')}
        </button>
      </div>
      {lavoro && <p className="mini spazio-sopra">{t('comune.caricamento')}</p>}
      {errore && <p className="campo__errore">{errore}</p>}
      <input ref={inputScatta} type="file" accept="image/*" capture="environment" className="nascosto-visivamente" tabIndex={-1} onChange={(e) => void gestisci(e.target.files).finally(() => (e.target.value = ''))} />
      <input ref={inputCarica} type="file" accept="image/*" multiple className="nascosto-visivamente" tabIndex={-1} onChange={(e) => void gestisci(e.target.files).finally(() => (e.target.value = ''))} />
    </div>
  )
}

export interface VoceGalleria {
  chiave: string
  tipo: TipoFoto
  blob: Blob
  miniatura: Blob | null
  /** true = già arrivata a Plexus; undefined = non applicabile */
  caricata?: boolean
}

function Miniatura({ voce, onApri, lingua }: { voce: VoceGalleria; onApri: () => void; lingua: string }) {
  const url = useUrlBlob(voce.miniatura ?? voce.blob)
  return (
    <button type="button" onClick={onApri} className="pulsante-nudo" style={{ display: 'block', width: '100%', height: '100%' }} aria-label={testoIn(brand.tipi_foto[voce.tipo], lingua)}>
      {url ? <img src={url} alt="" /> : <div style={{ width: '100%', height: '100%', background: 'var(--sfondo)' }} />}
    </button>
  )
}

export function GalleriaFoto({ foto, onRimuovi, onCambiaTipo, lingua, collegato, azioneExtra }: { foto: VoceGalleria[]; onRimuovi?: (chiave: string) => void; onCambiaTipo?: (chiave: string, tipo: TipoFoto) => void; lingua: string; collegato?: boolean; azioneExtra?: ReactNode }) {
  const { t } = useT()
  const [aperta, setAperta] = useState<VoceGalleria | null>(null)
  if (foto.length === 0 && !azioneExtra) return <p className="mini">{t('lead.foto_nessuna')}</p>
  return (
    <div>
      <div className="foto-griglia">
        {foto.map((v) => (
          <div key={v.chiave} className="foto-voce">
            <Miniatura voce={v} onApri={() => setAperta(v)} lingua={lingua} />
            {onCambiaTipo ? (
              <select className="foto-voce__tipo foto-voce__select" value={v.tipo} onChange={(e) => onCambiaTipo(v.chiave, e.target.value as TipoFoto)} aria-label={t('lead.tipo_foto')}>
                {TIPI_FOTO.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {testoIn(brand.tipi_foto[tipo], lingua)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="foto-voce__tipo">
                <Pillola tono="navy">{testoIn(brand.tipi_foto[v.tipo], lingua)}</Pillola>
              </span>
            )}
            {collegato && v.caricata !== undefined && (
              <span className="foto-voce__stato">
                <Pillola tono={v.caricata ? 'verde' : 'ambra'} punto>
                  {v.caricata ? t('stato.inviata') : t('stato.in_coda')}
                </Pillola>
              </span>
            )}
            {onRimuovi && (
              <button type="button" className="foto-voce__rimuovi" onClick={() => onRimuovi(v.chiave)} aria-label={t('comune.rimuovi')}>
                <IconaX dimensione={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      {azioneExtra && <div className="spazio-sopra">{azioneExtra}</div>}
      {aperta && <FotoGrande blob={aperta.blob} onChiudi={() => setAperta(null)} />}
    </div>
  )
}

export function FotoGrande({ blob, onChiudi }: { blob: Blob; onChiudi: () => void }) {
  const { t } = useT()
  const url = useUrlBlob(blob)
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => e.key === 'Escape' && onChiudi()
    document.addEventListener('keydown', suTasto)
    return () => document.removeEventListener('keydown', suTasto)
  }, [onChiudi])
  return (
    <div className="foto-grande" onClick={onChiudi} role="dialog" aria-modal="true">
      {url && <img src={url} alt="" />}
      <button type="button" className="pulsante pulsante--neutro pulsante--icona foto-grande__chiudi" onClick={onChiudi} aria-label={t('comune.chiudi')}>
        <IconaX />
      </button>
    </div>
  )
}
