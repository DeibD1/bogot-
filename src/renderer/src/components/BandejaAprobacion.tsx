import { useCallback, useEffect, useState } from 'react'
import type { CorreccionPendiente, MotivoRechazoInput, PendienteAprobacion } from '@shared/ipc'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { CriticidadBadge } from './CriticidadBadge'
import { cn } from '../lib/utils'

const NOMBRE_TRAMO: Record<number, string> = {
  1: 'Tramo 1 — Socialización de la oportunidad (líder comercial)',
  2: 'Tramo 2 — Visita y especificaciones (líder de proyectos)',
  3: 'Tramo 3 — Cotización (compras y contratación)',
  4: 'Tramo 4 — APUs y precio (presupuestos y control)'
}

export function BandejaAprobacion(): JSX.Element {
  const [pendientes, setPendientes] = useState<PendienteAprobacion[]>([])
  const [correcciones, setCorrecciones] = useState<CorreccionPendiente[]>([])
  const [rechazando, setRechazando] = useState<number | null>(null) // ofertaId en formulario de rechazo
  const [motivosRechazo, setMotivosRechazo] = useState<MotivoRechazoInput[]>([
    { numeroTramo: 4, motivo: '' }
  ])
  const [nuevaSubtarea, setNuevaSubtarea] = useState<Record<number, string>>({}) // por tareaId
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [p, c] = await Promise.all([
        window.api.obtenerPendientesAprobacion(),
        window.api.obtenerCorrecciones()
      ])
      setPendientes(p)
      setCorrecciones(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function onAprobar(ofertaId: number): Promise<void> {
    setOcupado(true)
    setError('')
    setAviso('')
    try {
      await window.api.aprobarOferta(ofertaId)
      setAviso('Oferta aprobada y finalizada.')
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

  async function onConfirmarRechazo(ofertaId: number): Promise<void> {
    setOcupado(true)
    setError('')
    setAviso('')
    try {
      await window.api.rechazarOferta(ofertaId, motivosRechazo)
      const tramos = [...new Set(motivosRechazo.map((m) => m.numeroTramo))].sort().join(', ')
      setAviso(`Oferta devuelta para corrección (tramos ${tramos}). Todos los profesionales fueron informados.`)
      setRechazando(null)
      setMotivosRechazo([{ numeroTramo: 4, motivo: '' }])
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {aviso && (
        <div className="rounded-md border border-estado-atiempo/40 bg-estado-atiempo/10 px-3 py-2 text-sm text-estado-atiempo">
          {aviso}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Pendientes de aprobación final ({pendientes.length})</h2>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay ofertas esperando aprobación.</p>
        ) : (
          <div className="space-y-4">
            {pendientes.map((p) => (
              <Card key={p.ofertaId} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {p.cliente}{' '}
                      <span className="font-normal text-muted-foreground">
                        · oferta {p.tamano === 'grande' ? 'grande' : 'pequeña'}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Revisión activada: {p.fechaActivacionRevision ?? '—'} · Plazo (1 día hábil):{' '}
                      <strong className="text-foreground">{p.fechaLimiteRevision ?? '—'}</strong> ·
                      Entrega comprometida: {p.fechaEntregaComprometida ?? '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CriticidadBadge nivel={p.criticidad} />
                    <Button size="sm" disabled={ocupado} onClick={() => onAprobar(p.ofertaId)}>
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={ocupado}
                      onClick={() => {
                        setRechazando(rechazando === p.ofertaId ? null : p.ofertaId)
                        setMotivosRechazo([{ numeroTramo: 4, motivo: '' }])
                      }}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>

                {/* Checklist del líder para su revisión (subtareas de la aprobación) */}
                {p.tareaId !== null && (
                  <div className="ml-1 mt-3 space-y-1 border-l pl-3">
                    {p.subtareas.map((s) => (
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
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                        placeholder="Añadir subtarea de revisión (p. ej. verificar precios unitarios)…"
                        value={nuevaSubtarea[p.tareaId] ?? ''}
                        onChange={(e) =>
                          setNuevaSubtarea((prev) => ({ ...prev, [p.tareaId!]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void onCrearSubtarea(p.tareaId!)
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={!(nuevaSubtarea[p.tareaId] ?? '').trim()}
                        onClick={() => onCrearSubtarea(p.tareaId!)}
                      >
                        + Añadir
                      </Button>
                    </div>
                  </div>
                )}

                {rechazando === p.ofertaId && (
                  <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-4">
                    <Label>Motivos del rechazo (cada uno dirigido a un tramo)</Label>
                    {motivosRechazo.map((m, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <select
                          className="h-9 w-72 rounded-md border border-input bg-background px-2 text-sm"
                          value={m.numeroTramo}
                          onChange={(e) =>
                            setMotivosRechazo((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, numeroTramo: Number(e.target.value) } : x))
                            )
                          }
                        >
                          {[1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>
                              {NOMBRE_TRAMO[n]}
                            </option>
                          ))}
                        </select>
                        <Input
                          className="h-9 flex-1"
                          value={m.motivo}
                          onChange={(e) =>
                            setMotivosRechazo((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, motivo: e.target.value } : x))
                            )
                          }
                          placeholder="Describe qué debe corregirse"
                        />
                        {motivosRechazo.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setMotivosRechazo((prev) => prev.filter((_, j) => j !== i))}
                          >
                            ✕
                          </Button>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setMotivosRechazo((prev) => [...prev, { numeroTramo: 4, motivo: '' }])
                        }
                      >
                        + Añadir otro motivo
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={ocupado || motivosRechazo.some((m) => !m.motivo.trim())}
                        onClick={() => onConfirmarRechazo(p.ofertaId)}
                      >
                        Confirmar rechazo
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">En corrección ({correcciones.length})</h2>
        {correcciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay ofertas en corrección.</p>
        ) : (
          <div className="space-y-2">
            {correcciones.map((c) => (
              <Card key={c.ofertaId} className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.cliente}</span>
                  <span className="text-xs text-muted-foreground">rechazada el {c.fechaRechazo}</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {c.motivos.map((m, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5',
                          m.entregada
                            ? 'bg-estado-atiempo/15 text-estado-atiempo'
                            : 'bg-estado-proximo/15 text-estado-proximo'
                        )}
                      >
                        {m.entregada ? '✓ entregada' : 'pendiente'}
                      </span>
                      <span className="text-muted-foreground">
                        T{m.numeroTramo} · {m.responsableNombre}:
                      </span>
                      <span className="truncate">“{m.motivo}”</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
