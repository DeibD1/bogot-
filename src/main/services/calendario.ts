// Carga de festivos desde la BD hacia un Set en memoria para el cálculo de días
// hábiles. Capa fina sobre la BD; la lógica pura vive en dias-habiles.ts.
import type { DB } from '../db/client.js'
import { festivo } from '../db/schema.js'
import type { Festivos } from './dias-habiles.js'

export async function cargarFestivos(db: DB): Promise<Festivos> {
  const filas = await db.select({ fecha: festivo.fecha }).from(festivo)
  return new Set(filas.map((f) => f.fecha))
}
