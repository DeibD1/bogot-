// =============================================================================
//  Planificación y cierre de tramos (núcleo de negocio, RN-02..08, 15, 16).
//  Módulo puro: opera sobre fechas y el conjunto de festivos.
// =============================================================================
import {
  DEFINICION_TRAMOS,
  DURACION_TRAMO_PROFESIONAL,
  PLAZO_TOTAL_DIAS,
  type Rol,
  type Tamano,
  type TipoTarea
} from '../../shared/dominio'
import {
  contarDiasHabiles,
  diferenciaDiasHabiles,
  fechaLimiteTramo,
  normalizarADiaHabil,
  siguienteDiaHabil,
  type Festivos
} from './dias-habiles'
import { indicadorCumplimiento } from './indicadores'

export interface TramoPlanificado {
  numero: number
  rol: Rol
  esAprobacion: boolean
  duracion: number
  fechaActivacion: string
  fechaLimite: string
  tareas: TipoTarea[]
}

export interface PlanOferta {
  tamano: Tamano
  plazoTotalDias: number
  /** Fecha comprometida con el cliente = límite del tramo de ENVÍO (socialización + plazo técnico + aprobación + envío). */
  fechaEntregaComprometida: string
  tramos: TramoPlanificado[]
}

/**
 * Genera el plan completo de una oferta (RF-02): los 6 tramos con sus fechas de
 * activación y límite en días hábiles, encadenados (el siguiente tramo se activa
 * el día hábil siguiente al límite del anterior, asumiendo entregas a tiempo).
 * Los tramos con duración fija (socialización, aprobación, envío) suman 1 día
 * hábil cada uno aparte del plazo técnico 3-3-3 / 2-2-2.
 */
export function planificarOferta(params: {
  tamano: Tamano
  fechaInicio: string
  festivos?: Festivos
  /** Días hábiles de la socialización (la define el comercial al crear; defecto 1). */
  duracionSocializacion?: number
}): PlanOferta {
  const { tamano, fechaInicio, festivos, duracionSocializacion } = params
  const duracionProfesional = DURACION_TRAMO_PROFESIONAL[tamano]

  let activacion = normalizarADiaHabil(fechaInicio, festivos)
  const tramos: TramoPlanificado[] = []

  for (const def of DEFINICION_TRAMOS) {
    const duracion =
      def.numero === 1 && duracionSocializacion
        ? duracionSocializacion
        : (def.duracionFijaDias ?? duracionProfesional)
    const fechaLimite = fechaLimiteTramo(activacion, duracion, festivos)
    tramos.push({
      numero: def.numero,
      rol: def.rol,
      esAprobacion: def.esAprobacion,
      duracion,
      fechaActivacion: activacion,
      fechaLimite,
      tareas: [...def.tareas]
    })
    activacion = siguienteDiaHabil(fechaLimite, festivos)
  }

  const ultimo = tramos[tramos.length - 1]!
  return {
    tamano,
    plazoTotalDias: PLAZO_TOTAL_DIAS[tamano],
    fechaEntregaComprometida: ultimo.fechaLimite,
    tramos
  }
}

export interface CierreTramo {
  diasHabilesUsados: number
  desviacionDias: number
  indicadorCumplimiento: number
}

/**
 * Calcula el cierre de un tramo (RN-07, §11.1/11.2):
 *   días_hábiles_usados = días hábiles inclusivos [activación, entrega]
 *   desviación = días_hábiles_usados − duración_asignada
 *   indicador  = 100 si desviación ≤ 0; si no, máx(0,(1−desv/duración)×100)
 * Cada tramo se mide contra SU duración desde SU activación (un retraso heredado
 * no penaliza al profesional, RN-15).
 */
export function calcularCierreTramo(params: {
  fechaActivacion: string
  duracion: number
  fechaEntregaReal: string
  festivos?: Festivos
}): CierreTramo {
  const { fechaActivacion, duracion, fechaEntregaReal, festivos } = params
  const diasHabilesUsados = contarDiasHabiles(fechaActivacion, fechaEntregaReal, festivos)
  const desviacionDias = diasHabilesUsados - duracion
  return {
    diasHabilesUsados,
    desviacionDias,
    indicadorCumplimiento: indicadorCumplimiento(desviacionDias, duracion)
  }
}

export interface FechasTramo {
  numero: number
  fechaActivacion: string
  fechaLimite: string
}

/**
 * Recalcula en cascada (RN-16 / RF-29) las fechas de activación y límite de los
 * tramos siguientes, a partir de la fecha de entrega real del tramo recién
 * cerrado. El primer tramo siguiente se activa el día hábil siguiente a esa
 * entrega; el resto se encadena. NO modifica calificaciones (RN-15).
 */
export function recalcularDesde(params: {
  fechaEntregaRealTramoCerrado: string
  tramosSiguientes: { numero: number; duracion: number }[]
  festivos?: Festivos
}): FechasTramo[] {
  const { fechaEntregaRealTramoCerrado, tramosSiguientes, festivos } = params
  let activacion = siguienteDiaHabil(fechaEntregaRealTramoCerrado, festivos)
  const resultado: FechasTramo[] = []
  for (const t of tramosSiguientes) {
    const fechaLimite = fechaLimiteTramo(activacion, t.duracion, festivos)
    resultado.push({ numero: t.numero, fechaActivacion: activacion, fechaLimite })
    activacion = siguienteDiaHabil(fechaLimite, festivos)
  }
  return resultado
}

/**
 * Desviación de la oferta (RN-08 / §11.1): diferencia firmada en días hábiles
 * entre la fecha de finalización real y la fecha comprometida.
 * Negativo = adelanto, 0 = a tiempo, positivo = retraso.
 */
export function calcularDesviacionOferta(params: {
  fechaFinalizacionReal: string
  fechaEntregaComprometida: string
  festivos?: Festivos
}): number {
  const { fechaFinalizacionReal, fechaEntregaComprometida, festivos } = params
  return diferenciaDiasHabiles(fechaEntregaComprometida, fechaFinalizacionReal, festivos)
}
