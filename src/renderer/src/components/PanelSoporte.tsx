import { useCallback, useEffect, useState } from 'react'
import type { ReporteSoporte } from '@shared/ipc'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { cn } from '../lib/utils'

function formatearFecha(creadaEn: string): string {
  const d = new Date(`${creadaEn.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime())
    ? creadaEn
    : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Bandeja de reportes de soporte (administrador). */
export function PanelSoporte(): JSX.Element {
  const [reportes, setReportes] = useState<ReporteSoporte[]>([])
  const [ampliada, setAmpliada] = useState<string | null>(null) // captura en grande
  const [respondiendo, setRespondiendo] = useState<number | null>(null) // reporteId
  const [respuesta, setRespuesta] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      setReportes(await window.api.listarReportesSoporte())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function onResponder(reporteId: number): Promise<void> {
    setOcupado(true)
    setError('')
    try {
      await window.api.responderReporteSoporte(reporteId, respuesta)
      setRespondiendo(null)
      setRespuesta('')
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function onAtender(r: ReporteSoporte): Promise<void> {
    setOcupado(true)
    try {
      await window.api.atenderReporteSoporte(r.id, !r.atendido)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const pendientes = reportes.filter((r) => !r.atendido).length

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <h2 className="text-lg font-medium">
        Reportes de soporte <span className="text-muted-foreground">({pendientes} pendientes)</span>
      </h2>

      {reportes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay reportes de soporte. 🎉</p>
      ) : (
        <div className="space-y-3">
          {reportes.map((r) => (
            <Card key={r.id} className={cn('p-4', r.atendido && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">#{r.id}</span>
                    <span>{r.usuarioNombre}</span>
                    <span className="text-xs text-muted-foreground">{r.usuarioEmail}</span>
                    <span className="text-xs text-muted-foreground">· {formatearFecha(r.creadaEn)}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs',
                        r.atendido
                          ? 'bg-estado-atiempo/15 text-estado-atiempo'
                          : 'bg-estado-proximo/15 text-estado-proximo'
                      )}
                    >
                      {r.atendido ? 'Atendido' : 'Pendiente'}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{r.descripcion}</p>

                  {r.respuesta && (
                    <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                      <span className="font-medium text-primary">Respuesta del administrador:</span>{' '}
                      <span className="whitespace-pre-wrap">{r.respuesta}</span>
                      {r.respondidaEn && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({formatearFecha(r.respondidaEn)})
                        </span>
                      )}
                    </div>
                  )}

                  {respondiendo === r.id && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Escribe la respuesta para el usuario…"
                        maxLength={2000}
                        value={respuesta}
                        onChange={(e) => setRespuesta(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={ocupado || !respuesta.trim()} onClick={() => onResponder(r.id)}>
                          Enviar respuesta
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRespondiendo(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {r.captura && (
                    <img
                      src={r.captura}
                      alt={`Pantallazo del reporte ${r.id}`}
                      title="Clic para ampliar"
                      className="h-20 cursor-pointer rounded border object-contain hover:opacity-80"
                      onClick={() => setAmpliada(r.captura)}
                    />
                  )}
                  {respondiendo !== r.id && (
                    <Button
                      size="sm"
                      disabled={ocupado}
                      onClick={() => {
                        setRespondiendo(r.id)
                        setRespuesta(r.respuesta ?? '')
                      }}
                    >
                      {r.respuesta ? 'Editar respuesta' : 'Responder'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={ocupado} onClick={() => onAtender(r)}>
                    {r.atendido ? 'Reabrir' : 'Marcar atendido'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {ampliada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setAmpliada(null)}
        >
          <img src={ampliada} alt="Pantallazo ampliado" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
