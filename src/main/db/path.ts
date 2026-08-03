import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Configuración de la aplicación (database.config.json). */
export interface ConfigApp {
  /** URL de PostgreSQL (multiusuario) o vacío (modo local PGlite). */
  url?: string
  /** SMTP para el código de verificación por correo (2FA). */
  smtp?: {
    host: string
    port: number
    user: string
    pass: string
    from?: string
  }
  seguridad?: {
    /** Minutos de inactividad antes de cerrar la sesión (defecto: 15). */
    inactividadMinutos?: number
    /** Exigir código de verificación por correo al iniciar sesión (defecto: true si hay SMTP). */
    requiere2fa?: boolean
  }
  /** Correo del administrador del software (recibe los reportes de soporte). */
  soporteEmail?: string
}

/** Lee database.config.json desde configDir (objeto vacío si no existe o es inválido). */
export function leerConfigApp(configDir: string = process.cwd()): ConfigApp {
  const archivo = resolve(configDir, 'database.config.json')
  if (!existsSync(archivo)) return {}
  try {
    return JSON.parse(readFileSync(archivo, 'utf8')) as ConfigApp
  } catch (e) {
    console.error(`database.config.json inválido (${archivo}); se ignora.`, e)
    return {}
  }
}

/**
 * Destino de la base de datos. Puede ser:
 *  - Una URL de PostgreSQL (`postgres://usuario:clave@servidor:5432/bd`):
 *    modo MULTIUSUARIO — todas las instalaciones comparten los datos.
 *  - Una ruta de carpeta local: modo LOCAL con Postgres embebido (PGlite),
 *    sin servidor (demo / desarrollo / un solo equipo).
 *
 * Prioridad:
 *  1. Variable de entorno `GESTOR_DB_URL`.
 *  2. Archivo `database.config.json` (clave "url") en `configDir`
 *     (raíz del proyecto en desarrollo; carpeta userData en producción).
 *  3. Carpeta local `data/pgdata` dentro de `configDir`.
 */
export function resolveDbDestino(configDir: string = process.cwd()): string {
  const desdeEnv = process.env.GESTOR_DB_URL
  if (desdeEnv && desdeEnv.trim().length > 0) return desdeEnv.trim()

  const config = leerConfigApp(configDir)
  if (config.url && config.url.trim().length > 0) return config.url.trim()

  return resolve(configDir, 'data', 'pgdata')
}

/** ¿El destino es un servidor PostgreSQL? */
export function esUrlPostgres(destino: string): boolean {
  return destino.startsWith('postgres://') || destino.startsWith('postgresql://')
}
