import { describe, expect, it } from 'vitest'
import { ROLES } from './dominio'
import { esLiderUnidad, esProfesional, puedeAprobar, tieneAccesoGlobal } from './permisos'

describe('permisos por rol', () => {
  it('solo el líder de la unidad aprueba y tiene acceso global (RF-18, RF-22)', () => {
    expect(puedeAprobar('lider_unidad')).toBe(true)
    expect(tieneAccesoGlobal('lider_unidad')).toBe(true)
    expect(esLiderUnidad('lider_unidad')).toBe(true)

    for (const rol of ROLES.filter((r) => r !== 'lider_unidad')) {
      expect(puedeAprobar(rol)).toBe(false)
      expect(tieneAccesoGlobal(rol)).toBe(false)
      expect(esProfesional(rol)).toBe(true)
    }
  })
})
