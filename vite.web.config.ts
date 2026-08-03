// Configuración de Vite para el build WEB (SPA de navegador, desplegable en
// Vercel). Es independiente de electron-vite: reutiliza los componentes React
// del renderer pero produce una web estática.
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve('src/web'),
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  css: {
    // postcss.config.js + tailwind.config.js viven en la raíz del proyecto.
    postcss: resolve('.')
  },
  server: {
    port: 5174,
    // En desarrollo, redirige /api al servidor local (npm run server, puerto 3000).
    // 127.0.0.1 explícito (no 'localhost') para evitar que Windows resuelva a IPv6.
    proxy: { '/api': process.env.VITE_API_BASE || 'http://127.0.0.1:3000' }
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true
  }
})
