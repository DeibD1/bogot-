import { describe, expect, it } from 'vitest'
import { addDias, diaSemana, esAntesODe, parseISO, toISO } from './fechas.js'

describe('fechas (utilidades ISO en UTC)', () => {
  it('parseISO + toISO son inversas', () => {
    expect(toISO(parseISO('2026-09-07'))).toBe('2026-09-07')
    expect(toISO(parseISO('2026-01-01'))).toBe('2026-01-01')
    expect(toISO(parseISO('2026-12-31'))).toBe('2026-12-31')
  })

  it('rechaza formatos y fechas inválidas', () => {
    expect(() => parseISO('2026-9-7')).toThrow()
    expect(() => parseISO('07/09/2026')).toThrow()
    expect(() => parseISO('2026-02-30')).toThrow()
    expect(() => parseISO('2026-13-01')).toThrow()
  })

  it('addDias cruza meses y años sin desfase de zona horaria', () => {
    expect(addDias('2026-09-07', 1)).toBe('2026-09-08')
    expect(addDias('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDias('2026-09-07', -1)).toBe('2026-09-06')
    expect(addDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('diaSemana: 0=domingo .. 6=sábado', () => {
    expect(diaSemana('2026-09-07')).toBe(1) // lunes
    expect(diaSemana('2026-09-12')).toBe(6) // sábado
    expect(diaSemana('2026-09-13')).toBe(0) // domingo
  })

  it('esAntesODe compara correctamente', () => {
    expect(esAntesODe('2026-09-07', '2026-09-08')).toBe(true)
    expect(esAntesODe('2026-09-08', '2026-09-08')).toBe(true)
    expect(esAntesODe('2026-09-09', '2026-09-08')).toBe(false)
  })
})
