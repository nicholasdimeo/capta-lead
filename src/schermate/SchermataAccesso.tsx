// Accesso a Capta Cloud, creazione dell'account dell'azienda e recupero della password.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Pagina } from '../componenti/Pagina'
import { Campo, CampoSelect } from '../componenti/Campo'
import { IconaGiu, IconaSu } from '../componenti/Icone'
import { useToast } from '../componenti/Toast'
import { useT } from '../i18n'
import { brand } from '../config/brand'
import { creaApiCapta, ErroreCapta } from '../capta/api'
import { leggiImpostazione, salvaImpostazione } from '../dati/archivio'
import { useMotore } from '../hooks/useMotore'
import { useImpostazione } from '../hooks/useImpostazioni'
import { motore } from '../sync/istanza'
import { password_accettabile } from '../capta/password'

export const CHIAVE_URL_CLOUD = 'cloud_url'
/** Salvata quando l'utente sceglie "Continua senza account": da lì in poi l'app si apre sugli eventi. */
export const CHIAVE_SENZA_ACCOUNT = 'senza_account'

/** Indirizzo di Capta Cloud da usare: l'ultimo usato, poi quello della configurazione, poi quello di sviluppo. */
export async function urlCloudIniziale(): Promise<string> {
  const salvato = await leggiImpostazione<string>(CHIAVE_URL_CLOUD, '')
  if (salvato) return salvato
  if (brand.cloud.url_predefinito) return brand.cloud.url_predefinito
  return import.meta.env.DEV ? 'http://localhost:8100' : ''
}

/** Traduce un errore dell'API di Capta Cloud in una frase per l'utente. */
export function spiegaErrore(e: unknown, t: ReturnType<typeof useT>['t']): string {
  if (e instanceof ErroreCapta) {
    if (e.tipo === 'credenziali_errate') return t('account.errore_credenziali')
    if (e.tipo === 'email_esistente') return t('account.errore_email_esistente')
    if (e.tipo === 'rete' || e.tipo === 'timeout') return t('account.errore_rete')
    if (e.tipo === 'limite_piano') return t('account.limite_piano', { motivo: e.message })
    return e.message
  }
  return t('account.errore_generico', { dettaglio: e instanceof Error ? e.message : String(e) })
}

type Modo = 'accesso' | 'registrazione' | 'password'

export function SchermataAccesso() {
  const { t, lingua } = useT()
  const naviga = useNavigate()
  const avvisa = useToast()
  const [parametri] = useSearchParams()
  const { collegamento } = useMotore()
  const senzaAccount = useImpostazione<boolean>(CHIAVE_SENZA_ACCOUNT, false)
  const [modo, setModo] = useState<Modo>((parametri.get('modo') as Modo) || 'accesso')
  const [url, setUrl] = useState('')
  const [urlCaricato, setUrlCaricato] = useState(false)
  const [serverAperto, setServerAperto] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [nome, setNome] = useState('')
  const [azienda, setAzienda] = useState('')
  const [linguaAccount, setLinguaAccount] = useState(lingua)
  const [errore, setErrore] = useState<string | null>(null)
  const [lavoro, setLavoro] = useState(false)
  const [linkInviato, setLinkInviato] = useState<'email' | 'nessuna_email' | null>(null)

  useEffect(() => {
    void urlCloudIniziale().then((u) => {
      setUrl(u)
      if (!u) setServerAperto(true)
      setUrlCaricato(true)
    })
  }, [])

  useEffect(() => {
    if (collegamento?.tipo === 'capta' && collegamento.stato === 'ok') naviga('/', { replace: true })
  }, [collegamento, naviga])

  async function invia() {
    setErrore(null)
    if (!url.trim()) return setErrore(t('impostazioni.errore_url'))
    if (modo !== 'password') {
      const problema = password_accettabile(password)
      if (modo === 'registrazione' && problema) return setErrore(problema)
      if (modo === 'registrazione' && password !== password2) return setErrore(t('account.errore_password_diverse'))
    }
    setLavoro(true)
    try {
      await salvaImpostazione(CHIAVE_URL_CLOUD, url.trim())
      if (modo === 'accesso') {
        await motore.accedi(url, email.trim(), password)
        naviga('/', { replace: true })
      } else if (modo === 'registrazione') {
        await motore.registra(url, { azienda_nome: azienda.trim(), nome: nome.trim(), email: email.trim(), password, lingua: linguaAccount })
        avvisa(t('account.verifica_avviso'))
        naviga('/', { replace: true })
      } else {
        const r = await creaApiCapta(url).passwordDimenticata(email.trim())
        setLinkInviato(r.email_inviata === false ? 'nessuna_email' : 'email')
      }
    } catch (e) {
      setErrore(spiegaErrore(e, t))
    } finally {
      setLavoro(false)
    }
  }

  const titolo = modo === 'accesso' ? t('account.accedi') : modo === 'registrazione' ? t('account.crea_titolo') : t('account.password_dimenticata_titolo')

  return (
    <Pagina titolo={titolo} indietro={collegamento || senzaAccount ? '/' : undefined}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void invia()
        }}
        noValidate
      >
        <div className="card">
          {modo === 'registrazione' && <p className="secondario" style={{ marginBottom: 14 }}>{t('account.crea_aiuto')}</p>}
          {modo === 'password' && <p className="secondario" style={{ marginBottom: 14 }}>{t('account.password_dimenticata_aiuto')}</p>}
          {linkInviato ? (
            <div className={`avviso ${linkInviato === 'email' ? 'avviso--verde' : 'avviso--blu'}`}>
              <span className="avviso__testo">{linkInviato === 'email' ? t('account.password_dimenticata_fatto') : t('account.password_dimenticata_no_email')}</span>
            </div>
          ) : (
            <>
              {modo === 'registrazione' && (
                <>
                  <Campo etichetta={t('account.azienda')} value={azienda} onChange={(e) => setAzienda(e.target.value)} autoComplete="organization" required />
                  <Campo etichetta={t('account.nome')} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" autoCapitalize="words" required />
                </>
              )}
              <Campo etichetta={t('account.email')} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {modo !== 'password' && (
                <Campo etichetta={t('account.password')} type="password" autoComplete={modo === 'accesso' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} aiuto={modo === 'registrazione' ? t('account.password_aiuto') : undefined} required />
              )}
              {modo === 'registrazione' && (
                <>
                  <Campo etichetta={t('account.password_conferma')} type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
                  <CampoSelect etichetta={t('account.lingua')} value={linguaAccount} onChange={(e) => setLinguaAccount(e.target.value)}>
                    {Object.entries(brand.lingue.disponibili).map(([k, nome]) => (
                      <option key={k} value={k}>
                        {nome}
                      </option>
                    ))}
                  </CampoSelect>
                </>
              )}
              {errore && (
                <div className="avviso avviso--rosso" role="alert" style={{ marginBottom: 12 }}>
                  <span className="avviso__testo">{errore}</span>
                </div>
              )}
              <button type="submit" className="pulsante pulsante--grande pulsante--pieno" disabled={lavoro}>
                {lavoro ? <span className="caricamento" /> : modo === 'accesso' ? t('account.accedi') : modo === 'registrazione' ? t('account.crea') : t('account.invia_link')}
              </button>
            </>
          )}
          <div className="riga spazio-sopra-grande" style={{ justifyContent: 'space-between' }}>
            {modo !== 'accesso' ? (
              <button type="button" className="pulsante pulsante--testo pulsante--piccolo" onClick={() => { setModo('accesso'); setLinkInviato(null) }}>
                {t('account.accedi')}
              </button>
            ) : (
              <button type="button" className="pulsante pulsante--testo pulsante--piccolo" onClick={() => setModo('registrazione')}>
                {t('account.crea')}
              </button>
            )}
            {modo === 'accesso' && (
              <button type="button" className="pulsante pulsante--testo pulsante--piccolo" onClick={() => setModo('password')}>
                {t('account.password_dimenticata')}
              </button>
            )}
          </div>
        </div>

        {urlCaricato && (
        <div className="card">
          <button type="button" className="pulsante pulsante--testo pulsante--piccolo" onClick={() => setServerAperto(!serverAperto)} aria-expanded={serverAperto} style={{ marginLeft: -8 }}>
            {serverAperto ? <IconaSu dimensione={16} /> : <IconaGiu dimensione={16} />} {t('account.server', { cloud: brand.cloud.nome })}
          </button>
          {serverAperto && (
            <div className="spazio-sopra">
              <Campo etichetta={t('account.server', { cloud: brand.cloud.nome })} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} aiuto={t('account.server_aiuto')} />
            </div>
          )}
        </div>
        )}

        <div className="card">
          <p className="secondario">{t('account.senza_account_aiuto')}</p>
          <Link
            to="/"
            className="pulsante pulsante--neutro spazio-sopra"
            onClick={(e) => {
              // prima si salva la scelta, poi si va agli eventi (altrimenti la pagina eventi rimanderebbe qui)
              e.preventDefault()
              void salvaImpostazione(CHIAVE_SENZA_ACCOUNT, true).then(() => naviga('/', { replace: true }))
            }}
          >
            {t('account.senza_account')}
          </Link>
        </div>
      </form>
    </Pagina>
  )
}
