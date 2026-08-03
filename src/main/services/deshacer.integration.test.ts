import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client.js'
import { crearConexion, type DB } from '../db/client.js'
import { aplicarEsquema } from '../db/ddl.js'
import { oferta, tarea, tramo, usuario } from '../db/schema.js'
import type { Rol } from '../../shared/dominio.js'
import type { SesionUsuario } from '../../shared/ipc.js'
import { aprobarOferta } from './aprobacion.js'
import { deshacerAprobacion, deshacerCompletarTarea } from './deshacer.js'
import { listarNotificaciones } from './notificaciones.js'
import { crearOferta } from './ofertas.js'
import { completarTarea } from './tareas.js'

let conexion: Conexion
let db: DB
let sesiones: Record<Rol, SesionUsuario>
let ofertaId: number
const SIN = new Set<string>()

async function tramoN(numero: number) {
  return (
    await db.select().from(tramo).where(and(eq(tramo.ofertaId, ofertaId), eq(tramo.numero, numero)))
  )[0]!
}

async function tareasDe(numero: number) {
  const tr = await tramoN(numero)
  return db.select().from(tarea).where(eq(tarea.tramoId, tr.id)).orderBy(asc(tarea.id))
}

async function entregarTramo(numero: number, fecha: string, responsable: number): Promise<void> {
  for (const ta of await tareasDe(numero)) {
    if (ta.estado !== 'completada') await completarTarea(db, ta.id, fecha, SIN, responsable)
  }
}

beforeEach(async () => {
  const conn = await crearConexion(':memory:')
  conexion = conn
  db = conn.db
  await aplicarEsquema(conexion.ejecutar)
  await db.insert(usuario).values([
    { nombre: 'Sofía', email: 'lc@x.co', rol: 'lider_comercial', passwordHash: 'x' },
    { nombre: 'Ana', email: 'lp@x.co', rol: 'lider_proyectos', passwordHash: 'x' },
    { nombre: 'Carlos', email: 'cc@x.co', rol: 'compras_contratacion', passwordHash: 'x' },
    { nombre: 'Diana', email: 'pc@x.co', rol: 'presupuestos_control', passwordHash: 'x' },
    { nombre: 'Eduardo', email: 'lu@x.co', rol: 'lider_unidad', passwordHash: 'x' }
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
    festivos: SIN
  })
})

afterEach(() => conexion.cerrar())

describe('deshacer completar tarea', () => {
  it('dentro del tramo: la visita deshecha reactiva su estado y la recolección vuelve a pendiente', async () => {
    await entregarTramo(1, '2026-09-07', sesiones.lider_comercial.id)
    const t2 = await tareasDe(2)
    await completarTarea(db, t2[0]!.id, '2026-09-08', SIN, sesiones.lider_proyectos.id)
    expect((await tareasDe(2)).map((x) => x.estado)).toEqual(['completada', 'en_curso'])

    await deshacerCompletarTarea(db, t2[0]!.id, sesiones.lider_proyectos)
    expect((await tareasDe(2)).map((x) => x.estado)).toEqual(['en_curso', 'pendiente'])
  })

  it('deshacer la entrega de un tramo lo reabre, limpia su medición y desactiva al siguiente', async () => {
    await entregarTramo(1, '2026-09-07', sesiones.lider_comercial.id)
    expect((await tramoN(1)).estado).toBe('completado')
    expect((await tramoN(2)).estado).toBe('en_curso')

    const t1 = await tareasDe(1)
    await deshacerCompletarTarea(db, t1[0]!.id, sesiones.lider_comercial)

    const tramo1 = await tramoN(1)
    expect(tramo1.estado).toBe('en_curso')
    expect(tramo1.fechaEntregaReal).toBeNull()
    expect(tramo1.indicadorCumplimiento).toBeNull()
    expect((await tramoN(2)).estado).toBe('pendiente')
    expect((await tareasDe(2))[0]!.estado).toBe('pendiente')

    // Ana fue notificada de que su tramo vuelve a quedar pendiente.
    const deAna = await listarNotificaciones(db, sesiones.lider_proyectos.id)
    expect(deAna.some((n) => n.mensaje.includes('Se reabrió el tramo anterior'))).toBe(true)
  })

  it('se BLOQUEA si el siguiente profesional ya completó trabajo', async () => {
    await entregarTramo(1, '2026-09-07', sesiones.lider_comercial.id)
    const t2 = await tareasDe(2)
    await completarTarea(db, t2[0]!.id, '2026-09-08', SIN, sesiones.lider_proyectos.id)

    const t1 = await tareasDe(1)
    await expect(
      deshacerCompletarTarea(db, t1[0]!.id, sesiones.lider_comercial)
    ).rejects.toThrow(/ya completó trabajo/)
  })

  it('deshacer el cierre del tramo 4 regresa la oferta de pendiente_aprobacion_final a en_curso', async () => {
    await entregarTramo(1, '2026-09-07', sesiones.lider_comercial.id)
    await entregarTramo(2, '2026-09-10', sesiones.lider_proyectos.id)
    await entregarTramo(3, '2026-09-15', sesiones.compras_contratacion.id)
    await entregarTramo(4, '2026-09-18', sesiones.presupuestos_control.id)
    expect((await db.select().from(oferta))[0]!.estado).toBe('pendiente_aprobacion_final')

    const t4 = await tareasDe(4)
    await deshacerCompletarTarea(db, t4[0]!.id, sesiones.presupuestos_control)
    expect((await db.select().from(oferta))[0]!.estado).toBe('en_curso')
    expect((await tramoN(5)).estado).toBe('pendiente')
  })

  it('solo el responsable deshace, en orden inverso, y nunca la aprobación por esta vía', async () => {
    await entregarTramo(1, '2026-09-07', sesiones.lider_comercial.id)
    const t1 = await tareasDe(1)
    await expect(
      deshacerCompletarTarea(db, t1[0]!.id, sesiones.lider_proyectos)
    ).rejects.toThrow(/responsable/)

    // Orden inverso dentro del tramo 2.
    const t2 = await tareasDe(2)
    await completarTarea(db, t2[0]!.id, '2026-09-08', SIN, sesiones.lider_proyectos.id)
    await completarTarea(db, t2[1]!.id, '2026-09-10', SIN, sesiones.lider_proyectos.id)
    // El tramo 2 quedó completado pero el tramo 3 no ha avanzado: puede deshacer
    // SOLO la última (recolección), no la visita.
    await expect(
      deshacerCompletarTarea(db, t2[0]!.id, sesiones.lider_proyectos)
    ).rejects.toThrow(/Primero deshaz la tarea posterior/)
  })
})

describe('deshacer aprobación', () => {
  beforeEach(async () => {
    await entregarTramo(1, '2026-09-07', sesiones.lider_comercial.id)
    await entregarTramo(2, '2026-09-10', sesiones.lider_proyectos.id)
    await entregarTramo(3, '2026-09-15', sesiones.compras_contratacion.id)
    await entregarTramo(4, '2026-09-18', sesiones.presupuestos_control.id)
    await aprobarOferta(db, ofertaId, '2026-09-21', SIN, sesiones.lider_unidad)
  })

  it('revierte la aprobación mientras el envío no se haya hecho', async () => {
    await deshacerAprobacion(db, ofertaId, sesiones.lider_unidad)

    const of = (await db.select().from(oferta))[0]!
    expect(of.estado).toBe('pendiente_aprobacion_final')
    expect(of.fechaAprobUnidad).toBeNull()
    expect(of.aprobadoPor).toBeNull()

    const t5 = await tramoN(5)
    expect(t5.estado).toBe('en_curso')
    expect(t5.indicadorCumplimiento).toBeNull()
    expect((await tramoN(6)).estado).toBe('pendiente')

    // El comercial fue avisado de que el envío queda sin efecto.
    const deSofia = await listarNotificaciones(db, sesiones.lider_comercial.id)
    expect(deSofia.some((n) => n.mensaje.includes('Se deshizo la aprobación'))).toBe(true)
  })

  it('se bloquea si la oferta ya fue enviada al cliente, y solo el líder puede', async () => {
    await expect(deshacerAprobacion(db, ofertaId, sesiones.lider_comercial)).rejects.toThrow(
      /líder de la unidad/
    )
    await entregarTramo(6, '2026-09-22', sesiones.lider_comercial.id)
    await expect(deshacerAprobacion(db, ofertaId, sesiones.lider_unidad)).rejects.toThrow(/ENVIADA/)
  })
})
