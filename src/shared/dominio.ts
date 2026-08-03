// =============================================================================
//  Dominio compartido (main + renderer)
//  Constantes y tipos derivados directamente del Documento de Requisitos v1.2
//  y del esquema_base_datos.sql. Fuente de verdad para enums y reglas fijas.
// =============================================================================

// --- Roles (esquema: rol_usuario) -------------------------------------------
export const ROLES = [
  'lider_comercial',
  'lider_proyectos',
  'compras_contratacion',
  'presupuestos_control',
  'lider_unidad'
] as const
export type Rol = (typeof ROLES)[number]

export const ETIQUETA_ROL: Record<Rol, string> = {
  lider_comercial: 'Líder comercial',
  lider_proyectos: 'Líder de proyectos',
  compras_contratacion: 'Compras y contratación',
  presupuestos_control: 'Presupuestos y control',
  lider_unidad: 'Líder de la unidad'
}

// --- Tamaño de oferta (esquema: tamano_oferta) ------------------------------
export const TAMANOS = ['grande', 'pequena'] as const
export type Tamano = (typeof TAMANOS)[number]

// --- Estados ----------------------------------------------------------------
export const ESTADOS_OFERTA = [
  'en_curso',
  'pendiente_aprobacion_final',
  'aprobada',
  'rechazada'
] as const
export type EstadoOferta = (typeof ESTADOS_OFERTA)[number]

export const TIPOS_TAREA = [
  'socializacion', // Apertura (tramo 1, líder comercial)
  'visita', // Tarea 1 (tramo 2, líder de proyectos)
  'recoleccion', // Tarea 2 (tramo 2, líder de proyectos)
  'cotizacion', // Tarea 3 (tramo 3, compras y contratación)
  'apu', // Tarea 4 (tramo 4, presupuestos y control)
  'aprobacion_unidad', // Aprobación (tramo 5, líder de la unidad)
  'envio_cliente' // Cierre (tramo 6, líder comercial)
] as const
export type TipoTarea = (typeof TIPOS_TAREA)[number]

export const ESTADOS_TAREA = ['pendiente', 'en_curso', 'completada', 'vencida'] as const
export type EstadoTarea = (typeof ESTADOS_TAREA)[number]

export const ESTADOS_TRAMO = ['pendiente', 'en_curso', 'completado', 'vencido'] as const
export type EstadoTramo = (typeof ESTADOS_TRAMO)[number]

export const TIPOS_NOTIFICACION = ['compromiso', 'vencimiento_proximo', 'retraso'] as const
export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number]

// =============================================================================
//  Reglas de negocio fijas (RN-02, RN-03, RN-08, RN-11/12)
// =============================================================================

/** Plazo total ofertado al cliente, en días hábiles, según el tamaño (RN-02). */
export const PLAZO_TOTAL_DIAS: Record<Tamano, number> = {
  grande: 9,
  pequena: 6
}

/** Duración asignada a cada tramo de profesional, en días hábiles (RN-03). */
export const DURACION_TRAMO_PROFESIONAL: Record<Tamano, number> = {
  grande: 3,
  pequena: 2
}

/** El paso de aprobación del líder de la unidad dura 1 día hábil (RN-11, RN-12). */
export const DURACION_APROBACION_UNIDAD = 1

/** Los pasos comerciales (socialización y envío al cliente) duran 1 día hábil. */
export const DURACION_TRAMO_COMERCIAL = 1

/** Número del tramo de aprobación final y total de tramos del flujo. */
export const NUMERO_TRAMO_APROBACION = 5
export const TOTAL_TRAMOS = 6

/**
 * Composición de los 6 tramos de una oferta (extensión al documento original:
 * se añadió al líder comercial al inicio —socialización— y al cierre —envío al
 * cliente—). El tramo 2 agrupa las tareas 1 y 2 (mismo profesional: líder de
 * proyectos). Los tramos se asignan por profesional, no por tarea individual.
 * Los tramos con `duracionFijaDias` no consumen el plazo 3-3-3 / 2-2-2.
 */
export interface DefinicionTramo {
  numero: 1 | 2 | 3 | 4 | 5 | 6
  rol: Rol
  esAprobacion: boolean
  /** Duración fija en días hábiles (si no se define, usa la del tamaño). */
  duracionFijaDias?: number
  tareas: TipoTarea[]
}

export const DEFINICION_TRAMOS: readonly DefinicionTramo[] = [
  { numero: 1, rol: 'lider_comercial', esAprobacion: false, duracionFijaDias: DURACION_TRAMO_COMERCIAL, tareas: ['socializacion'] },
  { numero: 2, rol: 'lider_proyectos', esAprobacion: false, tareas: ['visita', 'recoleccion'] },
  { numero: 3, rol: 'compras_contratacion', esAprobacion: false, tareas: ['cotizacion'] },
  { numero: 4, rol: 'presupuestos_control', esAprobacion: false, tareas: ['apu'] },
  { numero: 5, rol: 'lider_unidad', esAprobacion: true, duracionFijaDias: DURACION_APROBACION_UNIDAD, tareas: ['aprobacion_unidad'] },
  { numero: 6, rol: 'lider_comercial', esAprobacion: false, duracionFijaDias: DURACION_TRAMO_COMERCIAL, tareas: ['envio_cliente'] }
] as const

export const ETIQUETA_TIPO_TAREA: Record<TipoTarea, string> = {
  socializacion: 'Socialización de la oportunidad con el equipo técnico',
  visita: 'Visita técnica con el cliente',
  recoleccion: 'Recolección de medidas y especificaciones',
  cotizacion: 'Cotización de insumos y mano de obra',
  apu: 'Construcción de APUs y precio de la oferta',
  aprobacion_unidad: 'Aprobación final de la oferta',
  envio_cliente: 'Envío de la oferta al cliente'
}
