import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client.js'
import { crearConexion, type DB } from '../db/client.js'
import { aplicarEsquema } from '../db/ddl.js'
import { usuario } from '../db/schema.js'
import type { Rol } from '../../shared/dominio.js'
import type { SesionUsuario } from '../../shared/ipc.js'
import {
  idsOfertasVisibles,
  obtenerCalendarioUnidad,
  obtenerDetalleOferta,
  obtenerLineaTiempo,
  obtenerResumenOfertas
} from './consultas.js'
import { crearOferta } from './ofertas.js'

let conexion: Conexion
let db: DB
let usuarios: Record<string, SesionUsuario>

const SIN_FESTIVOS = new Set<string>()

beforeEach(async () => {
  const conn = await crearConexion(':memory:')
  conexion = conn
  db = conn.db
  await aplicarEsquema(conexion.ejecutar)
  await db.insert(usuario).values([
    { nombre: 'Sofía', email: 'sofia@x.co', rol: 'lider_comercial', passwordHash: 'x' },
    { nombre: 'Ana', email: 'ana@x.co', rol: 'lider_proyectos', passwordHash: 'x' },
    { nombre: 'Carlos', email: 'carlos@x.co', rol: 'compras_contratacion', passwordHash: 'x' },
    { nombre: 'Diana', email: 'diana@x.co', rol: 'presupuestos_control', passwordHash: 'x' },
    { nombre: 'Eduardo', email: 'eduardo@x.co', rol: 'lider_unidad', passwordHash: 'x' },
    { nombre: 'Gloria', email: 'gloria@x.co', rol: 'compras_contratacion', passwordHash: 'x' }
  ])
  const us = await db.select().from(usuario)
  usuarios = Object.fromEntries(
    us.map((u) => [u.email, { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol as Rol }])
  )

  const responsables: Record<Rol, number> = {
    lider_comercial: usuarios['sofia@x.co']!.id,
    lider_proyectos: usuarios['ana@x.co']!.id,
    compras_contratacion: usuarios['carlos@x.co']!.id,
    presupuestos_control: usuarios['diana@x.co']!.id,
    lider_unidad: usuarios['eduardo@x.co']!.id
  }
  await crearOferta(db, {
    cliente: 'Cliente X',
    tamano: 'grande',
    fechaInicio: '2026-09-07',
    responsables,
    creadoPor: usuarios['sofia@x.co']!.id,
    festivos: SIN_FESTIVOS
  })
})

afterEach(() => conexion.cerrar())

describe('alcance por rol (RNF-06 / RF-18)', () => {
  it('el líder de la unidad y el líder comercial ven todas las ofertas', async () => {
    expect(await idsOfertasVisibles(db, usuarios['eduardo@x.co']!)).toBe('todas')
    expect(await idsOfertasVisibles(db, usuarios['sofia@x.co']!)).toBe('todas')
    expect(await obtenerResumenOfertas(db, usuarios['eduardo@x.co']!)).toHaveLength(1)
  })

  it('un profesional responsable de un tramo ve su oferta', async () => {
    const visibles = await idsOfertasVisibles(db, usuarios['carlos@x.co']!)
    expect(visibles).toHaveLength(1)
    expect(await obtenerResumenOfertas(db, usuarios['carlos@x.co']!)).toHaveLength(1)
  })

  it('un profesional sin participación NO ve la oferta', async () => {
    expect(await idsOfertasVisibles(db, usuarios['gloria@x.co']!)).toEqual([])
    expect(await obtenerResumenOfertas(db, usuarios['gloria@x.co']!)).toHaveLength(0)
  })
})

describe('detalle de oferta (RF-09 / RF-19)', () => {
  const SIN = new Set<string>()

  it('el líder consulta el proceso completo: 6 tramos, tareas y responsables', async () => {
    const ofertas = await obtenerResumenOfertas(db, usuarios['eduardo@x.co']!)
    const d = await obtenerDetalleOferta(db, ofertas[0]!.id, usuarios['eduardo@x.co']!, '2026-09-08', SIN)

    expect(d.cliente).toBe('Cliente X')
    expect(d.tramos).toHaveLength(6)
    expect(d.tramos[0]!.tareas.map((t) => t.tipo)).toEqual(['socializacion'])
    expect(d.tramos[0]!.responsableNombre).toBe('Sofía')
    expect(d.tramos[0]!.estado).toBe('en_curso')
    expect(d.tramos[1]!.tareas.map((t) => t.tipo)).toEqual(['visita', 'recoleccion'])
    expect(d.tramos[4]!.responsableRol).toBe('lider_unidad')
    expect(d.tramos[5]!.tareas.map((t) => t.tipo)).toEqual(['envio_cliente'])
  })

  it('un participante o el comercial pueden verlo; un ajeno no (RNF-06)', async () => {
    const ofertas = await obtenerResumenOfertas(db, usuarios['eduardo@x.co']!)
    const id = ofertas[0]!.id
    await expect(
      obtenerDetalleOferta(db, id, usuarios['carlos@x.co']!, '2026-09-08', SIN)
    ).resolves.toBeTruthy()
    await expect(
      obtenerDetalleOferta(db, id, usuarios['sofia@x.co']!, '2026-09-08', SIN)
    ).resolves.toBeTruthy()
    // Gloria no participa: acceso denegado.
    await expect(
      obtenerDetalleOferta(db, id, usuarios['gloria@x.co']!, '2026-09-08', SIN)
    ).rejects.toThrow(/acceso/)
  })
})

describe('calendario general de la unidad', () => {
  const SIN = new Set<string>()

  it('muestra las actividades de todos por día y resalta el ENVÍO al cliente', async () => {
    // Hoy = día de inicio: la socialización de Sofía aparece HOY.
    const cal = await obtenerCalendarioUnidad(db, usuarios['eduardo@x.co']!, '2026-09-07', 20, SIN)
    expect(cal).toHaveLength(20)
    expect(cal[0]!.esHoy).toBe(true)
    expect(cal[0]!.items.map((i) => [i.numero, i.responsableNombre])).toEqual([[1, 'Sofía']])

    // El 09-08 trabaja Ana (tramo 2, planificado).
    const dia8 = cal.find((d) => d.fecha === '2026-09-08')!
    expect(dia8.items.some((i) => i.responsableNombre === 'Ana' && i.numero === 2)).toBe(true)

    // El cierre del proceso: ENVÍO al cliente el 2026-09-22, marcado como hito.
    const dia22 = cal.find((d) => d.fecha === '2026-09-22')!
    const envio = dia22.items.find((i) => i.esEnvio)!
    expect(envio.responsableRol).toBe('lider_comercial')
    expect(envio.esLimite).toBe(true)
    // Los envíos van primero en el día.
    expect(dia22.items[0]!.esEnvio).toBe(true)
  })

  it('un tramo en curso VENCIDO sigue apareciendo hoy', async () => {
    // El 09-09 la socialización (límite 09-07) sigue en curso: aparece hoy en rojo.
    const cal = await obtenerCalendarioUnidad(db, usuarios['sofia@x.co']!, '2026-09-09', 5, SIN)
    const hoy = cal[0]!
    const item = hoy.items.find((i) => i.numero === 1)!
    expect(item.criticidad).toBe('rojo')
  })

  it('solo el líder de la unidad y el comercial acceden', async () => {
    await expect(
      obtenerCalendarioUnidad(db, usuarios['ana@x.co']!, '2026-09-07', 5, SIN)
    ).rejects.toThrow(/líder de la unidad o el líder comercial/)
  })
})

describe('línea de tiempo por profesional', () => {
  const SIN = new Set<string>()

  it('líder y comercial ven todas las filas; otro profesional solo la suya', async () => {
    const lineaLider = await obtenerLineaTiempo(db, usuarios['eduardo@x.co']!, '2026-09-08', SIN, 7, 14)
    expect(lineaLider.filas.map((f) => f.rol)).toEqual([
      'lider_comercial',
      'lider_proyectos',
      'compras_contratacion',
      'presupuestos_control',
      'lider_unidad'
    ])
    expect(lineaLider.dias).toHaveLength(22) // 7 atrás + hoy + 14 adelante
    expect(lineaLider.dias.find((d) => d.esHoy)?.fecha).toBe('2026-09-08')

    // El líder comercial también ve a todos (para informar al cliente).
    const lineaSofia = await obtenerLineaTiempo(db, usuarios['sofia@x.co']!, '2026-09-08', SIN, 7, 14)
    expect(lineaSofia.filas).toHaveLength(5)

    // Ana (profesional técnico) solo ve su fila: su tramo va del 09-08 al 09-10.
    const lineaAna = await obtenerLineaTiempo(db, usuarios['ana@x.co']!, '2026-09-08', SIN, 7, 14)
    expect(lineaAna.filas).toHaveLength(1)
    expect(lineaAna.filas[0]!.nombre).toBe('Ana')
    expect(lineaAna.filas[0]!.tramos[0]!.fechaActivacion).toBe('2026-09-08')
    expect(lineaAna.filas[0]!.tramos[0]!.fechaFin).toBe('2026-09-10')
  })

  it('excluye tramos completamente fuera de la ventana', async () => {
    // Ventana en agosto: la oferta de septiembre no aparece.
    const linea = await obtenerLineaTiempo(db, usuarios['eduardo@x.co']!, '2026-08-03', SIN, 7, 14)
    expect(linea.filas).toHaveLength(0)
  })
})
