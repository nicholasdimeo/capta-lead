// Funzioni comode per le prove end-to-end.
import { expect, type Page, type APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const FINTO = 'http://localhost:8787'

export const PNG_PROVA = readFileSync(path.resolve('public/icone/icona-192.png'))

export async function azzeraFinto(request: APIRequestContext): Promise<void> {
  await request.post(`${FINTO}/_test/reset`)
}

export async function dumpFinto(request: APIRequestContext) {
  const r = await request.get(`${FINTO}/_test/dump`)
  return r.json() as Promise<{ eventi: Array<{ id: number; uuid_app: string | null; nome: string }>; lead: Array<{ id: number; uuid: string | null; nome: string; cognome: string; email: string; consenso: string | null; categoria: string; risposte: Record<string, string>; note: string }>; foto: Array<{ id: number; lead_id: number; tipo: string; dimensione: number; mime: string }>; registro: Array<{ metodo: string; percorso: string }> }>
}

/** Apre l'app e aspetta che il service worker sia attivo (serve per le prove offline). */
export async function apriApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Eventi' })).toBeVisible()
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker?.ready
    return Boolean(reg?.active) && Boolean(navigator.serviceWorker.controller)
  }, undefined, { timeout: 20_000 })
}

export async function collegaPlexus(page: Page, codice = 'plx_prova'): Promise<void> {
  await page.getByRole('link', { name: 'Impostazioni' }).click()
  // il collegamento diretto a Plexus sta sotto "avanzato": si apre solo se il campo non è già visibile
  if (!(await page.getByLabel('Indirizzo di Plexus').isVisible())) await page.getByRole('button', { name: 'Collegamento diretto a Plexus (avanzato)' }).click()
  await page.getByLabel('Indirizzo di Plexus').fill(FINTO)
  await page.getByLabel('Codice personale').fill(codice)
  await page.getByRole('button', { name: 'Collega', exact: true }).click()
  await expect(page.getByText('SGM Pharma (finto)')).toBeVisible()
  await page.getByRole('button', { name: 'Indietro' }).click()
}

export async function creaEvento(page: Page, nome: string): Promise<void> {
  await page.getByRole('link', { name: 'Nuovo evento' }).first().click()
  await page.getByLabel("Nome dell'evento").fill(nome)
  await page.getByLabel('Luogo').fill('Bologna')
  await page.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByRole('link', { name: 'Nuovo contatto' })).toBeVisible()
}

export interface DatiContatto {
  nome: string
  cognome: string
  email?: string
  azienda?: string
  categoria?: string
  conFoto?: boolean
  consenso?: 'Sì' | 'No'
}

/** Compila i tre passi della registrazione di un contatto, partendo dalla pagina dell'evento. */
export async function registraContatto(page: Page, dati: DatiContatto): Promise<void> {
  await page.getByRole('link', { name: 'Nuovo contatto' }).click()
  await page.getByLabel('Nome', { exact: true }).fill(dati.nome)
  await page.getByLabel('Cognome').fill(dati.cognome)
  if (dati.email) await page.getByLabel('Email').fill(dati.email)
  if (dati.azienda) await page.getByLabel('Azienda / studio').fill(dati.azienda)
  await page.getByRole('button', { name: 'Avanti' }).click()
  // passo 2: questionario
  await expect(page.getByRole('heading', { name: 'Qualche domanda veloce' })).toBeVisible()
  await page.getByRole('button', { name: 'Medico estetico' }).click()
  await page.getByRole('button', { name: 'Un campione' }).click()
  await page.getByRole('button', { name: 'Il listino' }).click()
  await page.getByRole('button', { name: dati.consenso ?? 'Sì', exact: true }).click()
  await page.getByRole('button', { name: 'Avanti' }).click()
  // passo 3: categoria, note, foto
  if (dati.categoria) await page.getByRole('button', { name: dati.categoria, exact: true }).click()
  await page.getByLabel('Note di chi è allo stand').fill('vuole il listino')
  if (dati.conFoto) {
    await page.locator('input[type=file][multiple]').setInputFiles([
      { name: 'biglietto.png', mimeType: 'image/png', buffer: PNG_PROVA },
      { name: 'volto.png', mimeType: 'image/png', buffer: PNG_PROVA },
    ])
    await expect(page.locator('.foto-voce')).toHaveCount(2)
    // la seconda foto è un "volto"
    await page.locator('.foto-voce select').nth(1).selectOption('volto')
  }
  await page.getByRole('button', { name: 'Salva contatto' }).click()
  await expect(page.getByText('Contatto salvato')).toBeVisible()
}
