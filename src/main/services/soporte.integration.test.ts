import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client.js'
import { crearConexion, type DB } from '../db/client.js'
import { aplicarEsquema } from '../db/ddl.js'
import { usuario } from '../db/schema.js'
import type { Rol } from '../../shared/dominio.js'
import type { SesionUsuario } from '../../shared/ipc.js'
import { listarNotificaciones } from './notificaciones.js'
import {
  crearReporteSoporte,
  listarMisReportes,
  listarReportesSoporte,
  marcarReporteAtendido,
  responderReporteSoporte
} from './soporte.js'

let conexion: Conexion
let db: DB
let ana: SesionUsuario
let lider: SesionUsuario

beforeEach(async () => {
  const conn = await crearConexion(':memory:')
  conexion = conn
  db = conn.db
  await aplicarEsquema(conexion.ejecutar)
  await db.insert(usuario).values([
    { nombre: 'Ana', email: 'lp@x.co', rol: 'lider_proyectos', passwordHash: 'x' },
    { nombre: 'Eduardo', email: 'lu@x.co', rol: 'lider_unidad', passwordHash: 'x' }
  ])
  const us = await db.select().from(usuario)
  const a = us.find((u) => u.rol === 'lider_proyectos')!
  const e = us.find((u) => u.rol === 'lider_unidad')!
  ana = { id: a.id, nombre: a.nombre, email: a.email, rol: a.rol as Rol }
  lider = { id: e.id, nombre: e.nombre, email: e.email, rol: e.rol as Rol }
})

afterEach(() => conexion.cerrar())

describe('soporte técnico', () => {
  it('cualquier usuario crea un reporte con pantallazo y el administrador es notificado', async () => {
    const id = await crearReporteSoporte(
      db,
      { descripcion: 'La agenda no carga al abrirla', captura: 'data:image/png;base64,AAAA' },
      ana
    )
    expect(id).toBeGreaterThan(0)

    // El líder lo ve en su bandeja con todos los datos.
    const lista = await listarReportesSoporte(db, lider)
    expect(lista).toHaveLength(1)
    expect(lista[0]!.usuarioNombre).toBe('Ana')
    expect(lista[0]!.descripcion).toContain('agenda no carga')
    expect(lista[0]!.captura).toContain('data:image/png')
    expect(lista[0]!.atendido).toBe(false)

    // Y recibió la notificación en la campana.
    const notifs = await listarNotificaciones(db, lider.id)
    expect(notifs.some((n) => n.mensaje.includes('Soporte técnico') && n.mensaje.includes('Ana'))).toBe(true)
  })

  it('el administrador marca atendido (y puede reabrir); pendientes van primero', async () => {
    const id1 = await crearReporteSoporte(db, { descripcion: 'Problema 1' }, ana)
    await crearReporteSoporte(db, { descripcion: 'Problema 2' }, ana)

    await marcarReporteAtendido(db, id1, true, lider)
    const lista = await listarReportesSoporte(db, lider)
    expect(lista[0]!.descripcion).toBe('Problema 2') // pendiente primero
    expect(lista[1]!.atendido).toBe(true)

    await marcarReporteAtendido(db, id1, false, lider)
    expect((await listarReportesSoporte(db, lider)).filter((r) => !r.atendido)).toHaveLength(2)
  })

  it('valida la descripción y restringe la bandeja al líder', async () => {
    await expect(crearReporteSoporte(db, { descripcion: '   ' }, ana)).rejects.toThrow(/Describe/)
    await expect(listarReportesSoporte(db, ana)).rejects.toThrow(/líder de la unidad/)
    await expect(marcarReporteAtendido(db, 1, true, ana)).rejects.toThrow(/líder de la unidad/)
  })

  it('la respuesta del administrador notifica al usuario y queda en sus reportes', async () => {
    const id = await crearReporteSoporte(db, { descripcion: 'No puedo adjuntar archivos' }, ana)
    await responderReporteSoporte(db, id, 'Ya quedó corregido: actualiza la app a la versión 0.1.1', lider)

    // El reporte queda atendido con la respuesta registrada.
    const bandeja = await listarReportesSoporte(db, lider)
    expect(bandeja[0]!.atendido).toBe(true)
    expect(bandeja[0]!.respuesta).toContain('quedó corregido')
    expect(bandeja[0]!.respondidaEn).not.toBeNull()

    // Ana lo ve en SUS reportes (sin necesitar permisos de líder).
    const mios = await listarMisReportes(db, ana)
    expect(mios).toHaveLength(1)
    expect(mios[0]!.respuesta).toContain('quedó corregido')

    // Y recibió la notificación en su campana.
    const notifs = await listarNotificaciones(db, ana.id)
    expect(
      notifs.some((n) => n.mensaje.includes(`respuesta a tu reporte #${id}`) && n.mensaje.includes('Eduardo'))
    ).toBe(true)
  })

  it('solo el líder responde, con texto no vacío', async () => {
    const id = await crearReporteSoporte(db, { descripcion: 'Algo falla' }, ana)
    await expect(responderReporteSoporte(db, id, 'intento', ana)).rejects.toThrow(/líder de la unidad/)
    await expect(responderReporteSoporte(db, id, '   ', lider)).rejects.toThrow(/respuesta/)
  })

  it('rechaza pantallazos demasiado grandes', async () => {
    const gigante = 'x'.repeat(4_500_001)
    await expect(
      crearReporteSoporte(db, { descripcion: 'Pantallazo enorme', captura: gigante }, ana)
    ).rejects.toThrow(/demasiado grande/)
  })
})
