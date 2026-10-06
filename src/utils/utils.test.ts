import { describe, it, expect } from 'vitest'
import { formattaData, formattaIntervallo, eventoInCorso, daGiornoIso, oggiIso } from './date'
import { emailValida, nomeCompleto, iniziali, normalizzaPerRicerca, nomeFileSicuro, pulisci } from './testo'
import { nuovoUuid } from './uuid'
import { formattaByte, nomeFileFoto } from './immagini'

describe('date', () => {
  it('formatta date e intervalli in italiano e inglese', () => {
    expect(formattaData('2026-11-05', 'it')).toMatch(/5 nov 2026/)
    expect(formattaData('2026-11-05', 'en')).toMatch(/5 Nov 2026/)
    expect(formattaData('', 'it')).toBe('')
    expect(formattaData('boh', 'it')).toBe('boh')
    expect(formattaIntervallo('2026-11-05', '2026-11-05', 'it')).toMatch(/5 nov 2026/)
    expect(formattaIntervallo('2026-11-05', '2026-11-07', 'it')).toMatch(/5.*7 nov 2026/)
    expect(formattaIntervallo('', '', 'it')).toBe('')
  })
  it('capisce se un evento è in corso', () => {
    expect(eventoInCorso('2026-11-05', '2026-11-07', '2026-11-06')).toBe(true)
    expect(eventoInCorso('2026-11-05', '2026-11-07', '2026-11-08')).toBe(false)
    expect(eventoInCorso('2026-11-05', '', '2026-11-05')).toBe(true)
    expect(eventoInCorso('', '', '2026-11-05')).toBe(false)
  })
  it('converte i giorni senza slittamenti di fuso', () => {
    expect(daGiornoIso('2026-02-28')?.getDate()).toBe(28)
    expect(daGiornoIso('2026-2-28')).toBeNull()
    expect(oggiIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('testo', () => {
  it('controlla le email in modo ragionevole', () => {
    expect(emailValida('anna@clinica.it')).toBe(true)
    expect(emailValida(' anna@clinica.it ')).toBe(true)
    expect(emailValida('anna@clinica')).toBe(false)
    expect(emailValida('anna')).toBe(false)
    expect(emailValida('')).toBe(false)
  })
  it('nome completo, iniziali e ricerca senza accenti', () => {
    expect(nomeCompleto({ nome: 'Anna', cognome: 'Bianchi' })).toBe('Anna Bianchi')
    expect(nomeCompleto({ email: 'x@y.it' })).toBe('x@y.it')
    expect(nomeCompleto({}, 'Senza nome')).toBe('Senza nome')
    expect(iniziali({ nome: 'anna', cognome: 'bianchi' })).toBe('AB')
    expect(iniziali({ email: 'zeta@x.it' })).toBe('Z')
    expect(iniziali({})).toBe('?')
    expect(normalizzaPerRicerca('  Forlì  CESENA ')).toBe('forli cesena')
    expect(nomeFileSicuro('Congresso SIME 2026 / Roma')).toBe('congresso-sime-2026-roma')
    expect(nomeFileSicuro('***')).toBe('report')
    expect(pulisci(undefined)).toBe('')
  })
})

describe('uuid e byte', () => {
  it('genera uuid v4 diversi', () => {
    const a = nuovoUuid()
    const b = nuovoUuid()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })
  it('formatta i byte e sceglie l\'estensione del file', () => {
    expect(formattaByte(500)).toBe('500 B')
    expect(formattaByte(1536)).toBe('1,5 KB')
    expect(formattaByte(3 * 1024 * 1024, 'en')).toBe('3 MB')
    expect(nomeFileFoto('image/png', 'abc')).toBe('abc.png')
    expect(nomeFileFoto('application/octet-stream', 'abc')).toBe('abc.jpg')
  })
})
