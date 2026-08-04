import type { Criticidad } from '@shared/ipc'
import { cn } from '../lib/utils'

const ETIQUETA: Record<Criticidad, string> = {
  verde: 'A tiempo',
  amarillo: 'Próximo a vencer',
  rojo: 'Vencido'
}

const CLASES: Record<Criticidad, string> = {
  verde: 'bg-estado-atiempo/10 text-estado-atiempo ring-1 ring-inset ring-estado-atiempo/25',
  amarillo: 'bg-estado-proximo/10 text-estado-proximo ring-1 ring-inset ring-estado-proximo/25',
  rojo: 'bg-estado-vencido/10 text-estado-vencido ring-1 ring-inset ring-estado-vencido/25'
}

export function CriticidadBadge({ nivel }: { nivel: Criticidad }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        CLASES[nivel]
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {ETIQUETA[nivel]}
    </span>
  )
}
