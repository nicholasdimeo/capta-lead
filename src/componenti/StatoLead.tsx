// Le "pillole" di stato accanto a un contatto: invio a Plexus, mail di ringraziamento, foto, stato in Plexus.
import type { Lead, Operazione } from '../dati/tipi'
import { useT } from '../i18n'
import { statoInvioLead } from '../sync/motore'
import { formattaDataOra } from '../utils/date'
import { Pillola, type TonoPillola } from './Pillola'

const TONO_INVIO: Record<ReturnType<typeof statoInvioLead>['stato'], TonoPillola> = {
  locale: 'neutro', in_coda: 'ambra', in_invio: 'ambra', errore: 'ambra', rifiutata: 'rosso', inviata: 'verde', modifiche_in_coda: 'ambra',
}
const TONO_MAIL: Record<string, TonoPillola> = { inviato: 'verde', in_attesa: 'ambra', saltato: 'neutro', errore: 'rosso' }
/** Stati di Plexus per cui esiste un testo: uno stato sconosciuto (versioni future) non viene mostrato. */
const STATI_PLEXUS_NOTI: string[] = ['nuova', 'bozza', 'approvata', 'inviata', 'risposta', 'scartata']
const TONO_PLEXUS: Record<string, TonoPillola> = { nuova: 'neutro', bozza: 'blu', approvata: 'blu', inviata: 'verde', risposta: 'verde', scartata: 'rosso' }

export function StatoLead({ lead, operazioni, collegato, nFoto, nFotoInviate, dettagliato = false }: { lead: Lead; operazioni: Operazione[]; collegato: boolean; nFoto?: number; nFotoInviate?: number; dettagliato?: boolean }) {
  const { t, tp, lingua } = useT()
  const invio = statoInvioLead(lead, operazioni, collegato)
  const chiaveInvio = `stato.${invio.stato === 'errore' ? 'invio_errore' : invio.stato}` as const
  return (
    <div className="pillole">
      <Pillola tono={TONO_INVIO[invio.stato]} punto title={invio.errore ?? undefined}>
        {t(chiaveInvio)}
      </Pillola>
      {invio.errore && dettagliato && <Pillola tono="rosso">{t('stato.dettaglio_errore', { errore: invio.errore })}</Pillola>}
      {lead.ringraziamento && (
        <Pillola tono={TONO_MAIL[lead.ringraziamento.esito] ?? 'neutro'} title={lead.ringraziamento.dettaglio || undefined}>
          {dettagliato && lead.ringraziamento.esito === 'inviato' && lead.ringraziamento.inviato_il
            ? t('stato.mail_inviata_il', { data: formattaDataOra(lead.ringraziamento.inviato_il, lingua) })
            : t(`stato.mail_${lead.ringraziamento.esito}` as const)}
        </Pillola>
      )}
      {dettagliato && lead.plexus_stato && lead.plexus_stato !== 'nuova' && STATI_PLEXUS_NOTI.includes(lead.plexus_stato) && (
        <Pillola tono={TONO_PLEXUS[lead.plexus_stato] ?? 'neutro'}>{t(`stato.plexus_${lead.plexus_stato}` as `stato.plexus_${'nuova' | 'bozza' | 'approvata' | 'inviata' | 'risposta' | 'scartata'}`)}</Pillola>
      )}
      {nFoto !== undefined && nFoto > 0 && (
        <Pillola tono={collegato && nFotoInviate !== undefined && nFotoInviate < nFoto ? 'ambra' : 'neutro'}>
          {collegato && nFotoInviate !== undefined ? (nFotoInviate < nFoto ? t('stato.foto', { inviate: nFotoInviate, totale: nFoto }) : tp('stato.foto_tutte', nFoto, ['_una', '_molte'])) : tp('stato.foto', nFoto, ['_una', '_molte'])}
        </Pillola>
      )}
    </div>
  )
}
