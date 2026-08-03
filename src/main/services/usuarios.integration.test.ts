import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client.js'
import { crearConexion, type DB } from '../db/client.js'
import { aplicarEsquema } from '../db/ddl.js'
import { usuario } from '../db/schema.js'
import type { SesionUsuario } from '../../shared/ipc.js'
import { hashPassword, verificarCredenciales } from './auth.js'
import { actualizarUsuario, crearUsuario, listarUsuarios } from './usuarios.js'

let conexion: Conexion
let db: DB
let lider: SesionUsuario
let profesional: SesionUsuario

beforeEach(async () => {
  const conn = await crearConexion(':memory:')
  conexion = conn
  db = conn.db
  await aplicarEsquema(conexion.ejecutar)
  await db.insert(usuario).values([
    { nombre: 'Eduardo', email: 'lu@x.co', rol: 'lider_unidad', passwordHash: hashPassword('x12345') },
    { nombre: 'Ana', email: 'lp@x.co', rol: 'lider_proyectos', passwordHash: hashPassword('x12345') }
  ])
  const us = await db.select().from(usuario)
  const e = us.find((u) => u.rol === 'lider_unidad')!
  const a = us.find((u) => u.rol === 'lider_proyectos')!
  lider = { id: e.id, nombre: e.nombre, email: e.email, rol: e.rol }
  profesional = { id: a.id, nombre: a.nombre, email: a.email, rol: a.rol }
})

afterEach(() => conexion.cerrar())

describe('administración de usuarios (RF-11)', () => {
  it('el líder crea un usuario con su perfil y este puede iniciar sesión', async () => {
    await crearUsuario(
      db,
      { nombre: 'María Gómez', email: '  MARIA@empresa.co ', rol: 'compras_contratacion', password: 'Clave#123' },
      lider
    )
    const lista = await listarUsuarios(db, lider)
    const maria = lista.find((u) => u.email === 'maria@empresa.co')!
    expect(maria.rol).toBe('compras_contratacion')
    expect(maria.activo).toBe(true)

    const sesion = await verificarCredenciales(db, 'maria@empresa.co', 'Clave#123')
    expect(sesion.tipo).toBe('ok')
    if (sesion.tipo === 'ok') expect(sesion.sesion.nombre).toBe('María Gómez')
  })

  it('un profesional NO puede administrar usuarios', async () => {
    await expect(listarUsuarios(db, profesional)).rejects.toThrow(/líder de la unidad/)
    await expect(
      crearUsuario(db, { nombre: 'X', email: 'x@x.co', rol: 'lider_proyectos', password: '123456' }, profesional)
    ).rejects.toThrow(/líder de la unidad/)
  })

  it('valida correo duplicado, contraseña corta y rol inválido', async () => {
    await expect(
      crearUsuario(db, { nombre: 'Otro', email: 'lp@x.co', rol: 'lider_proyectos', password: 'Valida#123' }, lider)
    ).rejects.toThrow(/Ya existe/)
    await expect(
      crearUsuario(db, { nombre: 'X', email: 'nuevo@x.co', rol: 'lider_proyectos', password: 'Ab#1' }, lider)
    ).rejects.toThrow(/8 caracteres/)
    await expect(
      crearUsuario(
        db,
        { nombre: 'X', email: 'nuevo@x.co', rol: 'gerente' as never, password: '123456' },
        lider
      )
    ).rejects.toThrow(/Rol inválido/)
  })

  it('actualiza nombre, rol y contraseña', async () => {
    await actualizarUsuario(
      db,
      { usuarioId: profesional.id, nombre: 'Ana María', rol: 'presupuestos_control', password: 'Nueva#123' },
      lider
    )
    const lista = await listarUsuarios(db, lider)
    const ana = lista.find((u) => u.id === profesional.id)!
    expect(ana.nombre).toBe('Ana María')
    expect(ana.rol).toBe('presupuestos_control')
    // La contraseña anterior ya no sirve; la nueva sí.
    expect((await verificarCredenciales(db, 'lp@x.co', 'x12345')).tipo).toBe('error')
    expect((await verificarCredenciales(db, 'lp@x.co', 'Nueva#123')).tipo).toBe('ok')
  })

  it('desactivar impide iniciar sesión; reactivar lo permite de nuevo', async () => {
    await actualizarUsuario(db, { usuarioId: profesional.id, activo: false }, lider)
    expect((await verificarCredenciales(db, 'lp@x.co', 'x12345')).tipo).toBe('error')

    await actualizarUsuario(db, { usuarioId: profesional.id, activo: true }, lider)
    expect((await verificarCredenciales(db, 'lp@x.co', 'x12345')).tipo).toBe('ok')
  })

  it('el líder no puede desactivarse ni cambiarse el rol a sí mismo', async () => {
    await expect(actualizarUsuario(db, { usuarioId: lider.id, activo: false }, lider)).rejects.toThrow(
      /propio usuario/
    )
    await expect(
      actualizarUsuario(db, { usuarioId: lider.id, rol: 'lider_proyectos' }, lider)
    ).rejects.toThrow(/propio rol/)
  })
})
