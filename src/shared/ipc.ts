// Contrato IPC compartido entre el proceso principal y el renderer.
import type {
  EstadoOferta,
  EstadoTarea,
  EstadoTramo,
  Rol,
  Tamano,
  TipoNotificacion,
  TipoTarea
} from './dominio.js'

export const CANALES = {
  login: 'auth:login',
  loginCodigo: 'auth:verificar-codigo',
  actividad: 'auth:actividad',
  sesionExpirada: 'auth:sesion-expirada', // push main -> renderer
  logout: 'auth:logout',
  sesion: 'auth:sesion',
  estadisticas: 'db:estadisticas',
  resumenOfertas: 'db:resumen-ofertas',
  misTramos: 'prof:mis-tramos',
  agenda: 'prof:agenda',
  completarTarea: 'prof:completar-tarea',
  adjuntosOferta: 'adjuntos:por-oferta',
  agregarAdjunto: 'adjuntos:agregar',
  pendientesAprobacion: 'aprob:pendientes',
  aprobarOferta: 'aprob:aprobar',
  rechazarOferta: 'aprob:rechazar',
  correcciones: 'aprob:correcciones',
  entregarCorreccion: 'prof:entregar-correccion',
  lineaTiempo: 'vista:linea-tiempo',
  calendarioUnidad: 'vista:calendario-unidad',
  detalleOferta: 'vista:detalle-oferta',
  indicadores: 'lider:indicadores',
  notificaciones: 'notif:listar',
  notificacionesNoLeidas: 'notif:no-leidas',
  notificacionesMarcarLeidas: 'notif:marcar-leidas',
  ofertaCrear: 'oferta:crear',
  ofertaCandidatos: 'oferta:candidatos',
  deshacerTarea: 'deshacer:tarea',
  deshacerAprobacion: 'deshacer:aprobacion',
  subtareaCrear: 'subtarea:crear',
  subtareaMarcar: 'subtarea:marcar',
  subtareaEliminar: 'subtarea:eliminar',
  soporteCrear: 'soporte:crear',
  soporteCapturar: 'soporte:capturar-pantalla',
  soporteAdjuntarImagen: 'soporte:adjuntar-imagen',
  soporteListar: 'soporte:listar',
  soporteMisReportes: 'soporte:mis-reportes',
  soporteResponder: 'soporte:responder',
  soporteAtender: 'soporte:atender',
  usuariosListar: 'admin:usuarios-listar',
  usuarioCrear: 'admin:usuario-crear',
  usuarioActualizar: 'admin:usuario-actualizar',
  cargarDemo: 'admin:cargar-demo',
  reasignarTramo: 'admin:reasignar-tramo'
} as const

/** Usuario autenticado (sin el hash de contraseña). */
export interface SesionUsuario {
  id: number
  nombre: string
  email: string
  rol: Rol
}

export interface Credenciales {
  email: string
  password: string
}

/** Resultado del inicio de sesión (con o sin segundo factor). */
export type ResultadoLogin =
  | { estado: 'ok'; sesion: SesionUsuario }
  | { estado: 'codigo_enviado'; correo: string } // 2FA: se envió código al correo (ofuscado)
  | { estado: 'error'; mensaje: string }

export interface Estadisticas {
  usuarios: number
  festivos: number
  ofertas: number
  tramos: number
  tareas: number
  rutaDb: string
}

export interface OfertaResumen {
  id: number
  cliente: string
  tamano: Tamano
  estado: EstadoOferta
  fechaInicio: string
  fechaEntregaComprometida: string | null
  tramoActual: number | null
}

// --- Creación de ofertas (RF-01..03; exclusiva del líder comercial) -----------

export interface NuevaOfertaInput {
  cliente: string
  tamano: Tamano
  fechaInicio: string
  /** Días hábiles que tomará la socialización (decisión del comercial). */
  duracionSocializacion: number
  /** Responsable elegido para cada rol. */
  responsables: Record<Rol, number>
}

export interface CandidatoRol {
  id: number
  nombre: string
}

/** Usuarios activos disponibles por rol (para asignar responsables). */
export type CandidatosPorRol = Record<Rol, CandidatoRol[]>

// --- Fase 3: vistas del profesional -----------------------------------------

/** Código de colores de criticidad (RF-08, RF-28). */
export type Criticidad = 'verde' | 'amarillo' | 'rojo'

/** Subtarea: checklist personal del profesional dentro de una tarea. */
export interface SubtareaInfo {
  id: number
  tareaId: number
  descripcion: string
  completada: boolean
}

export interface TareaItem {
  id: number
  tipo: TipoTarea
  descripcion: string | null
  estado: EstadoTarea
  completadaEn: string | null
  subtareas: SubtareaInfo[]
}

/** Tramo asignado al profesional, con sus tareas y criticidad calculada. */
export interface TramoAsignado {
  tramoId: number
  ofertaId: number
  cliente: string
  tamano: Tamano
  numero: number
  duracionDias: number
  fechaActivacion: string | null
  fechaLimite: string | null
  estado: EstadoTramo
  criticidad: Criticidad
  tareas: TareaItem[]
}

export interface AgendaItem {
  tramoId: number
  ofertaId: number
  cliente: string
  numero: number
  esActivacion: boolean
  esLimite: boolean
  criticidad: Criticidad
}

/** Un día de la agenda (RF-05): qué tramos están en ventana de trabajo. */
export interface AgendaDia {
  fecha: string // 'YYYY-MM-DD'
  esHabil: boolean
  items: AgendaItem[]
}

export interface ResultadoCompletar {
  tramoCerrado: boolean
  desviacionDias?: number
  indicadorCumplimiento?: number
}

export interface AdjuntoInfo {
  id: number
  tramoId: number
  numeroTramo: number
  tipo: string | null
  nombre: string
  ruta: string | null
  subidoPorNombre: string | null
  subidoEn: string
}

// --- Fase 4: aprobación final -------------------------------------------------

/** Oferta esperando aprobación final en la bandeja del líder (RF-21). */
export interface PendienteAprobacion {
  ofertaId: number
  cliente: string
  tamano: Tamano
  fechaEntregaComprometida: string | null
  fechaActivacionRevision: string | null
  fechaLimiteRevision: string | null
  criticidad: Criticidad
  /** Tarea de aprobación (para el checklist de subtareas del líder). */
  tareaId: number | null
  subtareas: SubtareaInfo[]
}

/** Un motivo de rechazo dirigido a un tramo (profesional) concreto. */
export interface MotivoRechazoInput {
  numeroTramo: number
  motivo: string
}

/** Oferta rechazada, con sus motivos de corrección (RN-19). */
export interface CorreccionPendiente {
  ofertaId: number
  cliente: string
  tamano: Tamano
  fechaRechazo: string | null
  motivos: {
    numeroTramo: number
    motivo: string
    entregada: boolean
    responsableNombre: string
  }[]
}

// --- Línea de tiempo (RF-05 ampliado): actividades día a día por profesional --

/** Barra de un tramo en la línea de tiempo. */
export interface TramoLinea {
  tramoId: number
  ofertaId: number
  cliente: string
  tamano: Tamano
  numero: number
  estado: EstadoTramo
  criticidad: Criticidad
  fechaActivacion: string
  /** Fin visual de la barra: entrega real si existe; si no, la fecha límite. */
  fechaFin: string
  fechaLimite: string
  fechaEntregaReal: string | null
}

export interface FilaLinea {
  usuarioId: number
  nombre: string
  rol: Rol
  tramos: TramoLinea[]
}

export interface DiaLinea {
  fecha: string
  esHabil: boolean
  esHoy: boolean
}

export interface LineaTiempo {
  dias: DiaLinea[]
  filas: FilaLinea[]
}

// --- Fase 5: dashboard de indicadores (§11, RF-13..17, RF-24..26) -------------

export interface FiltroIndicadores {
  /** Rango sobre la fecha de entrega real (tramos) / finalización (ofertas). */
  desde?: string
  hasta?: string
  tamano?: Tamano | 'todos'
}

/** Indicadores históricos de un profesional (vista V1 del esquema / §11.3). */
export interface IndicadorProfesional {
  usuarioId: number
  nombre: string
  rol: Rol
  totalTramos: number
  tramosATiempo: number
  tramosRetrasados: number
  desviacionPromedio: number | null
  tasaPuntualidad: number | null
  /** Promedio de las calificaciones de sus tramos (§11.6 / RF-25). */
  rendimientoPromedio: number | null
}

/** Detalle de cumplimiento de una oferta aprobada (RF-13/RF-14). */
export interface IndicadorOferta {
  ofertaId: number
  cliente: string
  tamano: Tamano
  fechaInicio: string
  fechaEntregaComprometida: string | null
  fechaFinalizacionReal: string | null
  desviacionDias: number | null
  diasCorreccion: number
  indicadorCumplimiento: number | null
}

export interface DatosDashboard {
  /** Promedio de los indicadores de las ofertas aprobadas (V2 / RF-24). */
  indicadorUnidad: number | null
  ofertasConsideradas: number
  /** Comparativa §11.5 (RF-16), entre quienes tienen tramos en el filtro. */
  masCumplido: { nombre: string; tasaPuntualidad: number } | null
  masAtrasado: { nombre: string; tramosRetrasados: number } | null
  profesionales: IndicadorProfesional[]
  ofertas: IndicadorOferta[]
}

// --- Calendario de la unidad: actividades de TODOS los profesionales por día --

export interface ItemCalendarioUnidad {
  tramoId: number
  ofertaId: number
  cliente: string
  numero: number
  responsableNombre: string
  responsableRol: Rol
  esActivacion: boolean
  esLimite: boolean
  criticidad: Criticidad
  /** Hito de cierre del proceso: envío de la oferta al cliente (tramo final). */
  esEnvio: boolean
}

export interface DiaCalendarioUnidad {
  fecha: string
  esHabil: boolean
  esHoy: boolean
  items: ItemCalendarioUnidad[]
}

// --- Detalle de oferta (RF-09 / RF-19): drill-down de solo lectura ------------

export interface DetalleTramo {
  tramoId: number
  numero: number
  responsableId: number
  responsableNombre: string
  responsableRol: Rol
  duracionDias: number
  fechaActivacion: string | null
  fechaLimite: string | null
  fechaEntregaReal: string | null
  diasHabilesUsados: number | null
  desviacionDias: number | null
  indicadorCumplimiento: number | null
  estado: EstadoTramo
  criticidad: Criticidad
  tareas: TareaItem[]
}

export interface DetalleOferta {
  id: number
  cliente: string
  tamano: Tamano
  estado: EstadoOferta
  fechaInicio: string
  plazoTotalDias: number
  fechaEntregaComprometida: string | null
  fechaFinalizacionReal: string | null
  fechaAprobUnidad: string | null
  desviacionDias: number | null
  indicadorCumplimiento: number | null
  diasCorreccion: number
  motivoRechazo: string | null
  tramoCorreccion: number | null
  tramos: DetalleTramo[]
  adjuntos: AdjuntoInfo[]
}

// --- Fase 6: notificaciones (RF-27) -------------------------------------------

export interface NotificacionInfo {
  id: number
  tipo: TipoNotificacion
  mensaje: string
  creadaEn: string
  leida: boolean
  ofertaId: number | null
  tramoId: number | null
}

// --- Soporte técnico (reporte de problemas con pantallazo) ---------------------

export interface ReporteSoporte {
  id: number
  usuarioNombre: string
  usuarioEmail: string
  descripcion: string
  /** Pantallazo como data URL (base64), si se adjuntó. */
  captura: string | null
  atendido: boolean
  creadaEn: string
  /** Respuesta del administrador (si ya respondió). */
  respuesta: string | null
  respondidaEn: string | null
}

// --- Administración de usuarios (solo líder de la unidad) ---------------------

export interface UsuarioAdmin {
  id: number
  nombre: string
  email: string
  rol: Rol
  activo: boolean
}

export interface NuevoUsuarioInput {
  nombre: string
  email: string
  rol: Rol
  password: string
}

export interface ActualizarUsuarioInput {
  usuarioId: number
  nombre?: string
  rol?: Rol
  password?: string
  activo?: boolean
}

// Forma de la API expuesta en el renderer vía contextBridge (window.api).
export interface ApiPuente {
  iniciarSesion: (credenciales: Credenciales) => Promise<ResultadoLogin>
  verificarCodigo: (email: string, codigo: string) => Promise<ResultadoLogin>
  /** Reporta actividad del usuario (reinicia el contador de inactividad). */
  reportarActividad: () => void
  /** Suscripción al cierre de sesión por inactividad. Devuelve un des-suscriptor. */
  onSesionExpirada: (callback: () => void) => () => void
  cerrarSesion: () => Promise<void>
  obtenerSesion: () => Promise<SesionUsuario | null>
  obtenerEstadisticas: () => Promise<Estadisticas>
  obtenerResumenOfertas: () => Promise<OfertaResumen[]>
  crearOferta: (datos: NuevaOfertaInput) => Promise<number>
  obtenerCandidatosPorRol: () => Promise<CandidatosPorRol>
  obtenerMisTramos: () => Promise<TramoAsignado[]>
  obtenerAgenda: (dias: number) => Promise<AgendaDia[]>
  completarTarea: (tareaId: number) => Promise<ResultadoCompletar>
  deshacerCompletarTarea: (tareaId: number) => Promise<void>
  deshacerAprobacion: (ofertaId: number) => Promise<void>
  crearSubtarea: (tareaId: number, descripcion: string) => Promise<void>
  marcarSubtarea: (subtareaId: number, completada: boolean) => Promise<void>
  eliminarSubtarea: (subtareaId: number) => Promise<void>
  obtenerAdjuntosOferta: (ofertaId: number) => Promise<AdjuntoInfo[]>
  agregarAdjunto: (tramoId: number, tipo: string) => Promise<AdjuntoInfo[] | null>
  obtenerPendientesAprobacion: () => Promise<PendienteAprobacion[]>
  aprobarOferta: (ofertaId: number) => Promise<void>
  rechazarOferta: (ofertaId: number, motivos: MotivoRechazoInput[]) => Promise<void>
  obtenerCorrecciones: () => Promise<CorreccionPendiente[]>
  entregarCorreccion: (ofertaId: number) => Promise<void>
  obtenerLineaTiempo: (diasAtras: number, diasAdelante: number) => Promise<LineaTiempo>
  obtenerCalendarioUnidad: (dias: number) => Promise<DiaCalendarioUnidad[]>
  obtenerDetalleOferta: (ofertaId: number) => Promise<DetalleOferta>
  obtenerIndicadores: (filtro: FiltroIndicadores) => Promise<DatosDashboard>
  obtenerNotificaciones: () => Promise<NotificacionInfo[]>
  contarNotificacionesNoLeidas: () => Promise<number>
  marcarNotificacionesLeidas: () => Promise<void>
  crearReporteSoporte: (descripcion: string, captura: string | null) => Promise<number>
  capturarPantalla: () => Promise<string>
  adjuntarImagenSoporte: () => Promise<string | null>
  listarReportesSoporte: () => Promise<ReporteSoporte[]>
  listarMisReportesSoporte: () => Promise<ReporteSoporte[]>
  responderReporteSoporte: (reporteId: number, respuesta: string) => Promise<void>
  atenderReporteSoporte: (reporteId: number, atendido: boolean) => Promise<void>
  listarUsuarios: () => Promise<UsuarioAdmin[]>
  crearUsuario: (datos: NuevoUsuarioInput) => Promise<void>
  actualizarUsuario: (cambios: ActualizarUsuarioInput) => Promise<void>
  reasignarTramo: (tramoId: number, nuevoResponsableId: number, motivo: string) => Promise<void>
  cargarDatosDemostracion: () => Promise<{ usuariosCreados: number; ofertasCreadas: number; passwordDemo: string }>
}
