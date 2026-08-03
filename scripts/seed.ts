// Siembra de datos de arranque (Fase 0):
//   - Usuarios: uno por cada rol + suplentes de los roles profesionales
//     (para demostrar reasignación, RN-18).
//   - Calendario de festivos de Colombia 2026.
//   - 1 oferta de ejemplo (grande) con sus 4 tramos, tareas y fechas planificadas
//     calculadas a mano con la convención inclusiva del §6 (inicio lunes
//     2026-09-07, ventana sin festivos). El motor de cálculo automático llega
//     en la Fase 1; aquí las fechas van precalculadas y verificables a mano.
import bcrypt from 'bcryptjs'
import { and, asc, count, eq } from 'drizzle-orm'
import { crearConexion, type DB } from '../src/main/db/client'
import { aplicarEsquema } from '../src/main/db/ddl'
import { festivo, oferta, tarea, tramo, usuario } from '../src/main/db/schema'
import type { Rol } from '../src/shared/dominio'
import type { SesionUsuario } from '../src/shared/ipc'
import { aprobarOferta } from '../src/main/services/aprobacion'
import { cargarFestivos } from '../src/main/services/calendario'
import { sumarDiasHabiles, type Festivos } from '../src/main/services/dias-habiles'
import { crearOferta } from '../src/main/services/ofertas'
import { completarTarea } from '../src/main/services/tareas'
import { FESTIVOS_COLOMBIA_2026 } from './festivos-colombia-2026'

const PASSWORD_DEMO = 'demo1234'

interface UsuarioSeed {
  nombre: string
  email: string
  rol: Rol
}

// 4 profesionales (uno por proceso, incluido el líder comercial) + líder de la unidad.
const USUARIOS: UsuarioSeed[] = [
  { nombre: 'Sofía Vargas', email: 'sofia@empresa.co', rol: 'lider_comercial' },
  { nombre: 'Ana Restrepo', email: 'ana@empresa.co', rol: 'lider_proyectos' },
  { nombre: 'Carlos Méndez', email: 'carlos@empresa.co', rol: 'compras_contratacion' },
  { nombre: 'Diana Lozano', email: 'diana@empresa.co', rol: 'presupuestos_control' },
  { nombre: 'Eduardo Salas', email: 'eduardo@empresa.co', rol: 'lider_unidad' }
]

// Suplentes de versiones anteriores del seed: se eliminan para dejar solo
// un profesional por proceso (se borran después de limpiar las ofertas).
const EMAILS_SUPLENTES = ['felipe@empresa.co', 'gloria@empresa.co', 'hugo@empresa.co']

async function sembrarFestivos(db: DB): Promise<number> {
  const filas = FESTIVOS_COLOMBIA_2026.map((f) => ({ fecha: f.fecha, descripcion: f.descripcion }))
  await db.insert(festivo).values(filas).onConflictDoNothing()
  return filas.length
}

async function sembrarUsuarios(db: DB): Promise<void> {
  const hash = bcrypt.hashSync(PASSWORD_DEMO, 10)
  for (const u of USUARIOS) {
    await db
      .insert(usuario)
      .values({ nombre: u.nombre, email: u.email, rol: u.rol, passwordHash: hash })
      .onConflictDoNothing({ target: usuario.email })
  }
}

async function idPorEmail(db: DB, email: string): Promise<number> {
  const filas = await db.select({ id: usuario.id }).from(usuario).where(eq(usuario.email, email))
  const fila = filas[0]
  if (!fila) throw new Error(`Usuario no encontrado: ${email}`)
  return fila.id
}

async function tramoDe(db: DB, ofertaId: number, numero: number) {
  const filas = await db
    .select()
    .from(tramo)
    .where(and(eq(tramo.ofertaId, ofertaId), eq(tramo.numero, numero)))
  if (!filas[0]) throw new Error(`Tramo ${numero} de oferta ${ofertaId} no existe`)
  return filas[0]
}

/**
 * Entrega un tramo completando todas sus tareas. Por defecto entrega justo en
 * su fecha límite vigente (a tiempo); `retrasoDias` la corre en días hábiles.
 */
async function entregarTramo(
  db: DB,
  festivos: Festivos,
  ofertaId: number,
  numero: number,
  responsableId: number,
  retrasoDias = 0
): Promise<void> {
  const tr = await tramoDe(db, ofertaId, numero)
  if (!tr.fechaLimite) throw new Error(`El tramo ${numero} no tiene fecha límite`)
  const fecha = retrasoDias > 0 ? sumarDiasHabiles(tr.fechaLimite, retrasoDias, festivos) : tr.fechaLimite
  const tareas = await db.select().from(tarea).where(eq(tarea.tramoId, tr.id)).orderBy(asc(tarea.id))
  for (const ta of tareas) {
    if (ta.estado !== 'completada') {
      await completarTarea(db, ta.id, fecha, festivos, responsableId)
    }
  }
}

type FilaOferta = [cliente: string, tamano: 'grande' | 'pequena', fechaInicio: string]

/**
 * Escenario de simulación (calibrado a la semana del 2026-06-10), generado
 * íntegramente con el MOTOR real (crearOferta / completarTarea / aprobar):
 *
 *  - 5 proyectos ACTIVOS por profesional, con inicios repartidos en la semana:
 *      · Grupo A: tramo 1 en curso (Ana) — incluye 1 vencido y 2 que vencen hoy.
 *      · Grupo B: tramo 2 en curso (Carlos) — incluye 2 vencidos.
 *      · Grupo C: tramo 3 en curso (Diana) — incluye 2 vencidos y 1 que vence hoy.
 *  - 2 ofertas PENDIENTES DE APROBACIÓN FINAL (bandeja del líder): una con la
 *    revisión VENCIDA y otra que vence hoy.
 *  - 2 ofertas APROBADAS (histórico para indicadores): una al 100% y otra al
 *    66.67% (Carlos entregó 2 días tarde; RN-15 demostrado).
 */
async function sembrarOfertasEjemplo(db: DB): Promise<void> {
  // Reinicia las ofertas para que el seed sea re-ejecutable.
  await db.delete(oferta) // cascada: tramo -> tarea / adjunto / notificacion

  // Sin ofertas que los referencien, los suplentes antiguos pueden eliminarse.
  for (const email of EMAILS_SUPLENTES) {
    await db.delete(usuario).where(eq(usuario.email, email))
  }

  const responsables: Record<Rol, number> = {
    lider_comercial: await idPorEmail(db, 'sofia@empresa.co'),
    lider_proyectos: await idPorEmail(db, 'ana@empresa.co'),
    compras_contratacion: await idPorEmail(db, 'carlos@empresa.co'),
    presupuestos_control: await idPorEmail(db, 'diana@empresa.co'),
    lider_unidad: await idPorEmail(db, 'eduardo@empresa.co')
  }
  const lider: SesionUsuario = {
    id: responsables.lider_unidad,
    nombre: 'Eduardo Salas',
    email: 'eduardo@empresa.co',
    rol: 'lider_unidad'
  }
  const festivos = await cargarFestivos(db)
  const nueva = (cliente: string, tamano: 'grande' | 'pequena', fechaInicio: string) =>
    crearOferta(db, { cliente, tamano, fechaInicio, responsables, creadoPor: responsables.lider_proyectos, festivos })

  // --- Grupo A: tramo 2 EN CURSO o por iniciar (Ana / Sofía) -------------------
  // Sofía socializa (tramo 1, 1 día) y entrega; Ana queda con la visita activa.
  const grupoA: FilaOferta[] = [
    ['Bodegas San Mateo', 'pequena', '2026-06-03'],
    ['Clínica del Oriente', 'grande', '2026-06-05'],
    ['Colegio La Arboleda', 'pequena', '2026-06-09'],
    ['Urbanización Altos del Río', 'grande', '2026-06-10'],
    ['Parqueadero Central', 'pequena', '2026-06-11']
  ]
  for (const [cliente, tamano, inicio] of grupoA) {
    const id = await nueva(cliente, tamano, inicio)
    // Las dos últimas quedan con la SOCIALIZACIÓN de Sofía aún en curso.
    if (inicio <= '2026-06-09') {
      await entregarTramo(db, festivos, id, 1, responsables.lider_comercial)
    }
  }

  // --- Grupo B: tramo 3 EN CURSO (Carlos, 5 proyectos) ------------------------
  const grupoB: FilaOferta[] = [
    ['Ferretería El Constructor', 'pequena', '2026-06-01'],
    ['Torre Empresarial Nogal', 'grande', '2026-06-01'],
    ['Restaurante La Plaza', 'pequena', '2026-06-04'],
    ['Centro Logístico Andes', 'grande', '2026-06-03'],
    ['Vivero Municipal', 'pequena', '2026-06-05']
  ]
  for (const [cliente, tamano, inicio] of grupoB) {
    const id = await nueva(cliente, tamano, inicio)
    await entregarTramo(db, festivos, id, 1, responsables.lider_comercial)
    await entregarTramo(db, festivos, id, 2, responsables.lider_proyectos)
  }

  // --- Grupo C: tramo 4 EN CURSO (Diana, 5 proyectos) -------------------------
  const grupoC: FilaOferta[] = [
    ['Hotel Mirador del Café', 'pequena', '2026-05-26'],
    ['Biblioteca Comunal', 'pequena', '2026-05-27'],
    ['Planta Industrial Cauca II', 'grande', '2026-05-28'],
    ['Conjunto Sauces Etapa 3', 'grande', '2026-06-01'],
    ['Edificio Miraflores', 'pequena', '2026-06-03']
  ]
  for (const [cliente, tamano, inicio] of grupoC) {
    const id = await nueva(cliente, tamano, inicio)
    await entregarTramo(db, festivos, id, 1, responsables.lider_comercial)
    await entregarTramo(db, festivos, id, 2, responsables.lider_proyectos)
    await entregarTramo(db, festivos, id, 3, responsables.compras_contratacion)
  }

  // --- Grupo D: PENDIENTES DE APROBACIÓN FINAL (bandeja del líder) ------------
  const grupoD: FilaOferta[] = [
    ['Centro Comercial La Sabana', 'pequena', '2026-05-25'],
    ['Constructora Andina S.A.S.', 'grande', '2026-05-26']
  ]
  for (const [cliente, tamano, inicio] of grupoD) {
    const id = await nueva(cliente, tamano, inicio)
    await entregarTramo(db, festivos, id, 1, responsables.lider_comercial)
    await entregarTramo(db, festivos, id, 2, responsables.lider_proyectos)
    await entregarTramo(db, festivos, id, 3, responsables.compras_contratacion)
    await entregarTramo(db, festivos, id, 4, responsables.presupuestos_control)
  }

  // --- APROBADA con ENVÍO pendiente (Sofía debe enviarla al cliente) -----------
  const h = await nueva('Hospital Regional del Norte', 'pequena', '2026-05-28')
  await entregarTramo(db, festivos, h, 1, responsables.lider_comercial)
  await entregarTramo(db, festivos, h, 2, responsables.lider_proyectos)
  await entregarTramo(db, festivos, h, 3, responsables.compras_contratacion)
  await entregarTramo(db, festivos, h, 4, responsables.presupuestos_control)
  await aprobarOferta(db, h, (await tramoDe(db, h, 5)).fechaLimite!, festivos, lider)

  // --- Históricas FINALIZADAS (alimentan los indicadores) ----------------------
  // 100%: todo a tiempo, incluida la socialización, la aprobación y el envío.
  const f = await nueva('Parque Industrial del Cauca', 'grande', '2026-05-04')
  await entregarTramo(db, festivos, f, 1, responsables.lider_comercial)
  await entregarTramo(db, festivos, f, 2, responsables.lider_proyectos)
  await entregarTramo(db, festivos, f, 3, responsables.compras_contratacion)
  await entregarTramo(db, festivos, f, 4, responsables.presupuestos_control)
  await aprobarOferta(db, f, (await tramoDe(db, f, 5)).fechaLimite!, festivos, lider)
  await entregarTramo(db, festivos, f, 6, responsables.lider_comercial)

  // 66.67%: Carlos entregó 2 días hábiles tarde (su tramo al 0%); los demás
  // cumplieron sus fechas recalculadas (100%, RN-15).
  const g = await nueva('Torres de Manizales', 'pequena', '2026-05-18')
  await entregarTramo(db, festivos, g, 1, responsables.lider_comercial)
  await entregarTramo(db, festivos, g, 2, responsables.lider_proyectos)
  await entregarTramo(db, festivos, g, 3, responsables.compras_contratacion, 2) // tarde
  await entregarTramo(db, festivos, g, 4, responsables.presupuestos_control)
  await aprobarOferta(db, g, (await tramoDe(db, g, 5)).fechaLimite!, festivos, lider)
  await entregarTramo(db, festivos, g, 6, responsables.lider_comercial)
}

async function main(): Promise<void> {
  const conexion = await crearConexion()
  const { db } = conexion
  const contar = async (t: typeof usuario | typeof festivo | typeof oferta | typeof tramo | typeof tarea) =>
    (await db.select({ n: count() }).from(t))[0]!.n
  try {
    await aplicarEsquema(conexion.ejecutar) // asegura que el esquema exista
    const nFestivos = await sembrarFestivos(db)
    await sembrarUsuarios(db)
    await sembrarOfertasEjemplo(db)

    console.log(`✓ Seed completado en: ${conexion.destino}`)
    console.log(`  Usuarios: ${await contar(usuario)}  (contraseña demo: "${PASSWORD_DEMO}")`)
    console.log(`  Festivos: ${await contar(festivo)}  (procesados ${nFestivos} de 2026)`)
    console.log(
      `  Ofertas de ejemplo: ${await contar(oferta)}  |  Tramos: ${await contar(tramo)}  |  Tareas: ${await contar(tarea)}`
    )
  } finally {
    await conexion.cerrar()
  }
}

main().catch((e) => {
  console.error('✗ Error en seed:', e)
  process.exit(1)
})
