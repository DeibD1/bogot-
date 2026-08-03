import { describe, expect, it } from 'vitest'
import { calcularCriticidad } from './criticidad.js'

// Semana de referencia: lunes 2026-09-07 .. viernes 2026-09-11.
describe('calcularCriticidad (RF-08 / RF-28)', () => {
  it('rojo cuando la fecha límite ya pasó (vencido)', () => {
    expect(calcularCriticidad('2026-09-10', '2026-09-09')).toBe('rojo')
    expect(calcularCriticidad('2026-09-14', '2026-09-11')).toBe('rojo')
  })

  it('amarillo cuando vence hoy o el siguiente día hábil', () => {
    expect(calcularCriticidad('2026-09-09', '2026-09-09')).toBe('amarillo') // vence hoy
    expect(calcularCriticidad('2026-09-08', '2026-09-09')).toBe('amarillo') // vence mañana
    // viernes -> vence el lunes (siguiente día hábil): amarillo
    expect(calcularCriticidad('2026-09-11', '2026-09-14')).toBe('amarillo')
  })

  it('verde cuando quedan más de 2 días hábiles', () => {
    expect(calcularCriticidad('2026-09-07', '2026-09-09')).toBe('verde') // quedan 3
    expect(calcularCriticidad('2026-09-07', '2026-09-18')).toBe('verde')
  })

  it('los festivos cuentan: un festivo intermedio acerca el vencimiento', () => {
    const festivos = new Set(['2026-09-09']) // miércoles festivo
    // mar 08 -> límite jue 10: hábiles [mar, jue] = 2 -> amarillo
    expect(calcularCriticidad('2026-09-08', '2026-09-10', festivos)).toBe('amarillo')
    // sin festivo serían 3 días hábiles -> verde
    expect(calcularCriticidad('2026-09-08', '2026-09-10')).toBe('verde')
  })

  it('sin fecha límite -> verde', () => {
    expect(calcularCriticidad('2026-09-07', null)).toBe('verde')
  })
})
