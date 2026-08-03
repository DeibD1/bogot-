import { useCallback, useEffect, useState } from 'react'
import type { DetalleOferta as Detalle, DetalleTramo, SesionUsuario, UsuarioAdmin } from '@shared/ipc'
import { ETIQUETA_ROL, TOTAL_TRAMOS } from '@shared/dominio'
import { puedeAprobar } from '@shared/permisos'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { CriticidadBadge } from './CriticidadBadge'
import { cn } from '../lib/utils'

const NOMBRE_TRAMO: Record<number, string> = {
  1: 'Socialización de la oportunidad',
  2: 'Visita técnica y especificaciones',
  3: 'Cotización de insumos y mano de obra',
  4: 'APUs y precio de la oferta',
  5: 'Aprobación final',
  6: 'Envío de la oferta al cliente'
}
const NUMERO_APROBACION = 5

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{etiqueta}</div>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

function MedicionTramo({ t }: { t: DetalleTramo }): JSX.Element | null {
  if (t.estado !== 'completado' || t.desviacionDias === null) return null
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-muted-foreground">
        usados: <strong className="text-foreground">{t.diasHabilesUsados}d</strong>
      </span>
      <span className="text-muted-foreground">
        desviación:{' '}
        <strong className={t.desviacionDias > 0 ? 'text-estado-vencido' : 'text-estado-atiempo'}>
          {t.desviacionDias > 0 ? `+${t.desviacionDias}` : t.desviacionDias}d
        </strong>
      </span>
      <span
        className={cn(
          'rounded-full px-2 py-0.5 font-semibold',
          (t.indicadorCumplimiento ?? 0) >= 90
            ? 'bg-estado-atiempo/15 text-estado-atiempo'
            : (t.indicadorCumplimiento ?? 0) >= 70
              ? 'bg-estado-proximo/15 text-estado-proximo'
              : 'bg-estado-vencido/15 text-estado-vencido'
        )}
      >
        {t.indicadorCumplimiento}%
      </span>
    </div>
  )
}

interface DetalleOfertaProps {
  ofertaId: number
  onVolver: () => void
  /** Habilita la reasignación forzosa de tramos (solo líder de la unidad). */
  permitirReasignar?: boolean
  /** Sesión actual: habilita "Deshacer" sobre las tareas propias. */
  sesion?: SesionUsuario
}

export function DetalleOferta({
  ofertaId,
  onVolver,
  permitirReasignar = false,
  sesion
}: DetalleOfertaProps): JSX.Element {
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [error, setError] = useState('')
  // Reasignación (RN-18 / RF-30)
  const [reasignando, setReasignando] = useState<number | null>(null) // tramoId
  const [candidatos, setCandidatos] = useState<UsuarioAdmin[]>([])
  const [nuevoResponsable, setNuevoResponsable] = useState<number | 0>(0)
  const [motivoReasignacion, setMotivoReasignacion] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    try {
      setDetalle(await window.api.obtenerDetalleOferta(ofertaId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [ofertaId])

  useEffect(() => {
    setError('')
    setAviso('')
    setReasignando(null)
    void cargar()
  }, [cargar])

  async function abrirReasignacion(t: DetalleTramo): Promise<void> {
    setAviso('')
    setError('')
    setMotivoReasignacion('')
    setNuevoResponsable(0)
    try {
      const usuarios = await window.api.listarUsuarios()
      setCandidatos(
        usuarios.filter((u) => u.rol === t.responsableRol && u.activo && u.id !== t.responsableId)
      )
      setReasignando(t.tramoId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onDeshacerTarea(tareaId: number): Promise<void> {
    setOcupado(true)
    setError('')
    setAviso('')
    try {
      await window.api.deshacerCompletarTarea(tareaId)
      setAviso('Acción deshecha: la tarea vuelve a estar en curso.')
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function onDeshacerAprobacion(): Promise<void> {
    setOcupado(true)
    setError('')
    setAviso('')
    try {
      await window.api.deshacerAprobacion(ofertaId)
      setAviso('Aprobación deshecha: la oferta vuelve a la bandeja de aprobación.')
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarReasignacion(tramoId: number): Promise<void> {
    setOcupado(true)
    setError('')
    try {
      await window.api.reasignarTramo(tramoId, nuevoResponsable, motivoReasignacion)
      setAviso('Tramo reasignado. El nuevo responsable fue notificado.')
      setReasignando(null)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  if (error) {
    return (
      <div className="space-y-3">
        <Button variant="outline" size="sm" onClick={onVolver}>
          ← Volver
        </Button>
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      </div>
    )
  }
  if (!detalle) return <p className="text-sm text-muted-foreground">Cargando detalle…</p>

  return (
    <div className="space-y-5">
      {aviso && (
        <div className="rounded-md border border-estado-atiempo/40 bg-estado-atiempo/10 px-3 py-2 text-sm text-estado-atiempo">
          {aviso}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button variant="outline" size="sm" onClick={onVolver} className="mb-2">
            ← Volver
          </Button>
          <h2 className="text-xl font-semibold">{detalle.cliente}</h2>
          <p className="text-sm text-muted-foreground">
            Oferta {detalle.tamano === 'grande' ? 'grande (9 días)' : 'pequeña (6 días)'} ·{' '}
            <span className="capitalize">{detalle.estado.replace(/_/g, ' ')}</span>
          </p>
        </div>
        {detalle.indicadorCumplimiento !== null && (
          <div className="text-right">
            <div
              className={cn(
                'text-3xl font-bold',
                detalle.indicadorCumplimiento >= 90
                  ? 'text-estado-atiempo'
                  : detalle.indicadorCumplimiento >= 70
                    ? 'text-estado-proximo'
                    : 'text-estado-vencido'
              )}
            >
              {detalle.indicadorCumplimiento}%
            </div>
            <div className="text-xs text-muted-foreground">indicador de la oferta</div>
          </div>
        )}
      </div>

      {/* Datos generales (RF-13) */}
      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Dato etiqueta="Inicio">{detalle.fechaInicio}</Dato>
        <Dato etiqueta="Entrega comprometida">{detalle.fechaEntregaComprometida ?? '—'}</Dato>
        <Dato etiqueta="Finalización real">{detalle.fechaFinalizacionReal ?? 'en proceso'}</Dato>
        <Dato etiqueta="Desviación">
          {detalle.desviacionDias === null ? (
            '—'
          ) : detalle.desviacionDias <= 0 ? (
            <span className="text-estado-atiempo">
              {detalle.desviacionDias === 0 ? 'A tiempo' : `Adelanto ${-detalle.desviacionDias}d`}
            </span>
          ) : (
            <span className="text-estado-vencido">Retraso {detalle.desviacionDias}d</span>
          )}
        </Dato>
        <Dato etiqueta="Días de corrección">
          {detalle.diasCorreccion > 0 ? `${detalle.diasCorreccion}d` : '—'}
        </Dato>
        <Dato etiqueta="Aprobación de la unidad">{detalle.fechaAprobUnidad ?? 'pendiente'}</Dato>
      </Card>

      {detalle.estado === 'rechazada' && (
        <div className="rounded-lg border border-estado-vencido/40 bg-estado-vencido/5 px-4 py-3 text-sm">
          <strong className="text-estado-vencido">En corrección:</strong> “{detalle.motivoRechazo}”
        </div>
      )}

      {/* Deshacer aprobación: solo líder, y solo si el envío aún no se realizó */}
      {detalle.estado === 'aprobada' &&
        sesion &&
        puedeAprobar(sesion.rol) &&
        !detalle.tramos
          .find((t) => t.numero === TOTAL_TRAMOS)
          ?.tareas.some((x) => x.estado === 'completada') && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              ¿Aprobada por error u olvidaste algo? Puedes revertirla mientras no se haya enviado al cliente.
            </span>
            <Button variant="outline" size="sm" disabled={ocupado} onClick={onDeshacerAprobacion}>
              ⟲ Deshacer aprobación
            </Button>
          </div>
        )}
      {detalle.estado !== 'rechazada' && detalle.motivoRechazo && (
        <p className="text-xs text-muted-foreground">
          Tuvo un rechazo previo: “{detalle.motivoRechazo}”
        </p>
      )}

      {/* Flujo de tramos (RF-09 / RF-19) */}
      <section className="space-y-3">
        <h3 className="text-lg font-medium">Proceso por tramos</h3>
        {detalle.tramos.map((t) => (
          <Card key={t.tramoId} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold">
                  Tramo {t.numero} · {NOMBRE_TRAMO[t.numero] ?? ''}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t.responsableNombre} — {ETIQUETA_ROL[t.responsableRol]} · {t.duracionDias} día(s)
                  hábil(es)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MedicionTramo t={t} />
                {t.estado === 'en_curso' && <CriticidadBadge nivel={t.criticidad} />}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs capitalize',
                    t.estado === 'completado'
                      ? 'bg-estado-atiempo/15 text-estado-atiempo'
                      : t.estado === 'en_curso'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-secondary text-secondary-foreground'
                  )}
                >
                  {t.estado.replace(/_/g, ' ')}
                </span>
                {permitirReasignar && t.estado !== 'completado' && t.numero !== NUMERO_APROBACION && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado}
                    onClick={() => (reasignando === t.tramoId ? setReasignando(null) : abrirReasignacion(t))}
                  >
                    Reasignar
                  </Button>
                )}
              </div>
            </div>

            {reasignando === t.tramoId && (
              <div className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-4">
                {candidatos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay otro profesional activo con el rol {ETIQUETA_ROL[t.responsableRol]}. Crea
                    uno en la pestaña Usuarios.
                  </p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor={`re-quien-${t.tramoId}`}>
                        Nuevo responsable (mismo rol: {ETIQUETA_ROL[t.responsableRol]})
                      </Label>
                      <select
                        id={`re-quien-${t.tramoId}`}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={nuevoResponsable}
                        onChange={(e) => setNuevoResponsable(Number(e.target.value))}
                      >
                        <option value={0}>— Selecciona —</option>
                        {candidatos.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} ({c.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`re-motivo-${t.tramoId}`}>Motivo de la reasignación</Label>
                      <Input
                        id={`re-motivo-${t.tramoId}`}
                        value={motivoReasignacion}
                        onChange={(e) => setMotivoReasignacion(e.target.value)}
                        placeholder="p. ej. incapacidad médica, vacaciones"
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={ocupado || !nuevoResponsable || !motivoReasignacion.trim()}
                      onClick={() => confirmarReasignacion(t.tramoId)}
                    >
                      Confirmar reasignación
                    </Button>
                  </>
                )}
              </div>
            )}

            <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Dato etiqueta="Activación">{t.fechaActivacion ?? '—'}</Dato>
              <Dato etiqueta="Fecha límite">{t.fechaLimite ?? '—'}</Dato>
              <Dato etiqueta="Entrega real">{t.fechaEntregaReal ?? '—'}</Dato>
            </div>

            <ul className="mt-3 space-y-1">
              {t.tareas.map((ta) => (
                <li key={ta.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-block h-2 w-2 rounded-full',
                        ta.estado === 'completada'
                          ? 'bg-estado-atiempo'
                          : ta.estado === 'en_curso'
                            ? 'bg-estado-proximo'
                            : 'bg-muted-foreground/40'
                      )}
                    />
                    <span className={cn(ta.estado === 'completada' && 'text-muted-foreground')}>
                      {ta.descripcion}
                    </span>
                    {ta.completadaEn && (
                      <span className="text-xs text-muted-foreground">— completada el {ta.completadaEn}</span>
                    )}
                    {ta.estado === 'completada' &&
                      ta.tipo !== 'aprobacion_unidad' &&
                      sesion &&
                      t.responsableId === sesion.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                          disabled={ocupado}
                          title="Deshacer: la tarea vuelve a estar en curso"
                          onClick={() => onDeshacerTarea(ta.id)}
                        >
                          ⟲ Deshacer
                        </Button>
                      )}
                    {ta.subtareas.length > 0 && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                        {ta.subtareas.filter((s) => s.completada).length}/{ta.subtareas.length} subtareas
                      </span>
                    )}
                  </div>
                  {ta.subtareas.length > 0 && (
                    <ul className="ml-5 mt-1 space-y-0.5 border-l pl-3 text-xs text-muted-foreground">
                      {ta.subtareas.map((s) => (
                        <li key={s.id} className={cn(s.completada && 'line-through')}>
                          {s.completada ? '✓ ' : '○ '}
                          {s.descripcion}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      {/* Adjuntos (RF-10) */}
      <section>
        <h3 className="mb-2 text-lg font-medium">Información compartida</h3>
        {detalle.adjuntos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay adjuntos en esta oferta.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {detalle.adjuntos.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <span aria-hidden>📎</span>
                <span className="font-medium">{a.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {a.tipo ?? 'documento'} · tramo {a.numeroTramo} · {a.subidoPorNombre ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
