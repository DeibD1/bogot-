import type { Criticidad } from '@shared/ipc'
import { cn } from '../lib/utils'

const ETIQUETA: Record<Criticidad, string> = {
  verde: 'A tiempo',
  amarillo: 'Próximo a vencer',
  rojo: 'Vencido'
}

const CLASES: Record<Criticidad, string> = {
  verde: 'bg-estado-atiempo/15 text-estado-atiempo',
  amarillo: 'bg-estado-proximo/15 text-estado-proximo',
  rojo: 'bg-estado-vencido/15 text-estado-vencido'
}

export function CriticidadBadge({ nivel }: { nivel: Criticidad }): JSX.Element {
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', CLASES[nivel])}>
      {ETIQUETA[nivel]}
    </span>
  )
}
