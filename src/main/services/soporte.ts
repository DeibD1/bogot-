// =============================================================================
//  Soporte técnico (extensión): cualquier usuario reporta un problema con
//  descripción y pantallazo. El reporte queda en la BD (visible para el
//  administrador desde cualquier equipo) y se notifica a los líderes de la
//  unidad por la campana — y por correo si hay SMTP configurado.
// =============================================================================
import { desc, eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { soporte, usuario } from '../db/schema'
import { esLiderUnidad } from '../../shared/permisos'
import type { ReporteSoporte, SesionUsuario } from '../../shared/ipc'
import { idsLideresUnidad, notificar } from './notificaciones'

/** Límite del pantallazo en base64 (~3 MB de imagen). */
const MAX_CAPTURA = 4_500_000

export async function crearReporteSoporte(
  db: DB,
  p: { descripcion: string; captura?: string | null },
  sesion: SesionUsuario
): Promise<number> {
  const descripcion = p.descripcion.trim()
  if (!descripcion) throw new Error('Describe el problema para poder ayudarte')
  if (descripcion.length > 2000) throw new Error('La descripción no puede superar 2000 caracteres')
  if (p.captura && p.captura.length > MAX_CAPTURA) {
    throw new Error('El pantallazo es demasiado grande (máximo ~3 MB)')
  }

  const filas = await db
    .insert(soporte)
    .values({ usuarioId: sesion.id, descripcion, captura: p.captura ?? null })
    .returning({ id: soporte.id })
  const reporteId = filas[0]!.id

  // Aviso en la campana a los administradores (líderes de la unidad).
  const resumen = descripcion.length > 180 ? `${descripcion.slice(0, 180)}…` : descripcion
  for (const liderId of await idsLideresUnidad(db)) {
    if (liderId === sesion.id) continue
    await notificar(db, {
      usuarioId: liderId,
      tipo: 'compromiso',
      mensaje: `Soporte técnico — reporte #${reporteId} de ${sesion.nombre}: "${resumen}"`
    })
  }

  return reporteId
}

const SELECT_REPORTE = {
  id: soporte.id,
  usuarioNombre: usuario.nombre,
  usuarioEmail: usuario.email,
  descripcion: soporte.descripcion,
  captura: soporte.captura,
  atendido: soporte.atendido,
  creadaEn: soporte.creadaEn,
  respuesta: soporte.respuesta,
  respondidaEn: soporte.respondidaEn
}

/** Bandeja de soporte (solo administradores). Pendientes primero. */
export async function listarReportesSoporte(db: DB, sesion: SesionUsuario): Promise<ReporteSoporte[]> {
  if (!esLiderUnidad(sesion.rol)) {
    throw new Error('Solo el líder de la unidad puede ver los reportes de soporte')
  }
  const filas = await db
    .select(SELECT_REPORTE)
    .from(soporte)
    .innerJoin(usuario, eq(soporte.usuarioId, usuario.id))
    .orderBy(desc(soporte.id))
  return filas.sort((a, b) => Number(a.atendido) - Number(b.atendido) || b.id - a.id)
}

/** Los reportes del propio usuario (para consultar la respuesta del administrador). */
export async function listarMisReportes(db: DB, sesion: SesionUsuario): Promise<ReporteSoporte[]> {
  return db
    .select(SELECT_REPORTE)
    .from(soporte)
    .innerJoin(usuario, eq(soporte.usuarioId, usuario.id))
    .where(eq(soporte.usuarioId, sesion.id))
    .orderBy(desc(soporte.id))
}

/**
 * Respuesta del administrador: queda en el reporte (lo marca atendido) y se
 * notifica al usuario que lo creó por la campana.
 */
export async function responderReporteSoporte(
  db: DB,
  reporteId: number,
  respuesta: string,
  sesion: SesionUsuario
): Promise<void> {
  if (!esLiderUnidad(sesion.rol)) {
    throw new Error('Solo el líder de la unidad puede responder los reportes de soporte')
  }
  const texto = respuesta.trim()
  if (!texto) throw new Error('Escribe la respuesta para el usuario')
  if (texto.length > 2000) throw new Error('La respuesta no puede superar 2000 caracteres')

  const filas = await db.select().from(soporte).where(eq(soporte.id, reporteId))
  const r = filas[0]
  if (!r) throw new Error(`El reporte ${reporteId} no existe`)

  await db
    .update(soporte)
    .set({
      respuesta: texto,
      respondidaEn: new Date().toISOString(),
      respondidoPor: sesion.id,
      atendido: true
    })
    .where(eq(soporte.id, reporteId))

  const resumen = texto.length > 200 ? `${texto.slice(0, 200)}…` : texto
  await notificar(db, {
    usuarioId: r.usuarioId,
    tipo: 'compromiso',
    mensaje: `Soporte — respuesta a tu reporte #${reporteId}: "${resumen}" (${sesion.nombre})`
  })
}

export async function marcarReporteAtendido(
  db: DB,
  reporteId: number,
  atendido: boolean,
  sesion: SesionUsuario
): Promise<void> {
  if (!esLiderUnidad(sesion.rol)) {
    throw new Error('Solo el líder de la unidad puede gestionar los reportes de soporte')
  }
  await db.update(soporte).set({ atendido }).where(eq(soporte.id, reporteId))
}
