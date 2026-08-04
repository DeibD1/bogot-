// Construcción del contexto de la aplicación (conexión, esquema, mailer).
// Compartido entre el servidor local (index.ts) y las funciones serverless de
// Vercel (api/index.ts), para no duplicar la inicialización.
import { count } from 'drizzle-orm'
import { crearConexion } from '../main/db/client.js'
import { aplicarEsquema } from '../main/db/ddl.js'
import { usuario } from '../main/db/schema.js'
import { hashPassword } from '../main/services/auth.js'
import { crearMailer } from '../main/services/mailer.js'
import { registrarMailer } from '../main/services/notificaciones.js'
import type { DB } from '../main/db/client.js'
import { CONFIG_APP, DB_DESTINO } from './config.js'
import type { Contexto } from './contexto.js'

/**
 * Bootstrap de primer uso: si no hay NINGÚN usuario, crea un líder de la unidad
 * inicial (admin@local / Admin#2026) para poder entrar y dar de alta al resto.
 * En producción con Supabase Auth, este usuario también debe existir en Supabase
 * (mismo correo) para poder iniciar sesión.
 */
export async function asegurarUsuarioInicial(db: DB): Promise<void> {
  const n = (await db.select({ n: count() }).from(usuario))[0]!.n
  if (n === 0) {
    await db.insert(usuario).values({
      nombre: 'Administrador',
      email: 'admin@local',
      rol: 'lider_unidad',
      passwordHash: hashPassword('Admin#2026')
    })
    console.info('Usuario inicial creado: admin@local / Admin#2026')
  }
}

/** Crea el contexto de la app: abre la BD, aplica el esquema y prepara el mailer. */
export async function crearContexto(): Promise<Contexto> {
  const conexion = await crearConexion(DB_DESTINO)
  await aplicarEsquema(conexion.ejecutar) // idempotente
  await asegurarUsuarioInicial(conexion.db)
  const mailer = crearMailer(CONFIG_APP)
  registrarMailer(mailer)
  return { conexion, mailer, config: CONFIG_APP, pendientes2fa: new Map() }
}
