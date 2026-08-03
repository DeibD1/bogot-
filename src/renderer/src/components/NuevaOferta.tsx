import { useEffect, useState, type FormEvent } from 'react'
import type { CandidatosPorRol } from '@shared/ipc'
import { ETIQUETA_ROL, ROLES, type Rol, type Tamano } from '@shared/dominio'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface NuevaOfertaProps {
  /** Se invoca con el id creado (para navegar al detalle / refrescar vistas). */
  onCreada: (ofertaId: number) => void
}

export function NuevaOferta({ onCreada }: NuevaOfertaProps): JSX.Element {
  const [candidatos, setCandidatos] = useState<CandidatosPorRol | null>(null)
  const [cliente, setCliente] = useState('')
  const [tamano, setTamano] = useState<Tamano>('pequena')
  const [fechaInicio, setFechaInicio] = useState(hoyISO())
  const [duracionSoc, setDuracionSoc] = useState(1)
  const [responsables, setResponsables] = useState<Partial<Record<Rol, number>>>({})
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let activo = true
    ;(async () => {
      try {
        const c = await window.api.obtenerCandidatosPorRol()
        if (!activo) return
        setCandidatos(c)
        // Preselecciona al único candidato (o el primero) de cada rol.
        const pre: Partial<Record<Rol, number>> = {}
        for (const rol of ROLES) {
          if (c[rol].length > 0) pre[rol] = c[rol][0]!.id
        }
        setResponsables(pre)
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      activo = false
    }
  }, [])

  const rolesSinCandidato = candidatos ? ROLES.filter((r) => candidatos[r].length === 0) : []

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setOcupado(true)
    try {
      const id = await window.api.crearOferta({
        cliente,
        tamano,
        fechaInicio,
        duracionSocializacion: duracionSoc,
        responsables: responsables as Record<Rol, number>
      })
      onCreada(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setOcupado(false)
    }
  }

  if (!candidatos) return <p className="text-sm text-muted-foreground">Cargando…</p>

  return (
    <Card className="max-w-3xl p-6">
      <h2 className="mb-1 text-lg font-medium">Nueva oferta</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Al crearla, el sistema genera automáticamente los 6 tramos con sus fechas en días hábiles,
        asigna las tareas a cada profesional y activa tu socialización de la oportunidad.
      </p>

      {rolesSinCandidato.length > 0 && (
        <div className="mb-4 rounded-md border border-estado-vencido/40 bg-estado-vencido/10 px-3 py-2 text-sm text-estado-vencido">
          No hay usuarios activos para: {rolesSinCandidato.map((r) => ETIQUETA_ROL[r]).join(', ')}.
          Pide al líder de la unidad crearlos antes de registrar ofertas.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="no-cliente">Cliente</Label>
            <Input
              id="no-cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nombre del cliente"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="no-tamano">Tamaño de la oferta</Label>
            <select
              id="no-tamano"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={tamano}
              onChange={(e) => setTamano(e.target.value as Tamano)}
            >
              <option value="pequena">Pequeña — 6 días hábiles (2-2-2)</option>
              <option value="grande">Grande — 9 días hábiles (3-3-3)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="no-inicio">Fecha de inicio</Label>
            <Input
              id="no-inicio"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Si cae en fin de semana o festivo, se corre al siguiente día hábil.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="no-soc">Duración de la socialización (días hábiles)</Label>
            <Input
              id="no-soc"
              type="number"
              min={1}
              max={10}
              value={duracionSoc}
              onChange={(e) => setDuracionSoc(Number(e.target.value))}
              required
            />
            <p className="text-xs text-muted-foreground">
              El tiempo que decidas para socializar la oportunidad con el equipo técnico.
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <span className="text-sm font-medium">Responsables</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ROLES.map((rol) => (
              <div key={rol} className="space-y-1">
                <Label htmlFor={`no-resp-${rol}`} className="text-xs text-muted-foreground">
                  {ETIQUETA_ROL[rol]}
                </Label>
                <select
                  id={`no-resp-${rol}`}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={responsables[rol] ?? ''}
                  onChange={(e) =>
                    setResponsables((prev) => ({ ...prev, [rol]: Number(e.target.value) }))
                  }
                  required
                >
                  {candidatos[rol].map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" disabled={ocupado || rolesSinCandidato.length > 0 || !cliente.trim()}>
          {ocupado ? 'Creando…' : 'Crear oferta'}
        </Button>
      </form>
    </Card>
  )
}
