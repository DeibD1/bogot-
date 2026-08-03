// Manejo de errores y convención de códigos HTTP (solicitud de Tecnología).
//   200/201 -> OK            (respuesta normal de cada endpoint)
//   400     -> Datos inválidos / violación de regla de negocio
//   401     -> No autenticado (sin token o token inválido/expirado)
//   403     -> Autenticado pero sin permiso para la operación (rol)
//   404     -> Recurso o ruta no encontrada
//   500     -> Error inesperado del servidor
import type { NextFunction, Request, RequestHandler, Response } from 'express'

/** Error con código HTTP explícito, lanzado deliberadamente por la API. */
export class ErrorHttp extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string
  ) {
    super(mensaje)
    this.name = 'ErrorHttp'
  }
}

export const noAutenticado = (m = 'No hay sesión activa'): ErrorHttp => new ErrorHttp(401, m)
export const prohibido = (m = 'No tiene permiso para esta operación'): ErrorHttp => new ErrorHttp(403, m)
export const noEncontrado = (m = 'Recurso no encontrado'): ErrorHttp => new ErrorHttp(404, m)
export const datosInvalidos = (m = 'Datos inválidos'): ErrorHttp => new ErrorHttp(400, m)

/** Envuelve un handler async y reenvía cualquier error al middleware central. */
export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next)
  }
}

/**
 * Middleware central de errores: traduce excepciones a códigos HTTP.
 * - `ErrorHttp` -> usa su código.
 * - Cualquier otro `Error`: en este código los servicios lanzan `Error` con
 *   mensajes de regla de negocio pensados para el usuario -> 400. El error
 *   completo se registra en el servidor para diagnóstico.
 */
export function middlewareErrores(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ErrorHttp) {
    res.status(err.estado).json({ error: err.message })
    return
  }
  console.error('[error]', err)
  const mensaje = err instanceof Error ? err.message : 'Error interno del servidor'
  res.status(400).json({ error: mensaje })
}

/** 404 para rutas de la API no registradas. */
export function middlewareNoEncontrado(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Ruta no encontrada' })
}
