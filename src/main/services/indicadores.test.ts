import { describe, expect, it } from 'vitest'
import {
  desviacionPromedio,
  indicadorCumplimiento,
  indicadorUnidad,
  promedio,
  redondear2,
  rendimientoPromedio,
  tasaPuntualidad
} from './indicadores'

describe('indicadorCumplimiento (§11.2)', () => {
  it('desviación ≤ 0 -> 100 (incluye adelanto, sin premio extra)', () => {
    expect(indicadorCumplimiento(0, 3)).toBe(100)
    expect(indicadorCumplimiento(-1, 3)).toBe(100)
    expect(indicadorCumplimiento(-5, 9)).toBe(100)
  })

  it('reproduce el ejemplo del documento: oferta grande, 2 días tarde ≈ 77.78%', () => {
    expect(indicadorCumplimiento(2, 9)).toBe(77.78)
  })

  it('retraso en tramos', () => {
    expect(indicadorCumplimiento(1, 3)).toBe(66.67)
    expect(indicadorCumplimiento(2, 3)).toBe(33.33)
  })

  it('se topa en 0 cuando el retraso iguala o supera el divisor', () => {
    expect(indicadorCumplimiento(3, 3)).toBe(0)
    expect(indicadorCumplimiento(4, 3)).toBe(0)
    expect(indicadorCumplimiento(9, 9)).toBe(0)
  })

  it('rechaza divisor no positivo', () => {
    expect(() => indicadorCumplimiento(1, 0)).toThrow()
  })
})

describe('agregados', () => {
  it('promedio y redondeo a 2 decimales', () => {
    expect(promedio([])).toBeNull()
    expect(promedio([100, 50])).toBe(75)
    expect(promedio([100, 100, 0])).toBe(66.67)
    expect(redondear2(66.666666)).toBe(66.67)
  })

  it('rendimientoPromedio por profesional (§11.6)', () => {
    expect(rendimientoPromedio([100, 100, 66.67])).toBe(88.89)
  })

  it('indicadorUnidad = promedio de indicadores de oferta (§11.6)', () => {
    expect(indicadorUnidad([100, 77.78, 50])).toBe(75.93)
    expect(indicadorUnidad([])).toBeNull()
  })

  it('tasaPuntualidad: % de tramos a tiempo (desviación ≤ 0)', () => {
    expect(tasaPuntualidad([0, -1, 2, 3])).toBe(50)
    expect(tasaPuntualidad([0, 0, 0])).toBe(100)
    expect(tasaPuntualidad([])).toBeNull()
  })

  it('desviacionPromedio en días', () => {
    expect(desviacionPromedio([0, 2, -2])).toBe(0)
    expect(desviacionPromedio([1, 2, 3])).toBe(2)
  })
})
