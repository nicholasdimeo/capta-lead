// Account Capta Cloud dal browser, contro il server Python vero: registrazione, evento e contatto che
// arrivano al cloud con "registrata da", uscita e nuovo accesso che riporta i dati.
import { test, expect } from '@playwright/test'
import { apriApp } from './aiuti'

const CLOUD = 'http://localhost:8011'

/** Scrive l'indirizzo del server di prova nel modulo di accesso (il campo compare quando l'indirizzo salvato è stato letto). */
async function impostaServer(page: import('@playwright/test').Page) {
  const pulsante = page.getByRole('button', { name: 'Indirizzo di Capta Cloud' })
  await pulsante.waitFor()
  if (!(await page.getByLabel('Indirizzo di Capta Cloud').isVisible())) await pulsante.click()
  await page.getByLabel('Indirizzo di Capta Cloud').fill(CLOUD)
}

test('registrazione, contatto condiviso con il cloud, uscita e nuovo accesso', async ({ page, request }) => {
  const email = `anna-${Date.now()}@sgm.it`
  await apriApp(page)
  await page.getByRole('link', { name: 'Accedi' }).first().click()
  await page.getByRole('button', { name: 'Crea un account' }).click()
  await page.getByLabel("Nome dell'azienda").fill('SGM Pharma')
  await page.getByLabel('Il tuo nome').fill('Anna')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('segreta123')
  await page.getByLabel('Ripeti la password').fill('segreta123')
  await impostaServer(page)
  await page.getByRole('button', { name: 'Crea un account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Eventi' })).toBeVisible()

  // impostazioni: account collegato
  await page.getByRole('link', { name: 'Impostazioni' }).click()
  await expect(page.getByText('SGM Pharma').first()).toBeVisible()
  await expect(page.getByText('Anna · amministratore', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Amministrazione' })).toBeVisible()
  await page.getByRole('button', { name: 'Indietro' }).click()

  // evento e contatto: arrivano al cloud con chi li ha registrati
  await page.getByRole('link', { name: 'Nuovo evento' }).first().click()
  await page.getByLabel("Nome dell'evento").fill('Evento cloud')
  await page.getByRole('button', { name: 'Salva' }).click()
  await page.getByRole('link', { name: 'Nuovo contatto' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Marco')
  await page.getByLabel('Cognome').fill('Rossi')
  await page.getByRole('button', { name: 'Avanti' }).click()
  await page.getByRole('button', { name: 'Sì', exact: true }).click()
  await page.getByRole('button', { name: 'Avanti' }).click()
  await page.getByRole('button', { name: 'Salva contatto' }).click()
  await expect(page.getByText('Su Capta Cloud').first()).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Indietro' }).click()

  const accesso = await request.post(`${CLOUD}/api/v1/auth/accesso`, { data: { email, password: 'segreta123' } })
  const token = (await accesso.json()).token.token_accesso
  const eventi = await (await request.get(`${CLOUD}/api/v1/eventi`, { headers: { Authorization: `Bearer ${token}` } })).json()
  expect(eventi.eventi).toHaveLength(1)
  const lead = await (await request.get(`${CLOUD}/api/v1/eventi/${eventi.eventi[0].id}/lead`, { headers: { Authorization: `Bearer ${token}` } })).json()
  expect(lead.lead).toHaveLength(1)
  expect(lead.lead[0].registrata_da.nome).toBe('Anna')
  expect(lead.lead[0].consenso).toBe('S')

  // uscita e nuovo accesso da un "altro dispositivo" (archivio locale vuoto): i dati tornano dal cloud
  await page.getByRole('link', { name: 'Impostazioni' }).click()
  await page.getByRole('button', { name: 'Esci' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Esci' }).click()
  await page.evaluate(() => indexedDB.deleteDatabase('leadstand'))
  await page.goto('/') // si riapre l'app dalla schermata iniziale
  // dispositivo "vuoto": l'app si apre direttamente sulla schermata di accesso
  await expect(page.getByRole('button', { name: 'Accedi', exact: true })).toBeVisible()
  await impostaServer(page) // l'archivio è stato cancellato: anche l'indirizzo del server va reinserito
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('segreta123')
  await page.getByRole('button', { name: 'Accedi', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Eventi' })).toBeVisible()
  await expect(page.getByText('Evento cloud')).toBeVisible({ timeout: 20_000 })
  await page.getByText('Evento cloud').click()
  await expect(page.getByText('Marco Rossi')).toBeVisible({ timeout: 20_000 })
})

test('invito di un collega con link da condividere: su un dispositivo nuovo entra nella stessa azienda e vede gli eventi', async ({ page, browser }) => {
  const capo = `capo-${Date.now()}@interno.prova` // dominio interno: piano senza limiti, si possono invitare colleghi
  const collega = `collega-${Date.now()}@interno.prova`
  await apriApp(page)
  await page.getByRole('link', { name: 'Accedi' }).first().click()
  await page.getByRole('button', { name: 'Crea un account' }).click()
  await page.getByLabel("Nome dell'azienda").fill('Azienda Inviti')
  await page.getByLabel('Il tuo nome').fill('Capo')
  await page.getByLabel('Email').fill(capo)
  await page.getByLabel('Password', { exact: true }).fill('segreta123')
  await page.getByLabel('Ripeti la password').fill('segreta123')
  await impostaServer(page)
  await page.getByRole('button', { name: 'Crea un account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Eventi' })).toBeVisible()
  // un evento creato dal capo
  await page.getByRole('link', { name: 'Nuovo evento' }).first().click()
  await page.getByLabel("Nome dell'evento").fill('Fiera condivisa')
  await page.getByRole('button', { name: 'Salva' }).click()
  await page.getByRole('button', { name: 'Indietro' }).click()
  await expect(page.getByText('Su Capta Cloud').first()).toBeVisible({ timeout: 20_000 }) // pillola nell'elenco eventi
  // senza email: nessun avviso di conferma; piano "uso interno"
  await page.goto('/#/impostazioni')
  await expect(page.getByText('Conferma la tua email')).toHaveCount(0)
  await expect(page.getByText('Piano uso interno')).toBeVisible()
  await page.getByRole('link', { name: 'Amministrazione' }).click()
  await page.getByLabel('Email').fill(collega)
  await page.getByRole('button', { name: 'Invita un collega' }).click()
  const campoLink = page.getByRole('textbox', { name: `Link d'invito per ${collega}` })
  await expect(campoLink).toBeVisible()
  const link = await campoLink.inputValue()
  expect(link).toContain('/#/invito/')
  expect(link).toContain('?server=')

  // il collega apre il link su un dispositivo nuovo (contesto del browser vuoto)
  const altro = await browser.newContext()
  const pagina = await altro.newPage()
  await pagina.goto(link)
  await expect(pagina.getByText('Azienda Inviti ti ha invitato', { exact: false })).toBeVisible()
  await pagina.getByLabel('Il tuo nome').fill('Collega')
  await pagina.getByLabel('Password', { exact: true }).fill('segreta123')
  await pagina.getByLabel('Ripeti la password').fill('segreta123')
  await pagina.getByRole('button', { name: 'Accetta e crea la password' }).click()
  await expect(pagina.getByRole('heading', { name: 'Eventi' })).toBeVisible()
  await expect(pagina.getByText('Fiera condivisa')).toBeVisible({ timeout: 20_000 })
  // è operatore: niente amministrazione
  await pagina.goto(link.split('#')[0] + '#/impostazioni')
  await expect(pagina.getByText('Collega · operatore', { exact: false })).toBeVisible()
  await expect(pagina.getByRole('link', { name: 'Amministrazione' })).toHaveCount(0)
  await altro.close()
})
