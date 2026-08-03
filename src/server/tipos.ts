// Extiende el tipo Request de Express para llevar la sesión autenticada
// (poblada por el middleware de autenticación a partir del JWT).
import type { SesionUsuario } from '../shared/ipc'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sesion?: SesionUsuario
    }
  }
}

export {}
