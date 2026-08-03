# Documento de Diseño Técnico — Gestor de Ofertas

**Versión:** 0.1.0 · **Tipo:** aplicación de escritorio (Electron) · multiusuario sobre PostgreSQL.
Documento solicitado por el Departamento de Tecnología. Los diagramas están en
**Mermaid** (se renderizan en VS Code, GitHub, Azure DevOps Wiki, mermaid.live o draw.io).

Índice:
1. Diagrama de contexto
2. Diagrama de arquitectura / componentes
3. Diagrama entidad–relación (DER)
4. Diagrama de flujo de procesos
5. Casos de uso
6. Diagrama de secuencia
7. Diagrama de despliegue
8. Diccionario de datos
9. Especificación de la API (IPC)

---

## 1. Diagrama de contexto

Visión general: quién usa el sistema y de qué servicios externos depende.

```mermaid
flowchart TB
  LC([Líder comercial]):::act
  LP([Líder de proyectos]):::act
  CC([Compras y contratación]):::act
  PC([Presupuestos y control]):::act
  LU([Líder de la unidad / Administrador]):::act

  SIS[["Gestor de Ofertas<br/>(aplicación de escritorio)"]]:::sys

  PG[(PostgreSQL<br/>servidor de la empresa / Azure)]:::ext
  M365[Microsoft 365<br/>Exchange Online · SMTP]:::ext

  LC -->|crea ofertas, socializa, envía| SIS
  LP -->|visita y especificaciones| SIS
  CC -->|cotización| SIS
  PC -->|APUs y precio| SIS
  LU -->|aprueba, administra, supervisa| SIS

  SIS -->|lee/escribe datos| PG
  SIS -->|códigos 2FA y avisos de soporte| M365

  classDef act fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;
  classDef sys fill:#ede9fe,stroke:#7c3aed,color:#4c1d95;
  classDef ext fill:#f1f5f9,stroke:#64748b,color:#334155;
```

---

## 2. Diagrama de arquitectura / componentes

Aplicación Electron con tres capas de proceso. **Toda la lógica de negocio y la
autorización viven en el proceso principal**; la interfaz solo consume una API
tipada expuesta por `contextBridge`.

```mermaid
flowchart TB
  subgraph REN[Renderer · React + Tailwind · contextIsolation + CSP]
    direction LR
    Login[Login / 2FA]
    Vistas[Vistas: Dashboard, VistaProfesional,<br/>BandejaAprobación, PanelIndicadores,<br/>CalendarioUnidad, LíneaTiempo,<br/>PanelUsuarios, PanelSoporte]
  end

  PRE[Preload · contextBridge<br/>API tipada window.api]

  subgraph MAIN[Proceso principal · Electron]
    direction TB
    IPC[index.ts · handlers IPC<br/>+ control de sesión e inactividad]
    subgraph SVC[Servicios de negocio]
      direction LR
      S1[auth · dosfa · mailer]
      S2[ofertas · tareas · planificacion<br/>dias-habiles · criticidad]
      S3[aprobacion · reasignacion<br/>subtareas · deshacer]
      S4[consultas · indicadores · calendario<br/>notificaciones · soporte · demo]
    end
    DB[db: client dual · schema Drizzle · DDL+migraciones]
  end

  PG[(PostgreSQL)]:::ext
  PGL[(PGlite embebido<br/>modo local)]:::ext
  SMTP[SMTP M365]:::ext

  Login & Vistas -->|IPC| PRE --> IPC
  IPC --> SVC --> DB
  IPC -->|eventos push| PRE
  DB -->|Drizzle ORM| PG
  DB -.->|sin servidor| PGL
  S1 -->|nodemailer| SMTP

  classDef ext fill:#f1f5f9,stroke:#64748b,color:#334155;
```

**Principios:** sin módulos nativos a compilar; consultas parametrizadas vía
ORM; sesión y permisos validados en el backend en cada operación; el renderer no
accede a Node.js.

---

## 3. Diagrama entidad–relación (DER)

Modelo de datos real (PostgreSQL). Incluye las extensiones al esquema original:
`subtarea`, `correccion`, `soporte` y columnas de rechazo/seguridad.

```mermaid
erDiagram
  USUARIO     ||--o{ OFERTA       : "crea / aprueba"
  USUARIO     ||--o{ TRAMO        : "es responsable"
  USUARIO     ||--o{ NOTIFICACION : "recibe"
  USUARIO     ||--o{ ADJUNTO      : "sube"
  USUARIO     ||--o{ REASIGNACION : "participa"
  USUARIO     ||--o{ SOPORTE      : "reporta"
  OFERTA      ||--|{ TRAMO        : "se divide en (6)"
  OFERTA      ||--o{ CORRECCION   : "motivos de rechazo"
  OFERTA      ||--o{ NOTIFICACION : "genera"
  TRAMO       ||--|{ TAREA        : "agrupa"
  TRAMO       ||--o{ ADJUNTO      : "contiene"
  TRAMO       ||--o{ REASIGNACION : "registra"
  TAREA       ||--o{ SUBTAREA     : "checklist"

  USUARIO {
    serial  id PK
    varchar nombre
    varchar email UK
    enum    rol
    varchar password_hash
    boolean activo
    smallint intentos_fallidos
    timestamp bloqueado_hasta
  }
  FESTIVO {
    date    fecha PK
    varchar descripcion
  }
  OFERTA {
    serial  id PK
    varchar cliente
    enum    tamano
    date    fecha_inicio
    smallint plazo_total_dias
    date    fecha_entrega_comprometida
    date    fecha_finalizacion_real
    date    fecha_aprob_unidad
    int     aprobado_por FK
    smallint dias_correccion
    smallint desviacion_dias
    numeric indicador_cumplimiento
    enum    estado
    int     creado_por FK
    varchar motivo_rechazo
    date    fecha_rechazo
    smallint tramo_correccion
  }
  TRAMO {
    serial  id PK
    int     oferta_id FK
    smallint numero
    int     responsable_id FK
    int     reasignado_de FK
    smallint duracion_asignada_dias
    date    fecha_activacion
    date    fecha_limite
    date    fecha_entrega_real
    smallint dias_habiles_usados
    smallint desviacion_dias
    numeric indicador_cumplimiento
    enum    estado
  }
  TAREA {
    serial  id PK
    int     tramo_id FK
    enum    tipo
    varchar descripcion
    enum    estado
    date    completada_en
  }
  SUBTAREA {
    serial  id PK
    int     tarea_id FK
    varchar descripcion
    boolean completada
  }
  ADJUNTO {
    serial  id PK
    int     tramo_id FK
    varchar tipo
    varchar nombre
    varchar ruta
    int     subido_por FK
  }
  REASIGNACION {
    serial  id PK
    int     tramo_id FK
    int     de_usuario_id FK
    int     a_usuario_id FK
    varchar motivo
  }
  CORRECCION {
    serial  id PK
    int     oferta_id FK
    smallint numero_tramo
    varchar motivo
    boolean entregada
  }
  SOPORTE {
    serial  id PK
    int     usuario_id FK
    varchar descripcion
    text    captura
    boolean atendido
    varchar respuesta
    int     respondido_por FK
  }
  NOTIFICACION {
    serial  id PK
    int     usuario_id FK
    int     oferta_id FK
    int     tramo_id FK
    enum    tipo
    varchar mensaje
    boolean leida
  }
```

---

## 4. Diagrama de flujo de procesos

Lógica funcional principal: ciclo de vida de una oferta (6 tramos secuenciales).

```mermaid
flowchart TD
  Inicio([Líder comercial registra la oferta]) --> Gen[/Sistema genera 6 tramos,<br/>tareas y fechas en días hábiles/]
  Gen --> T1[T1 · Socialización · Líder comercial · 1d]
  T1 --> T2[T2 · Visita + recolección · Proyectos · 2-3d]
  T2 --> T3[T3 · Cotización · Compras · 2-3d]
  T3 --> T4[T4 · APUs y precio · Presupuestos · 2-3d]
  T4 --> Pend{{Pendiente de aprobación}}
  Pend --> T5[T5 · Aprobación · Líder de unidad · 1d]
  T5 --> Dec{¿Aprueba?}
  Dec -- Sí --> T6[T6 · Envío al cliente · Líder comercial · 1d]
  Dec -- No --> Rech[Rechazada: 1+ motivos<br/>a tramos 1-4]
  Rech --> Corr[Cada implicado corrige y entrega]
  Corr --> Todos{¿Todos entregaron?}
  Todos -- No --> Corr
  Todos -- Sí --> Pend
  T6 --> Fin([Finalizada: desviación e indicador])
```

> Detalle ampliado y código de colores en `FLUJOGRAMA.md` /
> `flujograma_ciclo_vida.pdf`.

---

## 5. Casos de uso

Interacción de cada rol con el sistema.

```mermaid
flowchart LR
  LC([Líder comercial]):::act
  LP([Líder de proyectos]):::act
  CC([Compras]):::act
  PC([Presupuestos]):::act
  LU([Líder de la unidad]):::act
  TODOS([Todos los roles]):::act

  subgraph SIS[Gestor de Ofertas]
    U1(Iniciar sesión 2FA)
    U2(Crear oferta)
    U3(Completar tarea / entregar tramo)
    U4(Gestionar subtareas)
    U5(Adjuntar información)
    U6(Aprobar / rechazar oferta)
    U7(Entregar corrección)
    U8(Reasignar tramo)
    U9(Administrar usuarios)
    U10(Consultar indicadores)
    U11(Ver calendario / línea de tiempo)
    U12(Reportar / responder soporte)
    U13(Deshacer acción)
  end

  TODOS --- U1
  TODOS --- U10
  TODOS --- U13
  LC --- U2
  LC --- U11
  LP --- U3
  CC --- U3
  PC --- U3
  LP --- U4
  CC --- U4
  PC --- U4
  LP --- U5
  CC --- U5
  PC --- U5
  LP --- U7
  CC --- U7
  PC --- U7
  LU --- U6
  LU --- U8
  LU --- U9
  LU --- U11
  TODOS --- U12

  classDef act fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;
```

---

## 6. Diagrama de secuencia

Operación representativa: **un profesional completa la última tarea de su
tramo** (cierre, medición, recálculo en cascada y notificación).

```mermaid
sequenceDiagram
  autonumber
  actor P as Profesional (UI)
  participant PRE as Preload (contextBridge)
  participant M as Main (IPC handler)
  participant ST as Servicio Tareas
  participant SO as Servicio Ofertas
  participant DB as PostgreSQL
  participant SN as Notificaciones

  P->>PRE: completarTarea(tareaId)
  PRE->>M: ipc invoke 'prof:completar-tarea'
  M->>M: requerirSesion() · valida rol
  M->>ST: completarTarea(db, tareaId, hoy, festivos, usuarioId)
  ST->>DB: valida tarea 'en_curso' y responsable
  alt quedan tareas en el tramo
    ST->>DB: activa la siguiente tarea
  else era la última
    ST->>SO: cerrarTramo(tramoId, hoy)
    SO->>DB: desviación, indicador, estado=completado
    SO->>DB: recalcula fechas de tramos siguientes (cascada)
    SO->>DB: activa el tramo siguiente
    SO->>SN: notifica al siguiente responsable
    SN->>DB: inserta notificación
  end
  ST-->>M: ResultadoCompletar
  M-->>PRE: resultado
  PRE-->>P: actualiza la vista
```

---

## 7. Diagrama de despliegue

Dónde vive y se ejecuta la aplicación.

```mermaid
flowchart TB
  subgraph EQ["Estaciones de trabajo (Windows 10/11)"]
    APP[Gestor de Ofertas<br/>Electron · instalador NSIS<br/>config: database.config.json]
    LOCAL[(PGlite<br/>%APPDATA% · modo local)]
    APP -.->|sin servidor| LOCAL
  end

  subgraph RED["Red corporativa / VPN"]
    direction TB
    SRV[(Servidor PostgreSQL 14+<br/>on-premise o<br/>Azure Database for PostgreSQL)]
  end

  M365[Microsoft 365<br/>Exchange Online · SMTP 587/TLS]:::ext

  APP -->|TCP 5432 · TLS| SRV
  APP -->|SMTP · STARTTLS| M365

  classDef ext fill:#f1f5f9,stroke:#64748b,color:#334155;
```

**Notas de despliegue:** la app se instala por equipo (no requiere admin). La
conexión a la base y el SMTP se configuran por equipo en
`%APPDATA%\gestor-ofertas\database.config.json` (no se incrustan en el
instalador). Sin ese archivo, cada equipo opera de forma aislada con PGlite.

---

## 8. Diccionario de datos

Tipos enumerados:

| Enum | Valores |
|---|---|
| `rol_usuario` | lider_comercial, lider_proyectos, compras_contratacion, presupuestos_control, lider_unidad |
| `tamano_oferta` | grande (9 días), pequena (6 días) |
| `estado_oferta` | en_curso, pendiente_aprobacion_final, aprobada, rechazada |
| `tipo_tarea` | socializacion, visita, recoleccion, cotizacion, apu, aprobacion_unidad, envio_cliente |
| `estado_tarea` | pendiente, en_curso, completada, vencida |
| `estado_tramo` | pendiente, en_curso, completado, vencido |
| `tipo_notificacion` | compromiso, vencimiento_proximo, retraso |

**usuario** — personas que acceden al sistema.

| Campo | Tipo | Descripción |
|---|---|---|
| id | serial PK | Identificador |
| nombre | varchar(150) | Nombre completo |
| email | varchar(150) UK | Correo (login); ideal el de Microsoft 365 |
| rol | rol_usuario | Perfil / permisos |
| password_hash | varchar(255) | Hash bcrypt (nunca texto plano) |
| activo | boolean | Si puede iniciar sesión |
| intentos_fallidos | smallint | Contador para el bloqueo |
| bloqueado_hasta | timestamp | Fin del bloqueo temporal (si aplica) |
| creado_en | timestamp | Alta del registro |

**festivo** — calendario nacional para el cálculo de días hábiles.

| Campo | Tipo | Descripción |
|---|---|---|
| fecha | date PK | Día festivo |
| descripcion | varchar(150) | Nombre del festivo |

**oferta** — actividad principal.

| Campo | Tipo | Descripción |
|---|---|---|
| id | serial PK | Identificador |
| cliente | varchar(200) | Cliente |
| tamano | tamano_oferta | Grande / pequeña |
| fecha_inicio | date | Inicio (día hábil) |
| plazo_total_dias | smallint | 9 o 6 (plazo técnico) |
| fecha_entrega_comprometida | date | Fecha prometida al cliente (límite del envío) |
| fecha_finalizacion_real | date | Fecha real de envío al cliente |
| fecha_aprob_unidad | date | Fecha de aprobación |
| aprobado_por | int FK→usuario | Quién aprobó |
| dias_correccion | smallint | Días por rechazos (contados aparte, RN-19) |
| desviacion_dias | smallint | + retraso / − adelanto (días hábiles) |
| indicador_cumplimiento | numeric(5,2) | % de cumplimiento de la oferta |
| estado | estado_oferta | Estado actual |
| creado_por | int FK→usuario | Quién la registró (comercial) |
| motivo_rechazo | varchar(255) | Resumen del último rechazo |
| fecha_rechazo | date | Fecha del rechazo vigente |
| tramo_correccion | smallint | (heredado) compatibilidad |

**tramo** — unidad de plazo y calificación (6 por oferta).

| Campo | Tipo | Descripción |
|---|---|---|
| id | serial PK | Identificador |
| oferta_id | int FK→oferta | Oferta |
| numero | smallint (1–6) | Posición en el flujo |
| responsable_id | int FK→usuario | Profesional asignado |
| reasignado_de | int FK→usuario | Titular original si hubo reasignación |
| duracion_asignada_dias | smallint | Días hábiles asignados |
| fecha_activacion | date | Cuando recibe el trabajo |
| fecha_limite | date | Fecha límite |
| fecha_entrega_real | date | Entrega real |
| dias_habiles_usados | smallint | Días hábiles consumidos |
| desviacion_dias | smallint | usados − asignados |
| indicador_cumplimiento | numeric(5,2) | % del tramo |
| estado | estado_tramo | Estado |

**tarea** — pasos de un tramo. **subtarea** — checklist personal dentro de una tarea.

| tarea | Tipo | Descripción |
|---|---|---|
| id | serial PK | Identificador |
| tramo_id | int FK→tramo | Tramo |
| tipo | tipo_tarea | Tipo de tarea |
| descripcion | varchar(255) | Texto |
| estado | estado_tarea | Estado |
| completada_en | date | Fecha de completado |

| subtarea | Tipo | Descripción |
|---|---|---|
| id | serial PK | Identificador |
| tarea_id | int FK→tarea | Tarea |
| descripcion | varchar(255) | Ítem del checklist |
| completada | boolean | Cumplida o no |

**adjunto** — archivos compartidos por tramo. **reasignacion** — bitácora de reasignaciones.

| adjunto | Tipo | Descripción |
|---|---|---|
| id | serial PK | Identificador |
| tramo_id | int FK→tramo | Tramo |
| tipo | varchar(50) | especificaciones, cotizacion… |
| nombre | varchar(255) | Nombre del archivo |
| ruta | varchar(500) | Ruta/URL |
| subido_por | int FK→usuario | Autor |

| reasignacion | Tipo | Descripción |
|---|---|---|
| id | serial PK | Identificador |
| tramo_id | int FK→tramo | Tramo reasignado |
| de_usuario_id | int FK→usuario | Titular anterior |
| a_usuario_id | int FK→usuario | Nuevo responsable |
| motivo | varchar(255) | Motivo |

**correccion** — motivos de rechazo (varios por oferta). **soporte** — reportes técnicos.

| correccion | Tipo | Descripción |
|---|---|---|
| id | serial PK | Identificador |
| oferta_id | int FK→oferta | Oferta rechazada |
| numero_tramo | smallint | Tramo a corregir (1–4) |
| motivo | varchar(500) | Causa puntual |
| entregada | boolean | Si el profesional ya corrigió |

| soporte | Tipo | Descripción |
|---|---|---|
| id | serial PK | Identificador |
| usuario_id | int FK→usuario | Quién reporta |
| descripcion | varchar(2000) | Problema |
| captura | text | Pantallazo (data URL base64) |
| atendido | boolean | Estado |
| respuesta | varchar(2000) | Respuesta del administrador |
| respondido_por | int FK→usuario | Quién respondió |

**notificacion** — avisos en la app.

| Campo | Tipo | Descripción |
|---|---|---|
| id | serial PK | Identificador |
| usuario_id | int FK→usuario | Destinatario |
| oferta_id | int FK→oferta | Oferta relacionada (opcional) |
| tramo_id | int FK→tramo | Tramo relacionado (opcional) |
| tipo | tipo_notificacion | compromiso / vencimiento_proximo / retraso |
| mensaje | varchar(500) | Texto |
| leida | boolean | Estado |

---

## 9. Especificación de la API (IPC)

La aplicación **no expone una API REST**: el renderer se comunica con el proceso
principal mediante **IPC tipado** a través de `contextBridge`. Cada canal valida
sesión y, donde corresponde, rol. Esta es la superficie de la API interna.

| Módulo | Canal (IPC) | Parámetros → Retorno | Acceso |
|---|---|---|---|
| Auth | `auth:login` | {email, password} → ok / código_enviado / error | Público |
| Auth | `auth:verificar-codigo` | (email, código) → ResultadoLogin | Público |
| Auth | `auth:sesion` / `auth:logout` | () → SesiónUsuario \| null | Sesión |
| Auth | `auth:actividad` / `auth:sesion-expirada` | (push) inactividad | Sesión |
| Dashboard | `db:estadisticas` | () → conteos (con alcance por rol) | Sesión |
| Ofertas | `db:resumen-ofertas` | () → OfertaResumen[] | Sesión (alcance) |
| Ofertas | `oferta:crear` | NuevaOferta → ofertaId | **Comercial** |
| Ofertas | `oferta:candidatos` | () → responsables por rol | Comercial |
| Profesional | `prof:mis-tramos` | () → TramoAsignado[] | Sesión |
| Profesional | `prof:agenda` | (días) → AgendaDia[] | Sesión |
| Profesional | `prof:completar-tarea` | (tareaId) → ResultadoCompletar | Responsable |
| Profesional | `prof:entregar-correccion` | (ofertaId) → void | Responsable |
| Subtareas | `subtarea:crear/marcar/eliminar` | (…) → void | Responsable / líder en aprobación |
| Deshacer | `deshacer:tarea` | (tareaId) → void | Responsable |
| Deshacer | `deshacer:aprobacion` | (ofertaId) → void | **Líder unidad** |
| Aprobación | `aprob:pendientes` | () → PendienteAprobacion[] | Sesión |
| Aprobación | `aprob:aprobar` | (ofertaId) → void | **Líder unidad** |
| Aprobación | `aprob:rechazar` | (ofertaId, MotivoRechazo[]) → void | **Líder unidad** |
| Aprobación | `aprob:correcciones` | () → CorreccionPendiente[] | Sesión (propias) |
| Vistas | `vista:linea-tiempo` | (atrás, adelante) → LineaTiempo | Sesión |
| Vistas | `vista:calendario-unidad` | (días) → DiaCalendarioUnidad[] | Líder unidad / comercial |
| Vistas | `vista:detalle-oferta` | (ofertaId) → DetalleOferta | Participante / global |
| Indicadores | `lider:indicadores` | (filtro) → DatosDashboard | Sesión (todos) |
| Adjuntos | `adjuntos:por-oferta` / `:agregar` | (…) → AdjuntoInfo[] | Sesión / responsable |
| Reasignación | `admin:reasignar-tramo` | (tramoId, nuevoResp, motivo) → void | **Líder unidad** |
| Usuarios | `admin:usuarios-listar` | () → UsuarioAdmin[] | **Líder unidad** |
| Usuarios | `admin:usuario-crear` / `:usuario-actualizar` | (…) → void | **Líder unidad** |
| Demo | `admin:cargar-demo` | () → resumen | **Líder unidad** (base vacía) |
| Notificaciones | `notif:listar` / `:no-leidas` / `:marcar-leidas` | (…) | Sesión (propias) |
| Soporte | `soporte:crear` | (descripción, captura) → id | Sesión |
| Soporte | `soporte:capturar-pantalla` / `:adjuntar-imagen` | () → dataURL | Sesión |
| Soporte | `soporte:listar` / `:atender` / `:responder` | (…) | **Líder unidad** |
| Soporte | `soporte:mis-reportes` | () → ReporteSoporte[] | Sesión (propias) |

> El contrato de tipos completo está en `src/shared/ipc.ts`. La autorización se
> aplica en `src/main/index.ts` y en cada servicio de `src/main/services/`.
