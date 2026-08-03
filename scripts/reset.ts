// Reinicia la base de datos: elimina todas las tablas y tipos del esquema y lo
// vuelve a crear vacío. Funciona igual en PostgreSQL y en PGlite local.
// Para repoblar, ejecutar luego `npm run db:seed`.
import { crearConexion } from '../src/main/db/client'
import { aplicarEsquema } from '../src/main/db/ddl'

const DROP_TODO = `
DROP TABLE IF EXISTS notificacion, reasignacion, adjunto, tarea, tramo, oferta, festivo, usuario CASCADE;
DROP TYPE IF EXISTS rol_usuario, tamano_oferta, estado_oferta, tipo_tarea, estado_tarea, estado_tramo, tipo_notificacion CASCADE;
`

async function main(): Promise<void> {
  const conexion = await crearConexion()
  try {
    await conexion.ejecutar(DROP_TODO)
    await aplicarEsquema(conexion.ejecutar)
    console.log(`✓ Base de datos reiniciada (esquema vacío) en: ${conexion.destino}`)
  } finally {
    await conexion.cerrar()
  }
}

main().catch((e) => {
  console.error('✗ Error en reset:', e)
  process.exit(1)
})
