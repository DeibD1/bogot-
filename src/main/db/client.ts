import { mkdirSync } from 'node:fs'
import { Pool } from 'pg'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { schema } from './schema.js'
import { esUrlPostgres, resolveDbDestino } from './path.js'

/** Tipo común de base de datos (válido para node-postgres y PGlite). */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>

export interface Conexion {
  db: DB
  /** 'postgres' = servidor compartido (multiusuario); 'local' = PGlite embebido. */
  modo: 'postgres' | 'local'
  /** Descripción legible del destino (para mostrar en la UI/diagnóstico). */
  destino: string
  /** Ejecuta SQL crudo multi-sentencia (DDL). */
  ejecutar: (sql: string) => Promise<void>
  /** Consulta SQL cruda con parámetros posicionales ($1, $2, …). */
  consultar: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>
  cerrar: () => Promise<void>
}

/**
 * Abre la base de datos según el destino:
 *  - URL postgres://…  -> servidor PostgreSQL compartido (multiusuario en red).
 *  - ':memory:'        -> PGlite en memoria (tests).
 *  - ruta de carpeta   -> PGlite persistente local (sin servidor).
 * En todos los casos la app trabaja contra el MISMO dialecto (PostgreSQL),
 * por lo que la lógica y las consultas son idénticas.
 */
export async function crearConexion(destino: string = resolveDbDestino()): Promise<Conexion> {
  if (esUrlPostgres(destino)) {
    const pool = new Pool({ connectionString: destino, max: 5 })
    const db = drizzlePg(pool, { schema })
    const url = new URL(destino)
    return {
      db,
      modo: 'postgres',
      destino: `PostgreSQL ${url.hostname}:${url.port || 5432}/${url.pathname.slice(1)}`,
      ejecutar: async (sql) => {
        await pool.query(sql)
      },
      consultar: async (sql, params = []) =>
        (await pool.query(sql, params as unknown[])).rows as Record<string, unknown>[],
      cerrar: () => pool.end()
    }
  }

  if (destino !== ':memory:') mkdirSync(destino, { recursive: true })
  // PGlite (WASM) solo se usa en modo local/pruebas: se importa de forma
  // dinámica para NO incluirlo en el bundle serverless de producción (Postgres).
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite')
  const pglite = destino === ':memory:' ? new PGlite() : new PGlite(destino)
  const db = drizzlePglite(pglite, { schema }) as unknown as DB
  return {
    db,
    modo: 'local',
    destino: destino === ':memory:' ? 'PGlite en memoria' : `PGlite local: ${destino}`,
    ejecutar: async (sql) => {
      await pglite.exec(sql)
    },
    consultar: async (sql, params = []) =>
      (await pglite.query(sql, params as unknown[])).rows as Record<string, unknown>[],
    cerrar: () => pglite.close()
  }
}
