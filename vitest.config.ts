import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Las pruebas cubren SOLO lógica de negocio pura (días hábiles, fórmulas,
// recálculo de fechas). No tocan la base de datos ni módulos nativos, por lo
// que corren con Node estándar sin dependencias del driver de SQLite.
export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
    globals: false
  }
})
