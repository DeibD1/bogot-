import { useCallback, useEffect, useState } from 'react'
import type {
  AdjuntoInfo,
  AgendaDia,
  CorreccionPendiente,
  OfertaResumen,
  SesionUsuario,
  TareaItem,
  TramoAsignado
} from '@shared/ipc'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { CalendarioUnidad } from './CalendarioUnidad'
import { CriticidadBadge } from './CriticidadBadge'
import { DetalleOferta } from './DetalleOferta'
import { LineaTiempo } from './LineaTiempo'
import { NuevaOferta } from './NuevaOferta'
import { PanelIndicadores } from './PanelIndicadores'
import { TablaOfertas } from './TablaOfertas'
import { cn } from '../lib/utils'

type Pestana = 'pendientes' | 'agenda' | 'calendario' | 'linea' | 'ofertas' | 'indicadores' | 'nueva'

const TIPO_ADJUNTO_POR_TRAMO: Record<number, string> = {
  1: 'oportunidad',
  2: 'especificaciones',
  3: 'cotizacion',
  4: 'apu',
  6: 'oferta_enviada'
}

function formatearDia(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`)
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })
}

interface VistaProfesionalProps {
  /** Oferta a abrir en detalle (p. ej. desde una notificación). */
  ofertaSolicitada?: number | null
  onAtendida?: () => void
  sesion?: SesionUsuario
}

export function VistaProfesional({
  ofertaSolicitada = null,
  onAtendida,
  sesion
}: VistaProfesionalProps): JSX.Element {
  const [pestana, setPestana] = useState<Pestana>('pendientes')
  const [tramos, setTramos] = useState<TramoAsignado[]>([])
  const [agenda, setAgenda] = useState<AgendaDia[]>([])
  const [ofertas, setOfertas] = useState<OfertaResumen[]>([])
  const [correcciones, setCorrecciones] = useState<CorreccionPendiente[]>([])
  const [ofertaAbierta, setOfertaAbierta] = useState<number | null>(null)
  const [adjuntos, setAdjuntos] = useState<Record<number, AdjuntoInfo[]>>({}) // por ofertaId
  const [nuevaSubtarea, setNuevaSubtarea] = useState<Record<number, string>>({}) // por tareaId
  // Confirmación previa al completar (evita clics por error).
  const [confirmacion, setConfirmacion] = useState<{ tarea: TareaItem; tramo: TramoAsignado } | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [t, a, o, c] = await Promise.all([
        window.api.obtenerMisTramos(),
        window.api.obtenerAgenda(14),
        window.api.obtenerResumenOfertas(),
        window.api.obtenerCorrecciones()
      ])
      setTramos(t)
      setAgenda(a)
      setOfertas(o)
      setCorrecciones(c)
      const porOferta: Record<number, AdjuntoInfo[]> = {}
      for (const ofertaId of [...new Set(t.map((x) => x.ofertaId))]) {
        porOferta[ofertaId] = await window.api.obtenerAdjuntosOferta(ofertaId)
      }
      setAdjuntos(porOferta)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Navegación desde una notificación: abre el detalle de la oferta.
  useEffect(() => {
    if (ofertaSolicitada !== null) {
      setPestana('ofertas')
      setOfertaAbierta(ofertaSolicitada)
      onAtendida?.()
    }
  }, [ofertaSolicitada, onAtendida])

  async function onCompletar(tareaId: number): Promise<void> {
    setOcupado(true)
    setError('')
    try {
      const r = await window.api.completarTarea(tareaId)
      if (r.tramoCerrado) {
        const signo = (r.desviacionDias ?? 0) > 0 ? 'retraso' : 'a tiempo/adelanto'
        // feedback simple; el detalle queda en la tarjeta recargada
        console.info(`Tramo cerrado (${signo}), indicador ${r.indicadorCumplimiento}%`)
      }
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function onAdjuntar(tramo: TramoAsignado): Promise<void> {
    setOcupado(true)
    setError('')
    try {
      const tipo = TIPO_ADJUNTO_POR_TRAMO[tramo.numero] ?? 'documento'
      const lista = await window.api.agregarAdjunto(tramo.tramoId, tipo)
      if (lista) setAdjuntos((prev) => ({ ...prev, [tramo.ofertaId]: lista }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function onDeshacerTarea(tareaId: number): Promise<void> {
    setOcupado(true)
    setError('')
    try {
      await window.api.deshacerCompletarTarea(tareaId)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function onCrearSubtarea(tareaId: number): Promise<void> {
    const texto = (nuevaSubtarea[tareaId] ?? '').trim()
    if (!texto) return
    setError('')
    try {
      await window.api.crearSubtarea(tareaId, texto)
      setNuevaSubtarea((prev) => ({ ...prev, [tareaId]: '' }))
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onToggleSubtarea(subtareaId: number, completada: boolean): Promise<void> {
    setError('')
    try {
      await window.api.marcarSubtarea(subtareaId, completada)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onEliminarSubtarea(subtareaId: number): Promise<void> {
    setError('')
    try {
      await window.api.eliminarSubtarea(subtareaId)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onEntregarCorreccion(ofertaId: number): Promise<void> {
    setOcupado(true)
    setError('')
    try {
      await window.api.entregarCorreccion(ofertaId)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const enCurso = tramos.filter((t) => t.estado === 'en_curso')
  const proximos = tramos.filter((t) => t.estado === 'pendiente')
  // El líder comercial tiene vista global: calendario de toda la unidad.
  const esComercial = sesion?.rol === 'lider_comercial'

  const pestanas: [Pestana, string][] = [
    ...(esComercial ? ([['nueva', '+ Nueva oferta']] as [Pestana, string][]) : []),
    ['pendientes', `Tareas pendientes (${enCurso.length + correcciones.length})`],
    ['agenda', 'Agenda'],
    ...(esComercial ? ([['calendario', 'Calendario unidad']] as [Pestana, string][]) : []),
    ['linea', 'Línea de tiempo'],
    ['indicadores', 'Indicadores'],
    ['ofertas', esComercial ? 'Ofertas' : 'Mis ofertas']
  ]

  return (
    <div className="space-y-6">
      <nav className="flex gap-2">
        {pestanas.map(([clave, etiqueta]) => (
          <Button
            key={clave}
            variant={pestana === clave ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPestana(clave)}
          >
            {etiqueta}
          </Button>
        ))}
      </nav>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {pestana === 'pendientes' && (
        <div className="space-y-4">
          {correcciones.map((c) => (
            <Card key={`corr-${c.ofertaId}`} className="border-estado-vencido/40 bg-estado-vencido/5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-estado-vencido">
                    Corrección solicitada · {c.cliente}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Rechazada el {c.fechaRechazo ?? '—'}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {c.motivos.map((m, i) => (
                      <li key={i}>
                        <span className="text-muted-foreground">Tramo {m.numeroTramo}:</span>{' '}
                        <em>“{m.motivo}”</em>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button size="sm" disabled={ocupado} onClick={() => onEntregarCorreccion(c.ofertaId)}>
                  Entregar corrección
                </Button>
              </div>
            </Card>
          ))}

          {enCurso.length === 0 && correcciones.length === 0 && (
            <p className="text-sm text-muted-foreground">No tienes tareas activas. 🎉</p>
          )}
          {enCurso.map((t) => (
            <Card key={t.tramoId} className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {t.cliente}{' '}
                    <span className="font-normal text-muted-foreground">
                      · Tramo {t.numero} · oferta {t.tamano === 'grande' ? 'grande' : 'pequeña'}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Activado: {t.fechaActivacion ?? '—'} · Límite:{' '}
                    <strong className="text-foreground">{t.fechaLimite ?? '—'}</strong> ·{' '}
                    {t.duracionDias} día(s) hábil(es)
                  </div>
                </div>
                <CriticidadBadge nivel={t.criticidad} />
              </div>

              <ul className="space-y-2">
                {t.tareas.map((ta) => (
                  <li
                    key={ta.id}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm',
                      ta.estado === 'completada' && 'opacity-60'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>
                        <span
                          className={cn(
                            'mr-2 inline-block h-2 w-2 rounded-full align-middle',
                            ta.estado === 'completada'
                              ? 'bg-estado-atiempo'
                              : ta.estado === 'en_curso'
                                ? 'bg-estado-proximo'
                                : 'bg-muted-foreground/40'
                          )}
                        />
                        {ta.descripcion}
                        {ta.completadaEn && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (completada el {ta.completadaEn})
                          </span>
                        )}
                      </span>
                      {ta.estado === 'en_curso' && (
                        <Button
                          size="sm"
                          disabled={ocupado}
                          onClick={() => setConfirmacion({ tarea: ta, tramo: t })}
                        >
                          Marcar completada
                        </Button>
                      )}
                      {ta.estado === 'completada' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          disabled={ocupado}
                          title="Deshacer: la tarea vuelve a estar en curso"
                          onClick={() => onDeshacerTarea(ta.id)}
                        >
                          ⟲ Deshacer
                        </Button>
                      )}
                    </div>

                    {/* Subtareas: checklist personal dentro de la tarea */}
                    {(ta.subtareas.length > 0 || ta.estado !== 'completada') && (
                      <div className="ml-4 mt-2 space-y-1 border-l pl-3">
                        {ta.subtareas.map((s) => (
                          <div key={s.id} className="group flex items-center gap-2 text-xs">
                            <button
                              title={s.completada ? 'Marcar como pendiente' : 'Marcar como cumplida'}
                              onClick={() => onToggleSubtarea(s.id, !s.completada)}
                              className={cn(
                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none',
                                s.completada
                                  ? 'border-estado-atiempo bg-estado-atiempo text-white'
                                  : 'border-muted-foreground/40 hover:border-estado-atiempo'
                              )}
                            >
                              {s.completada ? '✓' : ''}
                            </button>
                            <span className={cn(s.completada && 'text-muted-foreground line-through')}>
                              {s.descripcion}
                            </span>
                            <button
                              title="Eliminar subtarea"
                              onClick={() => onEliminarSubtarea(s.id)}
                              className="ml-auto hidden text-muted-foreground hover:text-estado-vencido group-hover:inline"
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        {ta.estado !== 'completada' && (
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                              placeholder="Añadir subtarea (p. ej. calcular cantidades)…"
                              value={nuevaSubtarea[ta.id] ?? ''}
                              onChange={(e) =>
                                setNuevaSubtarea((prev) => ({ ...prev, [ta.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void onCrearSubtarea(ta.id)
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={!(nuevaSubtarea[ta.id] ?? '').trim()}
                              onClick={() => onCrearSubtarea(ta.id)}
                            >
                              + Añadir
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Información compartida</span>
                  <Button variant="outline" size="sm" disabled={ocupado} onClick={() => onAdjuntar(t)}>
                    Adjuntar archivo
                  </Button>
                </div>
                {(adjuntos[t.ofertaId] ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin adjuntos en esta oferta.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {(adjuntos[t.ofertaId] ?? []).map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-muted-foreground">
                        <span aria-hidden>📎</span>
                        <span className="font-medium text-foreground">{a.nombre}</span>
                        <span className="text-xs">
                          {a.tipo ?? 'documento'} · tramo {a.numeroTramo} · {a.subidoPorNombre ?? '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          ))}

          {proximos.length > 0 && (
            <section>
              <h3 className="mb-2 mt-6 text-sm font-medium text-muted-foreground">
                Próximos tramos (aún no activados)
              </h3>
              <div className="space-y-2">
                {proximos.map((t) => (
                  <Card key={t.tramoId} className="flex items-center justify-between p-3 text-sm">
                    <span>
                      {t.cliente} · Tramo {t.numero}
                    </span>
                    <span className="text-muted-foreground">
                      previsto: {t.fechaActivacion ?? '—'} → {t.fechaLimite ?? '—'}
                    </span>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {pestana === 'agenda' && (
        <div className="space-y-2">
          {agenda.every((d) => d.items.length === 0) && (
            <p className="text-sm text-muted-foreground">
              Sin compromisos en los próximos {agenda.length} días.
            </p>
          )}
          {agenda.map((dia) => (
            <div
              key={dia.fecha}
              className={cn(
                'flex items-start gap-4 rounded-lg border px-4 py-2',
                !dia.esHabil && 'bg-muted/40 opacity-70',
                dia.items.length === 0 && 'border-dashed'
              )}
            >
              <div className="w-36 shrink-0 text-sm">
                <div className="font-medium capitalize">{formatearDia(dia.fecha)}</div>
                <div className="text-xs text-muted-foreground">
                  {dia.fecha}
                  {!dia.esHabil && ' · no hábil'}
                </div>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {dia.items.length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  dia.items.map((it) => (
                    <span
                      key={`${it.tramoId}-${dia.fecha}`}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                        it.criticidad === 'rojo'
                          ? 'border-estado-vencido/40 bg-estado-vencido/10 text-estado-vencido'
                          : it.criticidad === 'amarillo'
                            ? 'border-estado-proximo/40 bg-estado-proximo/10 text-estado-proximo'
                            : 'border-estado-atiempo/40 bg-estado-atiempo/10 text-estado-atiempo'
                      )}
                    >
                      {it.cliente} · T{it.numero}
                      {it.esActivacion && ' · inicia'}
                      {it.esLimite && ' · ⏰ límite'}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pestana === 'nueva' && esComercial && (
        <NuevaOferta
          onCreada={(id) => {
            void cargar()
            setPestana('ofertas')
            setOfertaAbierta(id)
          }}
        />
      )}

      {pestana === 'calendario' && (
        <CalendarioUnidad
          onAbrirOferta={(id) => {
            setPestana('ofertas')
            setOfertaAbierta(id)
          }}
        />
      )}

      {pestana === 'linea' && <LineaTiempo />}

      {pestana === 'indicadores' && <PanelIndicadores sesion={sesion} />}

      {pestana === 'ofertas' &&
        (ofertaAbierta !== null ? (
          <DetalleOferta ofertaId={ofertaAbierta} onVolver={() => setOfertaAbierta(null)} sesion={sesion} />
        ) : (
          <TablaOfertas ofertas={ofertas} onSeleccionar={setOfertaAbierta} />
        ))}

      {/* Confirmación previa al completar una tarea (evita errores de clic) */}
      {confirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-5">
            <h2 className="mb-2 text-lg font-medium">¿Confirmas completar esta tarea?</h2>
            <p className="text-sm">
              <span className="font-medium">{confirmacion.tarea.descripcion}</span>
              <span className="text-muted-foreground"> · {confirmacion.tramo.cliente}</span>
            </p>

            {confirmacion.tramo.tareas.filter((x) => x.estado !== 'completada').length === 1 ? (
              <div className="mt-3 rounded-md border border-estado-proximo/40 bg-estado-proximo/10 px-3 py-2 text-sm">
                Es la <strong>última tarea de tu tramo</strong>: al confirmar se registrará tu fecha
                de entrega con su medición y el trabajo pasará al siguiente profesional.
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Se activará la siguiente tarea de tu tramo.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Si te equivocas, podrás revertirlo con «⟲ Deshacer» mientras el siguiente no haya
              avanzado.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmacion(null)}>
                Cancelar
              </Button>
              <Button
                disabled={ocupado}
                onClick={async () => {
                  const id = confirmacion.tarea.id
                  setConfirmacion(null)
                  await onCompletar(id)
                }}
              >
                Sí, completar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
