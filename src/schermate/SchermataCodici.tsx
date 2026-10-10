// Schermate raggiunte dai link nelle email: conferma dell'email, nuova password, invito.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pagina } from '../componenti/Pagina'
import { Campo } from '../componenti/Campo'
import { useToast } from '../componenti/Toast'
import { useT } from '../i18n'
import { brand } from '../config/brand'
import { creaApiCapta } from '../capta/api'
import { password_accettabile } from '../capta/password'
import { motore } from '../sync/istanza'
import { useMotore } from '../hooks/useMotore'
import { spiegaErrore, urlCloudIniziale } from './SchermataAccesso'

function useUrlCloud(): string {
  const { collegamento } = useMotore()
  const [url, setUrl] = useState(collegamento?.tipo === 'capta' ? collegamento.url : '')
  useEffect(() => {
    if (!url) void urlCloudIniziale().then(setUrl)
  }, [url])
  return url
}

export function SchermataVerifica() {
  const { t } = useT()
  const { codice = '' } = useParams()
  const url = useUrlCloud()
  const [esito, setEsito] = useState<'attesa' | 'ok' | 'errore'>('attesa')
  useEffect(() => {
    if (!url || !codice) return
    creaApiCapta(url)
      .verificaEmail(codice)
      .then(() => {
        setEsito('ok')
        void motore.aggiornaAccount().catch(() => undefined)
      })
      .catch(() => setEsito('errore'))
  }, [url, codice])
  return (
    <Pagina titolo={t('account.verifica_titolo')} indietro="/">
      <div className="card">
        {esito === 'attesa' && <p>{t('comune.caricamento')}</p>}
        {esito === 'ok' && (
          <div className="avviso avviso--verde">
            <span className="avviso__testo">{t('account.verifica_ok')}</span>
          </div>
        )}
        {esito === 'errore' && (
          <div className="avviso avviso--rosso">
            <span className="avviso__testo">{t('account.verifica_errore')}</span>
          </div>
        )}
        <Link to="/" className="pulsante spazio-sopra-grande">
          {t('barra.eventi')}
        </Link>
      </div>
    </Pagina>
  )
}

export function SchermataPassword() {
  const { t } = useT()
  const { codice = '' } = useParams()
  const naviga = useNavigate()
  const avvisa = useToast()
  const url = useUrlCloud()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [lavoro, setLavoro] = useState(false)
  async function invia() {
    const problema = password_accettabile(password)
    if (problema) return setErrore(problema)
    if (password !== password2) return setErrore(t('account.errore_password_diverse'))
    setLavoro(true)
    try {
      await creaApiCapta(url).passwordReimposta(codice, password)
      avvisa(t('account.password_cambiata'), 'verde')
      naviga('/accesso', { replace: true })
    } catch (e) {
      setErrore(spiegaErrore(e, t))
    } finally {
      setLavoro(false)
    }
  }
  return (
    <Pagina titolo={t('account.password_nuova_titolo')} indietro="/accesso">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void invia()
        }}
        noValidate
      >
        <div className="card">
          <Campo etichetta={t('account.password')} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aiuto={t('account.password_aiuto')} />
          <Campo etichetta={t('account.password_conferma')} type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          {errore && (
            <div className="avviso avviso--rosso" role="alert" style={{ marginBottom: 12 }}>
              <span className="avviso__testo">{errore}</span>
            </div>
          )}
          <button type="submit" className="pulsante pulsante--grande pulsante--pieno" disabled={lavoro || !url}>
            {lavoro ? <span className="caricamento" /> : t('comune.salva')}
          </button>
        </div>
      </form>
    </Pagina>
  )
}

export function SchermataInvito() {
  const { t, lingua } = useT()
  const { codice = '' } = useParams()
  const naviga = useNavigate()
  const avvisa = useToast()
  const url = useUrlCloud()
  const [info, setInfo] = useState<{ valido: boolean; azienda?: string; app?: string; email?: string; ruolo?: string } | null>(null)
  const [nome, setNome] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [lavoro, setLavoro] = useState(false)
  useEffect(() => {
    if (!url || !codice) return
    creaApiCapta(url)
      .invito(codice)
      .then(setInfo)
      .catch(() => setInfo({ valido: false }))
  }, [url, codice])
  async function invia() {
    const problema = password_accettabile(password)
    if (problema) return setErrore(problema)
    if (password !== password2) return setErrore(t('account.errore_password_diverse'))
    setLavoro(true)
    try {
      await motore.accettaInvito(url, codice, { nome: nome.trim(), password, lingua })
      avvisa(t('account.accedi'), 'verde')
      naviga('/', { replace: true })
    } catch (e) {
      setErrore(spiegaErrore(e, t))
    } finally {
      setLavoro(false)
    }
  }
  return (
    <Pagina titolo={t('account.invito_titolo')} indietro="/">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void invia()
        }}
        noValidate
      >
        <div className="card">
          {info === null && <p>{t('comune.caricamento')}</p>}
          {info && !info.valido && (
            <div className="avviso avviso--rosso">
              <span className="avviso__testo">{t('account.invito_non_valido')}</span>
            </div>
          )}
          {info?.valido && (
            <>
              <p style={{ marginBottom: 14 }}>{t('account.invito_testo', { azienda: info.azienda ?? '', app: info.app ?? brand.app.nome, ruolo: t(info.ruolo === 'amministratore' ? 'account.ruolo_amministratore' : 'account.ruolo_operatore') })}</p>
              <Campo etichetta={t('account.email')} value={info.email ?? ''} readOnly disabled />
              <Campo etichetta={t('account.nome')} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" autoCapitalize="words" autoFocus />
              <Campo etichetta={t('account.password')} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aiuto={t('account.password_aiuto')} />
              <Campo etichetta={t('account.password_conferma')} type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
              {errore && (
                <div className="avviso avviso--rosso" role="alert" style={{ marginBottom: 12 }}>
                  <span className="avviso__testo">{errore}</span>
                </div>
              )}
              <button type="submit" className="pulsante pulsante--grande pulsante--pieno" disabled={lavoro}>
                {lavoro ? <span className="caricamento" /> : t('account.invito_accetta')}
              </button>
            </>
          )}
        </div>
      </form>
    </Pagina>
  )
}
