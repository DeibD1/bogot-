// =============================================================================
//  Servicios de oferta sobre la BD (escritura). Usan la lógica pura de
//  planificacion.ts. Mantienen la lógica de negocio fuera de la UI.
// =============================================================================
import { and, asc, eq, gt } from 'drizzle-orm'
import type { DB } from '../db/client.js'
import { oferta, tarea, tramo } from '../db/schema.js'
import {
  ETIQUETA_TIPO_TAREA,
  NUMERO_TRAMO_APROBACION,
  TOTAL_TRAMOS,
  type Rol,
  type Tamano
} from '../../shared/dominio.js'
import { diferenciaDiasHabiles, type Festivos } from './dias-habiles.js'
import { indicadorCumplimiento } from './indicadores.js'
import { idsLideresUnidad, notificar, notificarActivacionTramo } from './notificaciones.js'
import {
  calcularCierreTramo,
  planificarOferta,
  recalcularDesde,
  type CierreTramo
} from './planificacion.js'

export interface CrearOfertaParams {
  cliente: string
  tamano: Tamano
  fechaInicio: string
  /** Días hábiles para la socialización (los define el comercial; defecto 1). */
  duracionSocializacion?: number
  /** Responsable asignado a cada rol que participa en la oferta. */
  responsables: Record<Rol, number>
  creadoPor: number
  festivos: Festivos
}

/**
 * Crea una oferta y genera automáticamente sus 4 tramos, sus tareas y las fechas
 * planificadas en días hábiles (RF-01, RF-02, RF-03). El tramo 1 queda activo
 * ('en_curso'); el resto queda 'pendiente' con fechas proyectadas.
 */
export async function crearOferta(db: DB, p: CrearOfertaParams): Promise<number> {
  if (!p.cliente.trim()) throw new Error('El nombre del cliente es obligatorio')
  if (p.duracionSocializacion !== undefined) {
    if (!Number.isInteger(p.duracionSocializacion) || p.duracionSocializacion < 1 || p.duracionSocializacion > 10) {
      throw new Error('La duración de la socialización debe ser de 1 a 10 días hábiles')
    }
  }
  const plan = planificarOferta({
    tamano: p.tamano,
    fechaInicio: p.fechaInicio,
    festivos: p.festivos,
    duracionSocializacion: p.duracionSocializacion
  })
  const fechaInicioNormalizada = plan.tramos[0]!.fechaActivacion

  const filasOferta = await db
    .insert(oferta)
    .values({
      cliente: p.cliente,
      tamano: p.tamano,
      fechaInicio: fechaInicioNormalizada,
      plazoTotalDias: plan.plazoTotalDias,
      fechaEntregaComprometida: plan.fechaEntregaComprometida,
      estado: 'en_curso',
      creadoPor: p.creadoPor
    })
    .returning({ id: oferta.id })
  const ofertaId = filasOferta[0]!.id

  for (const t of plan.tramos) {
    const filasTramo = await db
      .insert(tramo)
      .values({
        ofertaId,
        numero: t.numero,
        responsableId: p.responsables[t.rol],
        duracionAsignadaDias: t.duracion,
        fechaActivacion: t.fechaActivacion,
        fechaLimite: t.fechaLimite,
        estado: t.numero === 1 ? 'en_curso' : 'pendiente'
      })
      .returning({ id: tramo.id })
    const tramoId = filasTramo[0]!.id

    for (const [i, tipo] of t.tareas.entries()) {
      const activa = t.numero === 1 && i === 0
      await db.insert(tarea).values({
        tramoId,
        tipo,
        descripcion: ETIQUETA_TIPO_TAREA[tipo],
        estado: activa ? 'en_curso' : 'pendiente'
      })
    }

    // Compromiso al responsable del tramo que arranca activo (RF-27).
    if (t.numero === 1) {
      await notificarActivacionTramo(db, {
        tramoId,
        ofertaId,
        numero: 1,
        responsableId: p.responsables[t.rol],
        cliente: p.cliente,
        fechaLimite: t.fechaLimite,
        esAprobacion: false
      })
    }
  }

  return ofertaId
}

/**
 * Cierra un tramo de profesional al entregar su trabajo (RF-06, RF-12):
 *  - calcula días hábiles usados, desviación e indicador (RN-07, §11);
 *  - marca el tramo y sus tareas como completados;
 *  - recalcula en cascada las fechas de los tramos siguientes (RN-16) sin
 *    alterar sus calificaciones (RN-15);
 *  - activa el tramo inmediatamente siguiente.
 *
 * (El cierre del tramo de aprobación — finalización de la oferta — se maneja en
 * la fase de aprobación.)
 */
export async function cerrarTramo(
  db: DB,
  tramoId: number,
  fechaEntregaReal: string,
  festivos: Festivos
): Promise<CierreTramo> {
  const filas = await db.select().from(tramo).where(eq(tramo.id, tramoId))
  const actual = filas[0]
  if (!actual) throw new Error(`Tramo ${tramoId} no existe`)
  if (actual.estado !== 'en_curso') {
    throw new Error(`El tramo ${tramoId} no está activo (estado: ${actual.estado})`)
  }
  if (!actual.fechaActivacion) throw new Error(`El tramo ${tramoId} no tiene fecha de activación`)

  const cierre = calcularCierreTramo({
    fechaActivacion: actual.fechaActivacion,
    duracion: actual.duracionAsignadaDias,
    fechaEntregaReal,
    festivos
  })

  await db
    .update(tramo)
    .set({
      fechaEntregaReal,
      diasHabilesUsados: cierre.diasHabilesUsados,
      desviacionDias: cierre.desviacionDias,
      indicadorCumplimiento: String(cierre.indicadorCumplimiento),
      estado: 'completado'
    })
    .where(eq(tramo.id, tramoId))

  await db
    .update(tarea)
    .set({ estado: 'completada', completadaEn: fechaEntregaReal })
    .where(eq(tarea.tramoId, tramoId))

  // Recalcular en cascada los tramos siguientes de la misma oferta.
  const siguientes = await db
    .select()
    .from(tramo)
    .where(and(eq(tramo.ofertaId, actual.ofertaId), gt(tramo.numero, actual.numero)))
    .orderBy(asc(tramo.numero))

  if (siguientes.length > 0) {
    const nuevasFechas = recalcularDesde({
      fechaEntregaRealTramoCerrado: fechaEntregaReal,
      tramosSiguientes: siguientes.map((t) => ({ numero: t.numero, duracion: t.duracionAsignadaDias })),
      festivos
    })

    for (const [i, f] of nuevasFechas.entries()) {
      const s = siguientes[i]!
      await db
        .update(tramo)
        .set({
          fechaActivacion: f.fechaActivacion,
          fechaLimite: f.fechaLimite,
          // el inmediato siguiente se activa ('en_curso'); el resto sigue pendiente
          estado: i === 0 ? 'en_curso' : s.estado
        })
        .where(eq(tramo.id, s.id))

      // Activar la primera tarea del tramo que se pone en curso.
      if (i === 0) {
        const tareasTramo = await db
          .select({ id: tarea.id })
          .from(tarea)
          .where(eq(tarea.tramoId, s.id))
          .orderBy(asc(tarea.id))
        const primera = tareasTramo[0]
        if (primera) {
          await db.update(tarea).set({ estado: 'en_curso' }).where(eq(tarea.id, primera.id))
        }

        // Si el tramo activado es la aprobación final, la oferta pasa a
        // pendiente de aprobación del líder de la unidad (RF-21, RN-11).
        if (s.numero === NUMERO_TRAMO_APROBACION) {
          await db
            .update(oferta)
            .set({ estado: 'pendiente_aprobacion_final' })
            .where(eq(oferta.id, actual.ofertaId))
        }

        // Compromiso al responsable del tramo recién activado (hand-off, RF-27).
        const filasOferta = await db
          .select({ cliente: oferta.cliente })
          .from(oferta)
          .where(eq(oferta.id, actual.ofertaId))
        const cliente = filasOferta[0]?.cliente ?? ''
        if (s.numero === TOTAL_TRAMOS) {
          // Tramo de envío: mensaje específico para el líder comercial.
          await notificar(db, {
            usuarioId: s.responsableId,
            tipo: 'compromiso',
            mensaje: `La oferta de "${cliente}" fue APROBADA: envíala al cliente a más tardar el ${f.fechaLimite}.`,
            ofertaId: actual.ofertaId,
            tramoId: s.id
          })
        } else {
          await notificarActivacionTramo(db, {
            tramoId: s.id,
            ofertaId: actual.ofertaId,
            numero: s.numero,
            responsableId: s.responsableId,
            cliente,
            fechaLimite: f.fechaLimite,
            esAprobacion: s.numero === NUMERO_TRAMO_APROBACION
          })
        }

        // Una oferta pendiente de aprobación se anuncia a TODOS los líderes de
        // la unidad activos (RF-21), no solo al asignado al tramo.
        if (s.numero === NUMERO_TRAMO_APROBACION) {
          for (const liderId of await idsLideresUnidad(db)) {
            if (liderId === s.responsableId) continue
            await notificar(db, {
              usuarioId: liderId,
              tipo: 'compromiso',
              mensaje: `La oferta de "${cliente}" quedó pendiente de aprobación final (plazo: 1 día hábil, hasta ${f.fechaLimite}).`,
              ofertaId: actual.ofertaId,
              tramoId: s.id
            })
          }
        }
      }
    }
  }

  // Al cerrarse el ÚLTIMO tramo (envío al cliente), la oferta queda finalizada:
  // se mide contra la fecha comprometida con el cliente (RN-08 adaptado al
  // flujo de 6 tramos) y se calcula su indicador (§11.2).
  if (actual.numero === TOTAL_TRAMOS) {
    const filasOferta = await db.select().from(oferta).where(eq(oferta.id, actual.ofertaId))
    const of = filasOferta[0]
    if (of?.fechaEntregaComprometida) {
      const desviacion = diferenciaDiasHabiles(of.fechaEntregaComprometida, fechaEntregaReal, festivos)
      await db
        .update(oferta)
        .set({
          fechaFinalizacionReal: fechaEntregaReal,
          desviacionDias: desviacion,
          indicadorCumplimiento: String(indicadorCumplimiento(desviacion, of.plazoTotalDias))
        })
        .where(eq(oferta.id, actual.ofertaId))
    }
  }

  return cierre
}
