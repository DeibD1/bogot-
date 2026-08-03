// =============================================================================
//  Administración de usuarios (RF-11): crear profesionales, asignar perfil,
//  cambiar contraseñas y activar/desactivar. Reservado al líder de la unidad.
//  Se desactiva (no se borra) para conservar el histórico de indicadores.
// =============================================================================
import { count, eq } from 'drizzle-orm'
import type { DB } from '../db/client.js'
import { usuario } from '../db/schema.js'
import { ROLES, type Rol } from '../../shared/dominio.js'
import { esLiderUnidad } from '../../shared/permisos.js'
import type { SesionUsuario, UsuarioAdmin } from '../../shared/ipc.js'
import { hashPassword, validarPoliticaPassword } from './auth.js'

function exigirLider(sesion: SesionUsuario): void {
  if (!esLiderUnidad(sesion.rol)) {
    throw new Error('Solo el líder de la unidad puede administrar usuarios')
  }
}

function validarRol(rol: string): asserts rol is Rol {
  if (!(ROLES as readonly string[]).includes(rol)) {
    throw new Error(`Rol inválido: "${rol}"`)
  }
}

function normalizarEmail(email: string): string {
  const e = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+$/.test(e)) throw new Error('Correo electrónico inválido')
  return e
}

// Política: ≥8 caracteres, con letra, número y carácter especial (ver auth.ts).
const validarPassword = validarPoliticaPassword

export async function listarUsuarios(db: DB, sesion: SesionUsuario): Promise<UsuarioAdmin[]> {
  exigirLider(sesion)
  const filas = await db
    .select({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      activo: usuario.activo
    })
    .from(usuario)
  const ordenRol = new Map(ROLES.map((r, i) => [r, i]))
  return filas.sort(
    (a, b) => ordenRol.get(a.rol)! - ordenRol.get(b.rol)! || a.nombre.localeCompare(b.nombre)
  )
}

export interface DatosNuevoUsuario {
  nombre: string
  email: string
  rol: Rol
  password: string
}

export async function crearUsuario(db: DB, datos: DatosNuevoUsuario, sesion: SesionUsuario): Promise<void> {
  exigirLider(sesion)
  const nombre = datos.nombre.trim()
  if (!nombre) throw new Error('El nombre es obligatorio')
  validarRol(datos.rol)
  validarPassword(datos.password)
  const email = normalizarEmail(datos.email)

  const existentes = await db
    .select({ n: count() })
    .from(usuario)
    .where(eq(usuario.email, email))
  if (existentes[0]!.n > 0) {
    throw new Error(`Ya existe un usuario con el correo ${email}`)
  }

  await db.insert(usuario).values({
    nombre,
    email,
    rol: datos.rol,
    passwordHash: hashPassword(datos.password)
  })
}

export interface CambiosUsuario {
  usuarioId: number
  nombre?: string
  rol?: Rol
  /** Si se indica, cambia la contraseña. */
  password?: string
  activo?: boolean
}

export async function actualizarUsuario(db: DB, cambios: CambiosUsuario, sesion: SesionUsuario): Promise<void> {
  exigirLider(sesion)
  const filas = await db.select().from(usuario).where(eq(usuario.id, cambios.usuarioId))
  const u = filas[0]
  if (!u) throw new Error(`El usuario ${cambios.usuarioId} no existe`)

  // Salvaguardas: el líder no puede bloquearse a sí mismo.
  if (cambios.usuarioId === sesion.id) {
    if (cambios.activo === false) throw new Error('No puedes desactivar tu propio usuario')
    if (cambios.rol && cambios.rol !== u.rol) throw new Error('No puedes cambiar tu propio rol')
  }

  const set: Partial<typeof usuario.$inferInsert> = {}
  if (cambios.nombre !== undefined) {
    const nombre = cambios.nombre.trim()
    if (!nombre) throw new Error('El nombre no puede quedar vacío')
    set.nombre = nombre
  }
  if (cambios.rol !== undefined) {
    validarRol(cambios.rol)
    set.rol = cambios.rol
  }
  if (cambios.password !== undefined && cambios.password !== '') {
    validarPassword(cambios.password)
    set.passwordHash = hashPassword(cambios.password)
  }
  if (cambios.activo !== undefined) set.activo = cambios.activo

  if (Object.keys(set).length === 0) return
  await db.update(usuario).set(set).where(eq(usuario.id, cambios.usuarioId))
}
