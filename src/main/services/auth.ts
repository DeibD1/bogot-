// =============================================================================
//  Autenticación (RF-11) con refuerzos de seguridad:
//   - Hash bcrypt de contraseñas (nunca en texto plano, nunca al renderer).
//   - Política de contraseñas: mínimo 8 caracteres, letra, número y especial.
//   - Bloqueo temporal tras intentos fallidos (persistido en BD: aplica aunque
//     se reinicie la app y, en modo multiusuario, en todas las instalaciones).
//   - Mensajes genéricos (no revelan si falló el correo o la contraseña) y
//     comparación dummy para igualar tiempos cuando el correo no existe.
// =============================================================================
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { DB } from '../db/client.js'
import { usuario } from '../db/schema.js'
import type { SesionUsuario } from '../../shared/ipc.js'

export const MAX_INTENTOS = 5
export const BLOQUEO_MINUTOS = 15
const MENSAJE_GENERICO = 'Credenciales inválidas o usuario inactivo.'

// Hash de relleno: iguala el tiempo de respuesta cuando el correo no existe.
const HASH_DUMMY = bcrypt.hashSync('relleno-tiempo-constante', 10)

export type VerificacionLogin =
  | { tipo: 'ok'; sesion: SesionUsuario }
  | { tipo: 'error'; mensaje: string }

/** Política de contraseñas: ≥8 caracteres, con letra, número y carácter especial. */
export function validarPoliticaPassword(password: string): void {
  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres')
  }
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password)) {
    throw new Error('La contraseña debe incluir al menos una letra')
  }
  if (!/[0-9]/.test(password)) {
    throw new Error('La contraseña debe incluir al menos un número')
  }
  if (!/[^A-Za-z0-9\sÁÉÍÓÚáéíóúÑñ]/.test(password)) {
    throw new Error('La contraseña debe incluir al menos un carácter especial (p. ej. # $ % . _ -)')
  }
}

/** Convierte el TIMESTAMP (texto) de la BD a Date (se almacena en UTC). */
function parseTimestamp(ts: string): Date {
  return new Date(`${ts.replace(' ', 'T')}Z`)
}

/**
 * Verifica las credenciales aplicando el bloqueo por intentos (RNF-06 reforzado).
 * `ahora` es inyectable para pruebas.
 */
export async function verificarCredenciales(
  db: DB,
  email: string,
  password: string,
  ahora: Date = new Date()
): Promise<VerificacionLogin> {
  const correo = email.trim().toLowerCase()
  if (!correo || !password) return { tipo: 'error', mensaje: MENSAJE_GENERICO }

  const filas = await db.select().from(usuario).where(eq(usuario.email, correo))
  const u = filas[0]
  if (!u || !u.activo) {
    bcrypt.compareSync(password, HASH_DUMMY) // tiempo constante
    return { tipo: 'error', mensaje: MENSAJE_GENERICO }
  }

  // ¿Cuenta bloqueada vigente?
  if (u.bloqueadoHasta) {
    const hasta = parseTimestamp(u.bloqueadoHasta)
    if (hasta > ahora) {
      const minutos = Math.max(1, Math.ceil((hasta.getTime() - ahora.getTime()) / 60_000))
      return {
        tipo: 'error',
        mensaje: `Cuenta bloqueada por intentos fallidos. Intenta de nuevo en ${minutos} minuto(s).`
      }
    }
  }

  if (bcrypt.compareSync(password, u.passwordHash)) {
    // Éxito: limpiar contadores de bloqueo si los hubiera.
    if (u.intentosFallidos > 0 || u.bloqueadoHasta) {
      await db
        .update(usuario)
        .set({ intentosFallidos: 0, bloqueadoHasta: null })
        .where(eq(usuario.id, u.id))
    }
    return { tipo: 'ok', sesion: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol } }
  }

  // Fallo: incrementar el contador y bloquear si alcanzó el máximo.
  const intentos = u.intentosFallidos + 1
  if (intentos >= MAX_INTENTOS) {
    const hasta = new Date(ahora.getTime() + BLOQUEO_MINUTOS * 60_000)
    await db
      .update(usuario)
      .set({ intentosFallidos: 0, bloqueadoHasta: hasta.toISOString() })
      .where(eq(usuario.id, u.id))
    return {
      tipo: 'error',
      mensaje: `Demasiados intentos fallidos. Cuenta bloqueada por ${BLOQUEO_MINUTOS} minutos.`
    }
  }
  await db.update(usuario).set({ intentosFallidos: intentos }).where(eq(usuario.id, u.id))
  return { tipo: 'error', mensaje: MENSAJE_GENERICO }
}

/** Genera el hash de una contraseña (para alta/cambio de usuarios). */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10)
}
