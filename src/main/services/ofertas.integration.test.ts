import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client.js'
import { crearConexion, type DB } from '../db/client.js'
import { aplicarEsquema } from '../db/ddl.js'
import { oferta, tramo, usuario } from '../db/schema.js'
import type { Rol } from '../../shared/dominio.js'
import { cerrarTramo, crearOferta } from './ofertas.js'

// Integración real contra PGlite (PostgreSQL embebido) en memoria.
let conexion: Conexion
let db: DB
let idPorRol: Record<Rol, number>
const SIN_FESTIVOS = new Set<string>()

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
})

afterEach(() => {
  return conexion.cerrar()
})

describe('crearOferta (RF-01/02/03, flujo de 6 tramos)', () => {
  it('genera los 6 tramos con sus tareas y fechas en días hábiles', async () => {
    const id = await crearOferta(db, {
      cliente: 'Cliente X',
      tamano: 'grande',
      fechaInicio: '2026-09-07',
      responsables: idPorRol,
      creadoPor: idPorRol.lider_comercial,
      festivos: SIN_FESTIVOS
    })

    const tramos = await db.select().from(tramo).where(eq(tramo.ofertaId, id)).orderBy(asc(tramo.numero))
    expect(tramos.map((t) => [t.numero, t.fechaActivacion, t.fechaLimite, t.estado])).toEqual([
      [1, '2026-09-07', '2026-09-07', 'en_curso'], // socialización
      [2, '2026-09-08', '2026-09-10', 'pendiente'],
      [3, '2026-09-11', '2026-09-15', 'pendiente'],
      [4, '2026-09-16', '2026-09-18', 'pendiente'],
      [5, '2026-09-21', '2026-09-21', 'pendiente'], // aprobación
      [6, '2026-09-22', '2026-09-22', 'pendiente'] // envío al cliente
    ])

    const of = (await db.select().from(oferta).where(eq(oferta.id, id)))[0]!
    expect(of.fechaEntregaComprometida).toBe('2026-09-22')
    expect(of.plazoTotalDias).toBe(9)
    expect(tramos[0]!.responsableId).toBe(idPorRol.lider_comercial)
    expect(tramos[4]!.responsableId).toBe(idPorRol.lider_unidad)
    expect(tramos[5]!.responsableId).toBe(idPorRol.lider_comercial)
  })
})

describe('cerrarTramo: cascada (RN-16) y no penalización (RN-15)', () => {
  it('un retraso del tramo técnico reprograma los siguientes sin penalizar al próximo', async () => {
    const id = await crearOferta(db, {
      cliente: 'Cliente Y',
      tamano: 'grande',
      fechaInicio: '2026-09-07',
      responsables: idPorRol,
      creadoPor: idPorRol.lider_comercial,
      festivos: SIN_FESTIVOS
    })
    const tramos = await db.select().from(tramo).where(eq(tramo.ofertaId, id)).orderBy(asc(tramo.numero))

    // Socialización entregada a tiempo (lunes 09-07).
    await cerrarTramo(db, tramos[0]!.id, '2026-09-07', SIN_FESTIVOS)

    // Tramo 2 (Ana) entregado TARDE: lunes 09-14 en vez de jueves 09-10.
    const cierre2 = await cerrarTramo(db, tramos[1]!.id, '2026-09-14', SIN_FESTIVOS)
    expect(cierre2.desviacionDias).toBe(2) // usó 5 días hábiles de 3
    expect(cierre2.indicadorCumplimiento).toBe(33.33)

    const tras = await db.select().from(tramo).where(eq(tramo.ofertaId, id)).orderBy(asc(tramo.numero))
    expect(tras[1]!.estado).toBe('completado')
    // Tramo 3 reprogramado y activado.
    expect([tras[2]!.fechaActivacion, tras[2]!.fechaLimite, tras[2]!.estado]).toEqual([
      '2026-09-15',
      '2026-09-17',
      'en_curso'
    ])
    // Tramos 4, 5 y 6 reprogramados, aún pendientes.
    expect([tras[3]!.fechaActivacion, tras[3]!.fechaLimite]).toEqual(['2026-09-18', '2026-09-22'])
    expect([tras[4]!.fechaActivacion, tras[4]!.fechaLimite]).toEqual(['2026-09-23', '2026-09-23'])
    expect([tras[5]!.fechaActivacion, tras[5]!.fechaLimite]).toEqual(['2026-09-24', '2026-09-24'])

    // La fecha COMPROMETIDA con el cliente no se mueve.
    const of = (await db.select().from(oferta).where(eq(oferta.id, id)))[0]!
    expect(of.fechaEntregaComprometida).toBe('2026-09-22')

    // El tramo 3 entrega en su nuevo límite -> no penalizado por el retraso heredado.
    const cierre3 = await cerrarTramo(db, tras[2]!.id, '2026-09-17', SIN_FESTIVOS)
    expect(cierre3.desviacionDias).toBe(0)
    expect(cierre3.indicadorCumplimiento).toBe(100)
  })

  it('respeta la duración de socialización elegida por el comercial y valida el rango', async () => {
    const id = await crearOferta(db, {
      cliente: 'Cliente S',
      tamano: 'pequena',
      fechaInicio: '2026-09-07',
      duracionSocializacion: 2,
      responsables: idPorRol,
      creadoPor: idPorRol.lider_comercial,
      festivos: SIN_FESTIVOS
    })
    const tramos = await db.select().from(tramo).where(eq(tramo.ofertaId, id)).orderBy(asc(tramo.numero))
    expect(tramos[0]!.duracionAsignadaDias).toBe(2)
    expect(tramos[0]!.fechaLimite).toBe('2026-09-08')
    expect(tramos[1]!.fechaActivacion).toBe('2026-09-09')

    await expect(
      crearOferta(db, {
        cliente: 'Cliente T',
        tamano: 'pequena',
        fechaInicio: '2026-09-07',
        duracionSocializacion: 0,
        responsables: idPorRol,
        creadoPor: idPorRol.lider_comercial,
        festivos: SIN_FESTIVOS
      })
    ).rejects.toThrow(/1 a 10 días/)
  })

  it('rechaza cerrar un tramo que no está activo', async () => {
    const id = await crearOferta(db, {
      cliente: 'Cliente Z',
      tamano: 'pequena',
      fechaInicio: '2026-09-07',
      responsables: idPorRol,
      creadoPor: idPorRol.lider_comercial,
      festivos: SIN_FESTIVOS
    })
    const tramos = await db.select().from(tramo).where(eq(tramo.ofertaId, id)).orderBy(asc(tramo.numero))
    // El tramo 2 está 'pendiente', no se puede cerrar todavía.
    await expect(cerrarTramo(db, tramos[1]!.id, '2026-09-08', SIN_FESTIVOS)).rejects.toThrow()
  })
})
