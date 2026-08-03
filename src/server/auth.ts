// Autenticación web: login con JWT + segundo factor por correo (2FA),
// middleware que valida el token en cada petición y guard por rol.
// Reutiliza los servicios de autenticación ya existentes y probados.
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { usuario } from '../main/db/schema.js'
import { verificarCredenciales } from '../main/services/auth.js'
import { generarCodigo, registrarCodigo, verificarCodigo2fa } from '../main/services/dosfa.js'
import type { Rol } from '../shared/dominio.js'
import type { Credenciales, SesionUsuario } from '../shared/ipc.js'
import { JWT_EXPIRA, JWT_SECRET, SUPABASE_JWT_SECRET } from './config.js'
import { dosfaActivo, type Contexto } from './contexto.js'
import { asyncHandler, noAutenticado, prohibido } from './errors.js'

/** Firma un token JWT con los datos de la sesión. */
export function firmarToken(sesion: SesionUsuario): string {
  const payload = { id: sesion.id, nombre: sesion.nombre, email: sesion.email, rol: sesion.rol }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRA } as jwt.SignOptions)
}

/**
 * Resuelve la sesión a partir del token del encabezado Authorization.
 *  - Si hay SUPABASE_JWT_SECRET (producción): valida el token de Supabase Auth
 *    y cruza el correo con nuestra tabla `usuario` para obtener id/rol.
 *  - Si no (desarrollo local): valida nuestro propio JWT.
 */
async function resolverSesion(ctx: Contexto, token: string): Promise<SesionUsuario> {
  if (SUPABASE_JWT_SECRET) {
    let payload: jwt.JwtPayload
    try {
      payload = jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload
    } catch {
      throw noAutenticado('Sesión inválida o expirada')
    }
    const correo = String(payload.email ?? '').trim().toLowerCase()
    const filas = await ctx.conexion.db.select().from(usuario).where(eq(usuario.email, correo))
    const u = filas[0]
    if (!u || !u.activo) {
      throw prohibido('Usuario autenticado pero no habilitado en la aplicación. Contacta al administrador.')
    }
    return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol }
  }
  try {
    const p = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & SesionUsuario
    return { id: p.id, nombre: p.nombre, email: p.email, rol: p.rol }
  } catch {
    throw noAutenticado('Sesión inválida o expirada')
  }
}

/** Crea el middleware de autenticación (exige token válido y adjunta la sesión). */
export function crearMiddlewareAuth(ctx: Contexto): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const cabecera = req.header('authorization')
    const token = cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : null
    if (!token) {
      next(noAutenticado())
      return
    }
    resolverSesion(ctx, token)
      .then((s) => {
        req.sesion = s
        next()
      })
      .catch(next)
  }
}

/** Obtiene la sesión autenticada de la petición (o lanza 401). */
export function sesionDe(req: Request): SesionUsuario {
  if (!req.sesion) throw noAutenticado()
  return req.sesion
}

/** Guard de rol: exige que la sesión tenga alguno de los roles indicados. */
export function requiereRol(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const s = req.sesion
    if (!s) {
      next(noAutenticado())
      return
    }
    if (!roles.includes(s.rol)) {
      next(prohibido())
      return
    }
    next()
  }
}

function ofuscarCorreo(email: string): string {
  const [local, dominio] = email.split('@')
  if (!dominio) return email
  return `${(local ?? '').slice(0, 2)}***@${dominio}`
}

/** Rutas de autenticación (públicas: NO pasan por middlewareAuth). */
export function crearRutasAuth(ctx: Contexto): Router {
  const router = Router()

  // POST /api/auth/login  -> { estado:'ok', token, sesion } | { estado:'codigo_enviado', correo } | 401
  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const { email, password } = (req.body ?? {}) as Partial<Credenciales>
      const { db } = ctx.conexion
      const r = await verificarCredenciales(db, email ?? '', password ?? '')
      if (r.tipo === 'error') {
        res.status(401).json({ estado: 'error', mensaje: r.mensaje })
        return
      }
      if (!dosfaActivo(ctx)) {
        res.json({ estado: 'ok', token: firmarToken(r.sesion), sesion: r.sesion })
        return
      }
      // Segundo factor: enviar código al correo del usuario.
      const codigo = generarCodigo()
      registrarCodigo(r.sesion.email, codigo)
      ctx.pendientes2fa.set(r.sesion.email, r.sesion)
      try {
        await ctx.mailer!.enviar(
          r.sesion.email,
          'Código de verificación — Gestor de Ofertas',
          `Hola ${r.sesion.nombre}:\n\nTu código de verificación es: ${codigo}\n\nVence en 5 minutos. Si no intentaste iniciar sesión, ignora este correo.`
        )
      } catch (e) {
        console.error('Error enviando el código de verificación:', e)
        ctx.pendientes2fa.delete(r.sesion.email)
        res.status(500).json({
          estado: 'error',
          mensaje: 'No se pudo enviar el código de verificación al correo. Contacta al administrador.'
        })
        return
      }
      res.json({ estado: 'codigo_enviado', correo: ofuscarCorreo(r.sesion.email) })
    })
  )

  // POST /api/auth/verificar-codigo  -> { estado:'ok', token, sesion } | 401
  router.post(
    '/verificar-codigo',
    asyncHandler(async (req, res) => {
      const { email, codigo } = (req.body ?? {}) as { email?: string; codigo?: string }
      const correo = (email ?? '').trim().toLowerCase()
      const v = verificarCodigo2fa(correo, codigo ?? '')
      if (!v.ok) {
        res.status(401).json({ estado: 'error', mensaje: v.mensaje })
        return
      }
      const s = ctx.pendientes2fa.get(correo)
      if (!s) {
        res.status(401).json({ estado: 'error', mensaje: 'La verificación expiró. Vuelve a iniciar sesión.' })
        return
      }
      ctx.pendientes2fa.delete(correo)
      res.json({ estado: 'ok', token: firmarToken(s), sesion: s })
    })
  )

  return router
}
