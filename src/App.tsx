// Radice dell'interfaccia: lingua, avvisi, conferme, percorsi delle schermate e avvio del motore di sincronizzazione.
import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { applicaConfigurazione, ascoltaBrand, brand, versioneDelBrand } from './config/brand'
import { useMotore } from './hooks/useMotore'
import { FornitoreLingua, impostaNomePiattaforma } from './i18n'
import { FornitoreToast } from './componenti/Toast'
import { FornitoreConferma } from './componenti/Modale'
import { TornaInCima } from './componenti/TornaInCima'
import { useLinguaInterfaccia } from './hooks/useImpostazioni'
import { motore } from './sync/istanza'
import { db } from './dati/db'
import { pulisciCompletate } from './dati/coda'
import { SchermataEventi } from './schermate/SchermataEventi'
import { SchermataModificaEvento } from './schermate/SchermataModificaEvento'
import { SchermataEvento } from './schermate/SchermataEvento'
import { SchermataLead } from './schermate/SchermataLead'
import { SchermataSchedaLead } from './schermate/SchermataSchedaLead'
import { SchermataImpostazioni } from './schermate/SchermataImpostazioni'
import { SchermataAccesso } from './schermate/SchermataAccesso'
import { SchermataAmministrazione } from './schermate/SchermataAmministrazione'
import { SchermataInvito, SchermataPassword, SchermataVerifica } from './schermate/SchermataCodici'

export function App() {
  const [lingua] = useLinguaInterfaccia()
  const { collegamento } = useMotore()
  const [versioneBrand, setVersioneBrand] = useState(versioneDelBrand())
  useEffect(() => {
    void motore.avvia()
    void pulisciCompletate(db, 30).catch(() => undefined)
    // Chiede al browser di non cancellare i dati dell'app per fare spazio (Safari e Chrome lo rispettano).
    void navigator.storage?.persist?.().catch(() => undefined)
    return () => motore.ferma()
  }, [])
  useEffect(() => ascoltaBrand(() => setVersioneBrand(versioneDelBrand())), [])
  // La personalizzazione dell'azienda (da Capta Cloud) si sovrappone a quella del file; senza account si torna al file.
  const configurazione = collegamento?.tipo === 'capta' ? JSON.stringify(collegamento.account?.azienda.configurazione ?? null) : 'null'
  const nomeAzienda = collegamento?.tipo === 'capta' ? collegamento.account?.azienda.nome : undefined
  const tipoCollegamento = collegamento?.tipo ?? null
  useEffect(() => {
    impostaNomePiattaforma(tipoCollegamento === 'capta' ? brand.cloud.nome : null)
    applicaConfigurazione(JSON.parse(configurazione), nomeAzienda)
  }, [configurazione, nomeAzienda, tipoCollegamento])
  return (
    <FornitoreLingua lingua={lingua} key={versioneBrand}>
      <FornitoreToast>
        <FornitoreConferma>
          <HashRouter>
            <TornaInCima />
            <Routes>
              <Route path="/" element={<SchermataEventi />} />
              <Route path="/eventi/nuovo" element={<SchermataModificaEvento />} />
              <Route path="/eventi/:uuid" element={<SchermataEvento />} />
              <Route path="/eventi/:uuid/modifica" element={<SchermataModificaEvento />} />
              <Route path="/eventi/:uuid/nuovo-contatto" element={<SchermataLead />} />
              <Route path="/contatti/:uuid" element={<SchermataSchedaLead />} />
              <Route path="/contatti/:uuid/modifica" element={<SchermataLead />} />
              <Route path="/impostazioni" element={<SchermataImpostazioni />} />
              <Route path="/accesso" element={<SchermataAccesso />} />
              <Route path="/amministrazione" element={<SchermataAmministrazione />} />
              <Route path="/verifica/:codice" element={<SchermataVerifica />} />
              <Route path="/password/:codice" element={<SchermataPassword />} />
              <Route path="/invito/:codice" element={<SchermataInvito />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </FornitoreConferma>
      </FornitoreToast>
    </FornitoreLingua>
  )
}
