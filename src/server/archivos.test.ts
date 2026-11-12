import { describe, expect, it } from 'vitest'
import { construirRuta, nombreSeguro, rutaValidaParaTramo } from './archivos'

describe('nombreSeguro', () => {
  it('quita tildes, espacios y rutas', () => {
    expect(nombreSeguro('Cotización final (v2).pdf')).toBe('Cotizacion_final_v2_.pdf')
    expect(nombreSeguro('C:\\docs\\..\\secreto.xlsx')).toBe('secreto.xlsx')
    expect(nombreSeguro('../../etc/passwd')).toBe('passwd')
  })
  it('nunca devuelve vacío', () => {
    expect(nombreSeguro('...')).toBe('archivo')
    expect(nombreSeguro('')).toBe('archivo')
  })
})

describe('rutas de almacenamiento', () => {
  it('construye rutas válidas para su tramo y oferta', () => {
    const r = construirRuta(7, 21, 'Planos 1.dwg')
    expect(r).toMatch(/^oferta-7\/tramo-21\/[0-9a-f-]{36}-Planos_1\.dwg$/)
    expect(rutaValidaParaTramo(r, 7, 21)).toBe(true)
  })
  it('rechaza rutas de otro tramo, con traversal o mal formadas', () => {
    const r = construirRuta(7, 21, 'a.pdf')
    expect(rutaValidaParaTramo(r, 7, 22)).toBe(false)
    expect(rutaValidaParaTramo(r, 8, 21)).toBe(false)
    expect(rutaValidaParaTramo('oferta-7/tramo-21/../../x', 7, 21)).toBe(false)
    expect(rutaValidaParaTramo('/etc/passwd', 7, 21)).toBe(false)
  })
})
