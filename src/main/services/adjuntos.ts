// =============================================================================
//  Adjuntos (RF-10): la información que se comparte entre profesionales
//  (especificaciones, cotizaciones). Se registra la referencia al archivo
//  (nombre + ruta en el almacenamiento); los participantes de la oferta pueden
//  verla y descargarla. El archivo en sí vive en Supabase Storage o en disco.
// =============================================================================
import { asc, eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { adjunto, tramo, usuario } from '../db/schema'
import type { AdjuntoInfo } from '../../shared/ipc'

/** Lista todos los adjuntos de una oferta (de todos sus tramos), con autor. */
export async function listarAdjuntosOferta(db: DB, ofertaId: number): Promise<AdjuntoInfo[]> {
  const filas = await db
    .select({
      id: adjunto.id,
      tramoId: adjunto.tramoId,
      numeroTramo: tramo.numero,
      tipo: adjunto.tipo,
      nombre: adjunto.nombre,
      ruta: adjunto.ruta,
      subidoPorNombre: usuario.nombre,
      subidoEn: adjunto.subidoEn
    })
    .from(adjunto)
    .innerJoin(tramo, eq(adjunto.tramoId, tramo.id))
    .leftJoin(usuario, eq(adjunto.subidoPor, usuario.id))
    .where(eq(tramo.ofertaId, ofertaId))
    .orderBy(asc(adjunto.id))
  return filas
}

/**
 * Registra un adjunto en un tramo. Solo el responsable del tramo puede
 * adjuntar (los demás lo consultan en modo lectura).
 */
export async function registrarAdjunto(
  db: DB,
  params: { tramoId: number; tipo: string; nombre: string; ruta: string; subidoPor: number }
): Promise<void> {
  const filas = await db.select().from(tramo).where(eq(tramo.id, params.tramoId))
  const tr = filas[0]
  if (!tr) throw new Error(`El tramo ${params.tramoId} no existe`)
  if (tr.responsableId !== params.subidoPor) {
    throw new Error('Solo el responsable del tramo puede adjuntar archivos')
  }
  await db.insert(adjunto).values({
    tramoId: params.tramoId,
    tipo: params.tipo,
    nombre: params.nombre,
    ruta: params.ruta,
    subidoPor: params.subidoPor
  })
}

/** Datos mínimos de un tramo para autorizar la subida de archivos. */
export async function datosTramo(
  db: DB,
  tramoId: number
): Promise<{ ofertaId: number; responsableId: number } | null> {
  const filas = await db
    .select({ ofertaId: tramo.ofertaId, responsableId: tramo.responsableId })
    .from(tramo)
    .where(eq(tramo.id, tramoId))
  return filas[0] ?? null
}

/** Un adjunto con la oferta a la que pertenece (para autorizar su descarga). */
export async function obtenerAdjunto(
  db: DB,
  adjuntoId: number
): Promise<{ id: number; nombre: string; ruta: string | null; ofertaId: number } | null> {
  const filas = await db
    .select({ id: adjunto.id, nombre: adjunto.nombre, ruta: adjunto.ruta, ofertaId: tramo.ofertaId })
    .from(adjunto)
    .innerJoin(tramo, eq(adjunto.tramoId, tramo.id))
    .where(eq(adjunto.id, adjuntoId))
  return filas[0] ?? null
}
