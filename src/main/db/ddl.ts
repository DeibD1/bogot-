import {
  ESTADOS_OFERTA,
  ESTADOS_TAREA,
  ESTADOS_TRAMO,
  ROLES,
  TAMANOS,
  TIPOS_NOTIFICACION,
  TIPOS_TAREA
} from '../../shared/dominio'

const valores = (vs: readonly string[]): string => vs.map((v) => `'${v}'`).join(', ')

/** CREATE TYPE idempotente (PostgreSQL no soporta IF NOT EXISTS en tipos). */
const crearEnum = (nombre: string, vs: readonly string[]): string => `
DO $$ BEGIN
  CREATE TYPE ${nombre} AS ENUM (${valores(vs)});
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;`

/**
 * DDL del esquema en PostgreSQL, adaptación directa de esquema_base_datos.sql
 * (mismos tipos enumerados, tablas, restricciones e índices), más la extensión
 * de la Fase 4 (columnas de rechazo en `oferta`, con migración aditiva).
 * Idempotente: seguro de ejecutar en cada arranque. Mantener alineado con schema.ts.
 */
export const DDL_POSTGRES = `
${crearEnum('rol_usuario', ROLES)}
${crearEnum('tamano_oferta', TAMANOS)}
${crearEnum('estado_oferta', ESTADOS_OFERTA)}
${crearEnum('tipo_tarea', TIPOS_TAREA)}
${crearEnum('estado_tarea', ESTADOS_TAREA)}
${crearEnum('estado_tramo', ESTADOS_TRAMO)}
${crearEnum('tipo_notificacion', TIPOS_NOTIFICACION)}

CREATE TABLE IF NOT EXISTS usuario (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(150) NOT NULL,
  email             VARCHAR(150) NOT NULL UNIQUE,
  rol               rol_usuario  NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  activo            BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMP    NOT NULL DEFAULT now(),
  intentos_fallidos SMALLINT     NOT NULL DEFAULT 0,
  bloqueado_hasta   TIMESTAMP
);

CREATE TABLE IF NOT EXISTS festivo (
  fecha       DATE         PRIMARY KEY,
  descripcion VARCHAR(150) NOT NULL
);

CREATE TABLE IF NOT EXISTS oferta (
  id                          SERIAL        PRIMARY KEY,
  cliente                     VARCHAR(200)  NOT NULL,
  tamano                      tamano_oferta NOT NULL,
  fecha_inicio                DATE          NOT NULL,
  plazo_total_dias            SMALLINT      NOT NULL,
  fecha_entrega_comprometida  DATE,
  fecha_finalizacion_real     DATE,
  fecha_aprob_unidad          DATE,
  aprobado_por                INTEGER       REFERENCES usuario(id),
  dias_correccion             SMALLINT      NOT NULL DEFAULT 0,
  desviacion_dias             SMALLINT,
  indicador_cumplimiento      NUMERIC(5,2),
  estado                      estado_oferta NOT NULL DEFAULT 'en_curso',
  creado_por                  INTEGER       REFERENCES usuario(id),
  creado_en                   TIMESTAMP     NOT NULL DEFAULT now(),
  motivo_rechazo              VARCHAR(255),
  fecha_rechazo               DATE,
  tramo_correccion            SMALLINT,

  CONSTRAINT chk_plazo CHECK (plazo_total_dias IN (6, 9)),
  CONSTRAINT chk_indicador_oferta
    CHECK (indicador_cumplimiento IS NULL OR (indicador_cumplimiento BETWEEN 0 AND 100))
);

CREATE TABLE IF NOT EXISTS tramo (
  id                     SERIAL       PRIMARY KEY,
  oferta_id              INTEGER      NOT NULL REFERENCES oferta(id) ON DELETE CASCADE,
  numero                 SMALLINT     NOT NULL,
  responsable_id         INTEGER      NOT NULL REFERENCES usuario(id),
  reasignado_de          INTEGER      REFERENCES usuario(id),
  duracion_asignada_dias SMALLINT     NOT NULL,
  fecha_activacion       DATE,
  fecha_limite           DATE,
  fecha_entrega_real     DATE,
  dias_habiles_usados    SMALLINT,
  desviacion_dias        SMALLINT,
  indicador_cumplimiento NUMERIC(5,2),
  estado                 estado_tramo NOT NULL DEFAULT 'pendiente',

  CONSTRAINT uq_tramo_oferta UNIQUE (oferta_id, numero),
  CONSTRAINT chk_numero_tramo CHECK (numero BETWEEN 1 AND 6),
  CONSTRAINT chk_indicador_tramo
    CHECK (indicador_cumplimiento IS NULL OR (indicador_cumplimiento BETWEEN 0 AND 100))
);
CREATE INDEX IF NOT EXISTS idx_tramo_responsable  ON tramo (responsable_id);
CREATE INDEX IF NOT EXISTS idx_tramo_estado       ON tramo (estado);
CREATE INDEX IF NOT EXISTS idx_tramo_fecha_limite ON tramo (fecha_limite);

CREATE TABLE IF NOT EXISTS tarea (
  id            SERIAL       PRIMARY KEY,
  tramo_id      INTEGER      NOT NULL REFERENCES tramo(id) ON DELETE CASCADE,
  tipo          tipo_tarea   NOT NULL,
  descripcion   VARCHAR(255),
  estado        estado_tarea NOT NULL DEFAULT 'pendiente',
  completada_en DATE
);
CREATE INDEX IF NOT EXISTS idx_tarea_tramo ON tarea (tramo_id);

CREATE TABLE IF NOT EXISTS subtarea (
  id          SERIAL       PRIMARY KEY,
  tarea_id    INTEGER      NOT NULL REFERENCES tarea(id) ON DELETE CASCADE,
  descripcion VARCHAR(255) NOT NULL,
  completada  BOOLEAN      NOT NULL DEFAULT FALSE,
  creada_en   TIMESTAMP    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subtarea_tarea ON subtarea (tarea_id);

CREATE TABLE IF NOT EXISTS adjunto (
  id         SERIAL       PRIMARY KEY,
  tramo_id   INTEGER      NOT NULL REFERENCES tramo(id) ON DELETE CASCADE,
  tipo       VARCHAR(50),
  nombre     VARCHAR(255) NOT NULL,
  ruta       VARCHAR(500),
  subido_por INTEGER      REFERENCES usuario(id),
  subido_en  TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reasignacion (
  id            SERIAL    PRIMARY KEY,
  tramo_id      INTEGER   NOT NULL REFERENCES tramo(id) ON DELETE CASCADE,
  de_usuario_id INTEGER   REFERENCES usuario(id),
  a_usuario_id  INTEGER   NOT NULL REFERENCES usuario(id),
  motivo        VARCHAR(255),
  fecha         TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS correccion (
  id           SERIAL       PRIMARY KEY,
  oferta_id    INTEGER      NOT NULL REFERENCES oferta(id) ON DELETE CASCADE,
  numero_tramo SMALLINT     NOT NULL,
  motivo       VARCHAR(500) NOT NULL,
  entregada    BOOLEAN      NOT NULL DEFAULT FALSE,
  creada_en    TIMESTAMP    NOT NULL DEFAULT now(),
  entregada_en TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_correccion_oferta ON correccion (oferta_id, entregada);

CREATE TABLE IF NOT EXISTS soporte (
  id             SERIAL        PRIMARY KEY,
  usuario_id     INTEGER       NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  descripcion    VARCHAR(2000) NOT NULL,
  captura        TEXT,
  atendido       BOOLEAN       NOT NULL DEFAULT FALSE,
  creada_en      TIMESTAMP     NOT NULL DEFAULT now(),
  respuesta      VARCHAR(2000),
  respondida_en  TIMESTAMP,
  respondido_por INTEGER       REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS notificacion (
  id         SERIAL            PRIMARY KEY,
  usuario_id INTEGER           NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  oferta_id  INTEGER           REFERENCES oferta(id) ON DELETE CASCADE,
  tramo_id   INTEGER           REFERENCES tramo(id) ON DELETE CASCADE,
  tipo       tipo_notificacion NOT NULL,
  mensaje    VARCHAR(500)      NOT NULL,
  creada_en  TIMESTAMP         NOT NULL DEFAULT now(),
  leida      BOOLEAN           NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificacion (usuario_id, leida);

-- Migración aditiva para bases creadas antes de la Fase 4 (no-op si ya existen):
ALTER TABLE oferta ADD COLUMN IF NOT EXISTS motivo_rechazo   VARCHAR(255);
ALTER TABLE oferta ADD COLUMN IF NOT EXISTS fecha_rechazo    DATE;
ALTER TABLE oferta ADD COLUMN IF NOT EXISTS tramo_correccion SMALLINT;
-- Seguridad: bloqueo temporal por intentos fallidos de inicio de sesión:
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS intentos_fallidos SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS bloqueado_hasta   TIMESTAMP;

-- Líder comercial (extensión): nuevo rol, nuevas tareas y flujo de 6 tramos.
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'lider_comercial';
ALTER TYPE tipo_tarea  ADD VALUE IF NOT EXISTS 'socializacion';
ALTER TYPE tipo_tarea  ADD VALUE IF NOT EXISTS 'envio_cliente';
ALTER TABLE tramo DROP CONSTRAINT IF EXISTS chk_numero_tramo;
ALTER TABLE tramo ADD CONSTRAINT chk_numero_tramo CHECK (numero BETWEEN 1 AND 6);
-- Soporte: respuesta del administrador al usuario que reportó:
ALTER TABLE soporte ADD COLUMN IF NOT EXISTS respuesta      VARCHAR(2000);
ALTER TABLE soporte ADD COLUMN IF NOT EXISTS respondida_en  TIMESTAMP;
ALTER TABLE soporte ADD COLUMN IF NOT EXISTS respondido_por INTEGER REFERENCES usuario(id);
`

/** Ejecuta el DDL completo a través de la conexión (pg o PGlite). */
export async function aplicarEsquema(ejecutar: (sql: string) => Promise<void>): Promise<void> {
  await ejecutar(DDL_POSTGRES)
}
