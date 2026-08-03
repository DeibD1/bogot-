// =============================================================================
//  Esquema Drizzle (PostgreSQL) — fiel a esquema_base_datos.sql:
//  ENUMs nativos, SERIAL, DATE, TIMESTAMP, NUMERIC(5,2), CHECKs e índices.
//  Las fechas se manejan como cadenas 'YYYY-MM-DD' (mode: 'string') para que
//  toda la lógica de días hábiles siga operando sobre ISO puro.
//  Extensión documentada: columnas de rechazo en `oferta` (Fase 4).
// =============================================================================
import { sql } from 'drizzle-orm'
import {
  boolean,
  text,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  timestamp,
  unique,
  varchar
} from 'drizzle-orm/pg-core'
import {
  ESTADOS_OFERTA,
  ESTADOS_TAREA,
  ESTADOS_TRAMO,
  ROLES,
  TAMANOS,
  TIPOS_NOTIFICACION,
  TIPOS_TAREA
} from '../../shared/dominio.js'

// --- 1. TIPOS ENUMERADOS ------------------------------------------------------
export const rolUsuario = pgEnum('rol_usuario', ROLES)
export const tamanoOferta = pgEnum('tamano_oferta', TAMANOS)
export const estadoOferta = pgEnum('estado_oferta', ESTADOS_OFERTA)
export const tipoTarea = pgEnum('tipo_tarea', TIPOS_TAREA)
export const estadoTarea = pgEnum('estado_tarea', ESTADOS_TAREA)
export const estadoTramo = pgEnum('estado_tramo', ESTADOS_TRAMO)
export const tipoNotificacion = pgEnum('tipo_notificacion', TIPOS_NOTIFICACION)

// --- 2. USUARIO ----------------------------------------------------------------
export const usuario = pgTable('usuario', {
  id: serial('id').primaryKey(),
  nombre: varchar('nombre', { length: 150 }).notNull(),
  email: varchar('email', { length: 150 }).notNull().unique(),
  rol: rolUsuario('rol').notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { mode: 'string' }).notNull().defaultNow(),
  // Extensión de seguridad: bloqueo temporal por intentos fallidos de login.
  intentosFallidos: smallint('intentos_fallidos').notNull().default(0),
  bloqueadoHasta: timestamp('bloqueado_hasta', { mode: 'string' })
})

// --- 3. FESTIVO (Colombia) ------------------------------------------------------
export const festivo = pgTable('festivo', {
  fecha: date('fecha', { mode: 'string' }).primaryKey(),
  descripcion: varchar('descripcion', { length: 150 }).notNull()
})

// --- 4. OFERTA -------------------------------------------------------------------
export const oferta = pgTable(
  'oferta',
  {
    id: serial('id').primaryKey(),
    cliente: varchar('cliente', { length: 200 }).notNull(),
    tamano: tamanoOferta('tamano').notNull(),
    fechaInicio: date('fecha_inicio', { mode: 'string' }).notNull(),
    plazoTotalDias: smallint('plazo_total_dias').notNull(), // 6 (pequeña) o 9 (grande)
    fechaEntregaComprometida: date('fecha_entrega_comprometida', { mode: 'string' }),
    fechaFinalizacionReal: date('fecha_finalizacion_real', { mode: 'string' }),
    fechaAprobUnidad: date('fecha_aprob_unidad', { mode: 'string' }),
    aprobadoPor: integer('aprobado_por').references(() => usuario.id),
    diasCorreccion: smallint('dias_correccion').notNull().default(0), // RN-19 (aparte)
    desviacionDias: smallint('desviacion_dias'),
    indicadorCumplimiento: numeric('indicador_cumplimiento', { precision: 5, scale: 2 }),
    estado: estadoOferta('estado').notNull().default('en_curso'),
    creadoPor: integer('creado_por').references(() => usuario.id),
    creadoEn: timestamp('creado_en', { mode: 'string' }).notNull().defaultNow(),
    // Extensión al esquema original para el flujo de rechazo (RF-22 / RN-19):
    motivoRechazo: varchar('motivo_rechazo', { length: 255 }),
    fechaRechazo: date('fecha_rechazo', { mode: 'string' }),
    tramoCorreccion: smallint('tramo_correccion') // nº de tramo que corrige (1..3)
  },
  (t) => [check('chk_plazo', sql`${t.plazoTotalDias} IN (6, 9)`)]
)

// --- 5. TRAMO ---------------------------------------------------------------------
export const tramo = pgTable(
  'tramo',
  {
    id: serial('id').primaryKey(),
    ofertaId: integer('oferta_id')
      .notNull()
      .references(() => oferta.id, { onDelete: 'cascade' }),
    numero: smallint('numero').notNull(), // 1..4
    responsableId: integer('responsable_id')
      .notNull()
      .references(() => usuario.id),
    reasignadoDe: integer('reasignado_de').references(() => usuario.id),
    duracionAsignadaDias: smallint('duracion_asignada_dias').notNull(),
    fechaActivacion: date('fecha_activacion', { mode: 'string' }),
    fechaLimite: date('fecha_limite', { mode: 'string' }),
    fechaEntregaReal: date('fecha_entrega_real', { mode: 'string' }),
    diasHabilesUsados: smallint('dias_habiles_usados'),
    desviacionDias: smallint('desviacion_dias'),
    indicadorCumplimiento: numeric('indicador_cumplimiento', { precision: 5, scale: 2 }),
    estado: estadoTramo('estado').notNull().default('pendiente')
  },
  (t) => [
    unique('uq_tramo_oferta').on(t.ofertaId, t.numero),
    check('chk_numero_tramo', sql`${t.numero} BETWEEN 1 AND 6`),
    index('idx_tramo_responsable').on(t.responsableId),
    index('idx_tramo_estado').on(t.estado),
    index('idx_tramo_fecha_limite').on(t.fechaLimite)
  ]
)

// --- 6. TAREA -----------------------------------------------------------------------
export const tarea = pgTable(
  'tarea',
  {
    id: serial('id').primaryKey(),
    tramoId: integer('tramo_id')
      .notNull()
      .references(() => tramo.id, { onDelete: 'cascade' }),
    tipo: tipoTarea('tipo').notNull(),
    descripcion: varchar('descripcion', { length: 255 }),
    estado: estadoTarea('estado').notNull().default('pendiente'),
    completadaEn: date('completada_en', { mode: 'string' })
  },
  (t) => [index('idx_tarea_tramo').on(t.tramoId)]
)

// --- 6b. SUBTAREA (extensión: checklist personal dentro de cada tarea) -------------------
export const subtarea = pgTable(
  'subtarea',
  {
    id: serial('id').primaryKey(),
    tareaId: integer('tarea_id')
      .notNull()
      .references(() => tarea.id, { onDelete: 'cascade' }),
    descripcion: varchar('descripcion', { length: 255 }).notNull(),
    completada: boolean('completada').notNull().default(false),
    creadaEn: timestamp('creada_en', { mode: 'string' }).notNull().defaultNow()
  },
  (t) => [index('idx_subtarea_tarea').on(t.tareaId)]
)

// --- 7. ADJUNTO -----------------------------------------------------------------------
export const adjunto = pgTable('adjunto', {
  id: serial('id').primaryKey(),
  tramoId: integer('tramo_id')
    .notNull()
    .references(() => tramo.id, { onDelete: 'cascade' }),
  tipo: varchar('tipo', { length: 50 }),
  nombre: varchar('nombre', { length: 255 }).notNull(),
  ruta: varchar('ruta', { length: 500 }),
  subidoPor: integer('subido_por').references(() => usuario.id),
  subidoEn: timestamp('subido_en', { mode: 'string' }).notNull().defaultNow()
})

// --- 8. REASIGNACIÓN --------------------------------------------------------------------
export const reasignacion = pgTable('reasignacion', {
  id: serial('id').primaryKey(),
  tramoId: integer('tramo_id')
    .notNull()
    .references(() => tramo.id, { onDelete: 'cascade' }),
  deUsuarioId: integer('de_usuario_id').references(() => usuario.id),
  aUsuarioId: integer('a_usuario_id')
    .notNull()
    .references(() => usuario.id),
  motivo: varchar('motivo', { length: 255 }),
  fecha: timestamp('fecha', { mode: 'string' }).notNull().defaultNow()
})

// --- 8a. CORRECCIÓN (extensión: motivos de rechazo, varios por oferta) ---------------------
export const correccion = pgTable(
  'correccion',
  {
    id: serial('id').primaryKey(),
    ofertaId: integer('oferta_id')
      .notNull()
      .references(() => oferta.id, { onDelete: 'cascade' }),
    numeroTramo: smallint('numero_tramo').notNull(),
    motivo: varchar('motivo', { length: 500 }).notNull(),
    entregada: boolean('entregada').notNull().default(false),
    creadaEn: timestamp('creada_en', { mode: 'string' }).notNull().defaultNow(),
    entregadaEn: timestamp('entregada_en', { mode: 'string' })
  },
  (t) => [index('idx_correccion_oferta').on(t.ofertaId, t.entregada)]
)

// --- 8b. SOPORTE (extensión: reportes de problemas con pantallazo) ------------------------
export const soporte = pgTable('soporte', {
  id: serial('id').primaryKey(),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => usuario.id, { onDelete: 'cascade' }),
  descripcion: varchar('descripcion', { length: 2000 }).notNull(),
  /** Pantallazo como data URL (base64); visible desde cualquier equipo. */
  captura: text('captura'),
  atendido: boolean('atendido').notNull().default(false),
  creadaEn: timestamp('creada_en', { mode: 'string' }).notNull().defaultNow(),
  // Respuesta del administrador al usuario que reportó:
  respuesta: varchar('respuesta', { length: 2000 }),
  respondidaEn: timestamp('respondida_en', { mode: 'string' }),
  respondidoPor: integer('respondido_por').references(() => usuario.id)
})

// --- 9. NOTIFICACIÓN --------------------------------------------------------------------
export const notificacion = pgTable(
  'notificacion',
  {
    id: serial('id').primaryKey(),
    usuarioId: integer('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    ofertaId: integer('oferta_id').references(() => oferta.id, { onDelete: 'cascade' }),
    tramoId: integer('tramo_id').references(() => tramo.id, { onDelete: 'cascade' }),
    tipo: tipoNotificacion('tipo').notNull(),
    mensaje: varchar('mensaje', { length: 500 }).notNull(),
    creadaEn: timestamp('creada_en', { mode: 'string' }).notNull().defaultNow(),
    leida: boolean('leida').notNull().default(false)
  },
  (t) => [index('idx_notif_usuario').on(t.usuarioId, t.leida)]
)

// --- Tipos inferidos (para servicios y UI) ------------------------------------------------
export type Usuario = typeof usuario.$inferSelect
export type NuevoUsuario = typeof usuario.$inferInsert
export type Festivo = typeof festivo.$inferSelect
export type Oferta = typeof oferta.$inferSelect
export type NuevaOferta = typeof oferta.$inferInsert
export type Tramo = typeof tramo.$inferSelect
export type NuevoTramo = typeof tramo.$inferInsert
export type Tarea = typeof tarea.$inferSelect
export type Subtarea = typeof subtarea.$inferSelect
export type Adjunto = typeof adjunto.$inferSelect
export type Reasignacion = typeof reasignacion.$inferSelect
export type Correccion = typeof correccion.$inferSelect
export type Soporte = typeof soporte.$inferSelect
export type Notificacion = typeof notificacion.$inferSelect

export const schema = {
  usuario,
  festivo,
  oferta,
  tramo,
  tarea,
  subtarea,
  adjunto,
  reasignacion,
  correccion,
  soporte,
  notificacion
}
