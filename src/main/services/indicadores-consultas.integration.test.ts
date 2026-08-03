import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client.js'
import { crearConexion, type DB } from '../db/client.js'
import { aplicarEsquema } from '../db/ddl.js'
import { tarea, tramo, usuario } from '../db/schema.js'
import { NUMERO_TRAMO_APROBACION, TOTAL_TRAMOS, type Rol } from '../../shared/dominio.js'
import type { SesionUsuario } from '../../shared/ipc.js'
import { aprobarOferta } from './aprobacion.js'
import { sumarDiasHabiles } from './dias-habiles.js'
import { promedio } from './indicadores.js'
import { obtenerIndicadores } from './indicadores-consultas.js'
import { crearOferta } from './ofertas.js'
import { completarTarea } from './tareas.js'

let conexion: Conexion
let db: DB
let ids: Record<Rol, number>
let lider: SesionUsuario
const SIN = new Set<string>()

async function entregarTramo(ofertaId: number, numero: number, responsable: number, retraso = 0): Promise<void> {
  const tr = (
    await db.select().from(tramo).where(and(eq(tramo.ofertaId, ofertaId), eq(tramo.numero, numero)))
  )[0]!
  const fecha = retraso > 0 ? sumarDiasHabiles(tr.fechaLimite!, retraso, SIN) : tr.fechaLimite!
  const tareas = await db.select().from(tarea).where(eq(tarea.tramoId, tr.id)).orderBy(asc(tarea.id))
  for (const ta of tareas) {
    if (ta.estado !== 'completada') await completarTarea(db, ta.id, fecha, SIN, responsable)
  }
}

async function aprobarEnLimite(ofertaId: number): Promise<void> {
  const t5 = (
    await db
      .select()
      .from(tramo)
      .where(and(eq(tramo.ofertaId, ofertaId), eq(tramo.numero, NUMERO_TRAMO_APROBACION)))
  )[0]!
  await aprobarOferta(db, ofertaId, t5.fechaLimite!, SIN, lider)
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
  ids = Object.fromEntries(us.map((u) => [u.rol, u.id])) as Record<Rol, number>
  lider = { id: ids.lider_unidad, nombre: 'Eduardo', email: 'lu@x.co', rol: 'lider_unidad' }

  const flujoCompleto = async (ofertaId: number, retrasoCotizacion = 0): Promise<void> => {
    await entregarTramo(ofertaId, 1, ids.lider_comercial)
    await entregarTramo(ofertaId, 2, ids.lider_proyectos)
    await entregarTramo(ofertaId, 3, ids.compras_contratacion, retrasoCotizacion)
    await entregarTramo(ofertaId, 4, ids.presupuestos_control)
    await aprobarEnLimite(ofertaId)
    await entregarTramo(ofertaId, TOTAL_TRAMOS, ids.lider_comercial)
  }

  // Oferta GRANDE finalizada a tiempo (todo al 100%): enviada el 2026-09-22.
  const a = await crearOferta(db, {
    cliente: 'A',
    tamano: 'grande',
    fechaInicio: '2026-09-07',
    responsables: ids,
    creadoPor: ids.lider_comercial,
    festivos: SIN
  })
  await flujoCompleto(a)

  // Oferta PEQUEÑA con la cotización entregada 2 días tarde -> oferta 66.67%,
  // enviada el 2026-09-21 (comprometida: 2026-09-17).
  const b = await crearOferta(db, {
    cliente: 'B',
    tamano: 'pequena',
    fechaInicio: '2026-09-07',
    responsables: ids,
    creadoPor: ids.lider_comercial,
    festivos: SIN
  })
  await flujoCompleto(b, 2)
})

afterEach(() => conexion.cerrar())

describe('obtenerIndicadores (V1/V2, RF-13..16, RF-24/25)', () => {
  it('sin filtros: agrega las dos ofertas y el histórico de cada profesional', async () => {
    const d = await obtenerIndicadores(db, {})

    expect(d.ofertasConsideradas).toBe(2)
    // Ordenadas por fecha de finalización: B (09-21, 66.67%) antes que A (09-22, 100%).
    expect(d.ofertas.map((o) => o.indicadorCumplimiento)).toEqual([66.67, 100])
    expect(d.indicadorUnidad).toBe(promedio([100, 66.67]))

    const carlos = d.profesionales.find((p) => p.nombre === 'Carlos')!
    expect(carlos.totalTramos).toBe(2)
    expect(carlos.tramosATiempo).toBe(1)
    expect(carlos.tramosRetrasados).toBe(1)
    expect(carlos.tasaPuntualidad).toBe(50)
    expect(carlos.rendimientoPromedio).toBe(50) // (100 + 0) / 2
    expect(carlos.desviacionPromedio).toBe(1) // (0 + 2) / 2

    const ana = d.profesionales.find((p) => p.nombre === 'Ana')!
    expect(ana.tasaPuntualidad).toBe(100)
    expect(ana.rendimientoPromedio).toBe(100)

    // El líder comercial también se mide (2 socializaciones + 2 envíos, a tiempo).
    const sofia = d.profesionales.find((p) => p.nombre === 'Sofía')!
    expect(sofia.totalTramos).toBe(4)
    expect(sofia.tasaPuntualidad).toBe(100)
    expect(sofia.rendimientoPromedio).toBe(100)

    // El líder de la unidad también (RF-15): 2 aprobaciones a tiempo.
    const eduardo = d.profesionales.find((p) => p.nombre === 'Eduardo')!
    expect(eduardo.totalTramos).toBe(2)
    expect(eduardo.rendimientoPromedio).toBe(100)

    // Comparativa (RF-16): empate al 100% se resuelve por nombre; Carlos es el más atrasado.
    expect(d.masCumplido!.nombre).toBe('Ana')
    expect(d.masAtrasado!.nombre).toBe('Carlos')
    expect(d.masAtrasado!.tramosRetrasados).toBe(1)
  })

  it('filtro por tamaño: solo la oferta grande (todo al 100%)', async () => {
    const d = await obtenerIndicadores(db, { tamano: 'grande' })
    expect(d.ofertasConsideradas).toBe(1)
    expect(d.indicadorUnidad).toBe(100)
    const carlos = d.profesionales.find((p) => p.nombre === 'Carlos')!
    expect(carlos.totalTramos).toBe(1)
    expect(carlos.tramosRetrasados).toBe(0)
    expect(carlos.rendimientoPromedio).toBe(100)
  })

  it('filtro por fechas: excluye lo finalizado fuera del rango', async () => {
    // La grande se envió el 2026-09-22; la pequeña, el 2026-09-21.
    const soloAntes = await obtenerIndicadores(db, { hasta: '2026-09-21' })
    expect(soloAntes.ofertasConsideradas).toBe(1)
    expect(soloAntes.ofertas[0]!.cliente).toBe('B')

    const vacio = await obtenerIndicadores(db, { desde: '2026-10-01' })
    expect(vacio.ofertasConsideradas).toBe(0)
    expect(vacio.indicadorUnidad).toBeNull()
    expect(vacio.masCumplido).toBeNull()
  })
})
