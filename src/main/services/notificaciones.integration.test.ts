import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client.js'
import { crearConexion, type DB } from '../db/client.js'
import { aplicarEsquema } from '../db/ddl.js'
import { tarea, tramo, usuario } from '../db/schema.js'
import type { Rol } from '../../shared/dominio.js'
import type { SesionUsuario } from '../../shared/ipc.js'
import { aprobarOferta, rechazarOferta } from './aprobacion.js'
import {
  contarNoLeidas,
  generarAlertasVencimiento,
  listarNotificaciones,
  marcarTodasLeidas
} from './notificaciones.js'
import { crearOferta } from './ofertas.js'
import { completarTarea } from './tareas.js'

let conexion: Conexion
let db: DB
let ids: Record<Rol, number>
let ofertaId: number
const SIN = new Set<string>()

async function completarTramoCompleto(numero: number, fecha: string, responsable: number): Promise<void> {
  const tr = (
    await db.select().from(tramo).where(eq(tramo.ofertaId, ofertaId)).orderBy(asc(tramo.numero))
  )[numero - 1]!
  const tareas = await db.select().from(tarea).where(eq(tarea.tramoId, tr.id)).orderBy(asc(tarea.id))
  for (const ta of tareas) {
    if (ta.estado !== 'completada') await completarTarea(db, ta.id, fecha, SIN, responsable)
  }
}

async function avanzarHastaAprobacion(): Promise<void> {
  await completarTramoCompleto(1, '2026-09-07', ids.lider_comercial)
  await completarTramoCompleto(2, '2026-09-10', ids.lider_proyectos)
  await completarTramoCompleto(3, '2026-09-15', ids.compras_contratacion)
  await completarTramoCompleto(4, '2026-09-18', ids.presupuestos_control)
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
  ofertaId = await crearOferta(db, {
    cliente: 'Cliente X',
    tamano: 'grande',
    fechaInicio: '2026-09-07',
    responsables: ids,
    creadoPor: ids.lider_comercial,
    festivos: SIN
  })
})

afterEach(() => conexion.cerrar())

describe('notificaciones por eventos (RF-27)', () => {
  it('crear la oferta notifica el compromiso al líder comercial (socialización)', async () => {
    const deSofia = await listarNotificaciones(db, ids.lider_comercial)
    expect(deSofia).toHaveLength(1)
    expect(deSofia[0]!.tipo).toBe('compromiso')
    expect(deSofia[0]!.mensaje).toContain('tramo 1')
    expect(deSofia[0]!.mensaje).toContain('Cliente X')
    expect(deSofia[0]!.mensaje).toContain('2026-09-07') // su fecha límite
    // Los demás aún no tienen nada.
    expect(await listarNotificaciones(db, ids.lider_proyectos)).toHaveLength(0)
  })

  it('el hand-off notifica al siguiente; el cierre de APUs al líder; la aprobación al comercial', async () => {
    await completarTramoCompleto(1, '2026-09-07', ids.lider_comercial)
    const deAna = await listarNotificaciones(db, ids.lider_proyectos)
    expect(deAna).toHaveLength(1)
    expect(deAna[0]!.mensaje).toContain('tramo 2')

    await completarTramoCompleto(2, '2026-09-10', ids.lider_proyectos)
    await completarTramoCompleto(3, '2026-09-15', ids.compras_contratacion)
    await completarTramoCompleto(4, '2026-09-18', ids.presupuestos_control)

    const deEduardo = await listarNotificaciones(db, ids.lider_unidad)
    expect(deEduardo).toHaveLength(1)
    expect(deEduardo[0]!.tipo).toBe('compromiso')
    expect(deEduardo[0]!.mensaje).toContain('aprobación final')
    expect(deEduardo[0]!.mensaje).toContain('1 día hábil')

    // Al aprobar, el comercial recibe el aviso de ENVIAR la oferta al cliente.
    const lider: SesionUsuario = { id: ids.lider_unidad, nombre: 'E', email: 'lu@x.co', rol: 'lider_unidad' }
    await aprobarOferta(db, ofertaId, '2026-09-21', SIN, lider)
    const deSofia = await listarNotificaciones(db, ids.lider_comercial)
    const envio = deSofia.find((n) => n.mensaje.includes('APROBADA'))!
    expect(envio.mensaje).toContain('envíala al cliente')
    expect(envio.mensaje).toContain('2026-09-22')
  })

  it('el rechazo notifica la corrección al responsable e INFORMA la causa a todo el proceso', async () => {
    await avanzarHastaAprobacion()
    const lider: SesionUsuario = { id: ids.lider_unidad, nombre: 'E', email: 'lu@x.co', rol: 'lider_unidad' }
    await rechazarOferta(db, ofertaId, [{ numeroTramo: 3, motivo: 'Faltan cantidades' }], '2026-09-21', lider)

    // Carlos (tramo devuelto): compromiso de corrección con el motivo.
    const deCarlos = await listarNotificaciones(db, ids.compras_contratacion)
    expect(deCarlos[0]!.tipo).toBe('compromiso')
    expect(deCarlos[0]!.mensaje).toContain('rechazada')
    expect(deCarlos[0]!.mensaje).toContain('Faltan cantidades')

    // Los DEMÁS profesionales del proceso quedan informados de la causa.
    for (const quien of [ids.lider_comercial, ids.lider_proyectos, ids.presupuestos_control]) {
      const notifs = await listarNotificaciones(db, quien)
      const aviso = notifs.find((n) => n.mensaje.includes('NO fue aprobada'))
      expect(aviso).toBeDefined()
      expect(aviso!.mensaje).toContain('Faltan cantidades')
      expect(aviso!.mensaje).toContain('T3')
    }
  })
})

describe('alertas de calendario (vencimiento próximo / retraso)', () => {
  it('genera retraso cuando la fecha límite pasó, y es idempotente', async () => {
    // La socialización (límite 2026-09-07) sigue en curso el 2026-09-09.
    const r1 = await generarAlertasVencimiento(db, '2026-09-09', SIN)
    expect(r1.retrasos).toBe(1)
    expect(r1.proximos).toBe(0)

    const r2 = await generarAlertasVencimiento(db, '2026-09-09', SIN)
    expect(r2.retrasos).toBe(0) // no duplica

    const deSofia = await listarNotificaciones(db, ids.lider_comercial)
    const retraso = deSofia.find((n) => n.tipo === 'retraso')!
    expect(retraso.mensaje).toContain('VENCIDO')
    expect(retraso.mensaje).toContain('2026-09-07')
  })

  it('genera vencimiento próximo cuando vence hoy o el siguiente día hábil', async () => {
    const r = await generarAlertasVencimiento(db, '2026-09-07', SIN) // la socialización vence hoy
    expect(r.proximos).toBe(1)
    expect(r.retrasos).toBe(0)
    const deSofia = await listarNotificaciones(db, ids.lider_comercial)
    expect(deSofia.some((n) => n.tipo === 'vencimiento_proximo')).toBe(true)
  })

  it('no alerta cuando falta más de un día hábil', async () => {
    // Entregada la socialización, el tramo de Ana (límite 09-10) tiene 3 días el 09-08.
    await completarTramoCompleto(1, '2026-09-07', ids.lider_comercial)
    const r = await generarAlertasVencimiento(db, '2026-09-08', SIN)
    expect(r.proximos).toBe(0)
    expect(r.retrasos).toBe(0)
  })
})

describe('leídas / no leídas', () => {
  it('cuenta y marca todas como leídas', async () => {
    expect(await contarNoLeidas(db, ids.lider_comercial)).toBe(1)
    await marcarTodasLeidas(db, ids.lider_comercial)
    expect(await contarNoLeidas(db, ids.lider_comercial)).toBe(0)
    const lista = await listarNotificaciones(db, ids.lider_comercial)
    expect(lista.every((n) => n.leida)).toBe(true)
  })
})
