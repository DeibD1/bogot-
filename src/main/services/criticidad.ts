// =============================================================================
//  Criticidad de un tramo/tarea (RF-08, RF-28): código de colores.
//   - rojo:     vencido (hoy > fecha límite)
//   - amarillo: próximo a vencer (vence hoy o el siguiente día hábil)
//   - verde:    a tiempo
//  Módulo puro y testeable.
// =============================================================================
import type { Criticidad } from '../../shared/ipc.js'
import { contarDiasHabiles, type Festivos } from './dias-habiles.js'

/** Días hábiles restantes (inclusivos) que disparan el "amarillo": hoy o mañana hábil. */
const UMBRAL_PROXIMO = 2

export function calcularCriticidad(
  hoy: string,
  fechaLimite: string | null,
  festivos?: Festivos
): Criticidad {
  if (!fechaLimite) return 'verde'
  if (hoy > fechaLimite) return 'rojo'
  const restantes = contarDiasHabiles(hoy, fechaLimite, festivos) // [hoy, límite]
  return restantes <= UMBRAL_PROXIMO ? 'amarillo' : 'verde'
}
