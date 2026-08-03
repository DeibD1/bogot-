import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import type { NotificacionInfo } from '@shared/ipc'
import type { TipoNotificacion } from '@shared/dominio'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

const ESTILO_TIPO: Record<TipoNotificacion, { etiqueta: string; clase: string }> = {
  compromiso: { etiqueta: 'Compromiso', clase: 'bg-primary/10 text-primary' },
  vencimiento_proximo: { etiqueta: 'Próximo a vencer', clase: 'bg-estado-proximo/15 text-estado-proximo' },
  retraso: { etiqueta: 'Retraso', clase: 'bg-estado-vencido/15 text-estado-vencido' }
}

function formatearFecha(creadaEn: string): string {
  // SQLite guarda CURRENT_TIMESTAMP en UTC ('YYYY-MM-DD HH:MM:SS').
  const d = new Date(`${creadaEn.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime())
    ? creadaEn
    : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

interface CampanaProps {
  /** Navega al detalle de la oferta asociada a la notificación. */
  onIrAOferta?: (ofertaId: number) => void
}

export function CampanaNotificaciones({ onIrAOferta }: CampanaProps): JSX.Element {
  const [abierto, setAbierto] = useState(false)
  const [noLeidas, setNoLeidas] = useState(0)
  const [items, setItems] = useState<NotificacionInfo[]>([])
  const contenedor = useRef<HTMLDivElement>(null)

  const refrescarContador = useCallback(async () => {
    try {
      setNoLeidas(await window.api.contarNotificacionesNoLeidas())
    } catch {
      /* sin sesión todavía */
    }
  }, [])

  useEffect(() => {
    void refrescarContador()
    const intervalo = setInterval(refrescarContador, 60_000)
    return () => clearInterval(intervalo)
  }, [refrescarContador])

  // Cerrar el panel al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return
    const onClick = (e: MouseEvent): void => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [abierto])

  async function alternar(): Promise<void> {
    const abrir = !abierto
    setAbierto(abrir)
    if (abrir) {
      try {
        setItems(await window.api.obtenerNotificaciones())
        await refrescarContador()
      } catch {
        setItems([])
      }
    }
  }

  async function marcarLeidas(): Promise<void> {
    await window.api.marcarNotificacionesLeidas()
    setItems((prev) => prev.map((n) => ({ ...n, leida: true })))
    setNoLeidas(0)
  }

  return (
    <div className="relative" ref={contenedor}>
      <Button variant="outline" size="icon" onClick={alternar} aria-label="Notificaciones">
        <Bell className="h-4 w-4" />
        {noLeidas > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-estado-vencido px-1 text-[10px] font-bold text-white">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </Button>

      {abierto && (
        <div className="absolute right-0 top-12 z-50 w-96 overflow-hidden rounded-xl border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notificaciones</span>
            {items.some((n) => !n.leida) && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={marcarLeidas}>
                Marcar todas como leídas
              </Button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No tienes notificaciones.</p>
            ) : (
              items.map((n) => {
                const navegable = onIrAOferta && n.ofertaId !== null
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'border-b px-4 py-3 last:border-b-0',
                      !n.leida && 'bg-primary/5',
                      navegable && 'cursor-pointer transition-colors hover:bg-muted/60'
                    )}
                    title={navegable ? 'Ir a la oferta' : undefined}
                    onClick={
                      navegable
                        ? () => {
                            setAbierto(false)
                            onIrAOferta(n.ofertaId!)
                          }
                        : undefined
                    }
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          ESTILO_TIPO[n.tipo].clase
                        )}
                      >
                        {ESTILO_TIPO[n.tipo].etiqueta}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatearFecha(n.creadaEn)}
                      </span>
                    </div>
                    <p className={cn('text-sm leading-snug', !n.leida && 'font-medium')}>{n.mensaje}</p>
                    {navegable && (
                      <span className="mt-1 inline-block text-[11px] text-primary">
                        Ver la oferta →
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
