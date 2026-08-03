// Aplica el esquema (idempotente) sobre el destino configurado:
//   - database.config.json / GESTOR_DB_URL  -> servidor PostgreSQL compartido
//   - sin configuración                     -> PGlite local (data/pgdata)
// Uso: npm run db:migrate
import { crearConexion } from '../src/main/db/client'
import { aplicarEsquema } from '../src/main/db/ddl'

async function main(): Promise<void> {
  const conexion = await crearConexion()
  try {
    await aplicarEsquema(conexion.ejecutar)
    const tablas = await conexion.consultar(
      `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    )
    console.log(`✓ Esquema aplicado en: ${conexion.destino} (modo ${conexion.modo})`)
    console.log(`  Tablas (${tablas.length}): ${tablas.map((t) => t.name).join(', ')}`)
  } finally {
    await conexion.cerrar()
  }
}

main().catch((e) => {
  console.error('✗ Error en migrate:', e)
  process.exit(1)
})
