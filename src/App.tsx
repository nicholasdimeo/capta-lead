// Radice dell'interfaccia: lingua, avvisi, conferme, percorsi delle schermate e avvio del motore di sincronizzazione.
import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FornitoreLingua } from './i18n'
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

export function App() {
  const [lingua] = useLinguaInterfaccia()
  useEffect(() => {
    void motore.avvia()
    void pulisciCompletate(db, 30).catch(() => undefined)
    // Chiede al browser di non cancellare i dati dell'app per fare spazio (Safari e Chrome lo rispettano).
    void navigator.storage?.persist?.().catch(() => undefined)
    return () => motore.ferma()
  }, [])
  return (
    <FornitoreLingua lingua={lingua}>
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </FornitoreConferma>
      </FornitoreToast>
    </FornitoreLingua>
  )
}
