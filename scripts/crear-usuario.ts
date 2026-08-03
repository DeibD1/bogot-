// Crea (o actualiza la contraseña de) un usuario.
// Uso: npm run usuario:crear -- "<nombre>" <email> <rol> <contraseña>
//   rol: lider_proyectos | compras_contratacion | presupuestos_control | lider_unidad
import { eq } from 'drizzle-orm'
import { crearConexion } from '../src/main/db/client'
import { aplicarEsquema } from '../src/main/db/ddl'
import { usuario } from '../src/main/db/schema'
import { ROLES, type Rol } from '../src/shared/dominio'
import { hashPassword, validarPoliticaPassword } from '../src/main/services/auth'

async function main(): Promise<void> {
  const [nombre, emailArg, rolArg, password] = process.argv.slice(2)
  if (!nombre || !emailArg || !rolArg || !password) {
    console.error('Uso: npm run usuario:crear -- "<nombre>" <email> <rol> <contraseña>')
    console.error(`Roles válidos: ${ROLES.join(' | ')}`)
    process.exit(1)
  }
  if (!(ROLES as readonly string[]).includes(rolArg)) {
    console.error(`Rol inválido: "${rolArg}". Roles válidos: ${ROLES.join(' | ')}`)
    process.exit(1)
  }
  try {
    validarPoliticaPassword(password)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
  const email = emailArg.trim().toLowerCase()
  const rol = rolArg as Rol

  const conexion = await crearConexion()
  const { db } = conexion
  try {
    await aplicarEsquema(conexion.ejecutar)
    const existentes = await db.select().from(usuario).where(eq(usuario.email, email))
    if (existentes[0]) {
      await db
        .update(usuario)
        .set({ nombre, rol, passwordHash: hashPassword(password), activo: true })
        .where(eq(usuario.email, email))
      console.log(`✓ Usuario ACTUALIZADO: ${nombre} <${email}> · rol: ${rol}`)
    } else {
      await db.insert(usuario).values({ nombre, email, rol, passwordHash: hashPassword(password) })
      console.log(`✓ Usuario CREADO: ${nombre} <${email}> · rol: ${rol}`)
    }
    console.log('  Ya puede iniciar sesión con ese correo y contraseña.')
  } finally {
    await conexion.cerrar()
  }
}

main().catch((e) => {
  console.error('✗ Error al crear usuario:', e)
  process.exit(1)
})
