// =============================================================================
//  Código de verificación por correo (segundo factor del inicio de sesión).
//  - Código de 6 dígitos generado con crypto, almacenado HASHEADO (sha256) y
//    SOLO en la memoria del proceso principal.
//  - Vence a los 5 minutos y admite máximo 3 intentos de verificación.
// =============================================================================
import { createHash, randomInt } from 'node:crypto'

export const VIGENCIA_MINUTOS = 5
export const MAX_INTENTOS_CODIGO = 3

interface CodigoPendiente {
  hash: string
  expira: number // epoch ms
  intentos: number
}

const pendientes = new Map<string, CodigoPendiente>()

const sha256 = (texto: string): string => createHash('sha256').update(texto).digest('hex')

/** Genera un código de 6 dígitos criptográficamente aleatorio. */
export function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Registra (o reemplaza) el código vigente para un correo. */
export function registrarCodigo(email: string, codigo: string, ahora: number = Date.now()): void {
  pendientes.set(email.toLowerCase(), {
    hash: sha256(codigo),
    expira: ahora + VIGENCIA_MINUTOS * 60_000,
    intentos: 0
  })
}

export type ResultadoCodigo = { ok: true } | { ok: false; mensaje: string }

/** Verifica el código ingresado. Consume el código al acertar o al agotarse. */
export function verificarCodigo2fa(
  email: string,
  codigo: string,
  ahora: number = Date.now()
): ResultadoCodigo {
  const clave = email.toLowerCase()
  const p = pendientes.get(clave)
  if (!p) {
    return { ok: false, mensaje: 'No hay un código vigente. Vuelve a iniciar sesión.' }
  }
  if (ahora > p.expira) {
    pendientes.delete(clave)
    return { ok: false, mensaje: 'El código expiró. Vuelve a iniciar sesión.' }
  }
  if (p.hash !== sha256(codigo.trim())) {
    p.intentos += 1
    if (p.intentos >= MAX_INTENTOS_CODIGO) {
      pendientes.delete(clave)
      return { ok: false, mensaje: 'Demasiados intentos. Vuelve a iniciar sesión.' }
    }
    return { ok: false, mensaje: 'Código incorrecto.' }
  }
  pendientes.delete(clave) // un solo uso
  return { ok: true }
}

/** Limpia los códigos pendientes (pruebas). */
export function limpiarCodigos(): void {
  pendientes.clear()
}
