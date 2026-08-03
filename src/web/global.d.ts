// Tipado global de window.api para el frontend web. En la app de escritorio
// esto lo declaraba el preload de Electron; en la web lo declara aquí, y en
// tiempo de ejecución se asigna window.api = clienteHttp (ver main.tsx).
import type { ApiPuente } from '@shared/ipc'

declare global {
  interface Window {
    api: ApiPuente
  }
}

export {}
