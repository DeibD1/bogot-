import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { SesionUsuario, UsuarioAdmin } from '@shared/ipc'
import { ETIQUETA_ROL, ROLES, type Rol } from '@shared/dominio'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { cn } from '../lib/utils'

function SelectRol({
  id,
  value,
  onChange
}: {
  id: string
  value: Rol
  onChange: (rol: Rol) => void
}): JSX.Element {
  return (
    <select
      id={id}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as Rol)}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ETIQUETA_ROL[r]}
        </option>
      ))}
    </select>
  )
}

export function PanelUsuarios({ sesion }: { sesion: SesionUsuario }): JSX.Element {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  // Formulario de creación
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Rol>('lider_proyectos')
  const [password, setPassword] = useState('')

  // Edición en línea
  const [editando, setEditando] = useState<number | null>(null)
  const [eNombre, setENombre] = useState('')
  const [eRol, setERol] = useState<Rol>('lider_proyectos')
  const [ePassword, setEPassword] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      setUsuarios(await window.api.listarUsuarios())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function ejecutar(accion: () => Promise<void>, mensajeOk: string): Promise<void> {
    setOcupado(true)
    setError('')
    setAviso('')
    try {
      await accion()
      if (mensajeOk) setAviso(mensajeOk)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function onCrear(e: FormEvent): Promise<void> {
    e.preventDefault()
    await ejecutar(async () => {
      await window.api.crearUsuario({ nombre, email, rol, password })
      setNombre('')
      setEmail('')
      setPassword('')
      setRol('lider_proyectos')
    }, 'Usuario creado. Ya puede iniciar sesión.')
  }

  function comenzarEdicion(u: UsuarioAdmin): void {
    setEditando(u.id)
    setENombre(u.nombre)
    setERol(u.rol)
    setEPassword('')
    setAviso('')
    setError('')
  }

  async function onGuardarEdicion(usuarioId: number): Promise<void> {
    await ejecutar(async () => {
      await window.api.actualizarUsuario({
        usuarioId,
        nombre: eNombre,
        rol: eRol,
        ...(ePassword ? { password: ePassword } : {})
      })
      setEditando(null)
    }, 'Usuario actualizado.')
  }

  async function onCambiarActivo(u: UsuarioAdmin): Promise<void> {
    await ejecutar(
      () => window.api.actualizarUsuario({ usuarioId: u.id, activo: !u.activo }),
      u.activo ? 'Usuario desactivado (su histórico se conserva).' : 'Usuario reactivado.'
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {aviso && (
        <div className="rounded-md border border-estado-atiempo/40 bg-estado-atiempo/10 px-3 py-2 text-sm text-estado-atiempo">
          {aviso}
        </div>
      )}

      {/* Datos de demostración (para presentar la app) */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg font-medium">Datos de demostración</h2>
          <p className="text-sm text-muted-foreground">
            Carga usuarios de ejemplo y ofertas en todas las etapas (con distintos profesionales)
            para presentar la aplicación. Solo funciona si la base no tiene ofertas todavía.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={ocupado}
          onClick={() =>
            ejecutar(async () => {
              const r = await window.api.cargarDatosDemostracion()
              setAviso(
                `Demostración cargada: ${r.ofertasCreadas} ofertas y ${r.usuariosCreados} usuarios nuevos. ` +
                  `Contraseña de los usuarios demo: ${r.passwordDemo}`
              )
            }, '')
          }
        >
          Cargar datos de demostración
        </Button>
      </Card>

      {/* Crear usuario */}
      <Card className="p-5">
        <h2 className="mb-4 text-lg font-medium">Nuevo usuario</h2>
        <form onSubmit={onCrear} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="nu-nombre">Nombre completo</Label>
            <Input id="nu-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-email">Correo</Label>
            <Input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-rol">Perfil (rol)</Label>
            <SelectRol id="nu-rol" value={rol} onChange={setRol} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-pass">Contraseña</Label>
            <Input
              id="nu-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={ocupado}>
            Crear usuario
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          La contraseña debe tener mínimo 8 caracteres e incluir letra, número y un carácter
          especial (p. ej. # $ % . _ -).
        </p>
      </Card>

      {/* Lista de usuarios */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Usuarios ({usuarios.length})</h2>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Correo</th>
                <th className="px-4 py-2 font-medium">Perfil</th>
                <th className="px-4 py-2 text-center font-medium">Estado</th>
                <th className="px-4 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={cn('border-t align-top', !u.activo && 'opacity-60')}>
                  {editando === u.id ? (
                    <>
                      <td className="px-4 py-2">
                        <Input value={eNombre} onChange={(e) => setENombre(e.target.value)} />
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-2">
                        {u.id === sesion.id ? (
                          <span className="text-muted-foreground">{ETIQUETA_ROL[u.rol]}</span>
                        ) : (
                          <SelectRol id={`rol-${u.id}`} value={eRol} onChange={setERol} />
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="password"
                          placeholder="Nueva contraseña (opcional)"
                          value={ePassword}
                          onChange={(e) => setEPassword(e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" disabled={ocupado} onClick={() => onGuardarEdicion(u.id)}>
                            Guardar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditando(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-medium">
                        {u.nombre}
                        {u.id === sesion.id && (
                          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">tú</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-2">{ETIQUETA_ROL[u.rol]}</td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs',
                            u.activo
                              ? 'bg-estado-atiempo/15 text-estado-atiempo'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => comenzarEdicion(u)}>
                            Editar
                          </Button>
                          {u.id !== sesion.id && (
                            <Button
                              size="sm"
                              variant={u.activo ? 'destructive' : 'secondary'}
                              disabled={ocupado}
                              onClick={() => onCambiarActivo(u)}
                            >
                              {u.activo ? 'Desactivar' : 'Activar'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Desactivar (en lugar de eliminar) conserva el histórico de tramos e indicadores del
          profesional. Un usuario inactivo no puede iniciar sesión.
        </p>
      </section>
    </div>
  )
}
