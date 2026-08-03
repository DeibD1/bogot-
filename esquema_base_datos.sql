-- =============================================================================
--  ESQUEMA DE BASE DE DATOS
--  Aplicación de Gestión de Tiempo y Tareas para Ofertas Comerciales
--  Motor: PostgreSQL (adaptable a SQLite/MySQL — ver notas al final)
--  Basado en el Documento de Requisitos v1.2
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- -----------------------------------------------------------------------------
CREATE TYPE rol_usuario AS ENUM (
    'lider_proyectos',
    'compras_contratacion',
    'presupuestos_control',
    'lider_unidad'
);

CREATE TYPE tamano_oferta AS ENUM ('grande', 'pequena');

CREATE TYPE estado_oferta AS ENUM (
    'en_curso',
    'pendiente_aprobacion_final',
    'aprobada',
    'rechazada'
);

-- Las 4 tareas del flujo + el paso de aprobación del líder de la unidad
CREATE TYPE tipo_tarea AS ENUM (
    'visita',            -- Tarea 1  (tramo 1, líder de proyectos)
    'recoleccion',       -- Tarea 2  (tramo 1, líder de proyectos)
    'cotizacion',        -- Tarea 3  (tramo 2, compras y contratación)
    'apu',               -- Tarea 4  (tramo 3, presupuestos y control)
    'aprobacion_unidad'  -- Paso de cierre (tramo 4, líder de la unidad)
);

CREATE TYPE estado_tarea AS ENUM ('pendiente', 'en_curso', 'completada', 'vencida');
CREATE TYPE estado_tramo AS ENUM ('pendiente', 'en_curso', 'completado', 'vencido');

CREATE TYPE tipo_notificacion AS ENUM ('compromiso', 'vencimiento_proximo', 'retraso');


-- -----------------------------------------------------------------------------
-- 2. USUARIOS
-- -----------------------------------------------------------------------------
CREATE TABLE usuario (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    rol           rol_usuario  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en     TIMESTAMP    NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 3. CALENDARIO DE FESTIVOS (Colombia) — base para el cálculo de días hábiles
-- -----------------------------------------------------------------------------
CREATE TABLE festivo (
    fecha       DATE         PRIMARY KEY,
    descripcion VARCHAR(150) NOT NULL
);
-- NOTA: poblar cada año con el calendario oficial de festivos de Colombia
-- (incluye festivos trasladables por Ley Emiliani). Ejemplo de formato:
-- INSERT INTO festivo (fecha, descripcion) VALUES ('2026-01-01', 'Año Nuevo');


-- -----------------------------------------------------------------------------
-- 4. OFERTA  (actividad principal)
-- -----------------------------------------------------------------------------
CREATE TABLE oferta (
    id                          SERIAL        PRIMARY KEY,
    cliente                     VARCHAR(200)  NOT NULL,
    tamano                      tamano_oferta NOT NULL,
    fecha_inicio                DATE          NOT NULL,
    plazo_total_dias            SMALLINT      NOT NULL,   -- 6 (pequeña) o 9 (grande)
    -- Fecha comprometida = plazo ofertado al cliente + 1 día de aprobación final
    fecha_entrega_comprometida  DATE,
    fecha_finalizacion_real     DATE,                     -- = fecha de aprobación final
    fecha_aprob_unidad          DATE,
    aprobado_por                INTEGER       REFERENCES usuario(id),
    dias_correccion             SMALLINT      NOT NULL DEFAULT 0,  -- tiempo por rechazos (aparte)
    desviacion_dias             SMALLINT,                 -- (+) retraso / (-) adelanto / 0 a tiempo
    indicador_cumplimiento      NUMERIC(5,2),             -- 0.00 .. 100.00
    estado                      estado_oferta NOT NULL DEFAULT 'en_curso',
    creado_por                  INTEGER       REFERENCES usuario(id),
    creado_en                   TIMESTAMP     NOT NULL DEFAULT now(),

    CONSTRAINT chk_plazo CHECK (plazo_total_dias IN (6, 9)),
    CONSTRAINT chk_indicador_oferta
        CHECK (indicador_cumplimiento IS NULL
               OR indicador_cumplimiento BETWEEN 0 AND 100)
);


-- -----------------------------------------------------------------------------
-- 5. TRAMO  (unidad de plazo y de calificación, asignada a un profesional)
--    Tramo 1 = tareas 1 y 2 (líder de proyectos)
--    Tramo 2 = tarea 3      (compras y contratación)
--    Tramo 3 = tarea 4      (presupuestos y control)
--    Tramo 4 = aprobación   (líder de la unidad, duración 1 día)
-- -----------------------------------------------------------------------------
CREATE TABLE tramo (
    id                     SERIAL       PRIMARY KEY,
    oferta_id              INTEGER      NOT NULL REFERENCES oferta(id) ON DELETE CASCADE,
    numero                 SMALLINT     NOT NULL,    -- 1..4
    responsable_id         INTEGER      NOT NULL REFERENCES usuario(id),
    reasignado_de          INTEGER      REFERENCES usuario(id),  -- titular original, si hubo reasignación
    duracion_asignada_dias SMALLINT     NOT NULL,    -- 2 o 3 (profesionales); 1 (aprobación)
    fecha_activacion       DATE,                     -- cuando el profesional RECIBE el trabajo
    fecha_limite           DATE,                     -- activacion + duracion (en días hábiles)
    fecha_entrega_real     DATE,
    dias_habiles_usados    SMALLINT,
    -- desviacion = dias_habiles_usados - duracion_asignada  (se mide contra la
    -- duración de la actividad, NO contra una fecha fija: un retraso heredado
    -- no perjudica al profesional siguiente)
    desviacion_dias        SMALLINT,
    indicador_cumplimiento NUMERIC(5,2),
    estado                 estado_tramo NOT NULL DEFAULT 'pendiente',

    CONSTRAINT uq_tramo_oferta UNIQUE (oferta_id, numero),
    CONSTRAINT chk_numero_tramo CHECK (numero BETWEEN 1 AND 4),
    CONSTRAINT chk_indicador_tramo
        CHECK (indicador_cumplimiento IS NULL
               OR indicador_cumplimiento BETWEEN 0 AND 100)
);

CREATE INDEX idx_tramo_responsable ON tramo (responsable_id);
CREATE INDEX idx_tramo_estado      ON tramo (estado);
CREATE INDEX idx_tramo_fecha_limite ON tramo (fecha_limite);


-- -----------------------------------------------------------------------------
-- 6. TAREA  (cada paso concreto del flujo; pertenece a un tramo)
--    El tramo 1 agrupa dos tareas (visita y recolección).
-- -----------------------------------------------------------------------------
CREATE TABLE tarea (
    id            SERIAL       PRIMARY KEY,
    tramo_id      INTEGER      NOT NULL REFERENCES tramo(id) ON DELETE CASCADE,
    tipo          tipo_tarea   NOT NULL,
    descripcion   VARCHAR(255),
    estado        estado_tarea NOT NULL DEFAULT 'pendiente',
    completada_en TIMESTAMP
);

CREATE INDEX idx_tarea_tramo ON tarea (tramo_id);


-- -----------------------------------------------------------------------------
-- 7. ADJUNTO  (información que se comparte entre profesionales: RF-10)
--    Especificaciones técnicas, cotizaciones, etc.
-- -----------------------------------------------------------------------------
CREATE TABLE adjunto (
    id         SERIAL       PRIMARY KEY,
    tramo_id   INTEGER      NOT NULL REFERENCES tramo(id) ON DELETE CASCADE,
    tipo       VARCHAR(50),                 -- 'especificaciones', 'cotizacion', ...
    nombre     VARCHAR(255) NOT NULL,
    ruta       VARCHAR(500),                -- ruta/URL del archivo
    subido_por INTEGER      REFERENCES usuario(id),
    subido_en  TIMESTAMP    NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 8. REASIGNACIÓN  (bitácora de reasignaciones forzosas: RN-18 / RF-30)
-- -----------------------------------------------------------------------------
CREATE TABLE reasignacion (
    id            SERIAL    PRIMARY KEY,
    tramo_id      INTEGER   NOT NULL REFERENCES tramo(id) ON DELETE CASCADE,
    de_usuario_id INTEGER   REFERENCES usuario(id),
    a_usuario_id  INTEGER   NOT NULL REFERENCES usuario(id),
    motivo        VARCHAR(255),
    fecha         TIMESTAMP NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 9. NOTIFICACIÓN  (compromisos y retrasos: RF-27)
-- -----------------------------------------------------------------------------
CREATE TABLE notificacion (
    id         SERIAL            PRIMARY KEY,
    usuario_id INTEGER           NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    oferta_id  INTEGER           REFERENCES oferta(id) ON DELETE CASCADE,
    tramo_id   INTEGER           REFERENCES tramo(id) ON DELETE CASCADE,
    tipo       tipo_notificacion NOT NULL,
    mensaje    VARCHAR(500)      NOT NULL,
    creada_en  TIMESTAMP         NOT NULL DEFAULT now(),
    leida      BOOLEAN           NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_notif_usuario ON notificacion (usuario_id, leida);


-- =============================================================================
--  FUNCIONES Y VISTAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- F1. Conteo de días hábiles entre dos fechas (excluye fines de semana y festivos)
--     Cuenta el intervalo [p_inicio, p_fin)  (no incluye el día final).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dias_habiles(p_inicio DATE, p_fin DATE)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER
    FROM generate_series(p_inicio, p_fin - INTERVAL '1 day', INTERVAL '1 day') AS d
    WHERE EXTRACT(ISODOW FROM d) < 6                       -- 1=lunes .. 5=viernes
      AND d::date NOT IN (SELECT fecha FROM festivo);
$$ LANGUAGE sql STABLE;

-- -----------------------------------------------------------------------------
-- F2. Suma N días hábiles a una fecha (para calcular fechas límite)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sumar_dias_habiles(p_fecha DATE, p_dias INTEGER)
RETURNS DATE AS $$
DECLARE
    v_fecha   DATE := p_fecha;
    v_contado INTEGER := 0;
BEGIN
    WHILE v_contado < p_dias LOOP
        v_fecha := v_fecha + 1;
        IF EXTRACT(ISODOW FROM v_fecha) < 6
           AND v_fecha NOT IN (SELECT fecha FROM festivo) THEN
            v_contado := v_contado + 1;
        END IF;
    END LOOP;
    RETURN v_fecha;
END;
$$ LANGUAGE plpgsql STABLE;


-- -----------------------------------------------------------------------------
-- V1. Indicador de cumplimiento por profesional  (sección 11.3 / RF-15, RF-25)
--     rendimiento_promedio = promedio de las calificaciones de sus tramos
-- -----------------------------------------------------------------------------
CREATE VIEW v_indicador_profesional AS
SELECT
    u.id                                                   AS usuario_id,
    u.nombre,
    u.rol,
    COUNT(t.id)                                            AS total_tramos,
    COUNT(*) FILTER (WHERE t.desviacion_dias <= 0)         AS tramos_a_tiempo,
    COUNT(*) FILTER (WHERE t.desviacion_dias > 0)          AS tramos_retrasados,
    ROUND(AVG(t.desviacion_dias), 2)                       AS desviacion_promedio,
    ROUND(AVG(t.indicador_cumplimiento), 2)                AS rendimiento_promedio
FROM usuario u
LEFT JOIN tramo t
       ON t.responsable_id = u.id
      AND t.estado = 'completado'
GROUP BY u.id, u.nombre, u.rol;


-- -----------------------------------------------------------------------------
-- V2. Indicador de cumplimiento de la unidad  (sección 11.6 / RF-24)
--     = promedio de los indicadores de cumplimiento de las ofertas aprobadas
-- -----------------------------------------------------------------------------
CREATE VIEW v_indicador_unidad AS
SELECT
    ROUND(AVG(indicador_cumplimiento), 2) AS indicador_cumplimiento_unidad,
    COUNT(*)                              AS ofertas_consideradas
FROM oferta
WHERE estado = 'aprobada'
  AND indicador_cumplimiento IS NOT NULL;


-- -----------------------------------------------------------------------------
-- V3. Resumen de ofertas para el tablero del líder de la unidad
-- -----------------------------------------------------------------------------
CREATE VIEW v_oferta_resumen AS
SELECT
    o.id,
    o.cliente,
    o.tamano,
    o.estado,
    o.fecha_inicio,
    o.fecha_entrega_comprometida,
    o.fecha_finalizacion_real,
    o.desviacion_dias,
    o.indicador_cumplimiento,
    -- tramo en curso (el de menor número que no esté completado)
    (SELECT MIN(t.numero) FROM tramo t
      WHERE t.oferta_id = o.id AND t.estado <> 'completado') AS tramo_actual
FROM oferta o;


-- =============================================================================
--  NOTAS DE IMPLEMENTACIÓN
-- =============================================================================
-- 1) Los campos `desviacion_dias` e `indicador_cumplimiento` (en tramo y oferta)
--    los calcula la aplicación (o un trigger) al cerrar cada tramo/oferta, con
--    las fórmulas de la sección 11 del documento:
--      desviacion_tramo  = dias_habiles_usados - duracion_asignada_dias
--      cumplimiento      = 100                              si desviacion <= 0
--                          max(0, (1 - desviacion/duracion) * 100)  si > 0
--      (para la oferta, el divisor es plazo_total_dias)
--    Un adelanto se topa en 100% (no se premia por encima).
--
-- 2) Al entregarse un tramo tarde, la aplicación debe RECALCULAR (RN-16):
--      fecha_activacion del tramo siguiente = fecha_entrega_real del actual
--      fecha_limite = sumar_dias_habiles(fecha_activacion, duracion_asignada_dias)
--    y propagar hasta fecha_entrega_comprometida de la oferta.
--
-- 3) El tiempo de corrección por rechazo (RN-19) se acumula en
--    oferta.dias_correccion y NO modifica la desviación de los tramos del
--    profesional (no afecta su calificación).
--
-- 4) Adaptación a SQLite: reemplazar los ENUM por VARCHAR + CHECK, SERIAL por
--    INTEGER PRIMARY KEY AUTOINCREMENT, y portar las funciones de días hábiles
--    a la capa de aplicación (SQLite no soporta PL/pgSQL).
-- =============================================================================
