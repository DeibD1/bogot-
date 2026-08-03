// Arranque de la aplicación WEB (navegador). Reutiliza el mismo App y los
// mismos componentes React del renderer de Electron; la única diferencia es que
// aquí window.api es un cliente HTTP (no el puente IPC de Electron).
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@renderer/App'
import '@renderer/index.css'
import { clienteHttp } from './cliente'

// Los componentes usan window.api.*; en web lo servimos con el cliente HTTP.
window.api = clienteHttp

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
