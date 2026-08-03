import { useState, type FormEvent } from 'react'
import type { ResultadoLogin, SesionUsuario } from '@shared/ipc'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface LoginProps {
  onAutenticado: (sesion: SesionUsuario) => void
  /** Mensaje informativo inicial (p. ej. "sesión cerrada por inactividad"). */
  mensajeInicial?: string
}

export function Login({ onAutenticado, mensajeInicial }: LoginProps): JSX.Element {
  const [paso, setPaso] = useState<'credenciales' | 'codigo'>('credenciales')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [codigo, setCodigo] = useState('')
  const [correoOfuscado, setCorreoOfuscado] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(mensajeInicial ?? '')

  function procesar(r: ResultadoLogin): void {
    if (r.estado === 'ok') {
      onAutenticado(r.sesion)
    } else if (r.estado === 'codigo_enviado') {
      setCorreoOfuscado(r.correo)
      setCodigo('')
      setPaso('codigo')
      setInfo(`Enviamos un código de verificación a ${r.correo}. Revisa tu correo.`)
    } else {
      setError(r.mensaje)
    }
  }

  async function onSubmitCredenciales(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setInfo('')
    setCargando(true)
    try {
      procesar(await window.api.iniciarSesion({ email, password }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión.')
    } finally {
      setCargando(false)
    }
  }

  async function onSubmitCodigo(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      procesar(await window.api.verificarCodigo(email, codigo))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al verificar el código.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Gestor de Ofertas</CardTitle>
          <p className="text-sm text-muted-foreground">
            {paso === 'credenciales' ? 'Inicia sesión para continuar' : 'Verificación en dos pasos'}
          </p>
        </CardHeader>
        <CardContent>
          {info && (
            <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
              {info}
            </div>
          )}

          {paso === 'credenciales' ? (
            <form onSubmit={onSubmitCredenciales} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo</Label>
                <Input
                  id="email"
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.co"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={cargando}>
                {cargando ? 'Entrando…' : 'Iniciar sesión'}
              </Button>
            </form>
          ) : (
            <form onSubmit={onSubmitCodigo} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="codigo">Código de verificación</Label>
                <Input
                  id="codigo"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                  placeholder="6 dígitos"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Enviado a {correoOfuscado}. Vence en 5 minutos.
                </p>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={cargando || codigo.length !== 6}>
                {cargando ? 'Verificando…' : 'Verificar código'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setPaso('credenciales')
                  setError('')
                  setInfo('')
                }}
              >
                ← Volver
              </Button>
            </form>
          )}

          {paso === 'credenciales' && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Primer uso (base nueva): <code>admin@local</code> · <code>Admin#2026</code>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
