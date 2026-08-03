import type { OfertaResumen } from '@shared/ipc'
import { cn } from '../lib/utils'

interface TablaOfertasProps {
  ofertas: OfertaResumen[]
  /** Si se provee, las filas son clicables y abren el detalle de la oferta. */
  onSeleccionar?: (ofertaId: number) => void
}

export function TablaOfertas({ ofertas, onSeleccionar }: TablaOfertasProps): JSX.Element {
  if (ofertas.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay ofertas para mostrar.</p>
  }
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Cliente</th>
            <th className="px-4 py-2 font-medium">Tamaño</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium">Inicio</th>
            <th className="px-4 py-2 font-medium">Entrega comprometida</th>
            <th className="px-4 py-2 font-medium">Tramo actual</th>
          </tr>
        </thead>
        <tbody>
          {ofertas.map((o) => (
            <tr
              key={o.id}
              className={cn('border-t', onSeleccionar && 'cursor-pointer hover:bg-muted/40')}
              onClick={onSeleccionar ? () => onSeleccionar(o.id) : undefined}
              title={onSeleccionar ? 'Ver el detalle del proceso' : undefined}
            >
              <td className="px-4 py-2 font-medium">{o.cliente}</td>
              <td className="px-4 py-2 capitalize">{o.tamano}</td>
              <td className="px-4 py-2">
                <span
                  className={cn(
                    'inline-block rounded-full px-2 py-0.5 text-xs',
                    o.estado === 'aprobada'
                      ? 'bg-estado-atiempo/15 text-estado-atiempo'
                      : o.estado === 'rechazada'
                        ? 'bg-estado-vencido/15 text-estado-vencido'
                        : 'bg-secondary text-secondary-foreground'
                  )}
                >
                  {o.estado.replace(/_/g, ' ')}
                </span>
              </td>
              <td className="px-4 py-2">{o.fechaInicio}</td>
              <td className="px-4 py-2">{o.fechaEntregaComprometida ?? '—'}</td>
              <td className="px-4 py-2">{o.tramoActual ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
