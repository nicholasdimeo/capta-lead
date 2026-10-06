// Quando si apre una schermata nuova, la pagina riparte dall'alto (con il router "hash" il browser non lo fa da solo).
// Tornando indietro (freccia o gesto) la posizione viene lasciata al browser, così l'elenco resta dov'era.
import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

export function TornaInCima() {
  const { pathname } = useLocation()
  const tipo = useNavigationType()
  useEffect(() => {
    if (tipo === 'POP') return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, tipo])
  return null
}
