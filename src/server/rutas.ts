// Rutas de negocio de la API. Cada endpoint reutiliza los servicios ya
// existentes (los mismos que usaba el proceso principal de Electron), pero
// tomando la identidad del usuario desde el JWT (sesionDe) en lugar de una
// sesión global. Todas pasan por middlewareAuth (montado en index.ts).
import express, { Router, type Request } from 'express'
import { eq } from 'drizzle-orm'
import { soporte as soporteTabla, usuario } from '../main/db/schema'
import {
  datosTramo,
  listarAdjuntosOferta,
  obtenerAdjunto,
  registrarAdjunto
} from '../main/services/adjuntos'
import {
  aprobarOferta,
  entregarCorreccion,
  listarCorrecciones,
  listarPendientesAprobacion,
  rechazarOferta
} from '../main/services/aprobacion'
import { cargarFestivos } from '../main/services/calendario'
import {
  idsOfertasVisibles,
  obtenerAgenda,
  obtenerCalendarioUnidad,
  obtenerDetalleOferta,
  obtenerEstadisticas,
  obtenerLineaTiempo,
  obtenerMisTramos,
  obtenerResumenOfertas
} from '../main/services/consultas'
import { cargarDatosDemostracion } from '../main/services/demo'
import { deshacerAprobacion, deshacerCompletarTarea } from '../main/services/deshacer'
import { hoyLocalISO } from '../main/services/fechas'
import { obtenerIndicadores } from '../main/services/indicadores-consultas'
import {
  contarNoLeidas,
  generarAlertasVencimiento,
  listarNotificaciones,
  marcarTodasLeidas
} from '../main/services/notificaciones'
import { crearOferta } from '../main/services/ofertas'
import { reasignarTramo } from '../main/services/reasignacion'
import {
  crearReporteSoporte,
  listarMisReportes,
  listarReportesSoporte,
  marcarReporteAtendido,
  responderReporteSoporte
} from '../main/services/soporte'
import { crearSubtarea, eliminarSubtarea, marcarSubtarea } from '../main/services/subtareas'
import { completarTarea } from '../main/services/tareas'
import { actualizarUsuario, crearUsuario, listarUsuarios } from '../main/services/usuarios'
import { ROLES, type Rol } from '../shared/dominio'
import { puedeCrearOfertas } from '../shared/permisos'
import type {
  SesionUsuario,
  ActualizarUsuarioInput,
  CandidatosPorRol,
  FiltroIndicadores,
  MotivoRechazoInput,
  NuevaOfertaInput,
  NuevoUsuarioInput
} from '../shared/ipc'
import {
  construirRuta,
  MAX_ADJUNTO_BYTES,
  nombreSeguro,
  rutaValidaParaTramo
} from './archivos'
import {
  existeArchivo,
  guardarLocal,
  modoAlmacenamiento,
  prepararSubida,
  rutaLocal,
  urlDescarga
} from './almacenamiento'
import { sesionDe } from './auth'
import { type Contexto } from './contexto'
import { asyncHandler, datosInvalidos, noEncontrado, prohibido } from './errors'

/** Entero de query con valor por defecto y recorte a [min, max]. */
function entero(valor: unknown, porDefecto: number, min: number, max: number): number {
  const n = Math.trunc(Number(valor))
  return Math.min(Math.max(Number.isFinite(n) && n !== 0 ? n : porDefecto, min), max)
}

/** Parámetro de ruta entero (o lanza 400). */
function idDe(req: Request, nombre = 'id'): number {
  const n = Number(req.params[nombre])
  if (!Number.isInteger(n)) throw datosInvalidos(`Parámetro «${nombre}» inválido`)
  return n
}

export function crearRutasApi(ctx: Contexto): Router {
  const router = Router()
  const festivosDe = () => cargarFestivos(ctx.conexion.db)

  // --- Sesión ---------------------------------------------------------------
  router.get(
    '/sesion',
    asyncHandler(async (req, res) => {
      res.json(sesionDe(req))
    })
  )

  // --- Dashboard / consultas (con alcance por rol) --------------------------
  router.get(
    '/estadisticas',
    asyncHandler(async (req, res) => {
      const { db, destino } = ctx.conexion
      res.json(await obtenerEstadisticas(db, sesionDe(req), destino))
    })
  )

  router.get(
    '/ofertas/resumen',
    asyncHandler(async (req, res) => {
      res.json(await obtenerResumenOfertas(ctx.conexion.db, sesionDe(req)))
    })
  )

  // --- Creación de ofertas (EXCLUSIVA del líder comercial) ------------------
  router.get(
    '/ofertas/candidatos',
    asyncHandler(async (req, res) => {
      const { db } = ctx.conexion
      if (!puedeCrearOfertas(sesionDe(req).rol)) throw prohibido('Solo el líder comercial puede crear ofertas')
      const activos = await db
        .select({ id: usuario.id, nombre: usuario.nombre, rol: usuario.rol })
        .from(usuario)
        .where(eq(usuario.activo, true))
      const porRol = Object.fromEntries(
        ROLES.map((r) => [r, [] as { id: number; nombre: string }[]])
      ) as CandidatosPorRol
      for (const u of activos) porRol[u.rol as Rol].push({ id: u.id, nombre: u.nombre })
      res.json(porRol)
    })
  )

  router.post(
    '/ofertas',
    asyncHandler(async (req, res) => {
      const { db } = ctx.conexion
      const sesion = sesionDe(req)
      if (!puedeCrearOfertas(sesion.rol)) throw prohibido('Solo el líder comercial puede crear ofertas')
      const datos = req.body as NuevaOfertaInput
      const festivos = await festivosDe()
      const id = await crearOferta(db, {
        cliente: datos.cliente,
        tamano: datos.tamano,
        fechaInicio: datos.fechaInicio,
        duracionSocializacion: datos.duracionSocializacion,
        responsables: datos.responsables,
        creadoPor: sesion.id,
        festivos
      })
      res.status(201).json({ id })
    })
  )

  // --- Vistas del profesional ----------------------------------------------
  router.get(
    '/mis-tramos',
    asyncHandler(async (req, res) => {
      const { db } = ctx.conexion
      res.json(await obtenerMisTramos(db, sesionDe(req), hoyLocalISO(), await festivosDe()))
    })
  )

  router.get(
    '/agenda',
    asyncHandler(async (req, res) => {
      const { db } = ctx.conexion
      const n = entero(req.query.dias, 14, 1, 60)
      res.json(await obtenerAgenda(db, sesionDe(req), hoyLocalISO(), n, await festivosDe()))
    })
  )

  router.post(
    '/tareas/:id/completar',
    asyncHandler(async (req, res) => {
      const { db } = ctx.conexion
      const festivos = await festivosDe()
      res.json(await completarTarea(db, idDe(req), hoyLocalISO(), festivos, sesionDe(req).id))
    })
  )

  router.post(
    '/tareas/:id/deshacer',
    asyncHandler(async (req, res) => {
      await deshacerCompletarTarea(ctx.conexion.db, idDe(req), sesionDe(req))
      res.status(204).end()
    })
  )

  router.post(
    '/ofertas/:id/deshacer-aprobacion',
    asyncHandler(async (req, res) => {
      await deshacerAprobacion(ctx.conexion.db, idDe(req), sesionDe(req))
      res.status(204).end()
    })
  )

  // --- Subtareas ------------------------------------------------------------
  router.post(
    '/tareas/:id/subtareas',
    asyncHandler(async (req, res) => {
      const { descripcion } = (req.body ?? {}) as { descripcion?: string }
      await crearSubtarea(ctx.conexion.db, idDe(req), descripcion ?? '', sesionDe(req))
      res.status(201).end()
    })
  )

  router.patch(
    '/subtareas/:id',
    asyncHandler(async (req, res) => {
      const { completada } = (req.body ?? {}) as { completada?: boolean }
      await marcarSubtarea(ctx.conexion.db, idDe(req), Boolean(completada), sesionDe(req))
      res.status(204).end()
    })
  )

  router.delete(
    '/subtareas/:id',
    asyncHandler(async (req, res) => {
      await eliminarSubtarea(ctx.conexion.db, idDe(req), sesionDe(req))
      res.status(204).end()
    })
  )

  // --- Adjuntos (RF-10) -----------------------------------------------------
  /** Solo participantes de la oferta (o vista global de lectura) acceden a sus archivos (RNF-06). */
  const exigirVisibilidad = async (ofertaId: number, sesion: SesionUsuario): Promise<void> => {
    const visibles = await idsOfertasVisibles(ctx.conexion.db, sesion)
    if (visibles !== 'todas' && !visibles.includes(ofertaId)) throw prohibido('No tienes acceso a esta oferta')
  }

  router.get(
    '/ofertas/:id/adjuntos',
    asyncHandler(async (req, res) => {
      const ofertaId = idDe(req)
      await exigirVisibilidad(ofertaId, sesionDe(req))
      res.json(await listarAdjuntosOferta(ctx.conexion.db, ofertaId))
    })
  )

  /** Paso 1: el responsable pide dónde subir el archivo (valida permiso, nombre y tamaño). */
  router.post(
    '/tramos/:id/adjuntos/solicitar',
    asyncHandler(async (req, res) => {
      const sesion = sesionDe(req)
      const tramoId = idDe(req)
      const { nombre, tamano } = (req.body ?? {}) as { nombre?: string; tamano?: number }
      const t = await datosTramo(ctx.conexion.db, tramoId)
      if (!t) throw noEncontrado('El tramo no existe')
      if (t.responsableId !== sesion.id) throw prohibido('Solo el responsable del tramo puede adjuntar archivos')
      if (!nombre?.trim()) throw datosInvalidos('El archivo no tiene nombre')
      if (!Number.isFinite(tamano) || (tamano ?? 0) <= 0) throw datosInvalidos('El archivo está vacío')
      if ((tamano ?? 0) > MAX_ADJUNTO_BYTES) {
        throw datosInvalidos(`El archivo supera el máximo de ${MAX_ADJUNTO_BYTES / 1024 / 1024} MB`)
      }
      const ruta = construirRuta(t.ofertaId, tramoId, nombre)
      const destino = await prepararSubida(ruta, `/tramos/${tramoId}/adjuntos/local?ruta=${encodeURIComponent(ruta)}`)
      res.json({ ...destino, ruta })
    })
  )

  /** Paso 2 (solo modo local): el archivo pasa por la API y se guarda en disco. */
  router.put(
    '/tramos/:id/adjuntos/local',
    express.raw({ type: () => true, limit: MAX_ADJUNTO_BYTES }),
    asyncHandler(async (req, res) => {
      if (modoAlmacenamiento() !== 'local') throw datosInvalidos('Subida local no habilitada')
      const sesion = sesionDe(req)
      const tramoId = idDe(req)
      const t = await datosTramo(ctx.conexion.db, tramoId)
      if (!t) throw noEncontrado('El tramo no existe')
      if (t.responsableId !== sesion.id) throw prohibido('Solo el responsable del tramo puede adjuntar archivos')
      const ruta = String(req.query.ruta ?? '')
      if (!rutaValidaParaTramo(ruta, t.ofertaId, tramoId)) throw datosInvalidos('Ruta de archivo inválida')
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw datosInvalidos('El archivo está vacío')
      await guardarLocal(ruta, req.body)
      res.status(204).end()
    })
  )

  /** Paso 3: confirmar la subida → se verifica que el objeto exista y se registra en la BD. */
  router.post(
    '/tramos/:id/adjuntos',
    asyncHandler(async (req, res) => {
      const { db } = ctx.conexion
      const sesion = sesionDe(req)
      const tramoId = idDe(req)
      const { ruta, nombre, tipo } = (req.body ?? {}) as { ruta?: string; nombre?: string; tipo?: string }
      const t = await datosTramo(db, tramoId)
      if (!t) throw noEncontrado('El tramo no existe')
      if (!ruta || !rutaValidaParaTramo(ruta, t.ofertaId, tramoId)) throw datosInvalidos('Ruta de archivo inválida')
      if (!(await existeArchivo(ruta))) throw datosInvalidos('El archivo no llegó al almacenamiento. Intenta de nuevo.')
      await registrarAdjunto(db, {
        tramoId,
        tipo: (tipo ?? 'documento').slice(0, 50),
        nombre: (nombre?.trim() || nombreSeguro(ruta)).slice(0, 255),
        ruta,
        subidoPor: sesion.id // registrarAdjunto vuelve a exigir que sea el responsable
      })
      res.status(201).json(await listarAdjuntosOferta(db, t.ofertaId))
    })
  )

  /** Enlace de descarga: URL firmada (Supabase) o endpoint autenticado de la API (local). */
  router.get(
    '/adjuntos/:id/enlace',
    asyncHandler(async (req, res) => {
      const id = idDe(req)
      const a = await obtenerAdjunto(ctx.conexion.db, id)
      if (!a?.ruta) throw noEncontrado('El adjunto no existe o no tiene archivo')
      await exigirVisibilidad(a.ofertaId, sesionDe(req))
      if (modoAlmacenamiento() === 'supabase') {
        res.json({ modo: 'supabase', url: await urlDescarga(a.ruta) })
      } else {
        res.json({ modo: 'local', url: `/adjuntos/${id}/archivo` })
      }
    })
  )

  router.get(
    '/adjuntos/:id/archivo',
    asyncHandler(async (req, res) => {
      if (modoAlmacenamiento() !== 'local') throw noEncontrado()
      const a = await obtenerAdjunto(ctx.conexion.db, idDe(req))
      if (!a?.ruta) throw noEncontrado('El adjunto no existe o no tiene archivo')
      await exigirVisibilidad(a.ofertaId, sesionDe(req))
      res.download(rutaLocal(a.ruta), a.nombre)
    })
  )

  // --- Aprobación final -----------------------------------------------------
  router.get(
    '/aprobacion/pendientes',
    asyncHandler(async (req, res) => {
      sesionDe(req)
      res.json(await listarPendientesAprobacion(ctx.conexion.db, hoyLocalISO(), await festivosDe()))
    })
  )

  router.post(
    '/ofertas/:id/aprobar',
    asyncHandler(async (req, res) => {
      const festivos = await festivosDe()
      await aprobarOferta(ctx.conexion.db, idDe(req), hoyLocalISO(), festivos, sesionDe(req))
      res.status(204).end()
    })
  )

  router.post(
    '/ofertas/:id/rechazar',
    asyncHandler(async (req, res) => {
      const { motivos } = (req.body ?? {}) as { motivos?: MotivoRechazoInput[] }
      await rechazarOferta(ctx.conexion.db, idDe(req), motivos ?? [], hoyLocalISO(), sesionDe(req))
      res.status(204).end()
    })
  )

  router.get(
    '/correcciones',
    asyncHandler(async (req, res) => {
      const sesion = sesionDe(req)
      // El líder de la unidad ve todas las correcciones; el profesional, las suyas.
      res.json(await listarCorrecciones(ctx.conexion.db, sesion.rol === 'lider_unidad' ? null : sesion.id))
    })
  )

  router.post(
    '/ofertas/:id/entregar-correccion',
    asyncHandler(async (req, res) => {
      const festivos = await festivosDe()
      await entregarCorreccion(ctx.conexion.db, idDe(req), hoyLocalISO(), festivos, sesionDe(req))
      res.status(204).end()
    })
  )

  // --- Dashboard de indicadores (visible para todos los roles) --------------
  router.get(
    '/indicadores',
    asyncHandler(async (req, res) => {
      sesionDe(req)
      const q = req.query
      const filtro: FiltroIndicadores = {
        desde: typeof q.desde === 'string' ? q.desde : undefined,
        hasta: typeof q.hasta === 'string' ? q.hasta : undefined,
        tamano: typeof q.tamano === 'string' ? (q.tamano as FiltroIndicadores['tamano']) : undefined
      }
      res.json(await obtenerIndicadores(ctx.conexion.db, filtro))
    })
  )

  // --- Línea de tiempo por profesional --------------------------------------
  router.get(
    '/linea-tiempo',
    asyncHandler(async (req, res) => {
      const atras = entero(req.query.atras, 7, 0, 60)
      const adelante = entero(req.query.adelante, 14, 1, 90)
      res.json(
        await obtenerLineaTiempo(ctx.conexion.db, sesionDe(req), hoyLocalISO(), await festivosDe(), atras, adelante)
      )
    })
  )

  // --- Calendario general de la unidad --------------------------------------
  router.get(
    '/calendario-unidad',
    asyncHandler(async (req, res) => {
      const n = entero(req.query.dias, 14, 1, 60)
      res.json(await obtenerCalendarioUnidad(ctx.conexion.db, sesionDe(req), hoyLocalISO(), n, await festivosDe()))
    })
  )

  // --- Detalle de oferta (drill-down) ---------------------------------------
  router.get(
    '/ofertas/:id/detalle',
    asyncHandler(async (req, res) => {
      const festivos = await festivosDe()
      res.json(await obtenerDetalleOferta(ctx.conexion.db, idDe(req), sesionDe(req), hoyLocalISO(), festivos))
    })
  )

  // --- Notificaciones -------------------------------------------------------
  router.get(
    '/notificaciones',
    asyncHandler(async (req, res) => {
      const { db } = ctx.conexion
      const sesion = sesionDe(req)
      const festivos = await festivosDe()
      await generarAlertasVencimiento(db, hoyLocalISO(), festivos) // barrido bajo demanda
      res.json(await listarNotificaciones(db, sesion.id))
    })
  )

  router.get(
    '/notificaciones/no-leidas',
    asyncHandler(async (req, res) => {
      res.json({ total: await contarNoLeidas(ctx.conexion.db, sesionDe(req).id) })
    })
  )

  router.post(
    '/notificaciones/marcar-leidas',
    asyncHandler(async (req, res) => {
      await marcarTodasLeidas(ctx.conexion.db, sesionDe(req).id)
      res.status(204).end()
    })
  )

  // --- Soporte técnico ------------------------------------------------------
  router.post(
    '/soporte',
    asyncHandler(async (req, res) => {
      const { db } = ctx.conexion
      const sesion = sesionDe(req)
      const { descripcion, captura } = (req.body ?? {}) as { descripcion?: string; captura?: string | null }
      const reporteId = await crearReporteSoporte(db, { descripcion: descripcion ?? '', captura: captura ?? null }, sesion)

      // Correo al administrador del software (mejor esfuerzo, si hay SMTP).
      if (ctx.mailer) {
        try {
          const lideres = ctx.config.soporteEmail
            ? [ctx.config.soporteEmail]
            : (await db.select({ email: usuario.email, rol: usuario.rol, activo: usuario.activo }).from(usuario))
                .filter((u) => u.rol === 'lider_unidad' && u.activo)
                .map((u) => u.email)
          for (const para of lideres) {
            await ctx.mailer.enviar(
              para,
              `Soporte técnico — reporte #${reporteId} (Gestor de Ofertas)`,
              `Reporte de ${sesion.nombre} <${sesion.email}>:\n\n${descripcion ?? ''}\n\n${captura ? 'Incluye pantallazo: revisarlo en la pestaña Soporte.' : 'Sin pantallazo.'}`
            )
          }
        } catch (e) {
          console.error('No se pudo enviar el correo de soporte (el reporte sí quedó registrado):', e)
        }
      }
      res.status(201).json({ id: reporteId })
    })
  )

  router.get(
    '/soporte',
    asyncHandler(async (req, res) => {
      res.json(await listarReportesSoporte(ctx.conexion.db, sesionDe(req)))
    })
  )

  router.get(
    '/soporte/mis-reportes',
    asyncHandler(async (req, res) => {
      res.json(await listarMisReportes(ctx.conexion.db, sesionDe(req)))
    })
  )

  router.post(
    '/soporte/:id/responder',
    asyncHandler(async (req, res) => {
      const { db } = ctx.conexion
      const sesion = sesionDe(req)
      const reporteId = idDe(req)
      const { respuesta } = (req.body ?? {}) as { respuesta?: string }
      await responderReporteSoporte(db, reporteId, respuesta ?? '', sesion)

      if (ctx.mailer) {
        try {
          const filas = await db
            .select({ email: usuario.email })
            .from(usuario)
            .innerJoin(soporteTabla, eq(soporteTabla.usuarioId, usuario.id))
            .where(eq(soporteTabla.id, reporteId))
          const para = filas[0]?.email
          if (para) {
            await ctx.mailer.enviar(
              para,
              `Respuesta a tu reporte de soporte #${reporteId} (Gestor de Ofertas)`,
              `Hola:\n\nEl administrador respondió tu reporte #${reporteId}:\n\n${(respuesta ?? '').trim()}\n\n— ${sesion.nombre}`
            )
          }
        } catch (e) {
          console.error('No se pudo enviar el correo de respuesta (la respuesta sí quedó registrada):', e)
        }
      }
      res.status(204).end()
    })
  )

  router.patch(
    '/soporte/:id/atender',
    asyncHandler(async (req, res) => {
      const { atendido } = (req.body ?? {}) as { atendido?: boolean }
      await marcarReporteAtendido(ctx.conexion.db, idDe(req), Boolean(atendido), sesionDe(req))
      res.status(204).end()
    })
  )

  // --- Administración de usuarios (solo líder de la unidad) ------------------
  router.get(
    '/usuarios',
    asyncHandler(async (req, res) => {
      res.json(await listarUsuarios(ctx.conexion.db, sesionDe(req)))
    })
  )

  router.post(
    '/usuarios',
    asyncHandler(async (req, res) => {
      await crearUsuario(ctx.conexion.db, req.body as NuevoUsuarioInput, sesionDe(req))
      res.status(201).end()
    })
  )

  router.patch(
    '/usuarios/:id',
    asyncHandler(async (req, res) => {
      const cambios = { ...(req.body as Omit<ActualizarUsuarioInput, 'usuarioId'>), usuarioId: idDe(req) }
      await actualizarUsuario(ctx.conexion.db, cambios, sesionDe(req))
      res.status(204).end()
    })
  )

  router.post(
    '/demo',
    asyncHandler(async (req, res) => {
      const festivos = await festivosDe()
      res.json(await cargarDatosDemostracion(ctx.conexion.db, sesionDe(req), hoyLocalISO(), festivos))
    })
  )

  // --- Reasignación forzosa (RN-18 / RF-30) ---------------------------------
  router.post(
    '/tramos/:id/reasignar',
    asyncHandler(async (req, res) => {
      const { nuevoResponsableId, motivo } = (req.body ?? {}) as { nuevoResponsableId?: number; motivo?: string }
      await reasignarTramo(
        ctx.conexion.db,
        { tramoId: idDe(req), nuevoResponsableId: Number(nuevoResponsableId), motivo: motivo ?? '' },
        sesionDe(req)
      )
      res.status(204).end()
    })
  )

  return router
}
