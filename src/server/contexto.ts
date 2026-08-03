// Contexto compartido de la aplicación: se crea una vez al arrancar el servidor
// y se pasa a los registradores de rutas.
import type { Conexion } from '../main/db/client.js'
import type { ConfigApp } from '../main/db/path.js'
import type { Mailer } from '../main/services/mailer.js'
import type { SesionUsuario } from '../shared/ipc.js'

export interface Contexto {
  conexion: Conexion
  mailer: Mailer | null
  config: ConfigApp
  /** Sesiones validadas por contraseña que esperan el código 2FA (email -> sesión). */
  pendientes2fa: Map<string, SesionUsuario>
}

/** ¿El segundo factor por correo está activo? (hay SMTP y no está desactivado). */
export function dosfaActivo(ctx: Contexto): boolean {
  return ctx.mailer !== null && ctx.config.seguridad?.requiere2fa !== false
}
