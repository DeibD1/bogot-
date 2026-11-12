// Utilidades PURAS para los archivos adjuntos (sin E/S ni configuración):
// nombres seguros, rutas de almacenamiento y validación anti "path traversal".
import { randomUUID } from 'node:crypto'

/** Tamaño máximo de un adjunto (25 MB). */
export const MAX_ADJUNTO_BYTES = 25 * 1024 * 1024

/** Deja solo caracteres seguros en el nombre de archivo (conserva la extensión). */
export function nombreSeguro(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? ''
  const limpio = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // sin tildes
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-120)
  return limpio || 'archivo'
}

/** Ruta de almacenamiento: oferta-<id>/tramo-<id>/<uuid>-<nombre seguro>. */
export function construirRuta(ofertaId: number, tramoId: number, nombre: string): string {
  return `oferta-${ofertaId}/tramo-${tramoId}/${randomUUID()}-${nombreSeguro(nombre)}`
}

const RE_RUTA = /^oferta-\d+\/tramo-\d+\/[A-Za-z0-9._-]+$/

/** ¿La ruta tiene el formato esperado y pertenece a ese tramo de esa oferta? */
export function rutaValidaParaTramo(ruta: string, ofertaId: number, tramoId: number): boolean {
  return RE_RUTA.test(ruta) && ruta.startsWith(`oferta-${ofertaId}/tramo-${tramoId}/`) && !ruta.includes('..')
}
