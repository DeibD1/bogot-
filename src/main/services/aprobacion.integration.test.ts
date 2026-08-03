import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client.js'
import { crearConexion, type DB } from '../db/client.js'
import { aplicarEsquema } from '../db/ddl.js'
import { oferta, tarea, tramo, usuario } from '../db/schema.js'
import type { Rol } from '../../shared/dominio.js'
import type { SesionUsuario } from '../../shared/ipc.js'
import {
  aprobarOferta,
  entregarCorreccion,
  listarCorrecciones,
  listarPendientesAprobacion,
  rechazarOferta
} from './aprobacion.js'
import { crearOferta } from './ofertas.js'
import { completarTarea } from './tareas.js'

let conexion: Conexion
let db: DB
let sesiones: Record<Rol, SesionUsuario>
let ofertaId: number
const SIN_FESTIVOS = new Set<string>()

async function tramoN(numero: number) {
  return (
    await db.select().from(tramo).where(and(eq(tramo.ofertaId, ofertaId), eq(tramo.numero, numero)))
  )[0]!
}

async function completarTramoEn(numero: number, fechas: string[], responsable: number): Promise<void> {
  const tr = await tramoN(numero)
  const tareas = await db.select().from(tarea).where(eq(tarea.tramoId, tr.id)).orderBy(asc(tarea.id))
  for (const [i, ta] of tareas.entries()) {
    await completarTarea(db, ta.id, fechas[i] ?? fechas[fechas.length - 1]!, SIN_FESTIVOS, responsable)
  }
}

/** Lleva la oferta grande (inicio 2026-09-07) hasta pendiente de aprobación, todo a tiempo. */
async function avanzarHastaAprobacion(): Promise<void> {
  await completarTramoEn(1, ['2026-09-07'], sesiones.lider_comercial.id) // socialización
  await completarTramoEn(2, ['2026-09-08', '2026-09-10'], sesiones.lider_proyectos.id)
  await completarTramoEn(3, ['2026-09-15'], sesiones.compras_contratacion.id)
  await completarTramoEn(4, ['2026-09-18'], sesiones.presupuestos_control.id)
  // Tramo 5 (aprobación) queda activo: activación y límite 2026-09-21.
}

beforeEach(async () => {
  const conn = await crearConexion(':memory:')
  conexion = conn
  db = conn.db
  await aplicarEsquema(conexion.ejecutar)
  await db.insert(usuario).values([
    { nombre: 'COM', email: 'lc@x.co', rol: 'lider_comercial', passwordHash: 'x' },
    { nombre: 'LP', email: 'lp@x.co', rol: 'lider_proyectos', passwordHash: 'x' },
    { nombre: 'CC', email: 'cc@x.co', rol: 'compras_contratacion', passwordHash: 'x' },
    { nombre: 'PC', email: 'pc@x.co', rol: 'presupuestos_control', passwordHash: 'x' },
    { nombre: 'LU', email: 'lu@x.co', rol: 'lider_unidad', passwordHash: 'x' }
  ])
  const us = await db.select().from(usuario)
  sesiones = Object.fromEntries(
    us.map((u) => [u.rol, { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol as Rol }])
  ) as Record<Rol, SesionUsuario>

  ofertaId = await crearOferta(db, {
    cliente: 'Cliente X',
    tamano: 'grande',
    fechaInicio: '2026-09-07',
    responsables: Object.fromEntries(us.map((u) => [u.rol, u.id])) as Record<Rol, number>,
    creadoPor: sesiones.lider_comercial.id,
    festivos: SIN_FESTIVOS
  })
  await avanzarHastaAprobacion()
})

afterEach(() => conexion.cerrar())

describe('bandeja y aprobación (RF-21..23)', () => {
  it('la oferta aparece en la bandeja con su plazo de 1 día', async () => {
    const pendientes = await listarPendientesAprobacion(db, '2026-09-21', SIN_FESTIVOS)
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0]!.fechaActivacionRevision).toBe('2026-09-21')
    expect(pendientes[0]!.fechaLimiteRevision).toBe('2026-09-21')
    expect(pendientes[0]!.criticidad).toBe('amarillo') // vence hoy
  })

  it('aprobar activa el envío; al enviarse al cliente, la oferta queda medida al 100', async () => {
    await aprobarOferta(db, ofertaId, '2026-09-21', SIN_FESTIVOS, sesiones.lider_unidad)

    let of = (await db.select().from(oferta).where(eq(oferta.id, ofertaId)))[0]!
    expect(of.estado).toBe('aprobada')
    expect(of.fechaAprobUnidad).toBe('2026-09-21')
    expect(of.aprobadoPor).toBe(sesiones.lider_unidad.id)
    // Aún sin medir: falta el envío al cliente.
    expect(of.fechaFinalizacionReal).toBeNull()
    expect(of.indicadorCumplimiento).toBeNull()

    const t5 = await tramoN(5)
    expect(t5.estado).toBe('completado')
    expect(t5.desviacionDias).toBe(0)
    expect(Number(t5.indicadorCumplimiento)).toBe(100)

    // El tramo de ENVÍO quedó activo para el líder comercial.
    const t6 = await tramoN(6)
    expect(t6.estado).toBe('en_curso')
    expect(t6.fechaActivacion).toBe('2026-09-22')
    expect(t6.fechaLimite).toBe('2026-09-22')

    // Sofía envía la oferta al cliente en su límite.
    await completarTramoEn(6, ['2026-09-22'], sesiones.lider_comercial.id)
    of = (await db.select().from(oferta).where(eq(oferta.id, ofertaId)))[0]!
    expect(of.fechaFinalizacionReal).toBe('2026-09-22')
    expect(of.desviacionDias).toBe(0) // comprometida 2026-09-22
    expect(Number(of.indicadorCumplimiento)).toBe(100)
  })

  it('aprobar tarde penaliza al líder (tramo 5) y a la oferta (§11.2: 77.78%)', async () => {
    // Aprueba el miércoles 09-23: usó lun(21), mar(22), mié(23) = 3 días hábiles (asignado: 1).
    await aprobarOferta(db, ofertaId, '2026-09-23', SIN_FESTIVOS, sesiones.lider_unidad)

    const t5 = await tramoN(5)
    expect(t5.diasHabilesUsados).toBe(3)
    expect(t5.desviacionDias).toBe(2)
    expect(Number(t5.indicadorCumplimiento)).toBe(0) // máx(0, (1 − 2/1) × 100)

    // Envío reprogramado al 09-24; Sofía cumple su nuevo límite.
    const t6 = await tramoN(6)
    expect([t6.fechaActivacion, t6.fechaLimite, t6.estado]).toEqual(['2026-09-24', '2026-09-24', 'en_curso'])
    await completarTramoEn(6, ['2026-09-24'], sesiones.lider_comercial.id)

    const of = (await db.select().from(oferta).where(eq(oferta.id, ofertaId)))[0]!
    expect(of.desviacionDias).toBe(2) // comprometida 09-22 -> real 09-24
    expect(Number(of.indicadorCumplimiento)).toBe(77.78) // (1 − 2/9) × 100
  })

  it('solo el líder de la unidad puede aprobar', async () => {
    await expect(
      aprobarOferta(db, ofertaId, '2026-09-21', SIN_FESTIVOS, sesiones.lider_proyectos)
    ).rejects.toThrow(/líder de la unidad/)
  })
})

describe('rechazo con varios motivos y corrección coordinada (RN-19)', () => {
  it('flujo completo: rechazo a DOS tramos → entregas → re-aprobación → envío', async () => {
    // Desviaciones originales (a tiempo = 0) que deben quedar congeladas.
    expect((await tramoN(3)).desviacionDias).toBe(0)
    expect((await tramoN(4)).desviacionDias).toBe(0)

    // 1) El líder rechaza el lunes 09-21 con DOS motivos: cotización (T3) y APUs (T4).
    await rechazarOferta(
      db,
      ofertaId,
      [
        { numeroTramo: 3, motivo: 'Cotización incompleta' },
        { numeroTramo: 4, motivo: 'Revisar APU de acabados' }
      ],
      '2026-09-21',
      sesiones.lider_unidad
    )
    let of = (await db.select().from(oferta).where(eq(oferta.id, ofertaId)))[0]!
    expect(of.estado).toBe('rechazada')
    expect(of.motivoRechazo).toContain('T3: Cotización incompleta')
    expect(of.motivoRechazo).toContain('T4: Revisar APU')

    // Cada implicado ve SU corrección; un ajeno no; el líder ve todo.
    const deCarlos = await listarCorrecciones(db, sesiones.compras_contratacion.id)
    expect(deCarlos).toHaveLength(1)
    expect(deCarlos[0]!.motivos).toEqual([
      expect.objectContaining({ numeroTramo: 3, motivo: 'Cotización incompleta', entregada: false })
    ])
    expect(await listarCorrecciones(db, sesiones.presupuestos_control.id)).toHaveLength(1)
    expect(await listarCorrecciones(db, sesiones.lider_proyectos.id)).toHaveLength(0)
    expect((await listarCorrecciones(db, null))[0]!.motivos).toHaveLength(2)

    // 2) Carlos entrega primero (09-22): la oferta SIGUE en corrección (falta Diana).
    await entregarCorreccion(db, ofertaId, '2026-09-22', SIN_FESTIVOS, sesiones.compras_contratacion)
    of = (await db.select().from(oferta).where(eq(oferta.id, ofertaId)))[0]!
    expect(of.estado).toBe('rechazada')
    expect(await listarCorrecciones(db, sesiones.compras_contratacion.id)).toHaveLength(0)

    // 3) Diana entrega la última (09-23): cierre del ciclo de corrección.
    await entregarCorreccion(db, ofertaId, '2026-09-23', SIN_FESTIVOS, sesiones.presupuestos_control)
    of = (await db.select().from(oferta).where(eq(oferta.id, ofertaId)))[0]!
    expect(of.estado).toBe('pendiente_aprobacion_final')
    expect(of.diasCorreccion).toBe(2) // del rechazo (09-21) a la ÚLTIMA entrega (09-23)

    // Las calificaciones NO cambiaron (RN-19).
    expect((await tramoN(3)).desviacionDias).toBe(0)
    expect((await tramoN(4)).desviacionDias).toBe(0)

    // El tramo de aprobación se reactivó: jueves 09-24.
    const t5 = await tramoN(5)
    expect([t5.estado, t5.fechaActivacion, t5.fechaLimite]).toEqual(['en_curso', '2026-09-24', '2026-09-24'])

    // 4) Aprueba el 09-24 y Sofía envía el 09-25.
    await aprobarOferta(db, ofertaId, '2026-09-24', SIN_FESTIVOS, sesiones.lider_unidad)
    await completarTramoEn(6, ['2026-09-25'], sesiones.lider_comercial.id)

    of = (await db.select().from(oferta).where(eq(oferta.id, ofertaId)))[0]!
    expect(of.estado).toBe('aprobada')
    expect(of.diasCorreccion).toBe(2)
    expect(of.desviacionDias).toBe(3) // comprometida 09-22 -> enviada 09-25
    expect(Number(of.indicadorCumplimiento)).toBe(66.67)
  })

  it('rechazar exige al menos un motivo y tramos válidos (1 a 4)', async () => {
    await expect(
      rechazarOferta(db, ofertaId, [{ numeroTramo: 3, motivo: '   ' }], '2026-09-21', sesiones.lider_unidad)
    ).rejects.toThrow(/al menos un motivo/)
    await expect(
      rechazarOferta(db, ofertaId, [{ numeroTramo: 5, motivo: 'X' }], '2026-09-21', sesiones.lider_unidad)
    ).rejects.toThrow(/entre 1 y 4/)
  })

  it('quien no tiene motivos pendientes no puede entregar', async () => {
    await rechazarOferta(
      db,
      ofertaId,
      [{ numeroTramo: 4, motivo: 'Ajustar APUs' }],
      '2026-09-21',
      sesiones.lider_unidad
    )
    await expect(
      entregarCorreccion(db, ofertaId, '2026-09-22', SIN_FESTIVOS, sesiones.compras_contratacion)
    ).rejects.toThrow(/No tienes correcciones pendientes/)
  })
})
