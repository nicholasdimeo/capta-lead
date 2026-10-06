// Genera le icone PNG della PWA (192, 512, 512 "maskable", 180 per iOS) partendo da config/logo.svg,
// usando il Chromium di Playwright. Si lancia con: npm run icone
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const brand = JSON.parse(readFileSync(path.join(radice, 'config/brand.json'), 'utf8'))
const svg = readFileSync(path.join(radice, 'config/logo.svg'), 'utf8')
const cartella = path.join(radice, 'public/icone')
mkdirSync(cartella, { recursive: true })

const browser = await chromium.launch()
const pagina = await browser.newPage()

async function rendi(nome, lato, margine) {
  // margine: frazione del lato lasciata come sfondo colorato attorno al logo (per le icone "maskable")
  const interno = Math.round(lato * (1 - 2 * margine))
  const scostamento = Math.round(lato * margine)
  const sfondo = margine > 0 ? brand.tema?.navy ?? '#16244b' : 'transparent'
  await pagina.setViewportSize({ width: lato, height: lato })
  await pagina.setContent(`<!doctype html><html><body style="margin:0;background:${sfondo}">
    <div style="position:absolute;left:${scostamento}px;top:${scostamento}px;width:${interno}px;height:${interno}px">${svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>
  </body></html>`)
  const png = await pagina.screenshot({ type: 'png', omitBackground: margine === 0, clip: { x: 0, y: 0, width: lato, height: lato } })
  writeFileSync(path.join(cartella, nome), png)
  console.log('creata', nome, `${lato}x${lato}`)
}

await rendi('icona-192.png', 192, 0)
await rendi('icona-512.png', 512, 0)
await rendi('icona-180.png', 180, 0)
await rendi('icona-512-maskable.png', 512, 0.12)
await browser.close()
