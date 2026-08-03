// =============================================================================
//  Subtareas (extensión): checklist personal DENTRO de cada tarea principal
//  (p. ej. "Recolección de datos" -> "calcular cantidades", "resumir pliego").
//  Son organizativas: no alteran fechas, plazos ni indicadores.
//  Las gestiona el responsable del tramo; en las tareas de APROBACIÓN puede
//  hacerlo cualquier líder de la unidad (quien revise es quien las usa).
// =============================================================================
import { eq } from 'drizzle-orm'
import type { DB } from '../db/client.js'
import { subtarea, tarea, tramo } from '../db/schema.js'
import { esLiderUnidad } from '../../shared/permisos.js'
import type { SesionUsuario } from '../../shared/ipc.js'

/** Valida que el usuario pueda gestionar las subtareas de la tarea. */
async function exigirGestion(db: DB, tareaId: number, sesion: SesionUsuario) {
  const filas = await db
    .select({ tareaEstado: tarea.estado, tipo: tarea.tipo, responsableId: tramo.responsableId })
    .from(tarea)
    .innerJoin(tramo, eq(tarea.tramoId, tramo.id))
    .where(eq(tarea.id, tareaId))
  const fila = filas[0]
  if (!fila) throw new Error(`La tarea ${tareaId} no existe`)

  const esAprobacionYLider = fila.tipo === 'aprobacion_unidad' && esLiderUnidad(sesion.rol)
  if (fila.responsableId !== sesion.id && !esAprobacionYLider) {
    throw new Error('Solo el responsable del tramo puede gestionar las subtareas de esta tarea')
  }
  return fila
}

export async function crearSubtarea(
  db: DB,
  tareaId: number,
  descripcion: string,
  sesion: SesionUsuario
): Promise<void> {
  const texto = descripcion.trim()
  if (!texto) throw new Error('La subtarea debe tener una descripción')
  const t = await exigirGestion(db, tareaId, sesion)
  if (t.tareaEstado === 'completada') {
    throw new Error('No se pueden añadir subtareas a una tarea ya completada')
  }
  await db.insert(subtarea).values({ tareaId, descripcion: texto })
}

export async function marcarSubtarea(
  db: DB,
  subtareaId: number,
  completada: boolean,
  sesion: SesionUsuario
): Promise<void> {
  const filas = await db.select().from(subtarea).where(eq(subtarea.id, subtareaId))
  const s = filas[0]
  if (!s) throw new Error(`La subtarea ${subtareaId} no existe`)
  await exigirGestion(db, s.tareaId, sesion)
  await db.update(subtarea).set({ completada }).where(eq(subtarea.id, subtareaId))
}

export async function eliminarSubtarea(db: DB, subtareaId: number, sesion: SesionUsuario): Promise<void> {
  const filas = await db.select().from(subtarea).where(eq(subtarea.id, subtareaId))
  const s = filas[0]
  if (!s) throw new Error(`La subtarea ${subtareaId} no existe`)
  await exigirGestion(db, s.tareaId, sesion)
  await db.delete(subtarea).where(eq(subtarea.id, subtareaId))
}
