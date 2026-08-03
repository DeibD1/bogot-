// =============================================================================
//  Cálculo de DÍAS HÁBILES (RN-05).
//  Excluye fines de semana y los festivos de Colombia (tabla `festivo`).
//
//  Convención INCLUSIVA (§6 del documento, confirmada con el usuario):
//   - El día de activación cuenta como día 1.
//   - La fecha límite de un tramo de duración D es el D-ésimo día hábil
//     contando la activación como día 1  ->  sumarDiasHabiles(activacion, D-1).
//   - Los días hábiles usados se cuentan de forma inclusiva [activación, entrega].
//   - El tramo siguiente se activa el día hábil siguiente a la entrega.
//
//  Módulo puro: recibe el conjunto de festivos como parámetro (testeable sin BD).
// =============================================================================
import { addDias, diaSemana } from './fechas.js'

export type Festivos = ReadonlySet<string>

const SIN_FESTIVOS: Festivos = new Set<string>()

/** ¿La fecha cae en fin de semana (sábado o domingo)? */
export function esFinDeSemana(iso: string): boolean {
  const d = diaSemana(iso)
  return d === 0 || d === 6
}

/** ¿Es día hábil? (no fin de semana y no festivo) */
export function esDiaHabil(iso: string, festivos: Festivos = SIN_FESTIVOS): boolean {
  return !esFinDeSemana(iso) && !festivos.has(iso)
}

/** Primer día hábil estrictamente posterior a la fecha dada. */
export function siguienteDiaHabil(iso: string, festivos: Festivos = SIN_FESTIVOS): string {
  let c = addDias(iso, 1)
  while (!esDiaHabil(c, festivos)) c = addDias(c, 1)
  return c
}

/** Devuelve la misma fecha si es hábil; si no, el siguiente día hábil. */
export function normalizarADiaHabil(iso: string, festivos: Festivos = SIN_FESTIVOS): string {
  return esDiaHabil(iso, festivos) ? iso : siguienteDiaHabil(iso, festivos)
}

/**
 * Suma `n` días hábiles a una fecha (la fecha de partida NO se cuenta).
 * sumarDiasHabiles(lunes, 1) = martes;  sumarDiasHabiles(viernes, 1) = lunes.
 */
export function sumarDiasHabiles(iso: string, n: number, festivos: Festivos = SIN_FESTIVOS): string {
  if (n < 0) throw new Error(`sumarDiasHabiles: n no puede ser negativo (${n})`)
  let c = iso
  let contados = 0
  while (contados < n) {
    c = addDias(c, 1)
    if (esDiaHabil(c, festivos)) contados++
  }
  return c
}

/** Resta `n` días hábiles a una fecha (la fecha de partida NO se cuenta). */
export function restarDiasHabiles(iso: string, n: number, festivos: Festivos = SIN_FESTIVOS): string {
  if (n < 0) throw new Error(`restarDiasHabiles: n no puede ser negativo (${n})`)
  let c = iso
  let contados = 0
  while (contados < n) {
    c = addDias(c, -1)
    if (esDiaHabil(c, festivos)) contados++
  }
  return c
}

/**
 * Cuenta los días hábiles en el rango INCLUSIVO [inicio, fin].
 * Si fin < inicio devuelve 0.  contar(lunes, miércoles) = 3 (lun, mar, mié).
 */
export function contarDiasHabiles(inicio: string, fin: string, festivos: Festivos = SIN_FESTIVOS): number {
  let c = inicio
  let total = 0
  while (c <= fin) {
    if (esDiaHabil(c, festivos)) total++
    c = addDias(c, 1)
  }
  return total
}

/**
 * Fecha límite de un tramo según la convención inclusiva: el D-ésimo día hábil
 * contando la activación como día 1. Requiere que `activacion` sea día hábil.
 * fechaLimiteTramo(lunes, 3) = miércoles;  fechaLimiteTramo(lunes, 1) = lunes.
 */
export function fechaLimiteTramo(activacion: string, duracion: number, festivos: Festivos = SIN_FESTIVOS): string {
  if (duracion < 1) throw new Error(`duración debe ser >= 1 (${duracion})`)
  return sumarDiasHabiles(activacion, duracion - 1, festivos)
}

/**
 * Diferencia firmada en días hábiles entre dos fechas (fin − inicio), como un
 * desplazamiento: 0 si son la misma fecha, +k si `fin` está k días hábiles
 * después de `inicio`, −k si antes. (No es un conteo inclusivo de duración.)
 * Se usa para la desviación de la oferta (§11.1).
 */
export function diferenciaDiasHabiles(inicio: string, fin: string, festivos: Festivos = SIN_FESTIVOS): number {
  if (inicio === fin) return 0
  if (inicio < fin) return contarDiasHabiles(inicio, fin, festivos) - 1
  return -(contarDiasHabiles(fin, inicio, festivos) - 1)
}
