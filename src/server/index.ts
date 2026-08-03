// Punto de entrada del SERVIDOR LOCAL (desarrollo / servidor propio).
// En Vercel no se usa este archivo: allí el entrypoint es api/index.ts.
// Se ejecuta con: npm run server[:dev].
import './tipos.js'
import type { Conexion } from '../main/db/client.js'
import { cargarFestivos } from '../main/services/calendario.js'
import { hoyLocalISO } from '../main/services/fechas.js'
import { generarAlertasVencimiento } from '../main/services/notificaciones.js'
import { crearApp } from './app.js'
import { crearContexto } from './bootstrap.js'
import { HOST, PUERTO } from './config.js'
import { dosfaActivo } from './contexto.js'

/** Barrido periódico de alertas de vencimiento/retraso (RF-27), solo en local. */
function programarAlertas(conexion: Conexion): void {
  const ejecutar = async (): Promise<void> => {
    try {
      const festivos = await cargarFestivos(conexion.db)
      await generarAlertasVencimiento(conexion.db, hoyLocalISO(), festivos)
    } catch (e) {
      console.error('Error generando alertas de vencimiento:', e)
    }
  }
  void ejecutar()
  setInterval(() => void ejecutar(), 30 * 60 * 1000)
}

async function main(): Promise<void> {
  const ctx = await crearContexto()
  const app = crearApp(ctx)
  programarAlertas(ctx.conexion)

  app.listen(PUERTO, HOST, () => {
    console.info(`Servidor Gestor de Ofertas escuchando en http://${HOST}:${PUERTO}`)
    console.info(`Base de datos: ${ctx.conexion.destino} (modo ${ctx.conexion.modo})`)
    console.info(`Seguridad: 2FA por correo ${dosfaActivo(ctx) ? 'ACTIVO' : 'inactivo (sin SMTP)'} · sesión por JWT`)
  })
}

main().catch((e) => {
  console.error('No se pudo iniciar el servidor:', e)
  process.exit(1)
})
