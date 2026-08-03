// =============================================================================
//  Deshacer acciones (corrección de errores humanos):
//   - Deshacer "completar tarea": SOLO el responsable del tramo, y SOLO si el
//     proceso no avanzó después (nadie posterior ha completado nada).
//   - Deshacer una aprobación: SOLO el líder de la unidad, y SOLO si el envío
//     al cliente aún no se realizó.
//  Al deshacer se limpia la medición del tramo (se recalculará al volver a
//  entregar) y se notifica a quien quede des-activado.
// =============================================================================
import { and, asc, eq, gt } from 'drizzle-orm'
import type { DB } from '../db/client.js'
import { oferta, tarea, tramo } from '../db/schema.js'
import { NUMERO_TRAMO_APROBACION, TOTAL_TRAMOS } from '../../shared/dominio.js'
import { puedeAprobar } from '../../shared/permisos.js'
import type { SesionUsuario } from '../../shared/ipc.js'
import { notificar } from './notificaciones.js'

/** Revierte el "completar" de una tarea propia (RF de corrección de errores). */
export async function deshacerCompletarTarea(
  db: DB,
  tareaId: number,
  sesion: SesionUsuario
): Promise<void> {
  const filasTarea = await db.select().from(tarea).where(eq(tarea.id, tareaId))
  const t = filasTarea[0]
  if (!t) throw new Error(`La tarea ${tareaId} no existe`)
  if (t.estado !== 'completada') throw new Error('Solo se puede deshacer una tarea completada')
  if (t.tipo === 'aprobacion_unidad') {
    throw new Error('La aprobación se revierte con la opción "Deshacer aprobación"')
  }

  const filasTramo = await db.select().from(tramo).where(eq(tramo.id, t.tramoId))
  const tr = filasTramo[0]!
  if (tr.responsableId !== sesion.id) {
    throw new Error('Solo el responsable del tramo puede deshacer esta tarea')
  }

  // Dentro del tramo: deshacer en orden inverso (primero la más reciente).
  const tareasTramo = await db
    .select()
    .from(tarea)
    .where(eq(tarea.tramoId, t.tramoId))
    .orderBy(asc(tarea.id))
  if (tareasTramo.some((x) => x.id > tareaId && x.estado === 'completada')) {
    throw new Error('Primero deshaz la tarea posterior de este mismo tramo')
  }

  const filasOferta = await db.select().from(oferta).where(eq(oferta.id, tr.ofertaId))
  const of = filasOferta[0]!

  if (tr.estado === 'completado') {
    // El tramo ya se había entregado: verificar que NADIE posterior avanzó.
    if (of.estado === 'rechazada') {
      throw new Error('La oferta está en corrección: no se puede deshacer en este estado')
    }
    const siguientes = await db
      .select()
      .from(tramo)
      .where(and(eq(tramo.ofertaId, tr.ofertaId), gt(tramo.numero, tr.numero)))
      .orderBy(asc(tramo.numero))
    for (const s of siguientes) {
      if (s.estado === 'completado') {
        throw new Error(`No se puede deshacer: el proceso ya avanzó (el tramo ${s.numero} fue entregado)`)
      }
    }
    if (siguientes.length > 0) {
      const tareasSiguientes = await db
        .select()
        .from(tarea)
        .where(eq(tarea.tramoId, siguientes[0]!.id))
      if (tareasSiguientes.some((x) => x.estado === 'completada')) {
        throw new Error('No se puede deshacer: el siguiente profesional ya completó trabajo')
      }
    }

    // Reabrir el tramo: limpiar la medición (se recalculará al re-entregar).
    await db
      .update(tramo)
      .set({
        estado: 'en_curso',
        fechaEntregaReal: null,
        diasHabilesUsados: null,
        desviacionDias: null,
        indicadorCumplimiento: null
      })
      .where(eq(tramo.id, tr.id))

    // Desactivar el tramo siguiente que se había puesto en curso.
    const sig = siguientes[0]
    if (sig && sig.estado === 'en_curso') {
      await db.update(tramo).set({ estado: 'pendiente' }).where(eq(tramo.id, sig.id))
      await db
        .update(tarea)
        .set({ estado: 'pendiente', completadaEn: null })
        .where(eq(tarea.tramoId, sig.id))
      await notificar(db, {
        usuarioId: sig.responsableId,
        tipo: 'compromiso',
        ofertaId: tr.ofertaId,
        tramoId: sig.id,
        mensaje: `Se reabrió el tramo anterior de "${of.cliente}": tu tramo ${sig.numero} vuelve a quedar pendiente.`
      })
    }

    // Si se había activado la aprobación, la oferta regresa a "en curso".
    if (sig?.numero === NUMERO_TRAMO_APROBACION && of.estado === 'pendiente_aprobacion_final') {
      await db.update(oferta).set({ estado: 'en_curso' }).where(eq(oferta.id, tr.ofertaId))
    }
    // Si se deshace el ENVÍO, la oferta deja de estar "finalizada/medida".
    if (tr.numero === TOTAL_TRAMOS) {
      await db
        .update(oferta)
        .set({ fechaFinalizacionReal: null, desviacionDias: null, indicadorCumplimiento: null })
        .where(eq(oferta.id, tr.ofertaId))
    }
  } else {
    // Tramo aún en curso: la tarea siguiente que se activó vuelve a pendiente.
    const activa = tareasTramo.find((x) => x.estado === 'en_curso')
    if (activa) {
      await db.update(tarea).set({ estado: 'pendiente' }).where(eq(tarea.id, activa.id))
    }
  }

  await db
    .update(tarea)
    .set({ estado: 'en_curso', completadaEn: null })
    .where(eq(tarea.id, tareaId))
}

/** Revierte una aprobación (solo líder de la unidad; el envío no debe haberse hecho). */
export async function deshacerAprobacion(db: DB, ofertaId: number, sesion: SesionUsuario): Promise<void> {
  if (!puedeAprobar(sesion.rol)) {
    throw new Error('Solo el líder de la unidad puede deshacer una aprobación')
  }
  const filasOferta = await db.select().from(oferta).where(eq(oferta.id, ofertaId))
  const of = filasOferta[0]
  if (!of) throw new Error(`La oferta ${ofertaId} no existe`)
  if (of.estado !== 'aprobada') {
    throw new Error(`La oferta no está aprobada (estado: ${of.estado})`)
  }

  const tramos = await db
    .select()
    .from(tramo)
    .where(eq(tramo.ofertaId, ofertaId))
    .orderBy(asc(tramo.numero))
  const t5 = tramos.find((t) => t.numero === NUMERO_TRAMO_APROBACION)!
  const t6 = tramos.find((t) => t.numero === TOTAL_TRAMOS)!

  const tareasT6 = await db.select().from(tarea).where(eq(tarea.tramoId, t6.id))
  if (tareasT6.some((x) => x.estado === 'completada')) {
    throw new Error('No se puede deshacer: la oferta ya fue ENVIADA al cliente (pide al comercial deshacer el envío primero)')
  }

  // La oferta vuelve a pendiente de aprobación.
  await db
    .update(oferta)
    .set({ estado: 'pendiente_aprobacion_final', fechaAprobUnidad: null, aprobadoPor: null })
    .where(eq(oferta.id, ofertaId))

  // Reabrir el tramo de aprobación (conserva sus fechas: el reloj no se reinicia).
  await db
    .update(tramo)
    .set({
      estado: 'en_curso',
      fechaEntregaReal: null,
      diasHabilesUsados: null,
      desviacionDias: null,
      indicadorCumplimiento: null
    })
    .where(eq(tramo.id, t5.id))
  await db.update(tarea).set({ estado: 'en_curso', completadaEn: null }).where(eq(tarea.tramoId, t5.id))

  // El envío queda desactivado.
  await db.update(tramo).set({ estado: 'pendiente' }).where(eq(tramo.id, t6.id))
  await db.update(tarea).set({ estado: 'pendiente', completadaEn: null }).where(eq(tarea.tramoId, t6.id))

  await notificar(db, {
    usuarioId: t6.responsableId,
    tipo: 'compromiso',
    ofertaId,
    tramoId: t6.id,
    mensaje: `Se deshizo la aprobación de "${of.cliente}": el envío al cliente queda sin efecto por ahora.`
  })
}
