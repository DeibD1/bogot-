// Almacenamiento de adjuntos con dos "drivers":
//  - Supabase Storage (producción / Vercel): el NAVEGADOR sube directo a Supabase
//    con una URL firmada de un solo uso (evita el límite de ~4.5 MB del body de
//    las funciones serverless). La descarga también usa URLs firmadas de corta vida.
//  - Disco local (servidor propio / desarrollo): el archivo pasa por la API.
// Se elige Supabase si hay SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import {
  CARPETA_ADJUNTOS,
  SUPABASE_ANON_KEY,
  SUPABASE_BUCKET_ADJUNTOS,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL
} from './config'

export type ModoAlmacenamiento = 'supabase' | 'local'

export const modoAlmacenamiento = (): ModoAlmacenamiento =>
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'local'

const API = (): string => `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1`
const cabecerasServicio = (): Record<string, string> => ({
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  'Content-Type': 'application/json'
})
const rutaUrl = (ruta: string): string => ruta.split('/').map(encodeURIComponent).join('/')

async function errorSupabase(res: Response, texto: string): Promise<Error> {
  const detalle = await res.text().catch(() => '')
  console.error(`[storage] ${texto}: ${res.status} ${detalle}`)
  return new Error(`${texto}. Verifica la configuración de Supabase Storage (bucket "${SUPABASE_BUCKET_ADJUNTOS}").`)
}

export interface DestinoSubida {
  modo: ModoAlmacenamiento
  /** URL (absoluta en Supabase, relativa a /api en local) a la que el cliente sube con PUT. */
  url: string
  /** Cabeceras extra que el cliente debe enviar en la subida. */
  headers?: Record<string, string>
}

/** Prepara la subida de `ruta`. `urlLocal` es el endpoint de la API para el modo local. */
export async function prepararSubida(ruta: string, urlLocal: string): Promise<DestinoSubida> {
  if (modoAlmacenamiento() === 'local') return { modo: 'local', url: urlLocal }

  const res = await fetch(`${API()}/object/upload/sign/${SUPABASE_BUCKET_ADJUNTOS}/${rutaUrl(ruta)}`, {
    method: 'POST',
    headers: cabecerasServicio(),
    body: '{}'
  })
  if (!res.ok) throw await errorSupabase(res, 'No se pudo preparar la subida del archivo')
  const { url } = (await res.json()) as { url: string }
  return {
    modo: 'supabase',
    url: `${API()}${url}`,
    headers: SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : undefined
  }
}

/** Ruta absoluta en disco (modo local), garantizando que no escape de la carpeta base. */
export function rutaLocal(ruta: string): string {
  const base = resolve(CARPETA_ADJUNTOS)
  const destino = resolve(base, ruta)
  if (!destino.startsWith(base + sep)) throw new Error('Ruta de archivo inválida')
  return destino
}

/** Guarda el contenido en disco (modo local). */
export async function guardarLocal(ruta: string, contenido: Buffer): Promise<void> {
  const destino = rutaLocal(ruta)
  await mkdir(dirname(destino), { recursive: true })
  await writeFile(destino, contenido)
}

/** ¿El objeto ya existe en el almacenamiento? (se verifica antes de registrarlo en la BD). */
export async function existeArchivo(ruta: string): Promise<boolean> {
  if (modoAlmacenamiento() === 'local') {
    return stat(rutaLocal(ruta)).then((s) => s.isFile(), () => false)
  }
  const res = await fetch(`${API()}/object/info/${SUPABASE_BUCKET_ADJUNTOS}/${rutaUrl(ruta)}`, {
    headers: cabecerasServicio()
  })
  return res.ok
}

/** URL firmada de descarga de corta duración (solo Supabase). */
export async function urlDescarga(ruta: string, segundos = 120): Promise<string> {
  const res = await fetch(`${API()}/object/sign/${SUPABASE_BUCKET_ADJUNTOS}/${rutaUrl(ruta)}`, {
    method: 'POST',
    headers: cabecerasServicio(),
    body: JSON.stringify({ expiresIn: segundos })
  })
  if (!res.ok) throw await errorSupabase(res, 'No se pudo generar el enlace de descarga')
  const { signedURL } = (await res.json()) as { signedURL: string }
  return `${API()}${signedURL}`
}
