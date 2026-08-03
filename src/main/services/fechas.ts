// =============================================================================
//  Utilidades de fechas en formato ISO 'YYYY-MM-DD'.
//  Se trabaja en UTC para evitar desfases por zona horaria/horario de verano.
//  Módulo puro: sin dependencias de BD ni de festivos.
// =============================================================================

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** Convierte 'YYYY-MM-DD' a Date en UTC (medianoche). Lanza si el formato es inválido. */
export function parseISO(iso: string): Date {
  const m = RE_ISO.exec(iso)
  if (!m) throw new Error(`Fecha ISO inválida: "${iso}" (se espera YYYY-MM-DD)`)
  const anio = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  // Valida que la fecha exista realmente (p. ej. rechaza 2026-02-30).
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new Error(`Fecha ISO inexistente: "${iso}"`)
  }
  return d
}

/** Convierte un Date a 'YYYY-MM-DD' (en UTC). */
export function toISO(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Suma (o resta, con n negativo) n días calendario a una fecha ISO. */
export function addDias(iso: string, n: number): string {
  const d = parseISO(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}

/** Día de la semana: 0=domingo, 1=lunes, …, 6=sábado. */
export function diaSemana(iso: string): number {
  return parseISO(iso).getUTCDay()
}

/** Comparación de fechas ISO (lexicográfica, válida para 'YYYY-MM-DD'). */
export function esAntesODe(a: string, b: string): boolean {
  return a <= b
}

/** Fecha de HOY en hora local del equipo, como 'YYYY-MM-DD'. */
export function hoyLocalISO(): string {
  const d = new Date()
  const y = String(d.getFullYear()).padStart(4, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}
