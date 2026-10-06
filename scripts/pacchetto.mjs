// Impacchetta la cartella dist/ in uno zip pronto da caricare sull'hosting: leadstand-<versione>.zip
// Si lancia dopo "npm run build" con: npm run pacchetto
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(radice, 'dist')
if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('Manca dist/index.html: lancia prima "npm run build".')
  process.exit(1)
}
const pacchetto = JSON.parse(readFileSync(path.join(radice, 'package.json'), 'utf8'))
const nome = `${pacchetto.name}-${pacchetto.version}.zip`
const destinazione = path.join(radice, nome)
rmSync(destinazione, { force: true })
// "zip" è presente su macOS e Linux; lo zip contiene direttamente i file (index.html alla radice).
execFileSync('zip', ['-qr', destinazione, '.', '-x', '.DS_Store'], { cwd: dist, stdio: 'inherit' })
console.log(`creato ${nome}`)
