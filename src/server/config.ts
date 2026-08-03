// Configuración del servidor web. Se lee del entorno (.env) y, para SMTP/soporte,
// se reutiliza database.config.json a través de leerConfigApp.
import 'dotenv/config'
import { leerConfigApp, resolveDbDestino } from '../main/db/path.js'

/** Puerto de escucha (por defecto 3000). */
export const PUERTO = Number(process.env.PORT ?? 3000)

/** Interfaz de escucha: 0.0.0.0 = acepta conexiones de la LAN (no solo localhost). */
export const HOST = process.env.HOST ?? '0.0.0.0'

/** Destino de la base de datos (URL de PostgreSQL vía GESTOR_DB_URL o config). */
export const DB_DESTINO = resolveDbDestino(process.cwd())

/** Configuración de aplicación (SMTP, seguridad, correo de soporte). */
export const CONFIG_APP = leerConfigApp(process.cwd())

/** Vigencia del token de sesión (JWT). */
export const JWT_EXPIRA = process.env.JWT_EXPIRA ?? '8h'

const secretoEnv = process.env.JWT_SECRET
if (!secretoEnv) {
  console.warn(
    '[seguridad] JWT_SECRET no está definido. Se usa un secreto de DESARROLLO; ' +
      'defínelo en el entorno (.env) antes de producción.'
  )
}
/** Secreto para firmar/verificar los JWT. */
export const JWT_SECRET = secretoEnv ?? 'dev-secreto-no-usar-en-produccion'

// --- Supabase (producción) -------------------------------------------------
/** URL del proyecto Supabase (https://xxxx.supabase.co). */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
/** Clave de servicio (secreta, solo backend) para Storage/administración. */
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
/**
 * Secreto JWT del proyecto Supabase (Settings → API → JWT Secret). Si está
 * definido, el backend valida los tokens emitidos por Supabase Auth. Si NO
 * está definido (desarrollo local), se usa nuestro JWT propio (JWT_SECRET).
 */
export const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? ''
/** Bucket de Supabase Storage para los adjuntos (Fase 4). */
export const SUPABASE_BUCKET_ADJUNTOS = process.env.SUPABASE_BUCKET_ADJUNTOS ?? 'adjuntos'

/** Secreto para autorizar la tarea programada (Vercel Cron) de alertas. */
export const CRON_SECRET = process.env.CRON_SECRET ?? ''
