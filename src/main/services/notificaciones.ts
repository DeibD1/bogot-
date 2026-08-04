// =============================================================================
//  Notificaciones (RF-27):
//   - COMPROMISOS por eventos: activación de un tramo (hand-off), oferta
//     pendiente de aprobación, corrección solicitada tras un rechazo.
//   - ALERTAS por barrido del calendario: vencimiento próximo (vence hoy o el
//     siguiente día hábil) y retraso (fecha límite superada y tramo en curso).
//     El barrido es idempotente: una sola alerta por tramo y tipo.
// =============================================================================
import { and, desc, eq } from 'drizzle-orm'
import type { DB } from '../db/client.js'
import { notificacion, oferta, tramo, usuario } from '../db/schema.js'
import type { TipoNotificacion } from '../../shared/dominio.js'
import type { NotificacionInfo } from '../../shared/ipc.js'
import { calcularCriticidad } from './criticidad.js'
import type { Festivos } from './dias-habiles.js'
import type { Mailer } from './mailer.js'

const ASUNTO: Record<TipoNotificacion, string> = {
  compromiso: 'Gestor de Ofertas: nueva tarea a tu cargo',
  vencimiento_proximo: 'Gestor de Ofertas: un plazo está próximo a vencer',
  retraso: 'Gestor de Ofertas: un plazo se venció'
}

/**
 * Mailer activo del proceso (RF-27 por correo). Se registra una vez al armar
 * el contexto (crearContexto -> registrarMailer) y de ahí en adelante toda
 * notificación creada con `notificar()` también se envía por correo,
 * reutilizando el mismo mensaje y destinatario que ya recibe en la app.
 * Si no hay mailer configurado (sin RESEND_API_KEY/SMTP), queda en null y
 * la app sigue funcionando solo con notificaciones dentro de la app.
 */
let mailerActivo: Mailer | null = null

export function registrarMailer(m: Mailer | null): void {
  mailerActivo = m
}

/** Envía el correo para una notificación ya insertada; nunca revienta el flujo si falla. */
async function enviarCorreoNotificacion(db: DB, n: NuevaNotificacion): Promise<void> {
  if (!mailerActivo) return
  try {
    const filas = await db
      .select({ email: usuario.email })
      .from(usuario)
      .where(eq(usuario.id, n.usuarioId))
    const email = filas[0]?.email
    if (!email) return
    await mailerActivo.enviar(email, ASUNTO[n.tipo], n.mensaje)
  } catch (e) {
    console.error(`[correo] No se pudo enviar la notificación (usuario ${n.usuarioId}, tipo ${n.tipo}):`, e)
  }
}

export interface NuevaNotificacion {
  usuarioId: number
  tipo: TipoNotificacion
  mensaje: string
  ofertaId?: number
  tramoId?: number
  /** Si es true, no inserta si ya existe una del mismo tipo para el mismo tramo y usuario. */
  unicaPorTramo?: boolean
}

/** Inserta una notificación (y envía el correo correspondiente). Devuelve false si se omitió por deduplicación. */
export async function notificar(db: DB, n: NuevaNotificacion): Promise<boolean> {
  if (n.unicaPorTramo && n.tramoId) {
    const previas = await db
      .select({ id: notificacion.id })
      .from(notificacion)
      .where(
        and(
          eq(notificacion.usuarioId, n.usuarioId),
          eq(notificacion.tramoId, n.tramoId),
          eq(notificacion.tipo, n.tipo)
        )
      )
    if (previas.length > 0) return false
  }
  await db.insert(notificacion).values({
    usuarioId: n.usuarioId,
    tipo: n.tipo,
    mensaje: n.mensaje,
    ofertaId: n.ofertaId,
    tramoId: n.tramoId
  })
  await enviarCorreoNotificacion(db, n)
  return true
}

/** Compromiso al activarse un tramo (RN-04 / RF-27). */
export async function notificarActivacionTramo(
  db: DB,
  p: { tramoId: number; ofertaId: number; numero: number; responsableId: number; cliente: string; fechaLimite: string | null; esAprobacion: boolean }
): Promise<void> {
  const mensaje = p.esAprobacion
    ? `La oferta de "${p.cliente}" quedó pendiente de tu aprobación final. Plazo: 1 día hábil (hasta ${p.fechaLimite ?? '—'}).`
    : `Se activó tu tramo ${p.numero} de la oferta "${p.cliente}". Fecha límite: ${p.fechaLimite ?? '—'}.`
  await notificar(db, {
    usuarioId: p.responsableId,
    tipo: 'compromiso',
    mensaje,
    ofertaId: p.ofertaId,
    tramoId: p.tramoId
  })
}

/** Compromiso de corrección tras un rechazo (RN-19 / RF-22). */
export async function notificarCorreccion(
  db: DB,
  p: { ofertaId: number; cliente: string; numeroTramo: number; responsableId: number; motivo: string }
): Promise<void> {
  await notificar(db, {
    usuarioId: p.responsableId,
    tipo: 'compromiso',
    mensaje: `La oferta "${p.cliente}" fue rechazada y requiere corrección en tu tramo ${p.numeroTramo}. Motivo: ${p.motivo}`,
    ofertaId: p.ofertaId
  })
}

/**
 * Barrido de alertas de calendario (RF-08 / RF-27) sobre los tramos en curso:
 *  - límite superado  -> 'retraso'
 *  - vence hoy o el siguiente día hábil -> 'vencimiento_proximo'
 * Idempotente por (tramo, tipo, usuario). Devuelve cuántas alertas nuevas creó.
 */
export async function generarAlertasVencimiento(
  db: DB,
  hoy: string,
  festivos: Festivos
): Promise<{ proximos: number; retrasos: number }> {
  const activos = await db
    .select({
      tramoId: tramo.id,
      ofertaId: tramo.ofertaId,
      numero: tramo.numero,
      responsableId: tramo.responsableId,
      fechaLimite: tramo.fechaLimite,
      cliente: oferta.cliente
    })
    .from(tramo)
    .innerJoin(oferta, eq(tramo.ofertaId, oferta.id))
    .where(eq(tramo.estado, 'en_curso'))

  let proximos = 0
  let retrasos = 0
  for (const t of activos) {
    if (!t.fechaLimite) continue
    const criticidad = calcularCriticidad(hoy, t.fechaLimite, festivos)
    if (criticidad === 'rojo') {
      const creada = await notificar(db, {
        usuarioId: t.responsableId,
        tipo: 'retraso',
        mensaje: `Tramo ${t.numero} de "${t.cliente}" VENCIDO: la fecha límite era ${t.fechaLimite}.`,
        ofertaId: t.ofertaId,
        tramoId: t.tramoId,
        unicaPorTramo: true
      })
      if (creada) retrasos++
    } else if (criticidad === 'amarillo') {
      const creada = await notificar(db, {
        usuarioId: t.responsableId,
        tipo: 'vencimiento_proximo',
        mensaje: `Tramo ${t.numero} de "${t.cliente}" próximo a vencer: fecha límite ${t.fechaLimite}.`,
        ofertaId: t.ofertaId,
        tramoId: t.tramoId,
        unicaPorTramo: true
      })
      if (creada) proximos++
    }
  }
  return { proximos, retrasos }
}

/** Usuarios activos con rol líder de la unidad (destinatarios de aprobaciones). */
export async function idsLideresUnidad(db: DB): Promise<number[]> {
  const filas = await db
    .select({ id: usuario.id })
    .from(usuario)
    .where(and(eq(usuario.rol, 'lider_unidad'), eq(usuario.activo, true)))
  return filas.map((f) => f.id)
}

export async function listarNotificaciones(
  db: DB,
  usuarioId: number,
  limite = 50
): Promise<NotificacionInfo[]> {
  const filas = await db
    .select({
      id: notificacion.id,
      tipo: notificacion.tipo,
      mensaje: notificacion.mensaje,
      creadaEn: notificacion.creadaEn,
      leida: notificacion.leida,
      ofertaId: notificacion.ofertaId,
      tramoId: notificacion.tramoId
    })
    .from(notificacion)
    .where(eq(notificacion.usuarioId, usuarioId))
    .orderBy(desc(notificacion.id))
    .limit(limite)
  return filas
}

export async function contarNoLeidas(db: DB, usuarioId: number): Promise<number> {
  const filas = await db
    .select({ id: notificacion.id })
    .from(notificacion)
    .where(and(eq(notificacion.usuarioId, usuarioId), eq(notificacion.leida, false)))
  return filas.length
}

export async function marcarTodasLeidas(db: DB, usuarioId: number): Promise<void> {
  await db
    .update(notificacion)
    .set({ leida: true })
    .where(and(eq(notificacion.usuarioId, usuarioId), eq(notificacion.leida, false)))
}
