import { describe, expect, it } from 'vitest'
import {
  contarDiasHabiles,
  diferenciaDiasHabiles,
  esDiaHabil,
  esFinDeSemana,
  fechaLimiteTramo,
  normalizarADiaHabil,
  siguienteDiaHabil,
  sumarDiasHabiles
} from './dias-habiles.js'

// Semana de referencia: lunes 2026-09-07 .. domingo 2026-09-13 (sin festivos).
const FESTIVO_MIE = new Set(['2026-09-09']) // miércoles convertido en festivo

describe('días hábiles', () => {
  it('detecta fines de semana', () => {
    expect(esFinDeSemana('2026-09-11')).toBe(false) // viernes
    expect(esFinDeSemana('2026-09-12')).toBe(true) // sábado
    expect(esFinDeSemana('2026-09-13')).toBe(true) // domingo
  })

  it('esDiaHabil excluye fines de semana y festivos', () => {
    expect(esDiaHabil('2026-09-07')).toBe(true)
    expect(esDiaHabil('2026-09-12')).toBe(false) // sábado
    expect(esDiaHabil('2026-09-09', FESTIVO_MIE)).toBe(false) // festivo
    expect(esDiaHabil('2026-09-09')).toBe(true) // sin festivos sí es hábil
  })

  it('siguienteDiaHabil salta fin de semana y festivos', () => {
    expect(siguienteDiaHabil('2026-09-07')).toBe('2026-09-08')
    expect(siguienteDiaHabil('2026-09-11')).toBe('2026-09-14') // viernes -> lunes
    expect(siguienteDiaHabil('2026-09-08', FESTIVO_MIE)).toBe('2026-09-10') // salta el mié festivo
  })

  it('normalizarADiaHabil deja igual un día hábil y avanza uno no hábil', () => {
    expect(normalizarADiaHabil('2026-09-07')).toBe('2026-09-07')
    expect(normalizarADiaHabil('2026-09-12')).toBe('2026-09-14') // sábado -> lunes
  })

  it('sumarDiasHabiles no cuenta el día de partida y salta no hábiles', () => {
    expect(sumarDiasHabiles('2026-09-07', 0)).toBe('2026-09-07')
    expect(sumarDiasHabiles('2026-09-07', 1)).toBe('2026-09-08')
    expect(sumarDiasHabiles('2026-09-07', 2)).toBe('2026-09-09')
    expect(sumarDiasHabiles('2026-09-11', 1)).toBe('2026-09-14') // cruza fin de semana
    expect(sumarDiasHabiles('2026-09-07', 2, FESTIVO_MIE)).toBe('2026-09-10') // salta mié festivo
    expect(() => sumarDiasHabiles('2026-09-07', -1)).toThrow()
  })

  it('contarDiasHabiles es inclusivo en ambos extremos', () => {
    expect(contarDiasHabiles('2026-09-07', '2026-09-07')).toBe(1)
    expect(contarDiasHabiles('2026-09-07', '2026-09-09')).toBe(3) // lun, mar, mié
    expect(contarDiasHabiles('2026-09-07', '2026-09-13')).toBe(5) // semana laboral
    expect(contarDiasHabiles('2026-09-07', '2026-09-09', FESTIVO_MIE)).toBe(2) // sin el mié
    expect(contarDiasHabiles('2026-09-09', '2026-09-07')).toBe(0) // fin < inicio
  })

  it('fechaLimiteTramo: D-ésimo día hábil contando la activación como día 1', () => {
    expect(fechaLimiteTramo('2026-09-07', 1)).toBe('2026-09-07') // aprobación 1 día
    expect(fechaLimiteTramo('2026-09-07', 3)).toBe('2026-09-09') // ejemplo §6
    expect(fechaLimiteTramo('2026-09-10', 3)).toBe('2026-09-14') // cruza fin de semana
    expect(fechaLimiteTramo('2026-09-07', 3, FESTIVO_MIE)).toBe('2026-09-10') // salta festivo
  })

  it('diferenciaDiasHabiles: desplazamiento firmado (no inclusivo)', () => {
    expect(diferenciaDiasHabiles('2026-09-18', '2026-09-18')).toBe(0)
    expect(diferenciaDiasHabiles('2026-09-18', '2026-09-21')).toBe(1) // vie -> lun
    expect(diferenciaDiasHabiles('2026-09-18', '2026-09-22')).toBe(2)
    expect(diferenciaDiasHabiles('2026-09-21', '2026-09-18')).toBe(-1) // adelanto
  })
})
