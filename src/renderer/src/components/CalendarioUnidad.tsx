import { useCallback, useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import type { DiaCalendarioUnidad, ItemCalendarioUnidad } from '@shared/ipc'
import { ETIQUETA_ROL } from '@shared/dominio'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

function formatearDia(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`)
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })
}

function claseCriticidad(c: ItemCalendarioUnidad['criticidad']): string {
  if (c === 'rojo') return 'border-estado-vencido/40 bg-estado-vencido/10 text-estado-vencido'
  if (c === 'amarillo') return 'border-estado-proximo/40 bg-estado-proximo/10 text-estado-proximo'
  return 'border-estado-atiempo/40 bg-estado-atiempo/10 text-estado-atiempo'
}

interface CalendarioUnidadProps {
  /** Abre el detalle de la oferta al hacer clic en una actividad. */
  onAbrirOferta?: (ofertaId: number) => void
}

export function CalendarioUnidad({ onAbrirOferta }: CalendarioUnidadProps): JSX.Element {
  const [dias, setDias] = useState(14)
  const [datos, setDatos] = useState<DiaCalendarioUnidad[] | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async (n: number) => {
    setError('')
    try {
      setDatos(await window.api.obtenerCalendarioUnidad(n))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void cargar(dias)
  }, [cargar, dias])

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </div>
    )
  }
  if (!datos) return <p className="text-sm text-muted-foreground">Cargando calendario…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Actividades de todos los profesionales, día a día.{' '}
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            <Send className="h-3 w-3" /> Envío
          </span>{' '}
          marca el cierre de cada proceso (entrega al cliente).
        </p>
        <div className="flex items-center gap-2">
          {[14, 30].map((n) => (
            <Button key={n} size="sm" variant={dias === n ? 'default' : 'outline'} onClick={() => setDias(n)}>
              {n} días
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {datos.map((dia) => (
          <div
            key={dia.fecha}
            className={cn(
              'flex items-start gap-4 rounded-lg border px-4 py-2.5',
              !dia.esHabil && 'bg-muted/40 opacity-70',
              dia.esHoy && 'border-primary/50 bg-primary/5',
              dia.items.length === 0 && 'border-dashed'
            )}
          >
            <div className="w-36 shrink-0 text-sm">
              <div className={cn('font-medium capitalize', dia.esHoy && 'text-primary')}>
                {dia.esHoy ? 'HOY · ' : ''}
                {formatearDia(dia.fecha)}
              </div>
              <div className="text-xs text-muted-foreground">
                {dia.fecha}
                {!dia.esHabil && ' · no hábil'}
              </div>
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              {dia.items.length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                dia.items.map((it) => {
                  const titulo = `${it.cliente} · Tramo ${it.numero} · ${it.responsableNombre} (${ETIQUETA_ROL[it.responsableRol]})${it.esLimite ? ' · fecha límite' : ''}${it.esActivacion ? ' · inicia' : ''}`
                  if (it.esEnvio) {
                    // Hito de cierre: ENVÍO de la oferta al cliente, resaltado.
                    return (
                      <button
                        key={`${it.tramoId}-${dia.fecha}`}
                        title={titulo}
                        onClick={onAbrirOferta ? () => onAbrirOferta(it.ofertaId) : undefined}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-sm',
                          it.criticidad === 'rojo'
                            ? 'bg-estado-vencido'
                            : it.criticidad === 'amarillo'
                              ? 'bg-estado-proximo'
                              : 'bg-primary',
                          onAbrirOferta && 'cursor-pointer hover:opacity-90'
                        )}
                      >
                        <Send className="h-3 w-3" />
                        ENVÍO · {it.cliente} · {it.responsableNombre}
                        {it.esLimite && ' ⏰'}
                      </button>
                    )
                  }
                  return (
                    <button
                      key={`${it.tramoId}-${dia.fecha}`}
                      title={titulo}
                      onClick={onAbrirOferta ? () => onAbrirOferta(it.ofertaId) : undefined}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                        claseCriticidad(it.criticidad),
                        onAbrirOferta && 'cursor-pointer hover:opacity-80'
                      )}
                    >
                      {it.cliente} · T{it.numero} · {it.responsableNombre.split(' ')[0]}
                      {it.esActivacion && ' · inicia'}
                      {it.esLimite && ' · ⏰'}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
