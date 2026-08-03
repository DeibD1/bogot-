import { defineConfig } from 'drizzle-kit'
import { resolveDbDestino, esUrlPostgres } from './src/main/db/path'

// drizzle-kit se usa para generar/inspeccionar migraciones a partir del schema.
// En runtime, la app aplica el esquema con scripts/migrate.ts.
const destino = resolveDbDestino()

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: esUrlPostgres(destino) ? destino : 'postgres://localhost:5432/gestor_ofertas'
  }
})
