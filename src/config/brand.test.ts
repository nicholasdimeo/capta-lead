import { describe, it, expect } from 'vitest'
import { brand, validaBrand, normalizzaQuestionario, testoIn } from './brand'
import configurazioneSgm from '../../config/aziende/sgm-pharma.json'

describe('configurazione brand', () => {
  it('il brand.json del progetto è valido, completo e neutro (nessuna azienda cliente)', () => {
    expect(brand.app.nome).toBe('Capta Lead')
    expect(brand.azienda.nome).toBe('')
    expect(Object.keys(brand.lingue.disponibili)).toContain(brand.lingue.principale)
    expect(brand.questionario_predefinito.length).toBeGreaterThan(0)
    expect(brand.questionario_predefinito.filter((d) => d.consenso)).toHaveLength(1)
    expect(brand.categorie_predefinite.length).toBeGreaterThan(0)
    expect(brand.tema.accento).toMatch(/^#[0-9a-f]{6}$/i)
    expect(Object.keys(brand.linee)).toEqual(['generale'])
    for (const testo of [testoIn(brand.privacy.testo, 'it'), testoIn(brand.privacy.testo, 'en'), JSON.stringify(brand.questionario_predefinito)]) {
      expect(testo).not.toMatch(/SGM|REGENFLEX|TIADERM/i)
    }
  })

  it('la configurazione di SGM Pharma (da importare nell\'azienda) è valida', () => {
    const sgm = validaBrand(configurazioneSgm, '')
    expect(sgm.azienda.nome).toBe('SGM Pharma')
    expect(Object.keys(sgm.linee)).toEqual(['ortopedia', 'estetica', 'entrambe'])
    expect(sgm.questionario_predefinito.filter((d) => d.consenso)).toHaveLength(1)
    expect(testoIn(sgm.privacy.testo, 'it')).toContain('SGM Pharma')
  })

  it('con un file vuoto usa valori di riserva sensati senza rompersi', () => {
    const b = validaBrand({}, 'logo.svg')
    expect(b.app.nome).toBe('Capta Lead')
    expect(b.lingue.principale).toBe('it')
    expect(b.linee.generale).toBe('Generale')
    expect(b.linea_predefinita).toBe('generale')
    expect(b.tipi_foto.biglietto).toBe('biglietto')
    expect(b.questionario_predefinito).toEqual([])
    expect(b.tema.navy).toBe('#16244b')
  })

  it('se la lingua principale non è tra le disponibili prende la prima', () => {
    const b = validaBrand({ lingue: { principale: 'fr', disponibili: { de: 'Deutsch', en: 'English' } } }, '')
    expect(b.lingue.principale).toBe('de')
  })

  it('scarta le domande senza testo o con meno di due risposte; tiene le traduzioni solo se complete', () => {
    const q = normalizzaQuestionario([
      { domanda: 'Valida?', opzioni: ['A', 'B'], multipla: true, traduzioni: { en: { domanda: 'Valid?', opzioni: ['A', 'B'] }, de: { domanda: 'Gültig?', opzioni: ['A'] } } },
      { domanda: '', opzioni: ['A', 'B'] },
      { domanda: 'Una sola', opzioni: ['A'] },
      'spazzatura',
    ])
    expect(q).toHaveLength(1)
    expect(q[0].multipla).toBe(true)
    expect(q[0].consenso).toBe(false)
    expect(Object.keys(q[0].traduzioni ?? {})).toEqual(['en'])
  })

  it('testoIn: lingua richiesta, poi principale, poi la prima, poi stringa', () => {
    expect(testoIn({ it: 'Ciao', en: 'Hello' }, 'en')).toBe('Hello')
    expect(testoIn({ it: 'Ciao', en: 'Hello' }, 'de')).toBe('Ciao')
    expect(testoIn({ fr: 'Salut' }, 'de', 'it')).toBe('Salut')
    expect(testoIn('Fisso', 'en')).toBe('Fisso')
    expect(testoIn(undefined, 'en')).toBe('')
  })
})
