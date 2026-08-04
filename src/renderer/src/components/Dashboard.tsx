import { useEffect, useState } from 'react'
import type { Estadisticas, OfertaResumen, SesionUsuario } from '@shared/ipc'
import { ETIQUETA_ROL } from '@shared/dominio'
import { tieneAccesoGlobal } from '@shared/permisos'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { BandejaAprobacion } from './BandejaAprobacion'
import { CalendarioUnidad } from './CalendarioUnidad'
import { CampanaNotificaciones } from './CampanaNotificaciones'
import { DetalleOferta } from './DetalleOferta'
import { LineaTiempo } from './LineaTiempo'
import { PanelIndicadores } from './PanelIndicadores'
import { PanelSoporte } from './PanelSoporte'
import { PanelUsuarios } from './PanelUsuarios'
import { SoporteDialog } from './SoporteDialog'
import { TablaOfertas } from './TablaOfertas'
import { VistaProfesional } from './VistaProfesional'

interface DashboardProps {
  sesion: SesionUsuario
  onCerrarSesion: () => void
}

const TARJETAS: { clave: keyof Omit<Estadisticas, 'rutaDb'>; etiqueta: string }[] = [
  { clave: 'ofertas', etiqueta: 'Ofertas' },
  { clave: 'tramos', etiqueta: 'Tramos' },
  { clave: 'tareas', etiqueta: 'Tareas' },
  { clave: 'usuarios', etiqueta: 'Usuarios' },
  { clave: 'festivos', etiqueta: 'Festivos 2026' }
]

export interface NavegacionOferta {
  /** Oferta a abrir en detalle (p. ej. desde una notificación). */
  ofertaSolicitada: number | null
  onAtendida: () => void
  sesion: SesionUsuario
}

/** Vista del líder de la unidad: bandeja de aprobación + panorama global. */
function VistaLiderUnidad({ ofertaSolicitada, onAtendida, sesion }: NavegacionOferta): JSX.Element {
  const [pestana, setPestana] = useState<'bandeja' | 'indicadores' | 'calendario' | 'linea' | 'ofertas' | 'usuarios' | 'soporte'>('bandeja')
  const [stats, setStats] = useState<Estadisticas | null>(null)
  const [ofertas, setOfertas] = useState<OfertaResumen[]>([])
  const [ofertaAbierta, setOfertaAbierta] = useState<number | null>(null)
  const [error, setError] = useState('')

  // Navegación desde una notificación: abre el detalle de la oferta.
  useEffect(() => {
    if (ofertaSolicitada !== null) {
      setPestana('ofertas')
      setOfertaAbierta(ofertaSolicitada)
      onAtendida()
    }
  }, [ofertaSolicitada, onAtendida])

  useEffect(() => {
    let activo = true
    ;(async () => {
      try {
        const [s, o] = await Promise.all([
          window.api.obtenerEstadisticas(),
          window.api.obtenerResumenOfertas()
        ])
        if (!activo) return
        setStats(s)
        setOfertas(o)
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      activo = false
    }
  }, [])

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        <strong>Error al consultar la base de datos:</strong> {error}
      </div>
    )
  }
  if (!stats) return <p className="text-sm text-muted-foreground">Cargando datos…</p>

  return (
    <div className="space-y-6">
      <nav className="flex gap-2">
        <Button
          variant={pestana === 'bandeja' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPestana('bandeja')}
        >
          Bandeja de aprobación
        </Button>
        <Button
          variant={pestana === 'indicadores' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPestana('indicadores')}
        >
          Indicadores
        </Button>
        <Button
          variant={pestana === 'calendario' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPestana('calendario')}
        >
          Calendario
        </Button>
        <Button
          variant={pestana === 'linea' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPestana('linea')}
        >
          Línea de tiempo
        </Button>
        <Button
          variant={pestana === 'ofertas' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPestana('ofertas')}
        >
          Panorama general
        </Button>
        <Button
          variant={pestana === 'usuarios' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPestana('usuarios')}
        >
          Usuarios
        </Button>
        <Button
          variant={pestana === 'soporte' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPestana('soporte')}
        >
          Soporte
        </Button>
      </nav>

      {pestana === 'bandeja' && <BandejaAprobacion />}

      {pestana === 'indicadores' && <PanelIndicadores sesion={sesion} />}

      {pestana === 'calendario' && (
        <CalendarioUnidad
          onAbrirOferta={(id) => {
            setPestana('ofertas')
            setOfertaAbierta(id)
          }}
        />
      )}

      {pestana === 'linea' && <LineaTiempo />}

      {pestana === 'usuarios' && <PanelUsuarios sesion={sesion} />}

      {pestana === 'soporte' && <PanelSoporte />}

      {pestana === 'ofertas' &&
        (ofertaAbierta !== null ? (
          <DetalleOferta
            ofertaId={ofertaAbierta}
            onVolver={() => setOfertaAbierta(null)}
            permitirReasignar
            sesion={sesion}
          />
        ) : (
          <div className="space-y-8">
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {TARJETAS.map(({ clave, etiqueta }) => (
                <Card key={clave} className="p-4">
                  <div className="font-display text-3xl font-bold text-primary">{stats[clave]}</div>
                  <div className="text-sm text-muted-foreground">{etiqueta}</div>
                </Card>
              ))}
            </section>
            <section>
              <h2 className="mb-3 font-display text-lg font-medium">Todas las ofertas</h2>
              <TablaOfertas ofertas={ofertas} onSeleccionar={setOfertaAbierta} />
              <p className="mt-2 text-xs text-muted-foreground">
                Haz clic en una oferta para ver el detalle de su proceso. · Base de datos:{' '}
                <code className="font-mono text-accent/80">{stats.rutaDb}</code>
              </p>
            </section>
          </div>
        ))}
    </div>
  )
}

export function Dashboard({ sesion, onCerrarSesion }: DashboardProps): JSX.Element {
  const accesoGlobal = tieneAccesoGlobal(sesion.rol)
  const [ofertaSolicitada, setOfertaSolicitada] = useState<number | null>(null)

  async function cerrar(): Promise<void> {
    await window.api.cerrarSesion()
    onCerrarSesion()
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-t-2 border-t-primary bg-card px-8 py-4">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Gestor de Ofertas</h1>
          <p className="text-sm text-muted-foreground">
            {sesion.nombre} · <span className="text-accent">{ETIQUETA_ROL[sesion.rol]}</span>
            {accesoGlobal && ' · solo lectura global'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SoporteDialog />
          <CampanaNotificaciones onIrAOferta={setOfertaSolicitada} />
          <Button variant="outline" size="sm" onClick={cerrar}>
            Cerrar sesión
          </Button>
        </div>
      </header>

      <main className="p-8">
        {accesoGlobal ? (
          <VistaLiderUnidad
            ofertaSolicitada={ofertaSolicitada}
            onAtendida={() => setOfertaSolicitada(null)}
            sesion={sesion}
          />
        ) : (
          <VistaProfesional
            ofertaSolicitada={ofertaSolicitada}
            onAtendida={() => setOfertaSolicitada(null)}
            sesion={sesion}
          />
        )}
      </main>
    </div>
  )
}
