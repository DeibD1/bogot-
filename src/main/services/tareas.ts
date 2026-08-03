// =============================================================================
//  Completar tareas (RF-06, RF-12, RN-06).
//  Dentro de un tramo las tareas son secuenciales: completar una activa la
//  siguiente; al completar la última se CIERRA el tramo con el motor de la
//  Fase 1 (desviación, indicador y recálculo en cascada).
// =============================================================================
import { asc, eq } from 'drizzle-orm'
import type { DB } from '../db/client.js'
import { tarea, tramo } from '../db/schema.js'
import type { ResultadoCompletar } from '../../shared/ipc.js'
import type { Festivos } from './dias-habiles.js'
import { cerrarTramo } from './ofertas.js'

/**
 * Marca una tarea como completada en nombre de `usuarioId`.
 *  - Valida que la tarea esté 'en_curso' (RN-06: el orden se respeta porque
 *    solo la tarea activa puede completarse) y que el usuario sea el
 *    responsable del tramo.
 *  - La aprobación final NO se completa por aquí (es la bandeja del líder de
 *    la unidad, Fase 4).
 *  - Si quedan tareas en el tramo, activa la siguiente; si era la última,
 *    cierra el tramo (calcula desviación/indicador y reprograma los siguientes).
 */
export async function completarTarea(
  db: DB,
  tareaId: number,
  fechaHoy: string,
  festivos: Festivos,
  usuarioId: number
): Promise<ResultadoCompletar> {
  const filas = await db.select().from(tarea).where(eq(tarea.id, tareaId))
  const t = filas[0]
  if (!t) throw new Error(`La tarea ${tareaId} no existe`)
  if (t.tipo === 'aprobacion_unidad') {
    throw new Error('La aprobación final se gestiona desde la bandeja del líder de la unidad')
  }
  if (t.estado !== 'en_curso') {
    throw new Error(`La tarea no está activa (estado: ${t.estado})`)
  }

  const tramos = await db.select().from(tramo).where(eq(tramo.id, t.tramoId))
  const tr = tramos[0]
  if (!tr) throw new Error(`El tramo ${t.tramoId} no existe`)
  if (tr.responsableId !== usuarioId) {
    throw new Error('Solo el responsable del tramo puede completar esta tarea')
  }
  if (tr.estado !== 'en_curso') {
    throw new Error(`El tramo no está activo (estado: ${tr.estado})`)
  }

  await db
    .update(tarea)
    .set({ estado: 'completada', completadaEn: fechaHoy })
    .where(eq(tarea.id, tareaId))

  // ¿Queda alguna tarea pendiente en el mismo tramo? -> activar la siguiente.
  const tareasDelTramo = await db
    .select()
    .from(tarea)
    .where(eq(tarea.tramoId, t.tramoId))
    .orderBy(asc(tarea.id))
  const siguiente = tareasDelTramo.find((p) => p.estado === 'pendiente')

  if (siguiente) {
    await db.update(tarea).set({ estado: 'en_curso' }).where(eq(tarea.id, siguiente.id))
    return { tramoCerrado: false }
  }

  // Era la última tarea: cerrar el tramo (entrega / hand-off, RF-06).
  const cierre = await cerrarTramo(db, t.tramoId, fechaHoy, festivos)
  return {
    tramoCerrado: true,
    desviacionDias: cierre.desviacionDias,
    indicadorCumplimiento: cierre.indicadorCumplimiento
  }
}
