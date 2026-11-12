// Utilidades de imagen del lado del navegador para el soporte técnico:
// reducen y comprimen pantallazos/imágenes para que quepan en el límite del reporte.

/** Límite del data URL (el servidor acepta ~4.5 M de caracteres). */
const MAX_CARACTERES = 4_000_000
const ANCHO_MAX = 1600

/** Dibuja la fuente en un canvas reducido y la exporta como JPEG, bajando la calidad si hace falta. */
function aJpeg(fuente: CanvasImageSource, ancho: number, alto: number): string {
  const escala = Math.min(1, ANCHO_MAX / ancho)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(ancho * escala))
  canvas.height = Math.max(1, Math.round(alto * escala))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen en este navegador')
  ctx.fillStyle = '#ffffff' // evita fondo negro en PNG con transparencia
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height)
  for (const calidad of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', calidad)
    if (url.length <= MAX_CARACTERES) return url
  }
  throw new Error('La imagen es demasiado grande incluso comprimida; usa una más pequeña')
}

/** Convierte un archivo de imagen (o pegado/arrastrado) en un data URL JPEG comprimido. */
export async function comprimirImagen(archivo: Blob): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo seleccionado no es una imagen')
  const bmp = await createImageBitmap(archivo)
  try {
    return aJpeg(bmp, bmp.width, bmp.height)
  } finally {
    bmp.close()
  }
}

/**
 * Captura la pestaña actual con la API del navegador (getDisplayMedia).
 * Devuelve null si el usuario cancela el selector. Requiere HTTPS (o localhost)
 * y no existe en la mayoría de navegadores móviles.
 */
export async function capturarPestana(): Promise<string | null> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error(
      'Tu navegador no permite capturar la pantalla (p. ej. celulares). Usa «Adjuntar imagen» o pega una imagen con Ctrl+V.'
    )
  }
  let flujo: MediaStream
  try {
    flujo = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include'
    } as MediaStreamConstraints)
  } catch (e) {
    const nombre = e instanceof DOMException ? e.name : ''
    if (nombre === 'NotAllowedError' || nombre === 'AbortError') return null // canceló o denegó
    throw new Error('No se pudo iniciar la captura de pantalla. Usa «Adjuntar imagen».')
  }
  try {
    const video = document.createElement('video')
    video.muted = true
    video.srcObject = flujo
    await video.play()
    // Deja pasar unos cuadros: el selector del navegador y el diálogo ya se ocultaron.
    await new Promise((r) => setTimeout(r, 600))
    if (!video.videoWidth) throw new Error('No se pudo leer la imagen capturada')
    return aJpeg(video, video.videoWidth, video.videoHeight)
  } finally {
    flujo.getTracks().forEach((t) => t.stop())
  }
}
