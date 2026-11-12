// Cliente HTTP que implementa la MISMA interfaz ApiPuente que usaba el puente
// de Electron (window.api). Al asignarlo a window.api en el arranque web, todos
// los componentes React funcionan sin cambios: en vez de IPC, hacen fetch a la
// API. El token de sesión se guarda en localStorage y se envía en cada petición.
import type {
  ActualizarUsuarioInput,
  AdjuntoInfo,
  AgendaDia,
  ApiPuente,
  CandidatosPorRol,
  CorreccionPendiente,
  Credenciales,
  DatosDashboard,
  DetalleOferta,
  DiaCalendarioUnidad,
  Estadisticas,
  FiltroIndicadores,
  LineaTiempo,
  MotivoRechazoInput,
  NotificacionInfo,
  NuevaOfertaInput,
  NuevoUsuarioInput,
  OfertaResumen,
  PendienteAprobacion,
  ReporteSoporte,
  ResultadoCompletar,
  ResultadoLogin,
  SesionUsuario,
  TramoAsignado,
  UsuarioAdmin
} from '@shared/ipc'
import { capturarPestana, comprimirImagen } from '@renderer/lib/imagen'

const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api'
const TOKEN_KEY = 'gestor.token'

let token: string | null = localStorage.getItem(TOKEN_KEY)
const oyentesExpirada: Array<() => void> = []

function fijarToken(t: string | null): void {
  token = t
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

/** Extrae el mensaje de error de una respuesta JSON (o un texto por defecto). */
async function mensajeError(res: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { error?: string; mensaje?: string }
    return cuerpo.error ?? cuerpo.mensaje ?? porDefecto
  } catch {
    return porDefecto
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** Petición autenticada. Lanza Error en respuestas no OK; 204 -> undefined. */
async function req<T>(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + ruta, {
    method: metodo,
    headers,
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
  })

  if (res.status === 401) {
    const eraLogueado = token !== null
    fijarToken(null)
    if (eraLogueado) oyentesExpirada.forEach((f) => f())
    throw new Error(await mensajeError(res, 'Sesión no válida'))
  }
  if (!res.ok) throw new Error(await mensajeError(res, `Error ${res.status}`))
  if (res.status === 204) return undefined as T
  const texto = await res.text()
  return (texto ? JSON.parse(texto) : undefined) as T
}

/** Construye una query string omitiendo valores vacíos. */
function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/** Login: NO usa req() porque debe devolver el ResultadoLogin aun con 401. */
async function login(ruta: string, cuerpo: unknown): Promise<ResultadoLogin> {
  const res = await fetch(BASE + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  })
  const datos = (await res.json().catch(() => ({ estado: 'error', mensaje: 'Respuesta no válida del servidor' }))) as
    | { estado: 'ok'; token: string; sesion: SesionUsuario }
    | { estado: 'codigo_enviado'; correo: string }
    | { estado: 'error'; mensaje: string }
  if (datos.estado === 'ok') {
    fijarToken(datos.token)
    return { estado: 'ok', sesion: datos.sesion }
  }
  return datos
}

/** Abre el selector de archivos del sistema. Devuelve null si se cancela. */
function elegirArchivo(accept = ''): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

const MAX_ADJUNTO = 25 * 1024 * 1024

interface DestinoSubida {
  modo: 'supabase' | 'local'
  url: string
  ruta: string
  headers?: Record<string, string>
}

/** Sube el archivo al destino indicado por la API (Supabase directo, o API en modo local). */
async function subirArchivo(destino: DestinoSubida, archivo: File): Promise<void> {
  let res: Response
  if (destino.modo === 'supabase') {
    // Misma forma que supabase-js uploadToSignedUrl: multipart con el archivo.
    const form = new FormData()
    form.append('cacheControl', '3600')
    form.append('', archivo)
    res = await fetch(destino.url, { method: 'PUT', headers: destino.headers, body: form })
  } else {
    res = await fetch(BASE + destino.url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/octet-stream' },
      body: archivo
    })
  }
  if (!res.ok) throw new Error(await mensajeError(res, `No se pudo subir el archivo (${res.status})`))
}

export const clienteHttp: ApiPuente = {
  iniciarSesion: (credenciales: Credenciales) => login('/auth/login', credenciales),
  verificarCodigo: (email: string, codigo: string) => login('/auth/verificar-codigo', { email, codigo }),

  // En web la inactividad la controla la expiración del token; no hay ping.
  reportarActividad: () => {},
  onSesionExpirada: (callback: () => void) => {
    oyentesExpirada.push(callback)
    return () => {
      const i = oyentesExpirada.indexOf(callback)
      if (i >= 0) oyentesExpirada.splice(i, 1)
    }
  },
  cerrarSesion: async () => {
    fijarToken(null)
  },
  obtenerSesion: async () => {
    if (!token) return null
    try {
      return await req<SesionUsuario>('GET', '/sesion')
    } catch {
      return null
    }
  },

  obtenerEstadisticas: () => req<Estadisticas>('GET', '/estadisticas'),
  obtenerResumenOfertas: () => req<OfertaResumen[]>('GET', '/ofertas/resumen'),
  crearOferta: async (datos: NuevaOfertaInput) => (await req<{ id: number }>('POST', '/ofertas', datos)).id,
  obtenerCandidatosPorRol: () => req<CandidatosPorRol>('GET', '/ofertas/candidatos'),
  obtenerMisTramos: () => req<TramoAsignado[]>('GET', '/mis-tramos'),
  obtenerAgenda: (dias: number) => req<AgendaDia[]>('GET', `/agenda${qs({ dias })}`),
  completarTarea: (tareaId: number) => req<ResultadoCompletar>('POST', `/tareas/${tareaId}/completar`),
  deshacerCompletarTarea: (tareaId: number) => req<void>('POST', `/tareas/${tareaId}/deshacer`),
  deshacerAprobacion: (ofertaId: number) => req<void>('POST', `/ofertas/${ofertaId}/deshacer-aprobacion`),
  crearSubtarea: (tareaId: number, descripcion: string) =>
    req<void>('POST', `/tareas/${tareaId}/subtareas`, { descripcion }),
  marcarSubtarea: (subtareaId: number, completada: boolean) =>
    req<void>('PATCH', `/subtareas/${subtareaId}`, { completada }),
  eliminarSubtarea: (subtareaId: number) => req<void>('DELETE', `/subtareas/${subtareaId}`),
  obtenerAdjuntosOferta: (ofertaId: number) => req<AdjuntoInfo[]>('GET', `/ofertas/${ofertaId}/adjuntos`),
  agregarAdjunto: async (tramoId: number, tipo: string) => {
    const archivo = await elegirArchivo()
    if (!archivo) return null
    if (archivo.size === 0) throw new Error('El archivo está vacío')
    if (archivo.size > MAX_ADJUNTO) throw new Error('El archivo supera el máximo de 25 MB')
    const destino = await req<DestinoSubida>('POST', `/tramos/${tramoId}/adjuntos/solicitar`, {
      nombre: archivo.name,
      tamano: archivo.size,
      tipo
    })
    await subirArchivo(destino, archivo)
    return req<AdjuntoInfo[]>('POST', `/tramos/${tramoId}/adjuntos`, { ruta: destino.ruta, nombre: archivo.name, tipo })
  },
  abrirAdjunto: async (adjuntoId: number) => {
    // La pestaña se abre ya (clic del usuario) para que el bloqueador de ventanas no la frene.
    const ventana = window.open('about:blank', '_blank')
    try {
      const enlace = await req<{ modo: 'supabase' | 'local'; url: string }>('GET', `/adjuntos/${adjuntoId}/enlace`)
      let destino = enlace.url
      if (enlace.modo === 'local') {
        const res = await fetch(BASE + enlace.url, { headers: { Authorization: `Bearer ${token ?? ''}` } })
        if (!res.ok) throw new Error(await mensajeError(res, 'No se pudo descargar el archivo'))
        destino = URL.createObjectURL(await res.blob())
      }
      if (ventana) ventana.location.href = destino
      else window.location.href = destino
    } catch (e) {
      ventana?.close()
      throw e
    }
  },
  obtenerPendientesAprobacion: () => req<PendienteAprobacion[]>('GET', '/aprobacion/pendientes'),
  aprobarOferta: (ofertaId: number) => req<void>('POST', `/ofertas/${ofertaId}/aprobar`),
  rechazarOferta: (ofertaId: number, motivos: MotivoRechazoInput[]) =>
    req<void>('POST', `/ofertas/${ofertaId}/rechazar`, { motivos }),
  obtenerCorrecciones: () => req<CorreccionPendiente[]>('GET', '/correcciones'),
  entregarCorreccion: (ofertaId: number) => req<void>('POST', `/ofertas/${ofertaId}/entregar-correccion`),
  obtenerLineaTiempo: (diasAtras: number, diasAdelante: number) =>
    req<LineaTiempo>('GET', `/linea-tiempo${qs({ atras: diasAtras, adelante: diasAdelante })}`),
  obtenerCalendarioUnidad: (dias: number) => req<DiaCalendarioUnidad[]>('GET', `/calendario-unidad${qs({ dias })}`),
  obtenerDetalleOferta: (ofertaId: number) => req<DetalleOferta>('GET', `/ofertas/${ofertaId}/detalle`),
  obtenerIndicadores: (filtro: FiltroIndicadores) =>
    req<DatosDashboard>('GET', `/indicadores${qs({ desde: filtro.desde, hasta: filtro.hasta, tamano: filtro.tamano })}`),
  obtenerNotificaciones: () => req<NotificacionInfo[]>('GET', '/notificaciones'),
  contarNotificacionesNoLeidas: async () =>
    (await req<{ total: number }>('GET', '/notificaciones/no-leidas')).total,
  marcarNotificacionesLeidas: () => req<void>('POST', '/notificaciones/marcar-leidas'),
  crearReporteSoporte: async (descripcion: string, captura: string | null) =>
    (await req<{ id: number }>('POST', '/soporte', { descripcion, captura })).id,
  capturarPantalla: () => capturarPestana(),
  adjuntarImagenSoporte: async () => {
    const archivo = await elegirArchivo('image/*')
    return archivo ? comprimirImagen(archivo) : null
  },
  listarReportesSoporte: () => req<ReporteSoporte[]>('GET', '/soporte'),
  listarMisReportesSoporte: () => req<ReporteSoporte[]>('GET', '/soporte/mis-reportes'),
  responderReporteSoporte: (reporteId: number, respuesta: string) =>
    req<void>('POST', `/soporte/${reporteId}/responder`, { respuesta }),
  atenderReporteSoporte: (reporteId: number, atendido: boolean) =>
    req<void>('PATCH', `/soporte/${reporteId}/atender`, { atendido }),
  listarUsuarios: () => req<UsuarioAdmin[]>('GET', '/usuarios'),
  crearUsuario: (datos: NuevoUsuarioInput) => req<void>('POST', '/usuarios', datos),
  actualizarUsuario: ({ usuarioId, ...cambios }: ActualizarUsuarioInput) =>
    req<void>('PATCH', `/usuarios/${usuarioId}`, cambios),
  reasignarTramo: (tramoId: number, nuevoResponsableId: number, motivo: string) =>
    req<void>('POST', `/tramos/${tramoId}/reasignar`, { nuevoResponsableId, motivo }),
  cargarDatosDemostracion: () =>
    req<{ usuariosCreados: number; ofertasCreadas: number; passwordDemo: string }>('POST', '/demo')
}
