// =============================================================================
//  Consultas para el dashboard, con ALCANCE POR ROL (RNF-06, RF-18).
//   - Líder de la unidad: ve todas las ofertas (solo lectura).
//   - Profesionales: solo las ofertas donde son responsables de algún tramo
//     o que ellos crearon.
// =============================================================================
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import type { DB } from '../db/client.js'
import { festivo, oferta, subtarea, tarea, tramo, usuario } from '../db/schema.js'
import { ROLES, TOTAL_TRAMOS } from '../../shared/dominio.js'
import { tieneVistaGlobalLectura } from '../../shared/permisos.js'
import type {
  AgendaDia,
  AgendaItem,
  DetalleOferta,
  DetalleTramo,
  DiaCalendarioUnidad,
  DiaLinea,
  Estadisticas,
  FilaLinea,
  ItemCalendarioUnidad,
  LineaTiempo,
  OfertaResumen,
  SesionUsuario,
  SubtareaInfo,
  TramoAsignado,
  TramoLinea
} from '../../shared/ipc.js'
import { listarAdjuntosOferta } from './adjuntos.js'
import { calcularCriticidad } from './criticidad.js'
import { esDiaHabil, type Festivos } from './dias-habiles.js'
import { addDias } from './fechas.js'

/** Ofertas visibles para la sesión: 'todas' o una lista de ids. */
export async function idsOfertasVisibles(db: DB, sesion: SesionUsuario): Promise<'todas' | number[]> {
  if (tieneVistaGlobalLectura(sesion.rol)) return 'todas'
  const porTramo = await db
    .selectDistinct({ id: tramo.ofertaId })
    .from(tramo)
    .where(eq(tramo.responsableId, sesion.id))
  const porCreador = await db.select({ id: oferta.id }).from(oferta).where(eq(oferta.creadoPor, sesion.id))
  const ids = new Set<number>()
  for (const r of porTramo) ids.add(r.id)
  for (const r of porCreador) ids.add(r.id)
  return [...ids]
}

const SELECT_RESUMEN = {
  id: oferta.id,
  cliente: oferta.cliente,
  tamano: oferta.tamano,
  estado: oferta.estado,
  fechaInicio: oferta.fechaInicio,
  fechaEntregaComprometida: oferta.fechaEntregaComprometida,
  tramoActual: sql<number | null>`(
    SELECT MIN(t.numero) FROM ${tramo} t
    WHERE t.oferta_id = ${oferta.id} AND t.estado <> 'completado'
  )`
}

export async function obtenerResumenOfertas(db: DB, sesion: SesionUsuario): Promise<OfertaResumen[]> {
  const visibles = await idsOfertasVisibles(db, sesion)
  if (visibles !== 'todas' && visibles.length === 0) return []
  const consulta = db.select(SELECT_RESUMEN).from(oferta)
  const filas =
    visibles === 'todas' ? await consulta : await consulta.where(inArray(oferta.id, visibles))
  return filas as OfertaResumen[]
}

export async function obtenerEstadisticas(
  db: DB,
  sesion: SesionUsuario,
  rutaDb: string
): Promise<Estadisticas> {
  const visibles = await idsOfertasVisibles(db, sesion)

  let ofertas: number
  let tramos: number
  let tareas: number
  if (visibles === 'todas') {
    ofertas = (await db.select({ n: count() }).from(oferta))[0]!.n
    tramos = (await db.select({ n: count() }).from(tramo))[0]!.n
    tareas = (await db.select({ n: count() }).from(tarea))[0]!.n
  } else if (visibles.length === 0) {
    ofertas = 0
    tramos = 0
    tareas = 0
  } else {
    ofertas = visibles.length
    tramos = (
      await db.select({ n: count() }).from(tramo).where(inArray(tramo.ofertaId, visibles))
    )[0]!.n
    tareas = (
      await db
        .select({ n: count() })
        .from(tarea)
        .innerJoin(tramo, eq(tarea.tramoId, tramo.id))
        .where(inArray(tramo.ofertaId, visibles))
    )[0]!.n
  }

  return {
    usuarios: (await db.select({ n: count() }).from(usuario))[0]!.n,
    festivos: (await db.select({ n: count() }).from(festivo))[0]!.n,
    ofertas,
    tramos,
    tareas,
    rutaDb
  }
}

/** Subtareas de un conjunto de tareas, agrupadas por tarea. */
export async function cargarSubtareas(db: DB, tareaIds: number[]): Promise<Map<number, SubtareaInfo[]>> {
  const mapa = new Map<number, SubtareaInfo[]>()
  if (tareaIds.length === 0) return mapa
  const filas = await db
    .select({
      id: subtarea.id,
      tareaId: subtarea.tareaId,
      descripcion: subtarea.descripcion,
      completada: subtarea.completada
    })
    .from(subtarea)
    .where(inArray(subtarea.tareaId, tareaIds))
    .orderBy(asc(subtarea.id))
  for (const f of filas) {
    const lista = mapa.get(f.tareaId) ?? []
    lista.push(f)
    mapa.set(f.tareaId, lista)
  }
  return mapa
}

// --- Fase 3: vistas del profesional (RF-04, RF-05, RF-07, RF-08) -------------

/**
 * Tramos asignados al profesional (en curso y pendientes), con sus tareas y la
 * criticidad calculada respecto a HOY. Ordenados por fecha límite.
 */
export async function obtenerMisTramos(
  db: DB,
  sesion: SesionUsuario,
  hoy: string,
  festivos: Festivos
): Promise<TramoAsignado[]> {
  const filas = await db
    .select({
      tramoId: tramo.id,
      ofertaId: tramo.ofertaId,
      cliente: oferta.cliente,
      tamano: oferta.tamano,
      numero: tramo.numero,
      duracionDias: tramo.duracionAsignadaDias,
      fechaActivacion: tramo.fechaActivacion,
      fechaLimite: tramo.fechaLimite,
      estado: tramo.estado
    })
    .from(tramo)
    .innerJoin(oferta, eq(tramo.ofertaId, oferta.id))
    .where(and(eq(tramo.responsableId, sesion.id), inArray(tramo.estado, ['en_curso', 'pendiente'])))
    .orderBy(asc(tramo.fechaLimite), asc(tramo.id))

  const resultado: TramoAsignado[] = []
  for (const f of filas) {
    const tareas = await db
      .select({
        id: tarea.id,
        tipo: tarea.tipo,
        descripcion: tarea.descripcion,
        estado: tarea.estado,
        completadaEn: tarea.completadaEn
      })
      .from(tarea)
      .where(eq(tarea.tramoId, f.tramoId))
      .orderBy(asc(tarea.id))
    const subtareasPorTarea = await cargarSubtareas(db, tareas.map((t) => t.id))

    resultado.push({
      ...f,
      // Un tramo aún pendiente no está "vencido" para su responsable: su plazo
      // no ha empezado (RN-04). La criticidad solo aplica al tramo en curso.
      criticidad: f.estado === 'en_curso' ? calcularCriticidad(hoy, f.fechaLimite, festivos) : 'verde',
      tareas: tareas.map((t) => ({ ...t, subtareas: subtareasPorTarea.get(t.id) ?? [] }))
    })
  }
  return resultado
}

/**
 * Agenda día a día (RF-05): para los próximos `dias` días calendario, qué
 * tramos del profesional están en ventana de trabajo [activación, límite].
 */
export async function obtenerAgenda(
  db: DB,
  sesion: SesionUsuario,
  hoy: string,
  dias: number,
  festivos: Festivos
): Promise<AgendaDia[]> {
  const tramos = await obtenerMisTramos(db, sesion, hoy, festivos)
  const agenda: AgendaDia[] = []

  for (let i = 0; i < dias; i++) {
    const fecha = addDias(hoy, i)
    const items: AgendaItem[] = []
    for (const t of tramos) {
      if (!t.fechaActivacion || !t.fechaLimite) continue
      if (fecha < t.fechaActivacion || fecha > t.fechaLimite) continue
      items.push({
        tramoId: t.tramoId,
        ofertaId: t.ofertaId,
        cliente: t.cliente,
        numero: t.numero,
        esActivacion: fecha === t.fechaActivacion,
        esLimite: fecha === t.fechaLimite,
        criticidad: t.criticidad
      })
    }
    agenda.push({ fecha, esHabil: esDiaHabil(fecha, festivos), items })
  }
  return agenda
}

/**
 * Línea de tiempo día a día por profesional (RF-05/RF-18 ampliado): tramos de
 * todas las ofertas como barras [activación, fin], donde fin = entrega real si
 * existe (muestra retrasos reales) o la fecha límite planificada.
 * El líder de la unidad ve a todos los profesionales; un profesional, solo su fila.
 */
export async function obtenerLineaTiempo(
  db: DB,
  sesion: SesionUsuario,
  hoy: string,
  festivos: Festivos,
  diasAtras: number,
  diasAdelante: number
): Promise<LineaTiempo> {
  const desde = addDias(hoy, -diasAtras)
  const hasta = addDias(hoy, diasAdelante)

  const dias: DiaLinea[] = []
  for (let i = 0; i <= diasAtras + diasAdelante; i++) {
    const fecha = addDias(desde, i)
    dias.push({ fecha, esHabil: esDiaHabil(fecha, festivos), esHoy: fecha === hoy })
  }

  const filasBd = await db
    .select({
      tramoId: tramo.id,
      ofertaId: tramo.ofertaId,
      cliente: oferta.cliente,
      tamano: oferta.tamano,
      numero: tramo.numero,
      estado: tramo.estado,
      desviacionDias: tramo.desviacionDias,
      fechaActivacion: tramo.fechaActivacion,
      fechaLimite: tramo.fechaLimite,
      fechaEntregaReal: tramo.fechaEntregaReal,
      usuarioId: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol
    })
    .from(tramo)
    .innerJoin(usuario, eq(tramo.responsableId, usuario.id))
    .innerJoin(oferta, eq(tramo.ofertaId, oferta.id))
    .orderBy(asc(tramo.fechaActivacion), asc(tramo.id))

  const visiblesPara = tieneVistaGlobalLectura(sesion.rol)
    ? filasBd
    : filasBd.filter((f) => f.usuarioId === sesion.id)

  const porUsuario = new Map<number, FilaLinea>()
  for (const f of visiblesPara) {
    if (!f.fechaActivacion || !f.fechaLimite) continue
    const fechaFin = f.fechaEntregaReal ?? f.fechaLimite
    // Solo tramos que intersectan la ventana visible.
    if (f.fechaActivacion > hasta || fechaFin < desde) continue

    const criticidad =
      f.estado === 'completado'
        ? (f.desviacionDias ?? 0) <= 0
          ? 'verde'
          : 'rojo'
        : f.estado === 'en_curso'
          ? calcularCriticidad(hoy, f.fechaLimite, festivos)
          : 'verde'

    const barra: TramoLinea = {
      tramoId: f.tramoId,
      ofertaId: f.ofertaId,
      cliente: f.cliente,
      tamano: f.tamano,
      numero: f.numero,
      estado: f.estado,
      criticidad,
      fechaActivacion: f.fechaActivacion,
      fechaFin,
      fechaLimite: f.fechaLimite,
      fechaEntregaReal: f.fechaEntregaReal
    }

    const fila = porUsuario.get(f.usuarioId)
    if (fila) {
      fila.tramos.push(barra)
    } else {
      porUsuario.set(f.usuarioId, {
        usuarioId: f.usuarioId,
        nombre: f.nombre,
        rol: f.rol,
        tramos: [barra]
      })
    }
  }

  // Orden estable: por rol (según el flujo) y luego por nombre.
  const ordenRol = new Map(ROLES.map((r, i) => [r, i]))
  const filas = [...porUsuario.values()].sort(
    (a, b) => (ordenRol.get(a.rol)! - ordenRol.get(b.rol)!) || a.nombre.localeCompare(b.nombre)
  )

  return { dias, filas }
}

/**
 * Calendario general de la unidad: para cada día de la ventana, las actividades
 * de TODOS los profesionales (tramos en curso y planificados), destacando el
 * ENVÍO de la oferta al cliente como hito de cierre de cada proceso.
 * Acceso: líder de la unidad y líder comercial (vista global de lectura).
 * Un tramo en curso ya vencido sigue apareciendo HOY (hay que terminarlo).
 */
export async function obtenerCalendarioUnidad(
  db: DB,
  sesion: SesionUsuario,
  hoy: string,
  dias: number,
  festivos: Festivos
): Promise<DiaCalendarioUnidad[]> {
  if (!tieneVistaGlobalLectura(sesion.rol)) {
    throw new Error('Solo el líder de la unidad o el líder comercial pueden ver el calendario de la unidad')
  }

  const filas = await db
    .select({
      tramoId: tramo.id,
      ofertaId: tramo.ofertaId,
      cliente: oferta.cliente,
      numero: tramo.numero,
      estado: tramo.estado,
      fechaActivacion: tramo.fechaActivacion,
      fechaLimite: tramo.fechaLimite,
      responsableNombre: usuario.nombre,
      responsableRol: usuario.rol
    })
    .from(tramo)
    .innerJoin(usuario, eq(tramo.responsableId, usuario.id))
    .innerJoin(oferta, eq(tramo.ofertaId, oferta.id))
    .where(inArray(tramo.estado, ['en_curso', 'pendiente']))

  const ordenRol = new Map(ROLES.map((r, i) => [r, i]))
  const calendario: DiaCalendarioUnidad[] = []

  for (let i = 0; i < dias; i++) {
    const fecha = addDias(hoy, i)
    const items: ItemCalendarioUnidad[] = []

    for (const t of filas) {
      if (!t.fechaActivacion || !t.fechaLimite) continue
      // Ventana visual: un tramo EN CURSO vencido se extiende hasta hoy.
      const fin = t.estado === 'en_curso' && t.fechaLimite < hoy ? hoy : t.fechaLimite
      if (fecha < t.fechaActivacion || fecha > fin) continue
      items.push({
        tramoId: t.tramoId,
        ofertaId: t.ofertaId,
        cliente: t.cliente,
        numero: t.numero,
        responsableNombre: t.responsableNombre,
        responsableRol: t.responsableRol,
        esActivacion: fecha === t.fechaActivacion,
        esLimite: fecha === t.fechaLimite,
        criticidad:
          t.estado === 'en_curso' ? calcularCriticidad(hoy, t.fechaLimite, festivos) : 'verde',
        esEnvio: t.numero === TOTAL_TRAMOS
      })
    }

    // Los envíos (hito de cierre) primero; luego por orden del flujo y cliente.
    items.sort(
      (a, b) =>
        Number(b.esEnvio) - Number(a.esEnvio) ||
        ordenRol.get(a.responsableRol)! - ordenRol.get(b.responsableRol)! ||
        a.cliente.localeCompare(b.cliente)
    )
    calendario.push({ fecha, esHabil: esDiaHabil(fecha, festivos), esHoy: fecha === hoy, items })
  }
  return calendario
}

/**
 * Detalle completo de una oferta (RF-09 / RF-19), de solo lectura: datos
 * generales, los 4 tramos con responsable, fechas, medición y tareas, y los
 * adjuntos compartidos. Acceso: líder de la unidad (global) o un profesional
 * que participe en la oferta (responsable de algún tramo o su creador).
 */
export async function obtenerDetalleOferta(
  db: DB,
  ofertaId: number,
  sesion: SesionUsuario,
  hoy: string,
  festivos: Festivos
): Promise<DetalleOferta> {
  const filasOferta = await db.select().from(oferta).where(eq(oferta.id, ofertaId))
  const of = filasOferta[0]
  if (!of) throw new Error(`La oferta ${ofertaId} no existe`)

  const tramosBd = await db
    .select({
      tramoId: tramo.id,
      numero: tramo.numero,
      responsableNombre: usuario.nombre,
      responsableRol: usuario.rol,
      duracionDias: tramo.duracionAsignadaDias,
      fechaActivacion: tramo.fechaActivacion,
      fechaLimite: tramo.fechaLimite,
      fechaEntregaReal: tramo.fechaEntregaReal,
      diasHabilesUsados: tramo.diasHabilesUsados,
      desviacionDias: tramo.desviacionDias,
      indicadorCumplimiento: tramo.indicadorCumplimiento,
      estado: tramo.estado,
      responsableId: tramo.responsableId
    })
    .from(tramo)
    .innerJoin(usuario, eq(tramo.responsableId, usuario.id))
    .where(eq(tramo.ofertaId, ofertaId))
    .orderBy(asc(tramo.numero))

  // Control de acceso (RNF-06): global, o participante de la oferta.
  const participa =
    of.creadoPor === sesion.id || tramosBd.some((t) => t.responsableId === sesion.id)
  if (!tieneVistaGlobalLectura(sesion.rol) && !participa) {
    throw new Error('No tienes acceso a esta oferta')
  }

  const tramos: DetalleTramo[] = []
  for (const t of tramosBd) {
    const tareasBd = await db
      .select({
        id: tarea.id,
        tipo: tarea.tipo,
        descripcion: tarea.descripcion,
        estado: tarea.estado,
        completadaEn: tarea.completadaEn
      })
      .from(tarea)
      .where(eq(tarea.tramoId, t.tramoId))
      .orderBy(asc(tarea.id))
    const subtareasPorTarea = await cargarSubtareas(db, tareasBd.map((x) => x.id))
    const tareas = tareasBd.map((x) => ({ ...x, subtareas: subtareasPorTarea.get(x.id) ?? [] }))

    tramos.push({
      tramoId: t.tramoId,
      numero: t.numero,
      responsableId: t.responsableId,
      responsableNombre: t.responsableNombre,
      responsableRol: t.responsableRol,
      duracionDias: t.duracionDias,
      fechaActivacion: t.fechaActivacion,
      fechaLimite: t.fechaLimite,
      fechaEntregaReal: t.fechaEntregaReal,
      diasHabilesUsados: t.diasHabilesUsados,
      desviacionDias: t.desviacionDias,
      indicadorCumplimiento:
        t.indicadorCumplimiento === null ? null : Number(t.indicadorCumplimiento),
      estado: t.estado,
      criticidad:
        t.estado === 'completado'
          ? (t.desviacionDias ?? 0) <= 0
            ? 'verde'
            : 'rojo'
          : t.estado === 'en_curso'
            ? calcularCriticidad(hoy, t.fechaLimite, festivos)
            : 'verde',
      tareas
    })
  }

  return {
    id: of.id,
    cliente: of.cliente,
    tamano: of.tamano,
    estado: of.estado,
    fechaInicio: of.fechaInicio,
    plazoTotalDias: of.plazoTotalDias,
    fechaEntregaComprometida: of.fechaEntregaComprometida,
    fechaFinalizacionReal: of.fechaFinalizacionReal,
    fechaAprobUnidad: of.fechaAprobUnidad,
    desviacionDias: of.desviacionDias,
    indicadorCumplimiento:
      of.indicadorCumplimiento === null ? null : Number(of.indicadorCumplimiento),
    diasCorreccion: of.diasCorreccion,
    motivoRechazo: of.motivoRechazo,
    tramoCorreccion: of.tramoCorreccion,
    tramos,
    adjuntos: await listarAdjuntosOferta(db, ofertaId)
  }
}
