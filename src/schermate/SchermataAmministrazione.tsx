// Area di amministrazione dell'azienda (solo amministratori): utenti e inviti, dispositivi, gestionale,
// personalizzazione, piano. Tutto passa da Capta Cloud.
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Pagina } from '../componenti/Pagina'
import { Campo, CampoSelect, CampoTesto } from '../componenti/Campo'
import { Pillola } from '../componenti/Pillola'
import { useToast } from '../componenti/Toast'
import { useConferma } from '../componenti/Modale'
import { useT } from '../i18n'
import { brand, testoIn } from '../config/brand'
import { creaApiCapta, type DispositivoCapta, type IntegrazioneCapta, type InvitoCapta, type LinkCapta, type UtenteCapta } from '../capta/api'
import { useMotore } from '../hooks/useMotore'
import { motore } from '../sync/istanza'
import { formattaDataOra } from '../utils/date'
import { spiegaErrore } from './SchermataAccesso'
import { problemaUrlPlexus } from '../plexus/client'

type Sezione = 'utenti' | 'dispositivi' | 'gestionale' | 'personalizzazione' | 'piano'

export function SchermataAmministrazione() {
  const { t, lingua } = useT()
  const { collegamento } = useMotore()
  const [sezione, setSezione] = useState<Sezione>('utenti')
  if (!collegamento || collegamento.tipo !== 'capta' || collegamento.account?.utente.ruolo !== 'amministratore') return <Navigate to="/impostazioni" replace />
  const api = creaApiCapta(collegamento.url)
  const sezioni: [Sezione, string][] = [
    ['utenti', t('amministrazione.utenti')],
    ['dispositivi', t('amministrazione.dispositivi')],
    ['gestionale', t('amministrazione.gestionale')],
    ['personalizzazione', t('amministrazione.personalizzazione')],
    ['piano', t('amministrazione.piano')],
  ]
  return (
    <Pagina titolo={t('amministrazione.titolo')} sottotitolo={collegamento.azienda} indietro="/impostazioni">
      <div className="chips" style={{ marginBottom: 16 }}>
        {sezioni.map(([s, etichetta]) => (
          <button key={s} type="button" className={`chip chip--piccolo${sezione === s ? ' chip--attivo' : ''}`} aria-pressed={sezione === s} onClick={() => setSezione(s)}>
            {etichetta}
          </button>
        ))}
      </div>
      {sezione === 'utenti' && <SezioneUtenti api={api} />}
      {sezione === 'dispositivi' && <SezioneDispositivi api={api} />}
      {sezione === 'gestionale' && <SezioneGestionale api={api} />}
      {sezione === 'personalizzazione' && <SezionePersonalizzazione api={api} />}
      {sezione === 'piano' && <SezionePiano lingua={lingua} />}
    </Pagina>
  )
}

type Api = ReturnType<typeof creaApiCapta>

function useCaricamento<T>(carica: () => Promise<T>): [T | null, () => void, string | null] {
  const { t } = useT()
  const [dati, setDati] = useState<T | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [versione, setVersione] = useState(0)
  useEffect(() => {
    let attivo = true
    carica()
      .then((d) => attivo && setDati(d))
      .catch((e) => attivo && setErrore(spiegaErrore(e, t)))
    return () => {
      attivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versione])
  return [dati, () => setVersione((v) => v + 1), errore]
}

/** Ore di validità dei link d'invito e di nuova password (stesso valore del server). */
const ORE_LINK = 48

/** Riquadro con un link da mandare a mano: copia negli appunti o "Condividi" del telefono. */
function BoxLink({ titolo, link, emailInviataA, onChiudi }: { titolo: string; link: string; emailInviataA?: string | null; onChiudi: () => void }) {
  const { t } = useT()
  const avvisa = useToast()
  const puoCondividere = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  async function copia() {
    try {
      await navigator.clipboard.writeText(link)
      avvisa(t('amministrazione.link_copiato'), 'verde')
    } catch {
      // appunti non disponibili: si seleziona il testo, così si copia a mano
      const campo = document.getElementById('box-link-testo') as HTMLInputElement | null
      campo?.select()
    }
  }
  return (
    <div className="card card--evidenza" role="status">
      <div className="card__titolo">
        <h3>{titolo}</h3>
        <button type="button" className="pulsante pulsante--testo pulsante--piccolo" onClick={onChiudi}>
          {t('comune.chiudi')}
        </button>
      </div>
      <input id="box-link-testo" className="campo__input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label={titolo} />
      <p className="mini spazio-sopra">
        {t('amministrazione.link_aiuto', { ore: ORE_LINK })}
        {emailInviataA ? ` ${t('amministrazione.link_email_inviata', { email: emailInviataA })}` : ''}
      </p>
      <div className="riga spazio-sopra">
        <button type="button" className="pulsante" onClick={() => void copia()}>
          {t('amministrazione.link_copia')}
        </button>
        {puoCondividere && (
          <button type="button" className="pulsante pulsante--secondario" onClick={() => void navigator.share({ title: titolo, url: link }).catch(() => undefined)}>
            {t('amministrazione.link_condividi')}
          </button>
        )}
      </div>
    </div>
  )
}

function SezioneUtenti({ api }: { api: Api }) {
  const { t, lingua } = useT()
  const avvisa = useToast()
  const conferma = useConferma()
  const { collegamento } = useMotore()
  const io = collegamento?.account?.utente.id
  const [dati, ricarica, errore] = useCaricamento(async () => {
    const token = await motore.tokenValido()
    const [utenti, inviti] = await Promise.all([api.utenti(token), api.inviti(token)])
    return { utenti, inviti: inviti.filter((i) => !i.usato) }
  })
  const [email, setEmail] = useState('')
  const [ruolo, setRuolo] = useState('operatore')
  const [lavoro, setLavoro] = useState(false)
  const [linkMostrato, setLinkMostrato] = useState<{ titolo: string; link: string; emailInviataA?: string | null } | null>(null)
  function mostraLink(titolo: string, l: Pick<LinkCapta, 'link' | 'email_inviata'>, email: string) {
    setLinkMostrato({ titolo, link: l.link, emailInviataA: l.email_inviata ? email : null })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function nuovoLink(i: InvitoCapta) {
    try {
      mostraLink(t('amministrazione.link_invito_titolo', { email: i.email }), await api.nuovoLinkInvito(await motore.tokenValido(), i.id), i.email)
    } catch (e) {
      avvisa(spiegaErrore(e, t), 'rosso', 5000)
    }
  }
  async function linkPassword(u: UtenteCapta) {
    try {
      mostraLink(t('amministrazione.link_password_titolo', { nome: u.nome }), await api.linkPassword(await motore.tokenValido(), u.id), u.email)
    } catch (e) {
      avvisa(spiegaErrore(e, t), 'rosso', 5000)
    }
  }
  async function invita() {
    setLavoro(true)
    try {
      const invito = await api.invita(await motore.tokenValido(), email.trim(), ruolo)
      if (invito.link) mostraLink(t('amministrazione.link_invito_titolo', { email: invito.email }), { link: invito.link, email_inviata: Boolean(invito.email_inviata) }, invito.email)
      else avvisa(t('amministrazione.invito_inviato', { email: email.trim() }), 'verde')
      setEmail('')
      ricarica()
    } catch (e) {
      avvisa(spiegaErrore(e, t), 'rosso', 5000)
    } finally {
      setLavoro(false)
    }
  }
  async function cambia(u: UtenteCapta, modifiche: { ruolo?: string; attivo?: boolean }) {
    if (modifiche.attivo === false) {
      const ok = await conferma({ titolo: t('amministrazione.disattiva'), testo: t('amministrazione.disattiva_conferma', { nome: u.nome }), testoConferma: t('amministrazione.disattiva'), pericolo: true })
      if (!ok) return
    }
    try {
      await api.modificaUtente(await motore.tokenValido(), u.id, modifiche)
      ricarica()
    } catch (e) {
      avvisa(spiegaErrore(e, t), 'rosso', 5000)
    }
  }
  async function annulla(i: InvitoCapta) {
    try {
      await api.annullaInvito(await motore.tokenValido(), i.id)
      ricarica()
    } catch (e) {
      avvisa(spiegaErrore(e, t), 'rosso', 5000)
    }
  }
  return (
    <>
      {linkMostrato && <BoxLink {...linkMostrato} onChiudi={() => setLinkMostrato(null)} />}
      <div className="card">
        <div className="card__titolo">
          <div>
            <h2>{t('amministrazione.invita')}</h2>
            <p className="mini">{t('amministrazione.invita_aiuto')}</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void invita()
          }}
          noValidate
        >
          <div className="griglia-campi griglia-campi--2">
            <Campo etichetta={t('account.email')} type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
            <CampoSelect etichetta={t('amministrazione.ruolo')} value={ruolo} onChange={(e) => setRuolo(e.target.value)}>
              <option value="operatore">{t('account.ruolo_operatore')}</option>
              <option value="amministratore">{t('account.ruolo_amministratore')}</option>
            </CampoSelect>
          </div>
          <button type="submit" className="pulsante" disabled={lavoro || !email.trim()}>
            {lavoro ? <span className="caricamento" /> : t('amministrazione.invita')}
          </button>
        </form>
      </div>
      <div className="card">
        <div className="card__titolo">
          <h2>{t('amministrazione.utenti')}</h2>
        </div>
        {errore && <p className="campo__errore">{errore}</p>}
        <div className="elenco">
          {(dati?.utenti ?? []).map((u) => (
            <div key={u.id} className="card card--compatta" style={{ margin: 0, boxShadow: 'none', background: 'var(--sfondo)' }}>
              <div className="riga riga--spazio">
                <div style={{ minWidth: 0 }}>
                  <div className="grassetto">
                    {u.nome} {u.id === io && <span className="mini">({t('amministrazione.tu')})</span>}
                  </div>
                  <div className="mini">
                    {u.email} · {t('amministrazione.ultimo_accesso', { data: u.ultimo_accesso ? formattaDataOra(u.ultimo_accesso, lingua) : t('amministrazione.mai') })}
                  </div>
                  <div className="pillole spazio-sopra">
                    <Pillola tono={u.ruolo === 'amministratore' ? 'navy' : 'blu'}>{t(u.ruolo === 'amministratore' ? 'account.ruolo_amministratore' : 'account.ruolo_operatore')}</Pillola>
                    <Pillola tono={u.attivo ? 'verde' : 'rosso'}>{u.attivo ? t('amministrazione.attivo') : t('amministrazione.disattivato')}</Pillola>
                  </div>
                </div>
                {u.id !== io && (
                  <div className="riga" style={{ gap: 6 }}>
                    <select className="campo__select campo__select--piccolo" value={u.ruolo} onChange={(e) => void cambia(u, { ruolo: e.target.value })} aria-label={t('amministrazione.ruolo')}>
                      <option value="operatore">{t('account.ruolo_operatore')}</option>
                      <option value="amministratore">{t('account.ruolo_amministratore')}</option>
                    </select>
                    {u.attivo && (
                      <button type="button" className="pulsante pulsante--neutro pulsante--piccolo" onClick={() => void linkPassword(u)}>
                        {t('amministrazione.link_password')}
                      </button>
                    )}
                    <button type="button" className={`pulsante pulsante--piccolo ${u.attivo ? 'pulsante--pericolo' : 'pulsante--secondario'}`} onClick={() => void cambia(u, { attivo: !u.attivo })}>
                      {u.attivo ? t('amministrazione.disattiva') : t('amministrazione.riattiva')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {(dati?.inviti.length ?? 0) > 0 && (
          <>
            <span className="etichetta spazio-sopra-grande">{t('amministrazione.inviti_in_attesa')}</span>
            <div className="elenco">
              {dati?.inviti.map((i) => (
                <div key={i.id} className="riga riga--spazio card card--compatta" style={{ margin: 0, boxShadow: 'none', background: 'var(--sfondo)' }}>
                  <div>
                    <div className="grassetto">{i.email}</div>
                    <div className="mini">{t(i.ruolo === 'amministratore' ? 'account.ruolo_amministratore' : 'account.ruolo_operatore')}</div>
                  </div>
                  <div className="riga" style={{ gap: 6 }}>
                    <button type="button" className="pulsante pulsante--secondario pulsante--piccolo" onClick={() => void nuovoLink(i)}>
                      {t('amministrazione.link_nuovo')}
                    </button>
                    <button type="button" className="pulsante pulsante--neutro pulsante--piccolo" onClick={() => void annulla(i)}>
                      {t('amministrazione.invito_annulla')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function SezioneDispositivi({ api }: { api: Api }) {
  const { t, lingua } = useT()
  const avvisa = useToast()
  const conferma = useConferma()
  const [dati, ricarica, errore] = useCaricamento<DispositivoCapta[]>(async () => api.dispositivi(await motore.tokenValido()))
  async function scollega(d: DispositivoCapta) {
    const ok = await conferma({ titolo: t('amministrazione.scollega_dispositivo'), testo: t('amministrazione.scollega_dispositivo_conferma', { nome: d.nome || d.identificativo }), testoConferma: t('amministrazione.scollega_dispositivo'), pericolo: true })
    if (!ok) return
    try {
      await api.scollegaDispositivo(await motore.tokenValido(), d.id)
      ricarica()
    } catch (e) {
      avvisa(spiegaErrore(e, t), 'rosso', 5000)
    }
  }
  return (
    <div className="card">
      <div className="card__titolo">
        <h2>{t('amministrazione.dispositivi')}</h2>
      </div>
      {errore && <p className="campo__errore">{errore}</p>}
      {dati && dati.length === 0 && <p className="secondario">{t('amministrazione.nessun_dispositivo')}</p>}
      <div className="elenco">
        {(dati ?? []).map((d) => (
          <div key={d.id} className="riga riga--spazio card card--compatta" style={{ margin: 0, boxShadow: 'none', background: 'var(--sfondo)' }}>
            <div>
              <div className="grassetto">{d.nome || d.identificativo.slice(0, 8)}</div>
              <div className="mini">
                {d.utente_nome} · {t('amministrazione.ultimo_accesso', { data: formattaDataOra(d.ultimo_accesso, lingua) })}
              </div>
            </div>
            <button type="button" className="pulsante pulsante--pericolo pulsante--piccolo" onClick={() => void scollega(d)}>
              {t('amministrazione.scollega_dispositivo')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function SezioneGestionale({ api }: { api: Api }) {
  const { t, lingua } = useT()
  const avvisa = useToast()
  const conferma = useConferma()
  const [dati, ricarica, erroreCarico] = useCaricamento<IntegrazioneCapta[]>(async () => api.integrazioni(await motore.tokenValido()))
  const plexus = dati?.find((i) => i.tipo === 'plexus') ?? null
  const [url, setUrl] = useState('')
  const [codice, setCodice] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [lavoro, setLavoro] = useState(false)
  useEffect(() => {
    if (plexus && !url) setUrl(plexus.url)
  }, [plexus, url])
  async function salva() {
    setErrore(null)
    const problema = problemaUrlPlexus(url)
    if (problema === 'vuoto' || problema === 'non_valido') return setErrore(t('impostazioni.errore_url'))
    if (problema === 'non_sicuro') return setErrore(t('impostazioni.errore_https'))
    if (codice && !codice.trim().startsWith('plx_')) return setErrore(t('impostazioni.errore_codice'))
    setLavoro(true)
    try {
      await api.salvaPlexus(await motore.tokenValido(), { url: url.trim(), codice: codice.trim() || undefined, attiva: true })
      setCodice('')
      avvisa(t('impostazioni.collegato'), 'verde')
      await motore.aggiornaAccount().catch(() => undefined)
      ricarica()
    } catch (e) {
      setErrore(spiegaErrore(e, t))
    } finally {
      setLavoro(false)
    }
  }
  async function rimuovi() {
    const ok = await conferma({ titolo: t('amministrazione.gestionale_rimuovi'), testo: t('amministrazione.gestionale_rimuovi_conferma'), testoConferma: t('amministrazione.gestionale_rimuovi'), pericolo: true })
    if (!ok) return
    try {
      await api.rimuoviPlexus(await motore.tokenValido())
      setUrl('')
      await motore.aggiornaAccount().catch(() => undefined)
      ricarica()
    } catch (e) {
      avvisa(spiegaErrore(e, t), 'rosso', 5000)
    }
  }
  return (
    <div className="card">
      <div className="card__titolo">
        <div>
          <h2>{brand.plexus.nome_piattaforma}</h2>
          <p className="mini">{t('amministrazione.gestionale_aiuto')}</p>
        </div>
        {plexus && <Pillola tono={plexus.stato === 'ok' ? 'verde' : 'rosso'} punto>{plexus.stato === 'ok' ? t('impostazioni.collegato') : t('impostazioni.ricollega_titolo')}</Pillola>}
      </div>
      {erroreCarico && <p className="campo__errore">{erroreCarico}</p>}
      {plexus && (
        <div className="colonna" style={{ marginBottom: 14 }}>
          <div>{t('amministrazione.gestionale_collegato', { azienda: String(plexus.dettagli.azienda ?? ''), utente: String((plexus.dettagli.utente as { nome?: string } | undefined)?.nome ?? '') })}</div>
          <div className="mini">
            {t('amministrazione.gestionale_coda', { n: plexus.in_coda, errori: plexus.in_errore })}
            {plexus.ultima_sincronizzazione && ` · ${t('amministrazione.gestionale_ultima', { data: formattaDataOra(plexus.ultima_sincronizzazione, lingua) })}`}
          </div>
          {plexus.stato !== 'ok' && <div className="avviso avviso--rosso">{plexus.stato === 'permesso_negato' ? t('impostazioni.permesso_negato') : plexus.stato === 'token_non_valido' ? t('impostazioni.token_revocato') : plexus.ultimo_errore}</div>}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void salva()
        }}
        noValidate
      >
        <Campo etichetta={t('impostazioni.indirizzo', { piattaforma: brand.plexus.nome_piattaforma })} placeholder={t('impostazioni.indirizzo_segnaposto')} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Campo etichetta={t('impostazioni.codice')} placeholder={t('impostazioni.codice_segnaposto')} type="password" autoComplete="off" value={codice} onChange={(e) => setCodice(e.target.value)} aiuto={plexus ? t('amministrazione.gestionale_codice_lascia') : undefined} errore={errore} />
        <div className="riga">
          <button type="submit" className="pulsante" disabled={lavoro}>
            {lavoro ? <span className="caricamento" /> : t('amministrazione.gestionale_salva')}
          </button>
          {plexus && (
            <button type="button" className="pulsante pulsante--pericolo pulsante--piccolo" onClick={() => void rimuovi()}>
              {t('amministrazione.gestionale_rimuovi')}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

function righe(testo: string): string[] {
  return testo.split('\n').map((r) => r.trim()).filter(Boolean)
}

/** Voci che un file di configurazione può contenere (le stesse accettate da Capta Cloud). */
const CHIAVI_FILE = ['azienda', 'tema', 'lingue', 'linee', 'linea_predefinita', 'categorie_predefinite', 'professioni_suggerite', 'tipi_foto', 'privacy', 'questionario_predefinito', 'app']

function SezionePersonalizzazione({ api }: { api: Api }) {
  const { t } = useT()
  const avvisa = useToast()
  const conferma = useConferma()
  const [conf, ricaricaConf, errore] = useCaricamento<Record<string, unknown>>(async () => api.configurazione(await motore.tokenValido()))

  async function importa(file: File | undefined) {
    if (!file) return
    let dati: Record<string, unknown>
    try {
      const letto = JSON.parse(await file.text()) as unknown
      if (!letto || typeof letto !== 'object' || Array.isArray(letto)) throw new Error('non è un oggetto')
      dati = Object.fromEntries(Object.entries(letto as Record<string, unknown>).filter(([k]) => CHIAVI_FILE.includes(k)))
      if (Object.keys(dati).length === 0) throw new Error('nessuna voce riconosciuta')
    } catch {
      avvisa(t('amministrazione.file_non_valido'), 'rosso', 5000)
      return
    }
    const ok = await conferma({ titolo: t('amministrazione.file_importa'), testo: t('amministrazione.file_conferma'), testoConferma: t('amministrazione.file_importa') })
    if (!ok) return
    try {
      await api.salvaConfigurazione(await motore.tokenValido(), { ...(conf ?? {}), ...dati })
      await motore.aggiornaAccount()
      setCaricato(false)
      ricaricaConf()
      avvisa(t('amministrazione.file_importato', { voci: Object.keys(dati).join(', ') }), 'verde', 5000)
    } catch (e) {
      avvisa(spiegaErrore(e, t), 'rosso', 5000)
    }
  }

  function esporta() {
    const blob = new Blob([JSON.stringify(conf ?? {}, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'configurazione-capta-lead.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  const [nomeApp, setNomeApp] = useState('')
  const [nomeAzienda, setNomeAzienda] = useState('')
  const [categorie, setCategorie] = useState('')
  const [professioni, setProfessioni] = useState('')
  const [privacyIt, setPrivacyIt] = useState('')
  const [privacyEn, setPrivacyEn] = useState('')
  const [accento, setAccento] = useState('')
  const [navy, setNavy] = useState('')
  const [lavoro, setLavoro] = useState(false)
  const [caricato, setCaricato] = useState(false)
  useEffect(() => {
    if (!conf || caricato) return
    const c = conf as Record<string, Record<string, unknown> | string[] | undefined>
    setNomeApp(String((c.app as Record<string, unknown> | undefined)?.nome ?? ''))
    setNomeAzienda(String((c.azienda as Record<string, unknown> | undefined)?.nome ?? ''))
    setCategorie(Array.isArray(c.categorie_predefinite) ? c.categorie_predefinite.join('\n') : '')
    setProfessioni(Array.isArray(c.professioni_suggerite) ? c.professioni_suggerite.join('\n') : '')
    const privacy = (c.privacy as Record<string, Record<string, string>> | undefined)?.testo
    setPrivacyIt(privacy?.it ?? '')
    setPrivacyEn(privacy?.en ?? '')
    const tema = c.tema as Record<string, string> | undefined
    setAccento(tema?.accento ?? '')
    setNavy(tema?.navy ?? '')
    setCaricato(true)
  }, [conf, caricato])
  async function salva() {
    setLavoro(true)
    try {
      const nuova: Record<string, unknown> = { ...(conf ?? {}) }
      const app: Record<string, string> = {}
      if (nomeApp.trim()) app.nome = nomeApp.trim()
      if (nomeApp.trim()) app.nome_breve = nomeApp.trim()
      nuova.app = app
      nuova.azienda = nomeAzienda.trim() ? { nome: nomeAzienda.trim() } : {}
      nuova.categorie_predefinite = righe(categorie)
      nuova.professioni_suggerite = righe(professioni)
      const testo: Record<string, string> = {}
      if (privacyIt.trim()) testo.it = privacyIt.trim()
      if (privacyEn.trim()) testo.en = privacyEn.trim()
      nuova.privacy = { titolo: brandPrivacyTitolo(), testo }
      const tema: Record<string, string> = {}
      if (/^#[0-9a-f]{6}$/i.test(accento.trim())) tema.accento = accento.trim()
      if (/^#[0-9a-f]{6}$/i.test(navy.trim())) tema.navy = navy.trim()
      nuova.tema = tema
      for (const k of Object.keys(nuova)) {
        const v = nuova[k]
        if ((Array.isArray(v) && v.length === 0) || (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)) delete nuova[k]
      }
      await api.salvaConfigurazione(await motore.tokenValido(), nuova)
      await motore.aggiornaAccount()
      avvisa(t('amministrazione.salvato'), 'verde')
    } catch (e) {
      avvisa(spiegaErrore(e, t), 'rosso', 5000)
    } finally {
      setLavoro(false)
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void salva()
      }}
      noValidate
    >
      <div className="card">
        <div className="card__titolo">
          <div>
            <h2>{t('amministrazione.file_titolo')}</h2>
            <p className="mini">{t('amministrazione.file_aiuto')}</p>
          </div>
        </div>
        <div className="riga">
          <label className="pulsante pulsante--secondario" style={{ cursor: 'pointer' }}>
            {t('amministrazione.file_importa')}
            <input type="file" accept="application/json,.json" className="nascosto-visivamente" onChange={(e) => void importa(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
          </label>
          <button type="button" className="pulsante pulsante--neutro" onClick={esporta} disabled={!conf}>
            {t('amministrazione.file_esporta')}
          </button>
        </div>
      </div>
      <div className="card">
        <p className="mini" style={{ marginBottom: 14 }}>{t('amministrazione.personalizzazione_aiuto')}</p>
        {errore && <p className="campo__errore">{errore}</p>}
        <div className="griglia-campi griglia-campi--2">
          <Campo etichetta={t('amministrazione.nome_app')} value={nomeApp} onChange={(e) => setNomeApp(e.target.value)} placeholder={brand.app.nome} />
          <Campo etichetta={t('amministrazione.nome_azienda')} value={nomeAzienda} onChange={(e) => setNomeAzienda(e.target.value)} />
        </div>
        <div className="griglia-campi griglia-campi--2">
          <CampoTesto etichetta={t('amministrazione.categorie')} value={categorie} onChange={(e) => setCategorie(e.target.value)} rows={5} placeholder={brand.categorie_predefinite.join('\n')} />
          <CampoTesto etichetta={t('amministrazione.professioni')} value={professioni} onChange={(e) => setProfessioni(e.target.value)} rows={5} placeholder={brand.professioni_suggerite.join('\n')} />
        </div>
        <CampoTesto etichetta={t('amministrazione.privacy_it')} value={privacyIt} onChange={(e) => setPrivacyIt(e.target.value)} rows={4} placeholder={testoIn(brand.privacy.testo, 'it')} />
        <CampoTesto etichetta={t('amministrazione.privacy_en')} value={privacyEn} onChange={(e) => setPrivacyEn(e.target.value)} rows={4} placeholder={testoIn(brand.privacy.testo, 'en')} />
        <div className="griglia-campi griglia-campi--2">
          <Campo etichetta={t('amministrazione.colore_accento')} value={accento} onChange={(e) => setAccento(e.target.value)} placeholder={brand.tema.accento} />
          <Campo etichetta={t('amministrazione.colore_navy')} value={navy} onChange={(e) => setNavy(e.target.value)} placeholder={brand.tema.navy} />
        </div>
        <button type="submit" className="pulsante" disabled={lavoro || !conf}>
          {lavoro ? <span className="caricamento" /> : t('comune.salva')}
        </button>
      </div>
    </form>
  )
}

function brandPrivacyTitolo(): Record<string, string> | string {
  return brand.privacy.titolo
}

function SezionePiano({ lingua }: { lingua: string }) {
  const { t } = useT()
  const { collegamento } = useMotore()
  const piano = collegamento?.account?.azienda.piano
  if (!piano) return null
  const limite = (n: number | null | undefined) => (n === null || n === undefined ? t('account.illimitati') : String(n))
  return (
    <div className="card">
      <div className="card__titolo">
        <h2>{t('account.piano', { piano: t(`account.piano_${piano.nome}` as 'account.piano_prova') })}</h2>
      </div>
      <div className="griglia-numeri">
        <div className="numero">
          <span className="etichetta">{t('amministrazione.utenti')}</span>
          <div className="valore-medio">
            {piano.utilizzo.utenti} / {limite(piano.limiti.utenti)}
          </div>
        </div>
        <div className="numero">
          <span className="etichetta">{t('eventi.in_corso')}</span>
          <div className="valore-medio">
            {piano.utilizzo.eventi_attivi} / {limite(piano.limiti.eventi_attivi)}
          </div>
        </div>
        <div className="numero">
          <span className="etichetta">{t('dettaglio.contatti')}</span>
          <div className="valore-medio">{piano.utilizzo.lead}</div>
        </div>
      </div>
      <p className="mini spazio-sopra">
        {t('account.limite_lead', { n: limite(piano.limiti.lead_per_evento) })}
        {piano.nome === 'evento' && ` · ${t('eventi.lead_molti', { n: piano.crediti_eventi })}`}
        {piano.scadenza && ` · ${formattaDataOra(piano.scadenza, lingua)}`}
      </p>
    </div>
  )
}
