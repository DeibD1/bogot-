# Manual de despliegue — Gestor de Ofertas en Vercel + Supabase

**Versión:** 1.0 · **Fecha:** 3 de julio de 2026

Este manual explica, paso a paso, cómo poner la aplicación en la nube usando
**Supabase** (base de datos + autenticación + almacenamiento) y **Vercel**
(frontend + backend serverless). Está pensado para hacerse en este orden.

> **Resumen de la arquitectura**
> - **Supabase** aloja: la base de datos PostgreSQL, la autenticación (Supabase
>   Auth) y los archivos adjuntos (Supabase Storage). Está siempre activo (plan Pro).
> - **Vercel** aloja: la interfaz React y la API (funciones serverless). Se
>   despliega automáticamente desde un repositorio privado de GitHub.
> - La app ya está en PostgreSQL, por lo que la base de datos casi no cambia.

---

## Índice
1. [Requisitos previos](#1-requisitos-previos)
2. [Parte A — Configurar Supabase](#parte-a--configurar-supabase)
3. [Parte B — Subir el código a GitHub](#parte-b--subir-el-código-a-github)
4. [Parte C — Desplegar en Vercel](#parte-c--desplegar-en-vercel)
5. [Parte D — Cargar la base de datos](#parte-d--cargar-la-base-de-datos)
6. [Parte E — Crear los usuarios](#parte-e--crear-los-usuarios)
7. [Parte F — Verificación final](#parte-f--verificación-final)
8. [Variables de entorno (resumen)](#variables-de-entorno-resumen)

---

## 1. Requisitos previos

- Una cuenta de **GitHub** (para el repositorio privado).
- Una cuenta de **Supabase** (se creará el proyecto y se sube a plan **Pro**).
- Una cuenta de **Vercel** (plan **Pro** por ser uso comercial).
- (Para el SSO corporativo, Fase 6) un **App Registration en Azure / Entra ID**.
- **Node.js 20+** instalado en el equipo desde el que se cargará el esquema de BD.

---

## Parte A — Configurar Supabase

### A.1 Crear el proyecto
1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Elige la **organización** y ponle nombre: `gestor-ofertas`.
3. **Región (importante):** elige la más cercana / la que exija el cumplimiento
   de datos de la empresa (p. ej. una región de EE. UU. o Sudamérica). *Esto
   define dónde viven los datos.*
4. Define y **guarda la contraseña de la base de datos** (la necesitarás luego).
5. Crea el proyecto y espera a que termine de aprovisionarse.

### A.2 Subir a plan Pro
- En **Settings → Billing**, sube el proyecto a **Pro**. Esto evita que el
  proyecto se pause por inactividad (la app debe estar 24/7) y activa backups.

### A.3 Obtener las cadenas de conexión a la base de datos
En **Settings → Database → Connection string** verás varias. Necesitas **dos**:

| Uso | Cuál | Puerto |
|---|---|---|
| **La app en Vercel (serverless)** | **Transaction pooler** (Supavisor) | **6543** |
| **Cargar el esquema una sola vez** | **Direct connection** | 5432 |

- A ambas, añade al final `?sslmode=require`.
- Ejemplo de la del pooler (la que va en Vercel):
  `postgresql://postgres.xxxx:TU_CLAVE@aws-0-...pooler.supabase.com:6543/postgres?sslmode=require`

### A.4 Obtener las claves de Auth/API
En **Settings → API**, copia y guarda (en un lugar seguro):
- **Project URL** → `SUPABASE_URL`
- **anon public** key → `SUPABASE_ANON_KEY` (la usa el frontend)
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (secreta, solo backend)
- **JWT Secret** → `SUPABASE_JWT_SECRET` (con esto el backend valida los inicios de sesión)

### A.5 Activar la autenticación
1. **Authentication → Providers → Email:** actívalo (permite usuario + contraseña).
2. (Recomendado) En **Authentication → Providers**, más adelante se activa
   **Azure (Entra ID)** para el inicio de sesión corporativo — ver Parte G.
3. En **Authentication → URL Configuration**, agrega la URL del sitio de Vercel
   (se conoce después de la Parte C) como *Site URL* y *Redirect URL*.

### A.6 Crear el almacenamiento de adjuntos
1. **Storage → New bucket** → nombre `adjuntos` → **Private** (no público).
2. Se dejará que el backend suba/descargue con la `service_role` key (Fase 4).

---

## Parte B — Subir el código a GitHub

El proyecto ya está bajo control de versiones (git). Falta publicarlo en un
**repositorio privado**.

1. En GitHub → **New repository** → nombre `gestor-ofertas` → **Private** → *Create*.
2. En el equipo, dentro de la carpeta del proyecto, conecta y sube:
   ```bash
   git remote add origin https://github.com/TU_ORG/gestor-ofertas.git
   git branch -M main
   git push -u origin main
   ```
> El archivo `.gitignore` ya excluye los secretos (`.env`, `database.config.json`)
> y `node_modules`. **Nunca** subas claves al repositorio.

---

## Parte C — Desplegar en Vercel

1. Entra a [vercel.com](https://vercel.com) → **Add New → Project**.
2. **Import** el repositorio `gestor-ofertas` de GitHub.
3. Sube tu cuenta/equipo a **Pro** (uso comercial).
4. **Configuración de compilación** (Vercel la toma de `vercel.json`, pero
   verifica que quede así):
   - **Framework Preset:** *Other*
   - **Build Command:** `npm run web:build`
   - **Output Directory:** `dist-web`
   - **Install Command:** por defecto (`npm install`)
   - La carpeta `api/` se detecta sola como **funciones serverless**.
5. **Environment Variables:** agrega las de la sección
   [Variables de entorno](#variables-de-entorno-resumen) (al menos `GESTOR_DB_URL`,
   `SUPABASE_JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`).
6. **Deploy.** `vercel.json` ya define las rutas (`/api/*` → funciones, resto →
   la SPA) y la tarea programada de alertas.
7. Al terminar, Vercel te da una URL pública (p. ej. `https://gestor-ofertas.vercel.app`).
   Vuelve a la **Parte A.5** y pon esa URL en Supabase (*Site URL* / *Redirect*).

> **Pendiente de la Fase de auth:** mientras no se conecte **Supabase Auth** en
> el frontend, el inicio de sesión usa el login propio (JWT). Para una primera
> prueba en Vercel puedes definir `JWT_SECRET` (cadena aleatoria) y entrar con el
> usuario inicial. El cambio a Supabase Auth es transparente para el usuario.

---

## Parte D — Cargar la base de datos

La aplicación **crea y actualiza su propio esquema al conectarse** (migraciones
aditivas). Hay dos formas de dejar la BD lista en Supabase:

**Opción 1 (recomendada) — con el script del proyecto, desde tu equipo:**
```bash
# Usa la conexión DIRECTA (puerto 5432) solo para esta carga inicial:
export GESTOR_DB_URL="postgresql://postgres:TU_CLAVE@db.xxxx.supabase.co:5432/postgres?sslmode=require"
npm install
npm run db:migrate      # crea/actualiza todas las tablas en Supabase
npm run db:seed         # (opcional) carga festivos y datos base
```
En Windows PowerShell, en vez de `export`, usa:
`$env:GESTOR_DB_URL="...";  npm run db:migrate`

**Opción 2 — automática:** la primera vez que la app arranca en Vercel, aplica
el esquema sola. Igual conviene la Opción 1 para verificar antes.

Puedes comprobar las tablas en Supabase → **Table Editor**.

---

## Parte E — Crear los usuarios

Con Supabase Auth, cada persona necesita existir en **dos** lugares (enlazados
por el **mismo correo**):

1. **En Supabase Auth** (para poder iniciar sesión): *Authentication → Users →
   Add user* (o invitación por correo). Usa el correo corporativo de cada quien.
2. **En la tabla `usuario` de la app** (para su **rol** y sus datos): se da de
   alta desde la propia aplicación (pestaña *Usuarios*, con el usuario líder de
   la unidad) o con el script `npm run usuario:crear`.

> El backend, al recibir a un usuario autenticado por Supabase, busca su correo
> en la tabla `usuario` para saber su **rol** y mostrarle su vista. Si el correo
> no está dado de alta en la app, el acceso se rechaza (403).

**Usuario inicial:** en una base vacía la app crea `admin@local` (líder de la
unidad). Para producción, crea tu propio administrador con el correo corporativo
en ambos lugares y usa ese.

---

## Parte F — Verificación final

1. Abre la URL de Vercel → deberías ver la aplicación.
2. `https://TU-APP.vercel.app/api/salud` debe responder `{"ok":true,...}`.
3. Inicia sesión con un usuario de prueba → debe entrar y mostrar la vista
   correspondiente a su rol.
4. Prueba un usuario de otro rol → debe ver una vista distinta.
5. En Supabase → **Table Editor**, verifica que los datos se guardan.
6. La tarea programada de alertas corre cada hora (configurada en `vercel.json`);
   puedes verla en Vercel → **Cron Jobs**.

---

## Parte G — (Fase 6) Inicio de sesión con Microsoft Entra ID

Cuando se aborde la Fase 6:
1. Tecnología crea un **App Registration** en Azure (Entra ID) y entrega:
   *Tenant ID, Client ID, Client Secret* y la *Redirect URL* que indica Supabase.
2. En Supabase → **Authentication → Providers → Azure**, se pegan esos datos.
3. Los usuarios podrán entrar con su cuenta corporativa; el rol se sigue tomando
   de la tabla `usuario` por correo.

---

## Variables de entorno (resumen)

Se configuran en **Vercel → Settings → Environment Variables** (y, para la carga
inicial de BD, temporalmente en tu equipo). Ver plantilla en `.env.example`.

| Variable | Para qué | Dónde se obtiene |
|---|---|---|
| `GESTOR_DB_URL` | Conexión a la BD (la del **pooler**, puerto 6543) | Supabase → Settings → Database |
| `SUPABASE_URL` | URL del proyecto | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Clave pública para el frontend | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta del backend (Storage) | Supabase → Settings → API |
| `SUPABASE_JWT_SECRET` | Validar los inicios de sesión en el backend | Supabase → Settings → API → JWT Secret |
| `SUPABASE_BUCKET_ADJUNTOS` | Nombre del bucket de adjuntos (`adjuntos`) | Lo defines tú |
| `CRON_SECRET` | Proteger la tarea programada de alertas | Cadena aleatoria que inventas |
| `JWT_EXPIRA` | (Opcional) vigencia de sesión en modo local | — |

> **Seguridad:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` y `CRON_SECRET`
> son secretos. Nunca se ponen en el código ni se suben a GitHub; solo en las
> variables de entorno de Vercel.

---

## ¿Qué falta del lado del desarrollo?

Este manual cubre la infraestructura. En paralelo, del lado del código quedan
(según el `PLAN_MIGRACION_WEB.md`, ahora sobre Vercel + Supabase):
- **Frontend web (SPA):** adaptar la interfaz React (hoy dentro de Electron) para
  el navegador, con inicio de sesión vía Supabase Auth.
- **Adjuntos:** subir/descargar contra Supabase Storage.
- **Ajustes finos** de despliegue verificados en el primer *deploy*.

El backend (API) y la validación de sesión de Supabase ya están adaptados.
