import { describe, expect, it } from 'vitest'
import {
  calcularCierreTramo,
  calcularDesviacionOferta,
  planificarOferta,
  recalcularDesde
} from './planificacion.js'

// Inicio lunes 2026-09-07; septiembre 2026 no tiene festivos en Colombia.
const LUNES = '2026-09-07'

describe('planificarOferta (flujo de 6 tramos: socialización + 3 técnicos + aprobación + envío)', () => {
  it('oferta GRANDE: 1 + 3-3-3 (§6) + 1 + 1', () => {
    const plan = planificarOferta({ tamano: 'grande', fechaInicio: LUNES })
    expect(plan.plazoTotalDias).toBe(9)
    expect(plan.tramos.map((t) => [t.numero, t.fechaActivacion, t.fechaLimite, t.duracion])).toEqual([
      [1, '2026-09-07', '2026-09-07', 1], // socialización (comercial)
      [2, '2026-09-08', '2026-09-10', 3], // técnico 3-3-3 como el §6, desplazado 1 día
      [3, '2026-09-11', '2026-09-15', 3],
      [4, '2026-09-16', '2026-09-18', 3],
      [5, '2026-09-21', '2026-09-21', 1], // aprobación
      [6, '2026-09-22', '2026-09-22', 1] // envío al cliente
    ])
    expect(plan.fechaEntregaComprometida).toBe('2026-09-22')
    expect(plan.tramos[0]!.rol).toBe('lider_comercial')
    expect(plan.tramos[4]!.rol).toBe('lider_unidad')
    expect(plan.tramos[4]!.esAprobacion).toBe(true)
    expect(plan.tramos[5]!.rol).toBe('lider_comercial')
    expect(plan.tramos[5]!.tareas).toEqual(['envio_cliente'])
  })

  it('oferta PEQUEÑA: 1 + 2-2-2 + 1 + 1', () => {
    const plan = planificarOferta({ tamano: 'pequena', fechaInicio: LUNES })
    expect(plan.plazoTotalDias).toBe(6)
    expect(plan.tramos.map((t) => [t.numero, t.fechaActivacion, t.fechaLimite])).toEqual([
      [1, '2026-09-07', '2026-09-07'],
      [2, '2026-09-08', '2026-09-09'],
      [3, '2026-09-10', '2026-09-11'],
      [4, '2026-09-14', '2026-09-15'],
      [5, '2026-09-16', '2026-09-16'],
      [6, '2026-09-17', '2026-09-17']
    ])
    expect(plan.fechaEntregaComprometida).toBe('2026-09-17')
  })

  it('la duración de la socialización la decide el comercial y desplaza la cadena', () => {
    const plan = planificarOferta({ tamano: 'pequena', fechaInicio: LUNES, duracionSocializacion: 3 })
    expect(plan.tramos[0]!.duracion).toBe(3)
    expect([plan.tramos[0]!.fechaActivacion, plan.tramos[0]!.fechaLimite]).toEqual([
      '2026-09-07',
      '2026-09-09'
    ])
    // El tramo técnico arranca al terminar la socialización ampliada.
    expect(plan.tramos[1]!.fechaActivacion).toBe('2026-09-10')
    expect(plan.fechaEntregaComprometida).toBe('2026-09-21') // toda la cadena corre 2 días
  })

  it('normaliza un inicio en fin de semana al siguiente día hábil', () => {
    const plan = planificarOferta({ tamano: 'grande', fechaInicio: '2026-09-12' }) // sábado
    expect(plan.tramos[0]!.fechaActivacion).toBe('2026-09-14') // lunes
  })

  it('respeta los festivos en el encadenamiento', () => {
    const festivos = new Set(['2026-09-08']) // martes festivo
    const plan = planificarOferta({ tamano: 'grande', fechaInicio: LUNES, festivos })
    // Socialización lunes; el tramo técnico arranca el miércoles (martes festivo).
    expect(plan.tramos[1]!.fechaActivacion).toBe('2026-09-09')
  })
})

describe('calcularCierreTramo (RN-07, §11)', () => {
  it('entrega a tiempo: desviación 0, indicador 100', () => {
    const c = calcularCierreTramo({ fechaActivacion: LUNES, duracion: 3, fechaEntregaReal: '2026-09-09' })
    expect(c).toEqual({ diasHabilesUsados: 3, desviacionDias: 0, indicadorCumplimiento: 100 })
  })

  it('adelanto: desviación negativa, indicador topado en 100', () => {
    const c = calcularCierreTramo({ fechaActivacion: LUNES, duracion: 3, fechaEntregaReal: '2026-09-08' })
    expect(c.diasHabilesUsados).toBe(2)
    expect(c.desviacionDias).toBe(-1)
    expect(c.indicadorCumplimiento).toBe(100)
  })

  it('retraso de 2 días en tramo de 3: indicador 33.33', () => {
    const c = calcularCierreTramo({ fechaActivacion: LUNES, duracion: 3, fechaEntregaReal: '2026-09-11' })
    expect(c.diasHabilesUsados).toBe(5) // lun..vie
    expect(c.desviacionDias).toBe(2)
    expect(c.indicadorCumplimiento).toBe(33.33)
  })

  it('cuenta correctamente con un festivo intermedio', () => {
    const festivos = new Set(['2026-09-09'])
    const c = calcularCierreTramo({
      fechaActivacion: LUNES,
      duracion: 3,
      fechaEntregaReal: '2026-09-11',
      festivos
    })
    expect(c.diasHabilesUsados).toBe(4) // lun, mar, (mié festivo), jue, vie
    expect(c.desviacionDias).toBe(1)
    expect(c.indicadorCumplimiento).toBe(66.67)
  })
})

describe('recalcularDesde (RN-16 / RF-29) y no penalización (RN-15)', () => {
  it('un retraso del tramo 1 desplaza las fechas de los tramos siguientes', () => {
    // T1 entregado tarde el viernes 2026-09-11 (debía ser miércoles 09-09).
    const nuevas = recalcularDesde({
      fechaEntregaRealTramoCerrado: '2026-09-11',
      tramosSiguientes: [
        { numero: 2, duracion: 3 },
        { numero: 3, duracion: 3 },
        { numero: 4, duracion: 1 }
      ]
    })
    expect(nuevas).toEqual([
      { numero: 2, fechaActivacion: '2026-09-14', fechaLimite: '2026-09-16' },
      { numero: 3, fechaActivacion: '2026-09-17', fechaLimite: '2026-09-21' },
      { numero: 4, fechaActivacion: '2026-09-22', fechaLimite: '2026-09-22' }
    ])
  })

  it('el profesional siguiente NO se penaliza por el retraso heredado', () => {
    // T2 se activa en su nueva fecha 09-14 y entrega en su nuevo límite 09-16.
    const c = calcularCierreTramo({
      fechaActivacion: '2026-09-14',
      duracion: 3,
      fechaEntregaReal: '2026-09-16'
    })
    expect(c.desviacionDias).toBe(0)
    expect(c.indicadorCumplimiento).toBe(100)
  })
})

describe('calcularDesviacionOferta (RN-08 / §11.1)', () => {
  it('a tiempo = 0', () => {
    expect(
      calcularDesviacionOferta({
        fechaFinalizacionReal: '2026-09-18',
        fechaEntregaComprometida: '2026-09-18'
      })
    ).toBe(0)
  })

  it('retraso en días hábiles (positivo)', () => {
    expect(
      calcularDesviacionOferta({
        fechaFinalizacionReal: '2026-09-22',
        fechaEntregaComprometida: '2026-09-18'
      })
    ).toBe(2) // vie 18 -> lun 21 -> mar 22
  })

  it('adelanto (negativo)', () => {
    expect(
      calcularDesviacionOferta({
        fechaFinalizacionReal: '2026-09-17',
        fechaEntregaComprometida: '2026-09-18'
      })
    ).toBe(-1)
  })
})
