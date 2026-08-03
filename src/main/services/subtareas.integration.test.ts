import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client'
import { crearConexion, type DB } from '../db/client'
import { aplicarEsquema } from '../db/ddl'
import { subtarea, tarea, tramo, usuario } from '../db/schema'
import { NUMERO_TRAMO_APROBACION, type Rol } from '../../shared/dominio'
import type { SesionUsuario } from '../../shared/ipc'
import { obtenerMisTramos } from './consultas'
import { crearOferta } from './ofertas'
import { crearSubtarea, eliminarSubtarea, marcarSubtarea } from './subtareas'

let conexion: Conexion
let db: DB
let sesiones: Record<Rol, SesionUsuario>
let tareaSocializacion: number // tarea del tramo 1 (Sofía, en curso)
let tareaAprobacion: number // tarea del tramo 5 (aprobación)
const SIN = new Set<string>()

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
    { nombre: 'Eduardo', email: 'lu@x.co', rol: 'lider_unidad', passwordHash: 'x' },
    { nombre: 'Otro Líder', email: 'lu2@x.co', rol: 'lider_unidad', passwordHash: 'x' }
  ])
  const us = await db.select().from(usuario)
  sesiones = Object.fromEntries(
    us
      .filter((u) => u.email !== 'lu2@x.co')
      .map((u) => [u.rol, { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol as Rol }])
  ) as Record<Rol, SesionUsuario>
  const otroLider = us.find((u) => u.email === 'lu2@x.co')!
  sesionesExtra.otroLider = {
    id: otroLider.id,
    nombre: otroLider.nombre,
    email: otroLider.email,
    rol: otroLider.rol as Rol
  }

  const ofertaId = await crearOferta(db, {
    cliente: 'Cliente X',
    tamano: 'pequena',
    fechaInicio: '2026-09-07',
    responsables: Object.fromEntries(
      us.filter((u) => u.email !== 'lu2@x.co').map((u) => [u.rol, u.id])
    ) as Record<Rol, number>,
    creadoPor: sesiones.lider_comercial.id,
    festivos: SIN
  })
  const tramos = await db
    .select()
    .from(tramo)
    .where(eq(tramo.ofertaId, ofertaId))
    .orderBy(asc(tramo.numero))
  tareaSocializacion = (await db.select().from(tarea).where(eq(tarea.tramoId, tramos[0]!.id)))[0]!.id
  tareaAprobacion = (
    await db
      .select()
      .from(tarea)
      .where(eq(tarea.tramoId, tramos[NUMERO_TRAMO_APROBACION - 1]!.id))
  )[0]!.id
})

const sesionesExtra: { otroLider?: SesionUsuario } = {}

afterEach(() => conexion.cerrar())

describe('subtareas (checklist personal dentro de cada tarea)', () => {
  it('el responsable crea subtareas, las marca cumplidas y las elimina', async () => {
    await crearSubtarea(db, tareaSocializacion, 'Calcular cantidades', sesiones.lider_comercial)
    await crearSubtarea(db, tareaSocializacion, 'Resumir pliego de condiciones', sesiones.lider_comercial)

    let lista = await db.select().from(subtarea).orderBy(asc(subtarea.id))
    expect(lista.map((s) => [s.descripcion, s.completada])).toEqual([
      ['Calcular cantidades', false],
      ['Resumir pliego de condiciones', false]
    ])

    await marcarSubtarea(db, lista[0]!.id, true, sesiones.lider_comercial)
    lista = await db.select().from(subtarea).orderBy(asc(subtarea.id))
    expect(lista[0]!.completada).toBe(true)
    await marcarSubtarea(db, lista[0]!.id, false, sesiones.lider_comercial)
    expect((await db.select().from(subtarea).orderBy(asc(subtarea.id)))[0]!.completada).toBe(false)

    await eliminarSubtarea(db, lista[1]!.id, sesiones.lider_comercial)
    expect(await db.select().from(subtarea)).toHaveLength(1)
  })

  it('el líder de la unidad gestiona subtareas en su tarea de APROBACIÓN (cualquier líder)', async () => {
    // El líder asignado al tramo:
    await crearSubtarea(db, tareaAprobacion, 'Verificar precios unitarios', sesiones.lider_unidad)
    // Y también otro usuario con rol líder de la unidad (quien revise las usa):
    await crearSubtarea(db, tareaAprobacion, 'Revisar condiciones comerciales', sesionesExtra.otroLider!)

    const lista = await db.select().from(subtarea).orderBy(asc(subtarea.id))
    expect(lista).toHaveLength(2)
    await marcarSubtarea(db, lista[0]!.id, true, sesionesExtra.otroLider!)
    await eliminarSubtarea(db, lista[1]!.id, sesiones.lider_unidad)
    expect(await db.select().from(subtarea)).toHaveLength(1)

    // Pero un profesional NO puede tocar la tarea de aprobación.
    await expect(
      crearSubtarea(db, tareaAprobacion, 'X', sesiones.lider_proyectos)
    ).rejects.toThrow(/responsable/)
  })

  it('las subtareas llegan dentro de las tareas pendientes del profesional', async () => {
    await crearSubtarea(db, tareaSocializacion, 'Agendar reunión con el equipo', sesiones.lider_comercial)
    const tramos = await obtenerMisTramos(db, sesiones.lider_comercial, '2026-09-07', SIN)
    const tareaConSub = tramos[0]!.tareas[0]!
    expect(tareaConSub.subtareas).toHaveLength(1)
    expect(tareaConSub.subtareas[0]!.descripcion).toBe('Agendar reunión con el equipo')
  })

  it('solo el responsable del tramo gestiona sus subtareas', async () => {
    await expect(
      crearSubtarea(db, tareaSocializacion, 'X', sesiones.lider_proyectos)
    ).rejects.toThrow(/responsable/)

    await crearSubtarea(db, tareaSocializacion, 'Mía', sesiones.lider_comercial)
    const s = (await db.select().from(subtarea))[0]!
    await expect(marcarSubtarea(db, s.id, true, sesiones.compras_contratacion)).rejects.toThrow(/responsable/)
    await expect(eliminarSubtarea(db, s.id, sesiones.compras_contratacion)).rejects.toThrow(/responsable/)
  })

  it('valida descripción vacía y tarea ya completada', async () => {
    await expect(
      crearSubtarea(db, tareaSocializacion, '   ', sesiones.lider_comercial)
    ).rejects.toThrow(/descripción/)
    await db.update(tarea).set({ estado: 'completada' }).where(eq(tarea.id, tareaSocializacion))
    await expect(
      crearSubtarea(db, tareaSocializacion, 'Tarde', sesiones.lider_comercial)
    ).rejects.toThrow(/ya completada/)
  })
})
