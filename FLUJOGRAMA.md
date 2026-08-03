# Flujograma — Gestor de Ofertas

Documento solicitado por el Departamento de Tecnología. Los diagramas están en
**Mermaid**; se renderizan en VS Code (extensión Markdown Preview Mermaid),
GitHub, https://mermaid.live o draw.io. El diagrama principal también está como
archivo independiente: `flujograma_aplicacion.mermaid`.

---

## 1. Ciclo de vida de una oferta (flujo principal)

Flujo **secuencial de 6 tramos** entre 5 roles. Cada oferta avanza tramo a
tramo; al cerrarse cada uno se calcula su desviación e indicador, se reprograman
en cascada las fechas siguientes y se notifica al siguiente responsable.

```mermaid
flowchart TD
  Inicio([Líder comercial registra la oferta:<br/>cliente · tamaño · fecha · días de socialización]) --> Gen[/El sistema genera automáticamente<br/>6 tramos, tareas y fechas en días hábiles/]
  Gen --> T1
  T1[T1 · Socialización de la oportunidad<br/>Líder comercial · 1 día hábil]:::com --> T2
  T2[T2 · Visita técnica + recolección<br/>Líder de proyectos · 2-3 días]:::tec --> T3
  T3[T3 · Cotización de insumos y mano de obra<br/>Compras y contratación · 2-3 días]:::tec --> T4
  T4[T4 · APUs y precio de la oferta<br/>Presupuestos y control · 2-3 días]:::tec --> Pend{{Oferta pendiente<br/>de aprobación final}}
  Pend --> T5[T5 · Revisión y aprobación<br/>Líder de la unidad · 1 día hábil]:::uni
  T5 --> Dec{¿Aprueba la oferta?}
  Dec -- Sí --> T6[T6 · Envío de la oferta al cliente<br/>Líder comercial · 1 día hábil]:::com
  Dec -- No --> Rech[Oferta RECHAZADA<br/>uno o varios motivos, cada uno<br/>dirigido a un tramo 1-4]:::rech
  Rech --> Corr[Cada profesional implicado<br/>corrige y entrega su parte]:::tec
  Corr --> TodosOK{¿Todos los implicados<br/>entregaron?}
  TodosOK -- No --> Corr
  TodosOK -- Sí --> Pend
  T6 --> Fin([Oferta FINALIZADA:<br/>desviación e indicador de cumplimiento]):::fin
  classDef com fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;
  classDef tec fill:#dcfce7,stroke:#16a34a,color:#14532d;
  classDef uni fill:#fef9c3,stroke:#ca8a04,color:#713f12;
  classDef rech fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;
  classDef fin fill:#ede9fe,stroke:#7c3aed,color:#4c1d95;
```

**Reglas clave del flujo**
- Los plazos se calculan en **días hábiles** (excluye fines de semana y festivos
  de Colombia). Tamaño grande = 9 días técnicos (3-3-3); pequeña = 6 (2-2-2).
  Socialización, aprobación y envío suman 1 día cada uno, aparte.
- Un retraso en un tramo **desplaza** las fechas siguientes pero **no penaliza**
  la calificación del profesional posterior (cada quien se mide contra su propia
  duración desde que recibe el trabajo).
- El **tiempo de corrección** tras un rechazo se contabiliza aparte y no afecta
  la calificación de los tramos ya entregados.
- La oferta se mide contra la **fecha comprometida con el cliente** (la del
  envío) al completarse el tramo 6.

## 2. Inicio de sesión y acceso por rol

```mermaid
flowchart TD
  A([Abrir la aplicación]) --> B[Iniciar sesión<br/>correo + contraseña]
  B --> C{¿Credenciales válidas<br/>y usuario activo?}
  C -- No --> C1[Error genérico ·<br/>bloqueo tras 5 intentos por 15 min]
  C1 --> B
  C -- Sí --> D{¿SMTP configurado?<br/>2FA}
  D -- Sí --> E[Código de verificación al correo<br/>6 dígitos · 5 min · 3 intentos]
  E --> F{¿Código correcto?}
  F -- No --> E
  F -- Sí --> G[Sesión iniciada]
  D -- No --> G
  G --> H{Rol}
  H -- Líder comercial --> I1[Crear ofertas · socializar · enviar<br/>calendario e indicadores de unidad]
  H -- Profesional técnico --> I2[Mis tareas · agenda · subtareas<br/>completar/entregar · indicadores]
  H -- Líder de la unidad --> I3[Aprobar/rechazar · usuarios · reasignar<br/>soporte · indicadores · panorama]
  I1 --> Z[(Cierre automático<br/>por inactividad · 15 min)]
  I2 --> Z
  I3 --> Z
```

## 3. Arquitectura (flujo técnico de datos)

```mermaid
flowchart LR
  UI[Renderer · React<br/>contextIsolation + CSP]
  PRE[Preload · contextBridge<br/>API tipada]
  MAIN[Proceso principal Electron<br/>servicios + autorización por rol]
  DB[(PostgreSQL<br/>servidor compartido)]
  PG[(PGlite embebido<br/>modo local)]
  SMTP[SMTP Microsoft 365<br/>2FA y soporte]

  UI -- IPC --> PRE
  PRE -- invoke --> MAIN
  MAIN -- Drizzle ORM --> DB
  MAIN -. sin servidor .-> PG
  MAIN -- nodemailer --> SMTP
  MAIN -- eventos --> PRE
  PRE --> UI
```

> Toda la **lógica de negocio y la autorización** se ejecutan en el proceso
> principal; la interfaz solo consume una API tipada por `contextBridge`. La base
> de datos es PostgreSQL (servidor compartido) o PGlite embebido (local), con el
> mismo dialecto.
