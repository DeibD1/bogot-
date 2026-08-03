// =============================================================================
//  Reasignación forzosa de tramos (RN-18 / RF-30): cuando el titular no está
//  disponible, el líder de la unidad reasigna el tramo a otro profesional del
//  MISMO rol, registrando el cambio en la bitácora `reasignacion`.
//  El histórico del titular original queda trazado en `tramo.reasignado_de`.
// =============================================================================
import { eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { oferta, reasignacion, tramo, usuario } from '../db/schema'
import { esLiderUnidad } from '../../shared/permisos'
import type { SesionUsuario } from '../../shared/ipc'
import { notificar } from './notificaciones'

export async function reasignarTramo(
  db: DB,
  p: { tramoId: number; nuevoResponsableId: number; motivo: string },
  sesion: SesionUsuario
): Promise<void> {
  if (!esLiderUnidad(sesion.rol)) {
    throw new Error('Solo el líder de la unidad puede reasignar tramos')
  }
  if (!p.motivo.trim()) throw new Error('Debe indicar el motivo de la reasignación')

  const filasTramo = await db.select().from(tramo).where(eq(tramo.id, p.tramoId))
  const t = filasTramo[0]
  if (!t) throw new Error(`El tramo ${p.tramoId} no existe`)
  if (t.estado === 'completado') {
    throw new Error('No se puede reasignar un tramo ya completado')
  }

  const actuales = await db.select().from(usuario).where(eq(usuario.id, t.responsableId))
  const actual = actuales[0]!
  if (p.nuevoResponsableId === actual.id) {
    throw new Error('El nuevo responsable debe ser distinto del actual')
  }

  const nuevos = await db.select().from(usuario).where(eq(usuario.id, p.nuevoResponsableId))
  const nuevo = nuevos[0]
  if (!nuevo) throw new Error('El nuevo responsable no existe')
  if (!nuevo.activo) throw new Error('El nuevo responsable está inactivo')
  if (nuevo.rol !== actual.rol) {
    throw new Error('La reasignación debe ser a un profesional del MISMO rol (RN-18)')
  }

  // Bitácora del cambio (RF-30).
  await db.insert(reasignacion).values({
    tramoId: t.id,
    deUsuarioId: actual.id,
    aUsuarioId: nuevo.id,
    motivo: p.motivo.trim()
  })

  // El tramo pasa al nuevo responsable; se conserva el titular ORIGINAL.
  await db
    .update(tramo)
    .set({
      responsableId: nuevo.id,
      reasignadoDe: t.reasignadoDe ?? actual.id
    })
    .where(eq(tramo.id, t.id))

  // Compromiso para el nuevo responsable (RF-27).
  const filasOferta = await db
    .select({ cliente: oferta.cliente })
    .from(oferta)
    .where(eq(oferta.id, t.ofertaId))
  const cliente = filasOferta[0]?.cliente ?? ''
  const fechas =
    t.estado === 'en_curso'
      ? `Fecha límite: ${t.fechaLimite ?? '—'}.`
      : `Previsto: ${t.fechaActivacion ?? '—'} → ${t.fechaLimite ?? '—'}.`
  await notificar(db, {
    usuarioId: nuevo.id,
    tipo: 'compromiso',
    mensaje: `Se te reasignó el tramo ${t.numero} de la oferta "${cliente}" (antes de ${actual.nombre}). ${fechas}`,
    ofertaId: t.ofertaId,
    tramoId: t.id
  })
}
