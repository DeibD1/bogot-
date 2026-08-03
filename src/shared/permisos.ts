// =============================================================================
//  Permisos por rol (RNF-06, RF-18). Helpers puros, usados tanto por el proceso
//  principal (para hacer cumplir el acceso) como por el renderer (para la UI).
// =============================================================================
import type { Rol } from './dominio.js'

/** El líder de la unidad: acceso de solo lectura a TODA la operación. */
export function esLiderUnidad(rol: Rol): boolean {
  return rol === 'lider_unidad'
}

/** Solo el líder de la unidad aprueba/rechaza ofertas (RN-11, RF-22). */
export function puedeAprobar(rol: Rol): boolean {
  return rol === 'lider_unidad'
}

/** ¿Tiene acceso global (a todas las ofertas y profesionales)? */
export function tieneAccesoGlobal(rol: Rol): boolean {
  return rol === 'lider_unidad'
}

/**
 * ¿Puede CONSULTAR (solo lectura) el estado de cualquier oferta?
 * El líder de la unidad supervisa todo; el líder comercial necesita ver el
 * avance de cualquier oferta en el calendario para informar al cliente.
 */
export function tieneVistaGlobalLectura(rol: Rol): boolean {
  return rol === 'lider_unidad' || rol === 'lider_comercial'
}

/** Solo el líder comercial registra nuevas ofertas (inicia el proceso). */
export function puedeCrearOfertas(rol: Rol): boolean {
  return rol === 'lider_comercial'
}

/** Los roles profesionales gestionan sus propios tramos/ofertas. */
export function esProfesional(rol: Rol): boolean {
  return rol !== 'lider_unidad'
}
