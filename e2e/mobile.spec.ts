// Prove su schermo da telefono (Pixel 7): la registrazione funziona con pulsanti grandi e produce i report.
import { test, expect } from '@playwright/test'
import { apriApp, azzeraFinto, creaEvento, registraContatto } from './aiuti'

test.beforeEach(async ({ request }) => {
  await azzeraFinto(request)
})

test('registrazione da telefono e report Excel/PDF scaricabili', async ({ page }) => {
  await apriApp(page)
  await creaEvento(page, 'Fiera da telefono')
  await registraContatto(page, { nome: 'Sara', cognome: 'Gialli', email: 'sara@esempio.it', categoria: 'distributore', conFoto: true })
  await page.screenshot({ path: 'test-results/telefono-evento.png', fullPage: true })

  await page.getByRole('button', { name: 'Excel' }).click()
  await expect(page.getByRole('dialog', { name: 'Report pronto' })).toBeVisible({ timeout: 20_000 })
  const excel = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Scarica' }).click()
  expect((await excel).suggestedFilename()).toBe('report-fiera-da-telefono.xlsx')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'PDF' }).click()
  await expect(page.getByRole('dialog', { name: 'Report pronto' })).toBeVisible({ timeout: 20_000 })
  const pdf = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Scarica' }).click()
  expect((await pdf).suggestedFilename()).toBe('report-fiera-da-telefono.pdf')

  // nessuno scorrimento orizzontale sul telefono
  const largo = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(largo).toBe(false)
})
