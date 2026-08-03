import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client.js'
import { crearConexion, type DB } from '../db/client.js'
import { aplicarEsquema } from '../db/ddl.js'
import { reasignacion, tramo, usuario } from '../db/schema.js'
import type { Rol } from '../../shared/dominio.js'
import type { SesionUsuario } from '../../shared/ipc.js'
import { listarNotificaciones } from './notificaciones.js'
import { crearOferta } from './ofertas.js'
import { reasignarTramo } from './reasignacion.js'

let conexion: Conexion
let db: DB
let ids: Record<string, number>
let lider: SesionUsuario
let ofertaId: number
const SIN = new Set<string>()

async function tramoN(numero: number) {
  return (
    await db.select().from(tramo).where(and(eq(tramo.ofertaId, ofertaId), eq(tramo.numero, numero)))
  )[0]!
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
    { nombre: 'Gloria', email: 'cc2@x.co', rol: 'compras_contratacion', passwordHash: 'x' },
    { nombre: 'Inactiva', email: 'cc3@x.co', rol: 'compras_contratacion', passwordHash: 'x', activo: false },
    { nombre: 'Diana', email: 'pc@x.co', rol: 'presupuestos_control', passwordHash: 'x' },
    { nombre: 'Eduardo', email: 'lu@x.co', rol: 'lider_unidad', passwordHash: 'x' }
  ])
  const us = await db.select().from(usuario)
  ids = Object.fromEntries(us.map((u) => [u.email, u.id]))
  const e = us.find((u) => u.rol === 'lider_unidad')!
  lider = { id: e.id, nombre: e.nombre, email: e.email, rol: e.rol }

  const porRol: Record<Rol, number> = {
    lider_comercial: ids['lc@x.co']!,
    lider_proyectos: ids['lp@x.co']!,
    compras_contratacion: ids['cc@x.co']!,
    presupuestos_control: ids['pc@x.co']!,
    lider_unidad: ids['lu@x.co']!
  }
  ofertaId = await crearOferta(db, {
    cliente: 'Cliente X',
    tamano: 'grande',
    fechaInicio: '2026-09-07',
    responsables: porRol,
    creadoPor: porRol.lider_comercial,
    festivos: SIN
  })
})

afterEach(() => conexion.cerrar())

describe('reasignación forzosa (RN-18 / RF-30)', () => {
  it('reasigna el tramo a otro profesional del mismo rol, con bitácora y notificación', async () => {
    const t2 = await tramoN(3) // Carlos (compras)
    await reasignarTramo(
      db,
      { tramoId: t2.id, nuevoResponsableId: ids['cc2@x.co']!, motivo: 'Vacaciones del titular' },
      lider
    )

    const t2Despues = await tramoN(3)
    expect(t2Despues.responsableId).toBe(ids['cc2@x.co'])
    expect(t2Despues.reasignadoDe).toBe(ids['cc@x.co']) // titular original trazado

    const bitacora = await db
      .select()
      .from(reasignacion)
      .where(eq(reasignacion.tramoId, t2.id))
      .orderBy(asc(reasignacion.id))
    expect(bitacora).toHaveLength(1)
    expect(bitacora[0]!.deUsuarioId).toBe(ids['cc@x.co'])
    expect(bitacora[0]!.aUsuarioId).toBe(ids['cc2@x.co'])
    expect(bitacora[0]!.motivo).toBe('Vacaciones del titular')

    // Gloria recibió el compromiso.
    const deGloria = await listarNotificaciones(db, ids['cc2@x.co']!)
    expect(deGloria.some((n) => n.mensaje.includes('reasignó el tramo 3'))).toBe(true)
  })

  it('rechaza reasignar a un rol distinto, a un inactivo o al mismo titular', async () => {
    const t2 = await tramoN(3)
    await expect(
      reasignarTramo(db, { tramoId: t2.id, nuevoResponsableId: ids['pc@x.co']!, motivo: 'X' }, lider)
    ).rejects.toThrow(/MISMO rol/)
    await expect(
      reasignarTramo(db, { tramoId: t2.id, nuevoResponsableId: ids['cc3@x.co']!, motivo: 'X' }, lider)
    ).rejects.toThrow(/inactivo/)
    await expect(
      reasignarTramo(db, { tramoId: t2.id, nuevoResponsableId: ids['cc@x.co']!, motivo: 'X' }, lider)
    ).rejects.toThrow(/distinto/)
  })

  it('solo el líder reasigna, con motivo, y nunca un tramo completado', async () => {
    const t2 = await tramoN(3)
    const ana: SesionUsuario = { id: ids['lp@x.co']!, nombre: 'Ana', email: 'lp@x.co', rol: 'lider_proyectos' }
    await expect(
      reasignarTramo(db, { tramoId: t2.id, nuevoResponsableId: ids['cc2@x.co']!, motivo: 'X' }, ana)
    ).rejects.toThrow(/líder de la unidad/)
    await expect(
      reasignarTramo(db, { tramoId: t2.id, nuevoResponsableId: ids['cc2@x.co']!, motivo: '  ' }, lider)
    ).rejects.toThrow(/motivo/)

    await db.update(tramo).set({ estado: 'completado' }).where(eq(tramo.id, t2.id))
    await expect(
      reasignarTramo(db, { tramoId: t2.id, nuevoResponsableId: ids['cc2@x.co']!, motivo: 'X' }, lider)
    ).rejects.toThrow(/completado/)
  })
})
