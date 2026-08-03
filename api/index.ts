// Punto de entrada SERVERLESS para Vercel. Vercel expone este archivo como una
// función en /api/*. Reutiliza exactamente la misma app Express que el servidor
// local, cacheando el contexto entre invocaciones "en caliente" (warm start).
import '../src/server/tipos.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Express } from 'express'
import { crearApp } from '../src/server/app.js'
import { crearContexto } from '../src/server/bootstrap.js'

let appPromesa: Promise<Express> | null = null

function obtenerApp(): Promise<Express> {
  if (!appPromesa) {
    appPromesa = crearContexto()
      .then(crearApp)
      .catch((e) => {
        appPromesa = null // permite reintentar en la siguiente invocación
        throw e
      })
  }
  return appPromesa
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await obtenerApp()
  app(req as never, res as never)
}
