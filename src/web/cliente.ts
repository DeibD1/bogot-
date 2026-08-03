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
  agregarAdjunto: async () => {
    throw new Error('La carga de adjuntos estará disponible en una próxima actualización (Fase 4).')
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
  capturarPantalla: () =>
    Promise.reject(new Error('La captura automática no está disponible en el navegador. Usa «Adjuntar imagen».')),
  adjuntarImagenSoporte: () =>
    new Promise<string | null>((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const archivo = input.files?.[0]
        if (!archivo) return resolve(null)
        if (archivo.size > 3_000_000) return reject(new Error('La imagen supera los 3 MB; usa una más liviana'))
        const lector = new FileReader()
        lector.onload = () => resolve(String(lector.result))
        lector.onerror = () => reject(new Error('No se pudo leer la imagen'))
        lector.readAsDataURL(archivo)
      }
      input.click()
    }),
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
