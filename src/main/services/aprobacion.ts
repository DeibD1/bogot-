// =============================================================================
//  Aprobación final del líder de la unidad (RN-08, RN-11..13, RN-19, RF-21..23).
//   - Aprobar: cierra el tramo de aprobación (medido contra 1 día hábil,
//     RN-12) y activa el tramo de ENVÍO del líder comercial; la oferta se
//     finaliza y se mide cuando se envía al cliente.
//   - Rechazar: la oferta vuelve al tramo indicado para corrección, con motivo.
//     El tiempo de corrección se acumula en `dias_correccion` y NO altera la
//     calificación del profesional (RN-19): el tramo corregido conserva su
//     desviación e indicador originales.
// =============================================================================
import { and, asc, eq } from 'drizzle-orm'
import type { DB } from '../db/client.js'
import { correccion, oferta, tarea, tramo, usuario as usuarioTabla } from '../db/schema.js'
import { NUMERO_TRAMO_APROBACION } from '../../shared/dominio.js'
import type {
  CorreccionPendiente,
  MotivoRechazoInput,
  PendienteAprobacion,
  SesionUsuario
} from '../../shared/ipc.js'
import { puedeAprobar } from '../../shared/permisos.js'
import { calcularCriticidad } from './criticidad.js'
import { cargarSubtareas } from './consultas.js'
import { diferenciaDiasHabiles, fechaLimiteTramo, siguienteDiaHabil, type Festivos } from './dias-habiles.js'
import { notificar, notificarActivacionTramo, notificarCorreccion } from './notificaciones.js'
import { cerrarTramo } from './ofertas.js'

async function obtenerOferta(db: DB, ofertaId: number) {
  const filas = await db.select().from(oferta).where(eq(oferta.id, ofertaId))
  const of = filas[0]
  if (!of) throw new Error(`La oferta ${ofertaId} no existe`)
  return of
}

async function obtenerTramoAprobacion(db: DB, ofertaId: number) {
  const filas = await db
    .select()
    .from(tramo)
    .where(and(eq(tramo.ofertaId, ofertaId), eq(tramo.numero, NUMERO_TRAMO_APROBACION)))
  const t4 = filas[0]
  if (!t4) throw new Error(`La oferta ${ofertaId} no tiene tramo de aprobación`)
  return t4
}

/** Bandeja del líder: ofertas pendientes de aprobación final (RF-21). */
export async function listarPendientesAprobacion(
  db: DB,
  hoy: string,
  festivos: Festivos
): Promise<PendienteAprobacion[]> {
  const filas = await db
    .select({
      ofertaId: oferta.id,
      cliente: oferta.cliente,
      tamano: oferta.tamano,
      fechaEntregaComprometida: oferta.fechaEntregaComprometida,
      fechaActivacionRevision: tramo.fechaActivacion,
      fechaLimiteRevision: tramo.fechaLimite,
      tareaId: tarea.id
    })
    .from(oferta)
    .innerJoin(tramo, and(eq(tramo.ofertaId, oferta.id), eq(tramo.numero, NUMERO_TRAMO_APROBACION)))
    .leftJoin(tarea, eq(tarea.tramoId, tramo.id))
    .where(eq(oferta.estado, 'pendiente_aprobacion_final'))

  const subtareasPorTarea = await cargarSubtareas(
    db,
    filas.map((f) => f.tareaId).filter((id): id is number => id !== null)
  )

  return filas.map((f) => ({
    ...f,
    criticidad: calcularCriticidad(hoy, f.fechaLimiteRevision, festivos),
    subtareas: f.tareaId !== null ? (subtareasPorTarea.get(f.tareaId) ?? []) : []
  }))
}

/** Aprueba la oferta (RF-22, RF-23): mide la revisión y activa el envío al cliente. */
export async function aprobarOferta(
  db: DB,
  ofertaId: number,
  hoy: string,
  festivos: Festivos,
  sesion: SesionUsuario
): Promise<void> {
  const of = await obtenerOferta(db, ofertaId)
  if (of.estado !== 'pendiente_aprobacion_final') {
    throw new Error(`La oferta no está pendiente de aprobación (estado: ${of.estado})`)
  }
  if (!puedeAprobar(sesion.rol)) {
    throw new Error('Solo el líder de la unidad puede aprobar ofertas')
  }
  const t4 = await obtenerTramoAprobacion(db, ofertaId)

  // La revisión la realiza quien aprueba: si es un líder distinto del asignado,
  // el tramo de aprobación se le atribuye (su gestión es la que se mide, RN-13).
  if (t4.responsableId !== sesion.id) {
    await db
      .update(tramo)
      .set({ responsableId: sesion.id, reasignadoDe: t4.responsableId })
      .where(eq(tramo.id, t4.id))
  }

  // Cierra el tramo de aprobación (medido contra su día hábil, RN-12). El
  // recálculo en cascada activa el tramo de ENVÍO del líder comercial; la
  // oferta se finaliza y se mide cuando este la envía al cliente (tramo 6).
  await cerrarTramo(db, t4.id, hoy, festivos)

  await db
    .update(oferta)
    .set({
      estado: 'aprobada',
      fechaAprobUnidad: hoy,
      aprobadoPor: sesion.id
    })
    .where(eq(oferta.id, ofertaId))
}

/**
 * Rechaza la oferta (RF-22): vuelve al tramo indicado para corrección.
 * No se reabre el tramo en BD (su calificación queda congelada, RN-19); el
 * profesional ve la corrección como un pendiente aparte y la entrega con
 * `entregarCorreccion`.
 */
export async function rechazarOferta(
  db: DB,
  ofertaId: number,
  motivos: MotivoRechazoInput[],
  hoy: string,
  sesion: SesionUsuario
): Promise<void> {
  const items = motivos
    .map((m) => ({ numeroTramo: m.numeroTramo, motivo: m.motivo.trim() }))
    .filter((m) => m.motivo.length > 0)
  if (items.length === 0) throw new Error('Debe indicar al menos un motivo de rechazo')
  for (const m of items) {
    if (![1, 2, 3, 4].includes(m.numeroTramo)) {
      throw new Error('Cada motivo debe dirigirse a un tramo entre 1 y 4')
    }
    if (m.motivo.length > 500) throw new Error('Cada motivo debe tener máximo 500 caracteres')
  }

  const of = await obtenerOferta(db, ofertaId)
  if (of.estado !== 'pendiente_aprobacion_final') {
    throw new Error(`La oferta no está pendiente de aprobación (estado: ${of.estado})`)
  }
  if (!puedeAprobar(sesion.rol)) {
    throw new Error('Solo el líder de la unidad puede rechazar ofertas')
  }
  const t4 = await obtenerTramoAprobacion(db, ofertaId)

  // Resumen para la ficha de la oferta (la traza completa queda en `correccion`).
  const resumen = items.map((m) => `T${m.numeroTramo}: ${m.motivo}`).join(' | ')
  await db
    .update(oferta)
    .set({
      estado: 'rechazada',
      motivoRechazo: resumen.length > 250 ? `${resumen.slice(0, 250)}…` : resumen,
      fechaRechazo: hoy,
      tramoCorreccion: null
    })
    .where(eq(oferta.id, ofertaId))

  // Un registro de corrección por cada motivo (varios profesionales a la vez).
  for (const m of items) {
    await db.insert(correccion).values({ ofertaId, numeroTramo: m.numeroTramo, motivo: m.motivo })
  }

  // El tramo de aprobación vuelve a pendiente; se reactivará con nuevas fechas
  // cuando TODAS las correcciones se entreguen.
  await db
    .update(tramo)
    .set({ estado: 'pendiente', fechaActivacion: null, fechaLimite: null })
    .where(eq(tramo.id, t4.id))
  await db.update(tarea).set({ estado: 'pendiente' }).where(eq(tarea.tramoId, t4.id))

  // Compromiso de corrección a cada responsable implicado, con SUS motivos.
  const tramosOferta = await db
    .select({ numero: tramo.numero, responsableId: tramo.responsableId })
    .from(tramo)
    .where(eq(tramo.ofertaId, ofertaId))
  const responsablePorNumero = new Map(tramosOferta.map((t) => [t.numero, t.responsableId]))

  const implicados = new Set<number>()
  const motivosPorResponsable = new Map<number, string[]>()
  for (const m of items) {
    const resp = responsablePorNumero.get(m.numeroTramo)
    if (resp === undefined) continue
    implicados.add(resp)
    const lista = motivosPorResponsable.get(resp) ?? []
    lista.push(`(T${m.numeroTramo}) ${m.motivo}`)
    motivosPorResponsable.set(resp, lista)
  }
  for (const [responsableId, lista] of motivosPorResponsable) {
    await notificarCorreccion(db, {
      ofertaId,
      cliente: of.cliente,
      numeroTramo: items.find((m) => responsablePorNumero.get(m.numeroTramo) === responsableId)!
        .numeroTramo,
      responsableId,
      motivo: lista.join(' · ')
    })
  }

  // Y se informa la causa completa a los DEMÁS profesionales del proceso.
  const informados = new Set<number>()
  for (const t of tramosOferta) {
    if (t.responsableId === sesion.id || implicados.has(t.responsableId)) continue
    if (informados.has(t.responsableId)) continue
    informados.add(t.responsableId)
    await notificar(db, {
      usuarioId: t.responsableId,
      tipo: 'compromiso',
      ofertaId,
      mensaje: `La oferta de "${of.cliente}" NO fue aprobada. Motivos: ${resumen.slice(0, 300)}`
    })
  }
}

/**
 * Correcciones de ofertas rechazadas, agrupadas por oferta. Para un
 * profesional, solo las ofertas donde tiene motivos PENDIENTES; para el líder
 * de la unidad (usuarioId = null), todas con el estado de cada motivo.
 */
export async function listarCorrecciones(
  db: DB,
  usuarioId: number | null
): Promise<CorreccionPendiente[]> {
  const filas = await db
    .select({
      ofertaId: oferta.id,
      cliente: oferta.cliente,
      tamano: oferta.tamano,
      fechaRechazo: oferta.fechaRechazo,
      numeroTramo: correccion.numeroTramo,
      motivo: correccion.motivo,
      entregada: correccion.entregada,
      responsableId: tramo.responsableId,
      responsableNombre: usuarioTabla.nombre
    })
    .from(oferta)
    .innerJoin(correccion, eq(correccion.ofertaId, oferta.id))
    .innerJoin(tramo, and(eq(tramo.ofertaId, oferta.id), eq(tramo.numero, correccion.numeroTramo)))
    .innerJoin(usuarioTabla, eq(tramo.responsableId, usuarioTabla.id))
    .where(eq(oferta.estado, 'rechazada'))
    .orderBy(asc(correccion.numeroTramo), asc(correccion.id))

  const visibles =
    usuarioId === null ? filas : filas.filter((f) => f.responsableId === usuarioId && !f.entregada)

  const porOferta = new Map<number, CorreccionPendiente>()
  for (const f of visibles) {
    const entrada = porOferta.get(f.ofertaId) ?? {
      ofertaId: f.ofertaId,
      cliente: f.cliente,
      tamano: f.tamano,
      fechaRechazo: f.fechaRechazo,
      motivos: []
    }
    entrada.motivos.push({
      numeroTramo: f.numeroTramo,
      motivo: f.motivo,
      entregada: f.entregada,
      responsableNombre: f.responsableNombre
    })
    porOferta.set(f.ofertaId, entrada)
  }
  return [...porOferta.values()]
}

/**
 * Entrega de corrección (RN-19): el profesional entrega TODOS sus motivos
 * pendientes de la oferta. Cuando el ÚLTIMO implicado entrega, se acumulan los
 * días hábiles desde el rechazo en `dias_correccion` (sin tocar calificaciones)
 * y la oferta vuelve a aprobación con un nuevo plazo de 1 día hábil.
 */
export async function entregarCorreccion(
  db: DB,
  ofertaId: number,
  hoy: string,
  festivos: Festivos,
  sesion: SesionUsuario
): Promise<void> {
  const of = await obtenerOferta(db, ofertaId)
  if (of.estado !== 'rechazada') {
    throw new Error(`La oferta no está en corrección (estado: ${of.estado})`)
  }
  if (!of.fechaRechazo) throw new Error('La oferta no tiene datos de rechazo consistentes')

  // Motivos pendientes del usuario en esta oferta (vía el responsable del tramo).
  const pendientes = await db
    .select({ correccionId: correccion.id, responsableId: tramo.responsableId })
    .from(correccion)
    .innerJoin(tramo, and(eq(tramo.ofertaId, correccion.ofertaId), eq(tramo.numero, correccion.numeroTramo)))
    .where(and(eq(correccion.ofertaId, ofertaId), eq(correccion.entregada, false)))

  const mios = pendientes.filter((p) => p.responsableId === sesion.id)
  if (mios.length === 0) {
    throw new Error('No tienes correcciones pendientes en esta oferta')
  }
  for (const m of mios) {
    await db
      .update(correccion)
      .set({ entregada: true, entregadaEn: new Date().toISOString() })
      .where(eq(correccion.id, m.correccionId))
  }

  // ¿Quedan correcciones de OTROS profesionales? La oferta sigue en corrección.
  if (pendientes.length > mios.length) return

  // Última entrega: cerrar el ciclo de corrección (RN-19: tiempo aparte).
  const diasUsados = Math.max(0, diferenciaDiasHabiles(of.fechaRechazo, hoy, festivos))
  await db
    .update(oferta)
    .set({
      estado: 'pendiente_aprobacion_final',
      diasCorreccion: of.diasCorreccion + diasUsados,
      fechaRechazo: null
      // motivoRechazo se conserva como traza del último rechazo
    })
    .where(eq(oferta.id, ofertaId))

  // Reactivar el tramo de aprobación con nuevo plazo de 1 día hábil (RN-11).
  const t4 = await obtenerTramoAprobacion(db, ofertaId)
  const activacion = siguienteDiaHabil(hoy, festivos)
  const nuevoLimite = fechaLimiteTramo(activacion, 1, festivos)
  await db
    .update(tramo)
    .set({
      estado: 'en_curso',
      fechaActivacion: activacion,
      fechaLimite: nuevoLimite,
      fechaEntregaReal: null,
      diasHabilesUsados: null,
      desviacionDias: null,
      indicadorCumplimiento: null
    })
    .where(eq(tramo.id, t4.id))
  await db.update(tarea).set({ estado: 'en_curso', completadaEn: null }).where(eq(tarea.tramoId, t4.id))

  // Compromiso al líder: las correcciones llegaron y su revisión vuelve a correr.
  await notificarActivacionTramo(db, {
    tramoId: t4.id,
    ofertaId,
    numero: NUMERO_TRAMO_APROBACION,
    responsableId: t4.responsableId,
    cliente: of.cliente,
    fechaLimite: nuevoLimite,
    esAprobacion: true
  })
}
