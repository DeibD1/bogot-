import { useState } from 'react'
import { Camera, LifeBuoy, Paperclip, X } from 'lucide-react'
import type { ReporteSoporte } from '@shared/ipc'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Label } from './ui/label'
import { cn } from '../lib/utils'

/** Botón de soporte técnico (cabecera) + diálogo de reporte con pantallazo. */
export function SoporteDialog(): JSX.Element {
  const [abierto, setAbierto] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [captura, setCaptura] = useState<string | null>(null)
  const [misReportes, setMisReportes] = useState<ReporteSoporte[]>([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function cargarMisReportes(): Promise<void> {
    try {
      setMisReportes(await window.api.listarMisReportesSoporte())
    } catch {
      /* sección opcional */
    }
  }

  function reiniciar(): void {
    setDescripcion('')
    setCaptura(null)
    setError('')
    setAviso('')
    void cargarMisReportes()
  }

  async function onCapturar(): Promise<void> {
    setError('')
    // Cierra visualmente el diálogo para capturar la pantalla "limpia".
    setAbierto(false)
    await new Promise((r) => setTimeout(r, 250))
    try {
      const imagen = await window.api.capturarPantalla()
      setCaptura(imagen)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAbierto(true)
    }
  }

  async function onAdjuntar(): Promise<void> {
    setError('')
    try {
      const imagen = await window.api.adjuntarImagenSoporte()
      if (imagen) setCaptura(imagen)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onEnviar(): Promise<void> {
    setOcupado(true)
    setError('')
    try {
      const id = await window.api.crearReporteSoporte(descripcion, captura)
      setAviso(`Reporte #${id} enviado. El administrador fue notificado. ¡Gracias!`)
      setDescripcion('')
      setCaptura(null)
      void cargarMisReportes()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        title="Soporte técnico: reportar un problema"
        onClick={() => {
          reiniciar()
          setAbierto(true)
        }}
      >
        <LifeBuoy className="h-4 w-4" />
      </Button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-medium">
                <LifeBuoy className="h-5 w-5 text-primary" /> Soporte técnico
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setAbierto(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {aviso ? (
              <div className="space-y-4">
                <div className="rounded-md border border-estado-atiempo/40 bg-estado-atiempo/10 px-3 py-2 text-sm text-estado-atiempo">
                  {aviso}
                </div>
                <Button onClick={() => setAbierto(false)}>Cerrar</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sop-desc">¿Qué problema encontraste?</Label>
                  <textarea
                    id="sop-desc"
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Describe qué intentabas hacer, qué esperabas y qué ocurrió…"
                    maxLength={2000}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={onCapturar}>
                      <Camera className="mr-1 h-4 w-4" /> Capturar pantalla de la app
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={onAdjuntar}>
                      <Paperclip className="mr-1 h-4 w-4" /> Adjuntar imagen
                    </Button>
                    {captura && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setCaptura(null)}>
                        Quitar pantallazo
                      </Button>
                    )}
                  </div>
                  {captura && (
                    <img
                      src={captura}
                      alt="Pantallazo adjunto"
                      className="max-h-48 rounded-md border object-contain"
                    />
                  )}
                </div>

                {error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setAbierto(false)}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={ocupado || !descripcion.trim()}
                    onClick={onEnviar}
                    className={cn(ocupado && 'opacity-70')}
                  >
                    {ocupado ? 'Enviando…' : 'Enviar reporte'}
                  </Button>
                </div>

                {misReportes.length > 0 && (
                  <div className="border-t pt-3">
                    <h3 className="mb-2 text-sm font-medium">Mis reportes</h3>
                    <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                      {misReportes.map((r) => (
                        <div key={r.id} className="rounded-md border px-3 py-2 text-xs">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="font-semibold">#{r.id}</span>
                            <span className="truncate text-muted-foreground">{r.descripcion}</span>
                            <span
                              className={cn(
                                'ml-auto shrink-0 rounded-full px-2 py-0.5',
                                r.atendido
                                  ? 'bg-estado-atiempo/15 text-estado-atiempo'
                                  : 'bg-estado-proximo/15 text-estado-proximo'
                              )}
                            >
                              {r.atendido ? 'Atendido' : 'Pendiente'}
                            </span>
                          </div>
                          {r.respuesta && (
                            <div className="rounded bg-primary/5 px-2 py-1">
                              <span className="font-medium text-primary">Respuesta:</span>{' '}
                              <span className="whitespace-pre-wrap">{r.respuesta}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
