// =============================================================================
//  Datos de DEMOSTRACIÓN (para presentar la aplicación).
//  Crea usuarios de ejemplo (uno por proceso) y ofertas en TODAS las etapas,
//  con distintos profesionales, ancladas a la fecha actual para que la
//  criticidad (vencido / vence hoy / a tiempo) se vea realista.
//  Solo lo carga el líder de la unidad y SOLO si la base no tiene ofertas
//  todavía (no contamina una base en uso).
// =============================================================================
import { and, asc, count, eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { oferta, tarea, tramo, usuario } from '../db/schema'
import { type Rol } from '../../shared/dominio'
import { esLiderUnidad } from '../../shared/permisos'
import type { SesionUsuario } from '../../shared/ipc'
import { aprobarOferta, rechazarOferta } from './aprobacion'
import { hashPassword } from './auth'
import { restarDiasHabiles, sumarDiasHabiles, type Festivos } from './dias-habiles'
import { crearOferta } from './ofertas'
import { completarTarea } from './tareas'

const PASSWORD_DEMO = 'Demo#2026'

const USUARIOS_DEMO: { nombre: string; email: string; rol: Rol }[] = [
  { nombre: 'Sofía Vargas', email: 'sofia@empresa.co', rol: 'lider_comercial' },
  { nombre: 'Ana Restrepo', email: 'ana@empresa.co', rol: 'lider_proyectos' },
  { nombre: 'Carlos Méndez', email: 'carlos@empresa.co', rol: 'compras_contratacion' },
  { nombre: 'Diana Lozano', email: 'diana@empresa.co', rol: 'presupuestos_control' },
  { nombre: 'Eduardo Salas', email: 'eduardo@empresa.co', rol: 'lider_unidad' }
]

export interface ResultadoDemo {
  usuariosCreados: number
  ofertasCreadas: number
  passwordDemo: string
}

export async function cargarDatosDemostracion(
  db: DB,
  sesion: SesionUsuario,
  hoy: string,
  festivos: Festivos
): Promise<ResultadoDemo> {
  if (!esLiderUnidad(sesion.rol)) {
    throw new Error('Solo el líder de la unidad puede cargar los datos de demostración')
  }
  const hayOfertas = (await db.select({ n: count() }).from(oferta))[0]!.n
  if (hayOfertas > 0) {
    throw new Error(
      'Ya existen ofertas en la base. La demostración solo se carga en una base vacía para no mezclar datos.'
    )
  }

  // 1) Usuarios demo (no duplica si el correo ya existe).
  const hash = hashPassword(PASSWORD_DEMO)
  let usuariosCreados = 0
  for (const u of USUARIOS_DEMO) {
    const res = await db
      .insert(usuario)
      .values({ nombre: u.nombre, email: u.email, rol: u.rol, passwordHash: hash })
      .onConflictDoNothing({ target: usuario.email })
      .returning({ id: usuario.id })
    if (res.length > 0) usuariosCreados++
  }

  const filas = await db.select().from(usuario)
  const idPor = (email: string): number => filas.find((f) => f.email === email)!.id
  const responsables: Record<Rol, number> = {
    lider_comercial: idPor('sofia@empresa.co'),
    lider_proyectos: idPor('ana@empresa.co'),
    compras_contratacion: idPor('carlos@empresa.co'),
    presupuestos_control: idPor('diana@empresa.co'),
    lider_unidad: idPor('eduardo@empresa.co')
  }
  const comoEduardo: SesionUsuario = {
    id: responsables.lider_unidad,
    nombre: 'Eduardo Salas',
    email: 'eduardo@empresa.co',
    rol: 'lider_unidad'
  }

  // Helpers ------------------------------------------------------------------
  const nueva = (cliente: string, tamano: 'grande' | 'pequena', inicio: string) =>
    crearOferta(db, {
      cliente,
      tamano,
      fechaInicio: inicio,
      responsables,
      creadoPor: responsables.lider_comercial,
      festivos
    })

  const responsablePorTramo: Record<number, number> = {
    1: responsables.lider_comercial,
    2: responsables.lider_proyectos,
    3: responsables.compras_contratacion,
    4: responsables.presupuestos_control,
    6: responsables.lider_comercial
  }

  /** Entrega el tramo `numero` en su fecha límite (a tiempo); `retraso` lo corre. */
  const entregar = async (ofertaId: number, numero: number, retraso = 0): Promise<void> => {
    const tr = (
      await db.select().from(tramo).where(and(eq(tramo.ofertaId, ofertaId), eq(tramo.numero, numero)))
    )[0]!
    const fecha = retraso > 0 ? sumarDiasHabiles(tr.fechaLimite!, retraso, festivos) : tr.fechaLimite!
    const tareas = await db.select().from(tarea).where(eq(tarea.tramoId, tr.id)).orderBy(asc(tarea.id))
    for (const ta of tareas) {
      if (ta.estado !== 'completada') {
        await completarTarea(db, ta.id, fecha, festivos, responsablePorTramo[numero]!)
      }
    }
  }
  const limiteTramo = async (ofertaId: number, numero: number): Promise<string> =>
    (await db.select().from(tramo).where(and(eq(tramo.ofertaId, ofertaId), eq(tramo.numero, numero))))[0]!
      .fechaLimite!

  let ofertasCreadas = 0
  const reg = (): void => {
    ofertasCreadas++
  }

  // 2) Ofertas en todas las etapas ------------------------------------------

  // A) Recién creada hoy: SOCIALIZACIÓN en curso (Sofía).
  await nueva('Constructora Andina S.A.S.', 'grande', hoy)
  reg()

  // B) Tramo 2 en curso (Ana): socialización entregada; arrancó hace unos días.
  const b = await nueva('Inmobiliaria del Norte Ltda.', 'pequena', restarDiasHabiles(hoy, 2, festivos))
  await entregar(b, 1)
  reg()

  // C) Tramo 3 en curso (Carlos), arrancó hace tiempo → límite ya VENCIDO.
  const c = await nueva('Edificaciones Bolívar S.A.', 'pequena', restarDiasHabiles(hoy, 8, festivos))
  await entregar(c, 1)
  await entregar(c, 2)
  reg()

  // D) Tramo 4 en curso (Diana).
  const d = await nueva('Centro Comercial La Sabana', 'grande', restarDiasHabiles(hoy, 9, festivos))
  await entregar(d, 1)
  await entregar(d, 2)
  await entregar(d, 3)
  reg()

  // E) PENDIENTE DE APROBACIÓN (bandeja de Eduardo).
  const e = await nueva('Hotel Mirador del Café', 'pequena', restarDiasHabiles(hoy, 8, festivos))
  for (const n of [1, 2, 3, 4]) await entregar(e, n)
  reg()

  // F) RECHAZADA / en corrección (dos motivos: Carlos y Diana).
  const f = await nueva('Torres de Manizales', 'pequena', restarDiasHabiles(hoy, 9, festivos))
  for (const n of [1, 2, 3, 4]) await entregar(f, n)
  await rechazarOferta(
    db,
    f,
    [
      { numeroTramo: 3, motivo: 'Actualizar cotización de aceros (precios vencidos)' },
      { numeroTramo: 4, motivo: 'Revisar APU de acabados: faltan cantidades' }
    ],
    restarDiasHabiles(hoy, 1, festivos),
    comoEduardo
  )
  reg()

  // G) APROBADA con ENVÍO pendiente (Sofía debe enviarla al cliente).
  const g = await nueva('Parque Industrial del Cauca', 'grande', restarDiasHabiles(hoy, 13, festivos))
  for (const n of [1, 2, 3, 4]) await entregar(g, n)
  await aprobarOferta(db, g, await limiteTramo(g, 5), festivos, comoEduardo)
  reg()

  // H) FINALIZADA a tiempo (histórico, indicadores al 100%).
  const h = await nueva('Conjunto Sauces Etapa 3', 'grande', restarDiasHabiles(hoy, 20, festivos))
  for (const n of [1, 2, 3, 4]) await entregar(h, n)
  await aprobarOferta(db, h, await limiteTramo(h, 5), festivos, comoEduardo)
  await entregar(h, 6)
  reg()

  // I) FINALIZADA con retraso de Carlos (su tramo 0%, oferta 66.67%).
  const i = await nueva('Biblioteca Comunal', 'pequena', restarDiasHabiles(hoy, 20, festivos))
  await entregar(i, 1)
  await entregar(i, 2)
  await entregar(i, 3, 2) // cotización 2 días tarde
  await entregar(i, 4)
  await aprobarOferta(db, i, await limiteTramo(i, 5), festivos, comoEduardo)
  await entregar(i, 6)
  reg()

  return { usuariosCreados, ofertasCreadas, passwordDemo: PASSWORD_DEMO }
}
