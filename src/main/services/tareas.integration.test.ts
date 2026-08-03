import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client.js'
import { crearConexion, type DB } from '../db/client.js'
import { aplicarEsquema } from '../db/ddl.js'
import { oferta, tarea, tramo, usuario } from '../db/schema.js'
import type { Rol } from '../../shared/dominio.js'
import { crearOferta } from './ofertas.js'
import { completarTarea } from './tareas.js'

let conexion: Conexion
let db: DB
let idPorRol: Record<Rol, number>
let ofertaId: number
const SIN_FESTIVOS = new Set<string>()

async function tareasDeTramo(numero: number) {
  const tr = (
    await db.select().from(tramo).where(eq(tramo.ofertaId, ofertaId)).orderBy(asc(tramo.numero))
  )[numero - 1]!
  return {
    tramo: tr,
    tareas: await db.select().from(tarea).where(eq(tarea.tramoId, tr.id)).orderBy(asc(tarea.id))
  }
}

/** Entrega la socialización (tramo 1) para activar el tramo técnico de Ana. */
async function entregarSocializacion(fecha = '2026-09-07'): Promise<void> {
  const t1 = await tareasDeTramo(1)
  await completarTarea(db, t1.tareas[0]!.id, fecha, SIN_FESTIVOS, idPorRol.lider_comercial)
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
  idPorRol = Object.fromEntries(us.map((u) => [u.rol, u.id])) as Record<Rol, number>
  ofertaId = await crearOferta(db, {
    cliente: 'Cliente X',
    tamano: 'grande',
    fechaInicio: '2026-09-07',
    responsables: idPorRol,
    creadoPor: idPorRol.lider_comercial,
    festivos: SIN_FESTIVOS
  })
})

afterEach(() => conexion.cerrar())

describe('completarTarea (RF-06, RN-06)', () => {
  it('la socialización cierra el tramo 1 y activa el tramo técnico de proyectos', async () => {
    await entregarSocializacion()
    const t1 = await tareasDeTramo(1)
    const t2 = await tareasDeTramo(2)
    expect(t1.tramo.estado).toBe('completado')
    expect(t2.tramo.estado).toBe('en_curso')
    expect(t2.tareas[0]!.estado).toBe('en_curso') // visita activada
  })

  it('completar la visita activa la recolección del mismo tramo (sin cerrar el tramo)', async () => {
    await entregarSocializacion()
    const { tareas } = await tareasDeTramo(2)
    const r = await completarTarea(db, tareas[0]!.id, '2026-09-08', SIN_FESTIVOS, idPorRol.lider_proyectos)
    expect(r.tramoCerrado).toBe(false)

    const despues = await tareasDeTramo(2)
    expect(despues.tareas.map((t) => t.estado)).toEqual(['completada', 'en_curso'])
    expect(despues.tramo.estado).toBe('en_curso')
  })

  it('completar la última tarea cierra el tramo y activa el siguiente (hand-off)', async () => {
    await entregarSocializacion()
    const { tareas } = await tareasDeTramo(2)
    await completarTarea(db, tareas[0]!.id, '2026-09-08', SIN_FESTIVOS, idPorRol.lider_proyectos)
    const r = await completarTarea(db, tareas[1]!.id, '2026-09-10', SIN_FESTIVOS, idPorRol.lider_proyectos)

    expect(r.tramoCerrado).toBe(true)
    expect(r.desviacionDias).toBe(0) // entregó en su límite
    expect(r.indicadorCumplimiento).toBe(100)

    const t2 = await tareasDeTramo(2)
    const t3 = await tareasDeTramo(3)
    expect(t2.tramo.estado).toBe('completado')
    expect(t3.tramo.estado).toBe('en_curso')
    expect(t3.tareas[0]!.estado).toBe('en_curso') // cotización activada
  })

  it('no permite completar una tarea pendiente (debe respetarse el orden, RN-06)', async () => {
    const { tareas } = await tareasDeTramo(2)
    await expect(
      completarTarea(db, tareas[1]!.id, '2026-09-08', SIN_FESTIVOS, idPorRol.lider_proyectos)
    ).rejects.toThrow(/no está activa/)
  })

  it('solo el responsable del tramo puede completar', async () => {
    const { tareas } = await tareasDeTramo(1)
    await expect(
      completarTarea(db, tareas[0]!.id, '2026-09-07', SIN_FESTIVOS, idPorRol.lider_proyectos)
    ).rejects.toThrow(/responsable/)
  })

  it('la aprobación final no se completa por esta vía', async () => {
    const { tareas } = await tareasDeTramo(5)
    await expect(
      completarTarea(db, tareas[0]!.id, '2026-09-21', SIN_FESTIVOS, idPorRol.lider_unidad)
    ).rejects.toThrow(/bandeja del líder/)
  })

  it('al cerrarse el tramo 4 (APUs), la oferta pasa a pendiente_aprobacion_final (RF-21)', async () => {
    await entregarSocializacion()
    const t2 = await tareasDeTramo(2)
    await completarTarea(db, t2.tareas[0]!.id, '2026-09-08', SIN_FESTIVOS, idPorRol.lider_proyectos)
    await completarTarea(db, t2.tareas[1]!.id, '2026-09-10', SIN_FESTIVOS, idPorRol.lider_proyectos)

    const t3 = await tareasDeTramo(3)
    await completarTarea(db, t3.tareas[0]!.id, '2026-09-15', SIN_FESTIVOS, idPorRol.compras_contratacion)

    const t4 = await tareasDeTramo(4)
    const r = await completarTarea(db, t4.tareas[0]!.id, '2026-09-18', SIN_FESTIVOS, idPorRol.presupuestos_control)
    expect(r.tramoCerrado).toBe(true)

    const of = (await db.select().from(oferta).where(eq(oferta.id, ofertaId)))[0]!
    expect(of.estado).toBe('pendiente_aprobacion_final')

    const t5 = await tareasDeTramo(5)
    expect(t5.tramo.estado).toBe('en_curso')
    expect(t5.tramo.fechaActivacion).toBe('2026-09-21')
  })
})
