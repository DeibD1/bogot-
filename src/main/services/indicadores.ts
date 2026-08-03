// =============================================================================
//  Indicadores de cumplimiento (§11 del documento).
//  Módulo puro de fórmulas.
// =============================================================================

/** Redondea a 2 decimales (presentación de porcentajes 0.00..100.00). */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Indicador de cumplimiento de un tramo u oferta (§11.2 / RN-09).
 *   desviación ≤ 0  -> 100  (un adelanto se topa en 100, sin premio extra)
 *   desviación > 0  -> máx(0, (1 − desviación / divisor) × 100)
 * divisor = duración asignada (tramo) o plazo_total (oferta).
 */
export function indicadorCumplimiento(desviacion: number, divisor: number): number {
  if (divisor <= 0) throw new Error(`divisor debe ser > 0 (${divisor})`)
  if (desviacion <= 0) return 100
  return redondear2(Math.max(0, (1 - desviacion / divisor) * 100))
}

/** Promedio simple (devuelve null si no hay valores). */
export function promedio(valores: readonly number[]): number | null {
  if (valores.length === 0) return null
  const suma = valores.reduce((a, b) => a + b, 0)
  return redondear2(suma / valores.length)
}

/**
 * Rendimiento promedio de un profesional (§11.6 / RF-25):
 * promedio de las calificaciones (indicadores de cumplimiento) de sus tramos.
 */
export function rendimientoPromedio(calificacionesTramo: readonly number[]): number | null {
  return promedio(calificacionesTramo)
}

/**
 * Indicador de cumplimiento de la unidad (§11.6 / RF-24):
 * promedio de los indicadores de cumplimiento de todas las ofertas.
 */
export function indicadorUnidad(indicadoresOferta: readonly number[]): number | null {
  return promedio(indicadoresOferta)
}

/** Tasa de puntualidad (§11.3): % de tramos entregados a tiempo o antes. */
export function tasaPuntualidad(desviacionesTramo: readonly number[]): number | null {
  if (desviacionesTramo.length === 0) return null
  const aTiempo = desviacionesTramo.filter((d) => d <= 0).length
  return redondear2((aTiempo / desviacionesTramo.length) * 100)
}

/** Desviación promedio (en días) de los tramos de un profesional (§11.3). */
export function desviacionPromedio(desviacionesTramo: readonly number[]): number | null {
  return promedio(desviacionesTramo)
}
