# Gestor de Ofertas — aplicación web

Aplicación **web** para gestionar el tiempo y las tareas en la elaboración de
ofertas comerciales: flujo secuencial de 6 tramos entre 5 roles, con plazos en
días hábiles, indicadores de cumplimiento, notificaciones, calendario de unidad
y soporte técnico.

**Stack:** React + TypeScript (frontend) · Node/Express como **funciones
serverless** (backend) · **PostgreSQL** vía Drizzle ORM · despliegue en
**Vercel** + **Supabase** (base de datos, autenticación y almacenamiento).

> **Nota para revisión:** este proyecto nació como app de escritorio (Electron)
> y fue **migrado a web**. Los archivos de Electron ya fueron retirados: lo que
> hay en el repo es **una sola aplicación web**. La lógica de negocio y los
> componentes de UI se conservaron (están probados) y hoy los consume la web.

## Mapa del repositorio

| Carpeta | Qué es | Rol |
|---|---|---|
| `src/web/` | Entrada del **frontend** web (monta React y el cliente HTTP) | 🟢 Web |
| `src/renderer/src/` | **Componentes React** y vistas (UI compartida) | 🟢 Web |
| `api/` | **Punto de entrada serverless** de Vercel (envuelve la app Express) | 🟢 Web |
| `src/server/` | **Backend HTTP**: Express, rutas, autenticación (JWT/Supabase), errores | 🟢 Web |
| `src/main/services/` | **Lógica de negocio** (días hábiles, tramos, indicadores, reglas) | 🔵 Núcleo |
| `src/main/db/` | Esquema Drizzle, conexión (PostgreSQL/PGlite) y migraciones | 🔵 Núcleo |
| `src/shared/` | Dominio: roles, tramos, permisos, contrato de la API (tipos) | 🔵 Núcleo |
| `scripts/` | Utilidades: migrar, sembrar, resetear, crear usuario | 🔧 Ops |

> Los nombres `src/main` y `src/renderer` vienen de la estructura original; hoy
> `src/main` contiene la **lógica de negocio y la BD** (la usa el backend web) y
> `src/renderer/src` contiene la **UI React** (la usa el frontend web).

## Cómo correr en local

Requisitos: **Node.js 20+**. Sin configuración, la BD usa un PostgreSQL
embebido local (PGlite) — ideal para desarrollo.

```bash
npm install
npm run server     # backend HTTP en http://localhost:3000
npm run web:dev    # frontend en http://localhost:5174 (proxied a /api)
```

Abre `http://localhost:5174`. Usuario inicial en base vacía:
`admin@local` / `Admin#2026`.

Otros comandos:

```bash
npm test           # 122 pruebas de la lógica de negocio (Vitest)
npm run typecheck  # TypeScript estricto (backend + frontend)
npm run web:build  # compila la SPA a dist-web/ (lo que despliega Vercel)
npm run db:setup   # aplica esquema + datos base (modo local)
```

## Despliegue (Vercel + Supabase)

El paso a paso completo está en **[`MANUAL_DESPLIEGUE.md`](MANUAL_DESPLIEGUE.md)**:
crear el proyecto de Supabase (BD + Auth + Storage), subir el repo, e importar
en Vercel con las variables de entorno. La configuración de build ya está en
`vercel.json` y la plantilla de variables en `.env.example`.

## Documentación

- **[`PLAN_MIGRACION_WEB.md`](PLAN_MIGRACION_WEB.md)** — alcance y fases de la migración a web.
- **[`MANUAL_DESPLIEGUE.md`](MANUAL_DESPLIEGUE.md)** — guía de despliegue en Vercel + Supabase.
- **[`DISENO_TECNICO.md`](DISENO_TECNICO.md)** — diagramas (contexto, componentes, DER, secuencia, despliegue) y diccionario de datos.
- **[`Documento_de_Requisitos.md`](Documento_de_Requisitos.md)** — requisitos funcionales (SRS) y reglas de negocio.
- **`esquema_base_datos.sql`** — modelo de datos de referencia.

## Estado de la migración

- ✅ Backend HTTP (API) reutilizando la lógica de negocio
- ✅ Autenticación por JWT (y preparada para **Supabase Auth**)
- ✅ Frontend web (SPA) reutilizando los componentes React
- ✅ Adaptación a serverless de Vercel + configuración de despliegue
- ⏳ Conectar Supabase Auth y subir adjuntos a Supabase Storage (requiere las
  claves del proyecto Supabase)
