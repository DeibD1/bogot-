import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LineaTiempo as DatosLinea, TramoLinea } from '@shared/ipc'
import { ETIQUETA_ROL } from '@shared/dominio'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

const ANCHO_DIA = 36 // px por columna de día
const ANCHO_NOMBRES = 176 // px de la columna de profesionales

const INICIAL_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

function partesFecha(iso: string): { dia: number; mes: number; diaSemana: number } {
  const d = new Date(`${iso}T00:00:00`)
  return { dia: d.getDate(), mes: d.getMonth(), diaSemana: d.getDay() }
}

function claseBarra(t: TramoLinea): string {
  if (t.estado === 'completado') {
    return t.criticidad === 'rojo'
      ? 'bg-estado-vencido/50 text-white'
      : 'bg-estado-atiempo/50 text-white'
  }
  if (t.estado === 'en_curso') {
    return t.criticidad === 'rojo'
      ? 'bg-estado-vencido text-white'
      : t.criticidad === 'amarillo'
        ? 'bg-estado-proximo text-white'
        : 'bg-estado-atiempo text-white'
  }
  return 'border border-dashed border-muted-foreground/50 bg-muted/60 text-muted-foreground'
}

function tooltipBarra(t: TramoLinea): string {
  const partes = [
    `${t.cliente} · Tramo ${t.numero} (oferta ${t.tamano === 'grande' ? 'grande' : 'pequeña'})`,
    `Activación: ${t.fechaActivacion}`,
    `Límite: ${t.fechaLimite}`
  ]
  if (t.fechaEntregaReal) partes.push(`Entrega real: ${t.fechaEntregaReal}`)
  partes.push(`Estado: ${t.estado.replace(/_/g, ' ')}`)
  return partes.join('\n')
}

export function LineaTiempo(): JSX.Element {
  const [datos, setDatos] = useState<DatosLinea | null>(null)
  const [filtro, setFiltro] = useState<number | 'todos'>('todos')
  const [adelante, setAdelante] = useState(14)
  const [error, setError] = useState('')

  const cargar = useCallback(async (diasAdelante: number) => {
    setError('')
    try {
      setDatos(await window.api.obtenerLineaTiempo(7, diasAdelante))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void cargar(adelante)
  }, [cargar, adelante])

  const indicePorFecha = useMemo(() => {
    const m = new Map<string, number>()
    datos?.dias.forEach((d, i) => m.set(d.fecha, i))
    return m
  }, [datos])

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </div>
    )
  }
  if (!datos) return <p className="text-sm text-muted-foreground">Cargando línea de tiempo…</p>

  const { dias } = datos
  const filas = filtro === 'todos' ? datos.filas : datos.filas.filter((f) => f.usuarioId === filtro)
  const anchoGrilla = dias.length * ANCHO_DIA

  /** Posición y ancho (px) de la barra de un tramo, recortada a la ventana. */
  const posicion = (t: TramoLinea): { left: number; width: number } | null => {
    const primera = dias[0]!.fecha
    const ultima = dias[dias.length - 1]!.fecha
    const ini = t.fechaActivacion < primera ? primera : t.fechaActivacion
    const fin = t.fechaFin > ultima ? ultima : t.fechaFin
    const i0 = indicePorFecha.get(ini)
    const i1 = indicePorFecha.get(fin)
    if (i0 === undefined || i1 === undefined || i1 < i0) return null
    return { left: i0 * ANCHO_DIA, width: (i1 - i0 + 1) * ANCHO_DIA }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {datos.filas.length > 1 ? (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="filtro-prof" className="text-muted-foreground">
              Profesional:
            </label>
            <select
              id="filtro-prof"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={filtro === 'todos' ? 'todos' : String(filtro)}
              onChange={(e) => setFiltro(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
            >
              <option value="todos">Todos</option>
              {datos.filas.map((f) => (
                <option key={f.usuarioId} value={f.usuarioId}>
                  {f.nombre} — {ETIQUETA_ROL[f.rol]}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {[14, 30, 60].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={adelante === n ? 'default' : 'outline'}
              onClick={() => setAdelante(n)}
            >
              {n} días
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <div style={{ minWidth: ANCHO_NOMBRES + anchoGrilla }}>
          {/* Cabecera de días */}
          <div className="flex border-b bg-muted/40">
            <div
              className="shrink-0 border-r px-3 py-2 text-xs font-medium text-muted-foreground"
              style={{ width: ANCHO_NOMBRES }}
            >
              Profesional
            </div>
            <div className="relative flex">
              {dias.map((d, i) => {
                const p = partesFecha(d.fecha)
                return (
                  <div
                    key={d.fecha}
                    className={cn(
                      'flex flex-col items-center justify-end border-r py-1 text-[10px] leading-tight',
                      !d.esHabil && 'bg-muted/70 text-muted-foreground',
                      d.esHoy && 'bg-primary/10 font-bold text-primary'
                    )}
                    style={{ width: ANCHO_DIA }}
                    title={d.fecha + (d.esHabil ? '' : ' (no hábil)')}
                  >
                    {(p.dia === 1 || i === 0) && (
                      <span className="uppercase text-muted-foreground">{MES_CORTO[p.mes]}</span>
                    )}
                    <span>{INICIAL_DIA[p.diaSemana]}</span>
                    <span className="font-medium">{p.dia}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Filas por profesional */}
          {filas.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              No hay actividades en esta ventana de tiempo.
            </p>
          )}
          {filas.map((fila) => (
            <div key={fila.usuarioId} className="flex border-b last:border-b-0">
              <div
                className="flex shrink-0 flex-col justify-center border-r px-3 py-2"
                style={{ width: ANCHO_NOMBRES }}
              >
                <span className="text-sm font-medium">{fila.nombre}</span>
                <span className="text-xs text-muted-foreground">{ETIQUETA_ROL[fila.rol]}</span>
              </div>

              <div className="relative" style={{ width: anchoGrilla }}>
                {/* Fondo: franjas de días (no hábiles sombreados, hoy resaltado) */}
                <div className="absolute inset-0 flex">
                  {dias.map((d) => (
                    <div
                      key={d.fecha}
                      className={cn(
                        'h-full border-r',
                        !d.esHabil && 'bg-muted/50',
                        d.esHoy && 'bg-primary/10'
                      )}
                      style={{ width: ANCHO_DIA }}
                    />
                  ))}
                </div>

                {/* Barras: una línea por tramo */}
                <div className="relative space-y-1 py-2">
                  {fila.tramos.map((t) => {
                    const pos = posicion(t)
                    if (!pos) return null
                    return (
                      <div key={t.tramoId} className="relative h-6">
                        <div
                          className={cn(
                            'absolute top-0 flex h-6 items-center overflow-hidden rounded-md px-1.5 text-[11px] font-medium',
                            claseBarra(t)
                          )}
                          style={{ left: pos.left + 2, width: pos.width - 4 }}
                          title={tooltipBarra(t)}
                        >
                          <span className="truncate">
                            {t.cliente} · T{t.numero}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-estado-atiempo" /> en curso, a tiempo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-estado-proximo" /> próximo a vencer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-estado-vencido" /> vencido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-estado-atiempo/50" /> completado a tiempo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-estado-vencido/50" /> completado con retraso
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-dashed border-muted-foreground/50 bg-muted/60" />{' '}
          planificado (pendiente)
        </span>
      </div>
    </div>
  )
}
