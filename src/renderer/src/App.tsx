import { useEffect, useRef, useState } from 'react'
import type { SesionUsuario } from '@shared/ipc'
import { Login } from './components/Login'
import { Dashboard } from './components/Dashboard'

function App(): JSX.Element {
  const [sesion, setSesion] = useState<SesionUsuario | null>(null)
  const [verificando, setVerificando] = useState(true)
  const [avisoSesion, setAvisoSesion] = useState('')

  // Al arrancar, comprueba si ya hay una sesión activa en el proceso principal.
  useEffect(() => {
    let activo = true
    ;(async () => {
      try {
        const actual = await window.api.obtenerSesion()
        if (activo) setSesion(actual)
      } finally {
        if (activo) setVerificando(false)
      }
    })()
    return () => {
      activo = false
    }
  }, [])

  // Cierre de sesión por inactividad (push desde el proceso principal).
  useEffect(() => {
    return window.api.onSesionExpirada(() => {
      setSesion(null)
      setAvisoSesion('Tu sesión se cerró por inactividad. Vuelve a iniciar sesión.')
    })
  }, [])

  // Reporta actividad del usuario (ratón/teclado) al proceso principal,
  // limitado a un aviso cada 30 segundos.
  const ultimoReporte = useRef(0)
  useEffect(() => {
    if (!sesion) return
    const reportar = (): void => {
      const ahora = Date.now()
      if (ahora - ultimoReporte.current > 30_000) {
        ultimoReporte.current = ahora
        window.api.reportarActividad()
      }
    }
    window.addEventListener('mousemove', reportar)
    window.addEventListener('keydown', reportar)
    window.addEventListener('click', reportar)
    return () => {
      window.removeEventListener('mousemove', reportar)
      window.removeEventListener('keydown', reportar)
      window.removeEventListener('click', reportar)
    }
  }, [sesion])

  if (verificando) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Cargando…</div>
  }

  if (!sesion) {
    return (
      <Login
        mensajeInicial={avisoSesion}
        onAutenticado={(s) => {
          setAvisoSesion('')
          setSesion(s)
        }}
      />
    )
  }

  return <Dashboard sesion={sesion} onCerrarSesion={() => setSesion(null)} />
}

export default App
