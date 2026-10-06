// Scheda di un contatto: tutti i dati, risposte, foto (con aggiunta), stato verso Plexus, modifica ed eliminazione.
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pagina } from '../componenti/Pagina'
import { Pillola } from '../componenti/Pillola'
import { StatoLead } from '../componenti/StatoLead'
import { FotoInput, GalleriaFoto, type VoceGalleria } from '../componenti/Foto'
import { IconaCestino, IconaEmail, IconaMatita, IconaTelefono } from '../componenti/Icone'
import { useToast } from '../componenti/Toast'
import { useConferma } from '../componenti/Modale'
import { useT } from '../i18n'
import { brand } from '../config/brand'
import { aggiungiFoto, eliminaFoto, eliminaLead, fotoDiLead, leggiEvento, leggiLead } from '../dati/archivio'
import { useCollegato, useOperazioniAperte } from '../hooks/useMotore'
import { formattaDataOra } from '../utils/date'
import { nomeCompleto } from '../utils/testo'
import { testoDomanda } from '../componenti/Questionario'

function Voce({ etichetta, valore, vuoto }: { etichetta: string; valore?: string | null; vuoto: string }) {
  return (
    <div className="scheda-dati__voce">
      <span className="etichetta">{etichetta}</span>
      <div className={`scheda-dati__valore${valore ? '' : ' scheda-dati__valore--vuoto'}`}>{valore || vuoto}</div>
    </div>
  )
}

export function SchermataSchedaLead() {
  const { t, lingua } = useT()
  const { uuid = '' } = useParams()
  const naviga = useNavigate()
  const avvisa = useToast()
  const conferma = useConferma()
  // undefined = sto caricando; null = non esiste
  const lead = useLiveQuery(() => leggiLead(uuid).then((l) => l ?? null), [uuid])
  const evento = useLiveQuery(() => (lead ? leggiEvento(lead.evento_uuid) : Promise.resolve(undefined)), [lead?.evento_uuid])
  const foto = useLiveQuery(() => fotoDiLead(uuid), [uuid])
  const operazioni = useOperazioniAperte()
  const collegato = useCollegato()

  if (lead === undefined) return <Pagina titolo="…" indietro="/">{null}</Pagina>
  if (!lead) {
    return (
      <Pagina titolo={t('lead.titolo_modifica')} indietro="/">
        <div className="card">{t('lead.non_trovata')}</div>
      </Pagina>
    )
  }

  const vuoto = t('report.vuoto')
  const nome = nomeCompleto(lead, t('lead.senza_nome'))
  const galleria: VoceGalleria[] = (foto ?? []).map((f) => ({ chiave: f.uuid, tipo: f.tipo, blob: f.blob, miniatura: f.miniatura, caricata: f.plexus_foto_id !== null }))
  const questionario = evento?.questionario ?? []
  const risposteExtra = Object.keys(lead.risposte).filter((d) => !questionario.some((q) => q.domanda === d))

  async function elimina() {
    const ok = await conferma({ titolo: t('lead.elimina'), testo: t('lead.elimina_conferma'), testoConferma: t('comune.elimina'), pericolo: true })
    if (!ok) return
    await eliminaLead(uuid)
    naviga(`/eventi/${lead!.evento_uuid}`, { replace: true })
  }

  async function rimuoviFoto(chiave: string) {
    const ok = await conferma({ titolo: t('comune.elimina'), testo: t('lead.foto_elimina_conferma'), testoConferma: t('comune.elimina'), pericolo: true })
    if (ok) await eliminaFoto(chiave)
  }

  return (
    <Pagina
      titolo={nome}
      sottotitolo={evento?.nome}
      indietro={`/eventi/${lead.evento_uuid}`}
      azioni={
        !lead.solo_lettura && (
          <Link to={`/contatti/${lead.uuid}/modifica`} className="barra__pulsante" aria-label={t('comune.modifica')}>
            <IconaMatita dimensione={20} />
          </Link>
        )
      }
    >
      {lead.solo_lettura && (
        <div className="avviso avviso--blu" style={{ marginBottom: 14 }}>
          <span className="avviso__testo">{t('lead.solo_lettura')}</span>
        </div>
      )}
      <div className="card">
        <div className="riga riga--spazio" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ overflowWrap: 'anywhere' }}>{nome}</h1>
            <p className="secondario" style={{ marginTop: 4 }}>{[lead.professione, lead.azienda].filter(Boolean).join(' · ')}</p>
          </div>
          {lead.categoria && <Pillola tono="blu">{lead.categoria}</Pillola>}
        </div>
        <div className="pillole spazio-sopra">
          <Pillola tono={lead.consenso === true ? 'verde' : lead.consenso === false ? 'rosso' : 'neutro'}>{lead.consenso === true ? t('stato.consenso_si') : lead.consenso === false ? t('stato.consenso_no') : t('stato.consenso_nessuno')}</Pillola>
          <Pillola>{brand.lingue.disponibili[lead.lingua] ?? lead.lingua.toUpperCase()}</Pillola>
        </div>
        <div className="riga spazio-sopra">
          {lead.telefono && (
            <a className="pulsante pulsante--secondario pulsante--piccolo" href={`tel:${lead.telefono.replace(/\s+/g, '')}`}>
              <IconaTelefono dimensione={16} /> {t('lead.chiama')}
            </a>
          )}
          {lead.email && (
            <a className="pulsante pulsante--secondario pulsante--piccolo" href={`mailto:${lead.email}`}>
              <IconaEmail dimensione={16} /> {t('lead.scrivi')}
            </a>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card__titolo">
          <h2>{t('lead.dati_plexus')}</h2>
        </div>
        <StatoLead lead={lead} operazioni={operazioni} collegato={collegato} nFoto={foto?.length} nFotoInviate={(foto ?? []).filter((f) => f.plexus_foto_id !== null).length} dettagliato />
        <p className="mini spazio-sopra">
          {t('lead.registrata_il', { data: formattaDataOra(lead.creato_il, lingua) })}
          {lead.aggiornato_il !== lead.creato_il && ` · ${t('lead.modificata_il', { data: formattaDataOra(lead.aggiornato_il, lingua) })}`}
          {lead.plexus_id !== null && ` · ${t('lead.id_plexus', { id: lead.plexus_id })}`}
        </p>
      </div>

      <div className="card">
        <div className="scheda-dati">
          <Voce etichetta={t('lead.email')} valore={lead.email} vuoto={vuoto} />
          <Voce etichetta={t('lead.telefono')} valore={lead.telefono} vuoto={vuoto} />
          <Voce etichetta={t('lead.azienda')} valore={lead.azienda} vuoto={vuoto} />
          <Voce etichetta={t('lead.professione')} valore={lead.professione} vuoto={vuoto} />
          <Voce etichetta={t('lead.citta')} valore={[lead.citta, lead.provincia].filter(Boolean).join(' ')} vuoto={vuoto} />
          <Voce etichetta={t('lead.indirizzo')} valore={lead.indirizzo} vuoto={vuoto} />
        </div>
        <div className="separatore" />
        <span className="etichetta">{t('lead.note')}</span>
        <p style={{ whiteSpace: 'pre-line' }} className={lead.note ? '' : 'scheda-dati__valore--vuoto'}>{lead.note || vuoto}</p>
      </div>

      <div className="card">
        <div className="card__titolo">
          <h2>{t('lead.risposte')}</h2>
        </div>
        {questionario.length === 0 && risposteExtra.length === 0 ? (
          <p className="mini">{t('lead.nessuna_risposta')}</p>
        ) : (
          <div className="colonna">
            {questionario.map((d) => {
              const r = lead.risposte[d.domanda]
              const scelte = Array.isArray(r) ? r : r ? [r] : []
              const mostra = testoDomanda(d, lingua)
              const etichette = scelte.map((s) => {
                const i = d.opzioni.indexOf(s)
                return i >= 0 ? mostra.opzioni[i] : s
              })
              return (
                <div key={d.domanda} className={d.consenso ? 'card card--compatta card--evidenza' : ''} style={d.consenso ? { boxShadow: 'none', marginTop: 0 } : undefined}>
                  <span className="etichetta">{mostra.domanda}</span>
                  <div className={`scheda-dati__valore${etichette.length ? '' : ' scheda-dati__valore--vuoto'}`}>{etichette.length ? etichette.join(', ') : t('lead.nessuna_risposta')}</div>
                </div>
              )
            })}
            {risposteExtra.map((d) => (
              <div key={d}>
                <span className="etichetta">{d}</span>
                <div className="scheda-dati__valore">{Array.isArray(lead.risposte[d]) ? (lead.risposte[d] as string[]).join(', ') : String(lead.risposte[d])}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card__titolo">
          <h2>{t('lead.foto')}</h2>
        </div>
        <GalleriaFoto foto={galleria} lingua={lingua} collegato={collegato} onRimuovi={lead.solo_lettura ? undefined : (chiave) => void rimuoviFoto(chiave)} />
        {!lead.solo_lettura && (
          <div className="spazio-sopra">
            <FotoInput
              onScelte={async (scelte) => {
                try {
                  for (const s of scelte) await aggiungiFoto(lead.uuid, s.tipo, s.immagine)
                  avvisa(t('lead.aggiornato'), 'verde')
                } catch {
                  avvisa(t('lead.errore_salvataggio'), 'rosso')
                }
              }}
            />
          </div>
        )}
      </div>

      {!lead.solo_lettura && (
        <div className="riga" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="pulsante pulsante--pericolo" onClick={() => void elimina()}>
            <IconaCestino /> {t('lead.elimina')}
          </button>
        </div>
      )}
    </Pagina>
  )
}
