// Construye la aplicación Express (middleware + rutas), SIN ponerse a escuchar.
// Así la usan igual el servidor local (index.ts, con app.listen) y las
// funciones serverless de Vercel (api/index.ts, exportando el handler).
import cors from 'cors'
import express, { type Express } from 'express'
import { cargarFestivos } from '../main/services/calendario'
import { hoyLocalISO } from '../main/services/fechas'
import { generarAlertasVencimiento } from '../main/services/notificaciones'
import { crearMiddlewareAuth, crearRutasAuth } from './auth'
import { CRON_SECRET } from './config'
import type { Contexto } from './contexto'
import { asyncHandler, middlewareErrores, middlewareNoEncontrado, prohibido } from './errors'
import { crearRutasApi } from './rutas'

export function crearApp(ctx: Contexto): Express {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '6mb' })) // el pantallazo de soporte viaja como data URL

  // Salud/diagnóstico (público).
  app.get('/api/salud', (_req, res) => {
    res.json({ ok: true, destino: ctx.conexion.destino, modo: ctx.conexion.modo })
  })

  // Tarea programada de alertas (RF-27), invocada por Vercel Cron.
  // Reemplaza al temporizador del servidor local en el entorno serverless.
  app.post(
    '/api/cron/alertas',
    asyncHandler(async (req, res) => {
      // Vercel Cron envía Authorization: Bearer <CRON_SECRET> cuando la var existe.
      if (CRON_SECRET && req.header('authorization') !== `Bearer ${CRON_SECRET}`) {
        throw prohibido('Tarea programada no autorizada')
      }
      const festivos = await cargarFestivos(ctx.conexion.db)
      await generarAlertasVencimiento(ctx.conexion.db, hoyLocalISO(), festivos)
      res.json({ ok: true })
    })
  )

  app.use('/api/auth', crearRutasAuth(ctx)) // login local (público; en prod lo hace Supabase)
  app.use('/api', crearMiddlewareAuth(ctx), crearRutasApi(ctx)) // resto: exige token válido
  app.use('/api', middlewareNoEncontrado) // 404 para /api/* no registrado
  app.use(middlewareErrores) // traduce errores a códigos HTTP

  return app
}
