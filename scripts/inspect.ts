// Muestra en consola un resumen legible de los datos (revisión rápida).
// Uso: npm run db:inspect
import { crearConexion } from '../src/main/db/client'
import { ETIQUETA_ROL, type Rol } from '../src/shared/dominio'

async function main(): Promise<void> {
  const conexion = await crearConexion()
  const { consultar } = conexion
  try {
    console.log(`\n📂 Base de datos: ${conexion.destino} (modo ${conexion.modo})\n`)

    console.log('👥 USUARIOS')
    const us = await consultar('SELECT nombre, email, rol FROM usuario ORDER BY rol, id')
    for (const r of us) {
      console.log(
        `   • ${String(r.nombre).padEnd(20)} ${String(r.email).padEnd(22)} ${ETIQUETA_ROL[r.rol as Rol]}`
      )
    }

    const fe = await consultar('SELECT COUNT(*) AS n FROM festivo')
    console.log(`\n🗓️  FESTIVOS: ${fe[0]!.n}`)

    console.log('\n📄 OFERTAS')
    const ofertas = await consultar(
      `SELECT id, cliente, tamano, plazo_total_dias, fecha_inicio::text AS fecha_inicio,
              fecha_entrega_comprometida::text AS fecha_entrega_comprometida,
              fecha_finalizacion_real::text AS fecha_finalizacion_real,
              desviacion_dias, indicador_cumplimiento, dias_correccion,
              motivo_rechazo, tramo_correccion, estado
       FROM oferta ORDER BY id`
    )
    for (const o of ofertas) {
      console.log(`   #${o.id}  ${o.cliente}  [${o.tamano}, plazo ${o.plazo_total_dias}d]  ${o.estado}`)
      console.log(`        inicio=${o.fecha_inicio}  entrega_comprometida=${o.fecha_entrega_comprometida}`)
      if (o.indicador_cumplimiento !== null) {
        console.log(
          `        finalizada=${o.fecha_finalizacion_real}  desviación=${o.desviacion_dias}d  indicador=${o.indicador_cumplimiento}%  corrección=${o.dias_correccion}d`
        )
      }
      if (o.estado === 'rechazada') {
        console.log(`        ⛔ rechazada → tramo ${o.tramo_correccion}: "${o.motivo_rechazo}"`)
      }
      const tramos = await consultar(
        `SELECT t.numero, u.nombre, t.duracion_asignada_dias d, t.fecha_activacion::text a,
                t.fecha_limite::text l, t.fecha_entrega_real::text er,
                t.desviacion_dias dv, t.indicador_cumplimiento ic, t.estado
         FROM tramo t JOIN usuario u ON u.id = t.responsable_id
         WHERE t.oferta_id = $1 ORDER BY t.numero`,
        [o.id]
      )
      for (const t of tramos) {
        const medicion = t.ic !== null ? `  ✦ entregó=${t.er} desv=${t.dv}d ind=${t.ic}%` : ''
        console.log(
          `        Tramo ${t.numero} · ${String(t.nombre).padEnd(15)} ${t.d}d  activa=${t.a} límite=${t.l} [${t.estado}]${medicion}`
        )
      }
    }
    console.log('')
  } finally {
    await conexion.cerrar()
  }
}

main().catch((e) => {
  console.error('✗ Error en inspect:', e)
  process.exit(1)
})
