import { useCallback, useEffect, useState } from 'react'
import type { DatosDashboard, FiltroIndicadores, SesionUsuario } from '@shared/ipc'
import { ETIQUETA_ROL, type Tamano } from '@shared/dominio'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { cn } from '../lib/utils'

/** Color por nivel de cumplimiento (código de colores, RF-28). */
function clasePorcentaje(valor: number | null): string {
  if (valor === null) return 'text-muted-foreground'
  if (valor >= 90) return 'text-estado-atiempo'
  if (valor >= 70) return 'text-estado-proximo'
  return 'text-estado-vencido'
}

function Porcentaje({ valor }: { valor: number | null }): JSX.Element {
  return (
    <span className={cn('font-semibold', clasePorcentaje(valor))}>
      {valor === null ? '—' : `${valor}%`}
    </span>
  )
}

/** Cumplió / adelanto / retraso de una oferta, en días hábiles (RF-13). */
function EtiquetaDesviacion({ dias }: { dias: number | null }): JSX.Element {
  if (dias === null) return <span className="text-muted-foreground">—</span>
  if (dias === 0)
    return <span className="rounded-full bg-estado-atiempo/15 px-2 py-0.5 text-xs text-estado-atiempo">A tiempo</span>
  if (dias < 0)
    return (
      <span className="rounded-full bg-estado-atiempo/15 px-2 py-0.5 text-xs text-estado-atiempo">
        Adelanto {-dias}d
      </span>
    )
  return (
    <span className="rounded-full bg-estado-vencido/15 px-2 py-0.5 text-xs text-estado-vencido">
      Retraso {dias}d
    </span>
  )
}

interface PanelIndicadoresProps {
  /** Si se indica, resalta la fila del usuario actual ("tú"). */
  sesion?: SesionUsuario
}

export function PanelIndicadores({ sesion }: PanelIndicadoresProps): JSX.Element {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [tamano, setTamano] = useState<Tamano | 'todos'>('todos')
  const [datos, setDatos] = useState<DatosDashboard | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const filtro: FiltroIndicadores = {
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
        tamano
      }
      setDatos(await window.api.obtenerIndicadores(filtro))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [desde, hasta, tamano])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </div>
    )
  }
  if (!datos) return <p className="text-sm text-muted-foreground">Calculando indicadores…</p>

  const conActividad = datos.profesionales.filter((p) => p.totalTramos > 0)
  const sinActividad = datos.profesionales.filter((p) => p.totalTramos === 0)

  return (
    <div className="space-y-6">
      {/* Filtros (RF-20 / RF-26) */}
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="space-y-1">
          <Label htmlFor="f-desde">Desde</Label>
          <Input id="f-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-hasta">Hasta</Label>
          <Input id="f-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-tamano">Tamaño</Label>
          <select
            id="f-tamano"
            className="flex h-10 w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={tamano}
            onChange={(e) => setTamano(e.target.value as Tamano | 'todos')}
          >
            <option value="todos">Todas</option>
            <option value="grande">Grandes (9 días)</option>
            <option value="pequena">Pequeñas (6 días)</option>
          </select>
        </div>
        {(desde || hasta || tamano !== 'todos') && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDesde('')
              setHasta('')
              setTamano('todos')
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </Card>

      {/* Tarjetas agregadas (RF-24 / RF-16) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className={cn('text-4xl font-bold', clasePorcentaje(datos.indicadorUnidad))}>
            {datos.indicadorUnidad === null ? '—' : `${datos.indicadorUnidad}%`}
          </div>
          <div className="mt-1 text-sm font-medium">Cumplimiento de la unidad</div>
          <div className="text-xs text-muted-foreground">
            promedio de los indicadores de las ofertas aprobadas
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-4xl font-bold text-primary">{datos.ofertasConsideradas}</div>
          <div className="mt-1 text-sm font-medium">Ofertas consideradas</div>
          <div className="text-xs text-muted-foreground">aprobadas dentro del filtro</div>
        </Card>
        <Card className="p-5">
          <div className="truncate text-xl font-bold text-estado-atiempo">
            {datos.masCumplido?.nombre ?? '—'}
          </div>
          <div className="mt-1 text-sm font-medium">Profesional más cumplido</div>
          <div className="text-xs text-muted-foreground">
            {datos.masCumplido ? `puntualidad ${datos.masCumplido.tasaPuntualidad}%` : 'sin datos en el filtro'}
          </div>
        </Card>
        <Card className="p-5">
          <div className="truncate text-xl font-bold text-estado-vencido">
            {datos.masAtrasado && datos.masAtrasado.tramosRetrasados > 0 ? datos.masAtrasado.nombre : '—'}
          </div>
          <div className="mt-1 text-sm font-medium">Con más atrasos</div>
          <div className="text-xs text-muted-foreground">
            {datos.masAtrasado && datos.masAtrasado.tramosRetrasados > 0
              ? `${datos.masAtrasado.tramosRetrasados} tramo(s) retrasado(s)`
              : 'sin retrasos en el filtro'}
          </div>
        </Card>
      </section>

      {/* Indicadores por profesional (V1 / RF-15, RF-25) */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Desempeño por profesional</h2>
        {conActividad.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay tramos completados dentro del filtro.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Profesional</th>
                  <th className="px-4 py-2 font-medium">Rol</th>
                  <th className="px-4 py-2 text-center font-medium">Tramos</th>
                  <th className="px-4 py-2 text-center font-medium">A tiempo</th>
                  <th className="px-4 py-2 text-center font-medium">Retrasados</th>
                  <th className="px-4 py-2 text-center font-medium">Desv. promedio</th>
                  <th className="px-4 py-2 text-center font-medium">Puntualidad</th>
                  <th className="px-4 py-2 text-center font-medium">Rendimiento promedio</th>
                </tr>
              </thead>
              <tbody>
                {conActividad.map((p) => (
                  <tr
                    key={p.usuarioId}
                    className={cn('border-t', p.usuarioId === sesion?.id && 'bg-primary/5')}
                  >
                    <td className="px-4 py-2 font-medium">
                      {p.nombre}
                      {p.usuarioId === sesion?.id && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          tú
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{ETIQUETA_ROL[p.rol]}</td>
                    <td className="px-4 py-2 text-center">{p.totalTramos}</td>
                    <td className="px-4 py-2 text-center text-estado-atiempo">{p.tramosATiempo}</td>
                    <td
                      className={cn(
                        'px-4 py-2 text-center',
                        p.tramosRetrasados > 0 ? 'font-semibold text-estado-vencido' : 'text-muted-foreground'
                      )}
                    >
                      {p.tramosRetrasados}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {p.desviacionPromedio === null
                        ? '—'
                        : `${p.desviacionPromedio > 0 ? '+' : ''}${p.desviacionPromedio}d`}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Porcentaje valor={p.tasaPuntualidad} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              (p.rendimientoPromedio ?? 0) >= 90
                                ? 'bg-estado-atiempo'
                                : (p.rendimientoPromedio ?? 0) >= 70
                                  ? 'bg-estado-proximo'
                                  : 'bg-estado-vencido'
                            )}
                            style={{ width: `${p.rendimientoPromedio ?? 0}%` }}
                          />
                        </div>
                        <Porcentaje valor={p.rendimientoPromedio} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sinActividad.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Sin actividad en el filtro: {sinActividad.map((p) => p.nombre).join(', ')}
          </p>
        )}
      </section>

      {/* Indicadores por oferta (RF-13 / RF-14) */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Cumplimiento por oferta (aprobadas)</h2>
        {datos.ofertas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay ofertas aprobadas dentro del filtro.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Tamaño</th>
                  <th className="px-4 py-2 font-medium">Comprometida</th>
                  <th className="px-4 py-2 font-medium">Finalización real</th>
                  <th className="px-4 py-2 text-center font-medium">Resultado</th>
                  <th className="px-4 py-2 text-center font-medium">Corrección</th>
                  <th className="px-4 py-2 text-center font-medium">Indicador</th>
                </tr>
              </thead>
              <tbody>
                {datos.ofertas.map((o) => (
                  <tr key={o.ofertaId} className="border-t">
                    <td className="px-4 py-2 font-medium">{o.cliente}</td>
                    <td className="px-4 py-2 capitalize">{o.tamano}</td>
                    <td className="px-4 py-2">{o.fechaEntregaComprometida ?? '—'}</td>
                    <td className="px-4 py-2">{o.fechaFinalizacionReal ?? '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <EtiquetaDesviacion dias={o.desviacionDias} />
                    </td>
                    <td className="px-4 py-2 text-center text-muted-foreground">
                      {o.diasCorreccion > 0 ? `${o.diasCorreccion}d` : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Porcentaje valor={o.indicadorCumplimiento} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
