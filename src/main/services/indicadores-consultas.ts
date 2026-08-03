// =============================================================================
//  Consultas de indicadores para el dashboard del líder (§11, RF-13..17, 24..26).
//  Equivalentes en la capa de servicios a las vistas V1 (v_indicador_profesional)
//  y V2 (v_indicador_unidad) del esquema, con filtros por rango de fechas y
//  tamaño (RF-20):
//   - Profesionales: tramos COMPLETADOS cuya fecha de entrega real cae en el rango.
//   - Unidad / ofertas: ofertas APROBADAS cuya finalización real cae en el rango.
// =============================================================================
import { and, eq, isNotNull } from 'drizzle-orm'
import type { DB } from '../db/client.js'
import { oferta, tramo, usuario } from '../db/schema.js'
import { ROLES } from '../../shared/dominio.js'
import type {
  DatosDashboard,
  FiltroIndicadores,
  IndicadorOferta,
  IndicadorProfesional
} from '../../shared/ipc.js'
import { desviacionPromedio, promedio, tasaPuntualidad } from './indicadores.js'

function enRango(fecha: string | null, desde?: string, hasta?: string): boolean {
  if (!fecha) return false
  if (desde && fecha < desde) return false
  if (hasta && fecha > hasta) return false
  return true
}

export async function obtenerIndicadores(db: DB, filtro: FiltroIndicadores): Promise<DatosDashboard> {
  const { desde, hasta } = filtro
  const tamano = filtro.tamano && filtro.tamano !== 'todos' ? filtro.tamano : null

  // --- Tramos completados (base del indicador por profesional, V1) ------------
  const tramosCompletados = await db
    .select({
      responsableId: tramo.responsableId,
      desviacionDias: tramo.desviacionDias,
      indicadorCumplimiento: tramo.indicadorCumplimiento,
      fechaEntregaReal: tramo.fechaEntregaReal,
      tamano: oferta.tamano
    })
    .from(tramo)
    .innerJoin(oferta, eq(tramo.ofertaId, oferta.id))
    .where(and(eq(tramo.estado, 'completado'), isNotNull(tramo.fechaEntregaReal)))

  const tramosFiltrados = tramosCompletados.filter(
    (t) =>
      enRango(t.fechaEntregaReal, desde, hasta) &&
      (!tamano || t.tamano === tamano) &&
      t.desviacionDias !== null &&
      t.indicadorCumplimiento !== null
  )

  const usuarios = await db.select().from(usuario).where(eq(usuario.activo, true))
  const ordenRol = new Map(ROLES.map((r, i) => [r, i]))

  const profesionales: IndicadorProfesional[] = usuarios
    .map((u) => {
      const suyos = tramosFiltrados.filter((t) => t.responsableId === u.id)
      const desviaciones = suyos.map((t) => t.desviacionDias!)
      const calificaciones = suyos.map((t) => Number(t.indicadorCumplimiento))
      return {
        usuarioId: u.id,
        nombre: u.nombre,
        rol: u.rol,
        totalTramos: suyos.length,
        tramosATiempo: desviaciones.filter((d) => d <= 0).length,
        tramosRetrasados: desviaciones.filter((d) => d > 0).length,
        desviacionPromedio: desviacionPromedio(desviaciones),
        tasaPuntualidad: tasaPuntualidad(desviaciones),
        rendimientoPromedio: promedio(calificaciones)
      }
    })
    .sort(
      (a, b) =>
        ordenRol.get(a.rol)! - ordenRol.get(b.rol)! || a.nombre.localeCompare(b.nombre)
    )

  // --- Comparativa §11.5 (RF-16): solo entre quienes tienen tramos ------------
  const conActividad = profesionales.filter((p) => p.totalTramos > 0)
  const masCumplido = conActividad.length
    ? [...conActividad].sort(
        (a, b) =>
          (b.tasaPuntualidad ?? 0) - (a.tasaPuntualidad ?? 0) ||
          (a.desviacionPromedio ?? 0) - (b.desviacionPromedio ?? 0) ||
          a.nombre.localeCompare(b.nombre)
      )[0]!
    : null
  const masAtrasado = conActividad.length
    ? [...conActividad].sort(
        (a, b) =>
          b.tramosRetrasados - a.tramosRetrasados ||
          (b.desviacionPromedio ?? 0) - (a.desviacionPromedio ?? 0) ||
          a.nombre.localeCompare(b.nombre)
      )[0]!
    : null

  // --- Ofertas aprobadas (indicador por oferta y de la unidad, V2) ------------
  const aprobadas = await db.select().from(oferta).where(eq(oferta.estado, 'aprobada'))
  const ofertasFiltradas: IndicadorOferta[] = aprobadas
    .filter(
      (o) =>
        enRango(o.fechaFinalizacionReal, desde, hasta) &&
        (!tamano || o.tamano === tamano) &&
        o.indicadorCumplimiento !== null
    )
    .map((o) => ({
      ofertaId: o.id,
      cliente: o.cliente,
      tamano: o.tamano,
      fechaInicio: o.fechaInicio,
      fechaEntregaComprometida: o.fechaEntregaComprometida,
      fechaFinalizacionReal: o.fechaFinalizacionReal,
      desviacionDias: o.desviacionDias,
      diasCorreccion: o.diasCorreccion,
      indicadorCumplimiento: Number(o.indicadorCumplimiento)
    }))
    .sort((a, b) => (a.fechaFinalizacionReal ?? '').localeCompare(b.fechaFinalizacionReal ?? ''))

  return {
    indicadorUnidad: promedio(ofertasFiltradas.map((o) => o.indicadorCumplimiento!)),
    ofertasConsideradas: ofertasFiltradas.length,
    masCumplido: masCumplido
      ? { nombre: masCumplido.nombre, tasaPuntualidad: masCumplido.tasaPuntualidad ?? 0 }
      : null,
    masAtrasado: masAtrasado
      ? { nombre: masAtrasado.nombre, tramosRetrasados: masAtrasado.tramosRetrasados }
      : null,
    profesionales,
    ofertas: ofertasFiltradas
  }
}
