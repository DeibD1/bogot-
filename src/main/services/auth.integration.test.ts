import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Conexion } from '../db/client'
import { crearConexion, type DB } from '../db/client'
import { aplicarEsquema } from '../db/ddl'
import { usuario } from '../db/schema'
import {
  BLOQUEO_MINUTOS,
  hashPassword,
  MAX_INTENTOS,
  validarPoliticaPassword,
  verificarCredenciales
} from './auth'

let conexion: Conexion
let db: DB

beforeEach(async () => {
  const conn = await crearConexion(':memory:')
  conexion = conn
  db = conn.db
  await aplicarEsquema(conexion.ejecutar)
  await db.insert(usuario).values([
    { nombre: 'Ana', email: 'ana@empresa.co', rol: 'lider_proyectos', passwordHash: hashPassword('Demo#1234') },
    {
      nombre: 'Inactivo',
      email: 'inactivo@empresa.co',
      rol: 'compras_contratacion',
      passwordHash: hashPassword('Demo#1234'),
      activo: false
    }
  ])
})

afterEach(() => conexion.cerrar())

describe('verificarCredenciales (RF-11)', () => {
  it('acepta credenciales correctas y devuelve la sesión sin el hash', async () => {
    const r = await verificarCredenciales(db, 'ana@empresa.co', 'Demo#1234')
    expect(r.tipo).toBe('ok')
    if (r.tipo === 'ok') {
      expect(r.sesion).toEqual({
        id: expect.any(Number),
        nombre: 'Ana',
        email: 'ana@empresa.co',
        rol: 'lider_proyectos'
      })
      expect(r.sesion).not.toHaveProperty('passwordHash')
    }
  })

  it('normaliza el email (mayúsculas/espacios)', async () => {
    const r = await verificarCredenciales(db, '  ANA@empresa.co ', 'Demo#1234')
    expect(r.tipo).toBe('ok')
  })

  it('rechaza con mensaje GENÉRICO: contraseña mala, email inexistente, inactivo y vacíos', async () => {
    for (const [e, p] of [
      ['ana@empresa.co', 'mala-clave'],
      ['nadie@empresa.co', 'Demo#1234'],
      ['inactivo@empresa.co', 'Demo#1234'],
      ['', '']
    ] as const) {
      const r = await verificarCredenciales(db, e, p)
      expect(r.tipo).toBe('error')
      if (r.tipo === 'error') expect(r.mensaje).toContain('Credenciales inválidas')
    }
  })
})

describe('bloqueo por intentos fallidos', () => {
  const ahora = new Date('2026-06-10T12:00:00Z')

  it(`bloquea la cuenta tras ${MAX_INTENTOS} intentos y rechaza incluso la contraseña correcta`, async () => {
    for (let i = 0; i < MAX_INTENTOS - 1; i++) {
      const r = await verificarCredenciales(db, 'ana@empresa.co', 'mala', ahora)
      if (r.tipo === 'error') expect(r.mensaje).toContain('Credenciales inválidas')
    }
    // 5º intento fallido -> bloqueo
    const r5 = await verificarCredenciales(db, 'ana@empresa.co', 'mala', ahora)
    expect(r5.tipo).toBe('error')
    if (r5.tipo === 'error') expect(r5.mensaje).toContain('bloqueada')

    // Con la contraseña CORRECTA, sigue bloqueada.
    const rOk = await verificarCredenciales(db, 'ana@empresa.co', 'Demo#1234', ahora)
    expect(rOk.tipo).toBe('error')
    if (rOk.tipo === 'error') expect(rOk.mensaje).toContain('bloqueada')
  })

  it('el bloqueo expira pasados los minutos configurados', async () => {
    for (let i = 0; i < MAX_INTENTOS; i++) {
      await verificarCredenciales(db, 'ana@empresa.co', 'mala', ahora)
    }
    const despues = new Date(ahora.getTime() + (BLOQUEO_MINUTOS + 1) * 60_000)
    const r = await verificarCredenciales(db, 'ana@empresa.co', 'Demo#1234', despues)
    expect(r.tipo).toBe('ok')
  })

  it('un login exitoso reinicia el contador de intentos', async () => {
    for (let i = 0; i < MAX_INTENTOS - 1; i++) {
      await verificarCredenciales(db, 'ana@empresa.co', 'mala', ahora)
    }
    expect((await verificarCredenciales(db, 'ana@empresa.co', 'Demo#1234', ahora)).tipo).toBe('ok')
    // El contador quedó en cero: 4 fallos más no bloquean.
    for (let i = 0; i < MAX_INTENTOS - 1; i++) {
      const r = await verificarCredenciales(db, 'ana@empresa.co', 'mala', ahora)
      if (r.tipo === 'error') expect(r.mensaje).toContain('Credenciales inválidas')
    }
  })
})

describe('validarPoliticaPassword (≥8, letra, número y especial)', () => {
  it('acepta contraseñas que cumplen la política', () => {
    expect(() => validarPoliticaPassword('Clave#123')).not.toThrow()
    expect(() => validarPoliticaPassword('otra.Clave9')).not.toThrow()
  })

  it('rechaza las que no cumplen, indicando qué falta', () => {
    expect(() => validarPoliticaPassword('Ab#1')).toThrow(/8 caracteres/)
    expect(() => validarPoliticaPassword('12345678#')).toThrow(/letra/)
    expect(() => validarPoliticaPassword('Solo#Letras')).toThrow(/número/)
    expect(() => validarPoliticaPassword('SinEspecial9')).toThrow(/carácter especial/)
  })
})
