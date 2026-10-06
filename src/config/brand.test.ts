import { describe, it, expect } from 'vitest'
import { brand, validaBrand, normalizzaQuestionario, testoIn } from './brand'

describe('configurazione brand', () => {
  it('il brand.json del progetto è valido e completo', () => {
    expect(brand.app.nome).toBeTruthy()
    expect(brand.azienda.nome).toBeTruthy()
    expect(Object.keys(brand.lingue.disponibili)).toContain(brand.lingue.principale)
    expect(brand.questionario_predefinito.length).toBeGreaterThan(0)
    expect(brand.questionario_predefinito.filter((d) => d.consenso)).toHaveLength(1)
    expect(brand.categorie_predefinite.length).toBeGreaterThan(0)
    expect(brand.tema.accento).toMatch(/^#[0-9a-f]{6}$/i)
    expect(testoIn(brand.privacy.testo, 'it')).toContain('SGM Pharma')
    expect(testoIn(brand.privacy.testo, 'en')).toContain('SGM Pharma')
  })

  it('con un file vuoto usa valori di riserva sensati senza rompersi', () => {
    const b = validaBrand({}, 'logo.svg')
    expect(b.app.nome).toBe('LeadStand')
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
