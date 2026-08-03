/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base de la API (vacío = mismo origen). Solo se usa en desarrollo. */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
