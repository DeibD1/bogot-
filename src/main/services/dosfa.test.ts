import { beforeEach, describe, expect, it } from 'vitest'
import {
  generarCodigo,
  limpiarCodigos,
  MAX_INTENTOS_CODIGO,
  registrarCodigo,
  verificarCodigo2fa,
  VIGENCIA_MINUTOS
} from './dosfa.js'

const T0 = 1_000_000_000 // epoch ms de referencia

beforeEach(() => limpiarCodigos())

describe('código de verificación por correo (2FA)', () => {
  it('genera códigos de 6 dígitos', () => {
    for (let i = 0; i < 20; i++) {
      expect(generarCodigo()).toMatch(/^\d{6}$/)
    }
  })

  it('acepta el código correcto una sola vez', () => {
    registrarCodigo('ana@empresa.co', '123456', T0)
    expect(verificarCodigo2fa('ana@empresa.co', '123456', T0 + 1000)).toEqual({ ok: true })
    // Un solo uso: el segundo intento ya no tiene código vigente.
    const r2 = verificarCodigo2fa('ana@empresa.co', '123456', T0 + 2000)
    expect(r2.ok).toBe(false)
  })

  it('el correo no distingue mayúsculas y el código admite espacios alrededor', () => {
    registrarCodigo('Ana@Empresa.co', '654321', T0)
    expect(verificarCodigo2fa('ana@empresa.co', ' 654321 ', T0)).toEqual({ ok: true })
  })

  it('rechaza el código expirado', () => {
    registrarCodigo('ana@empresa.co', '123456', T0)
    const tarde = T0 + (VIGENCIA_MINUTOS + 1) * 60_000
    const r = verificarCodigo2fa('ana@empresa.co', '123456', tarde)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.mensaje).toContain('expiró')
  })

  it(`invalida el código tras ${MAX_INTENTOS_CODIGO} intentos incorrectos`, () => {
    registrarCodigo('ana@empresa.co', '123456', T0)
    for (let i = 0; i < MAX_INTENTOS_CODIGO; i++) {
      expect(verificarCodigo2fa('ana@empresa.co', '000000', T0).ok).toBe(false)
    }
    // Incluso el código correcto ya no sirve (fue consumido por intentos).
    const r = verificarCodigo2fa('ana@empresa.co', '123456', T0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.mensaje).toContain('Vuelve a iniciar sesión')
  })

  it('un nuevo registro reemplaza al código anterior', () => {
    registrarCodigo('ana@empresa.co', '111111', T0)
    registrarCodigo('ana@empresa.co', '222222', T0 + 1000)
    expect(verificarCodigo2fa('ana@empresa.co', '111111', T0 + 2000).ok).toBe(false)
    // El anterior consumió 1 intento; el nuevo código sigue siendo válido.
    expect(verificarCodigo2fa('ana@empresa.co', '222222', T0 + 3000).ok).toBe(true)
  })
})
