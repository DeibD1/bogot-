# Documento de Requisitos de Software (SRS)
## Aplicación de Gestión de Tiempo y Tareas para la Elaboración de Ofertas Comerciales

**Versión:** 1.2
**Fecha:** Junio de 2026
**Tipo de aplicación:** Aplicativo de escritorio

---

## 1. Objetivo

Desarrollar una aplicación de escritorio especializada en la gestión del tiempo y las tareas asociadas a la elaboración de ofertas comerciales. El objetivo principal es que cada profesional involucrado pueda visualizar sus tareas pendientes y su agenda día a día, permitiendo un seguimiento ordenado del flujo de trabajo y del cumplimiento de los plazos de entrega.

Como segundo objetivo, la aplicación debe medir el cumplimiento de los tiempos: determinar, en cada oferta, si se cumplió el plazo ofertado al cliente o si hubo retraso o adelanto (y cuánto), identificar al profesional más cumplido y al que presenta más atrasos, y calcular indicadores de cumplimiento por profesional y por oferta.

## 2. Alcance

La aplicación gestiona una única actividad principal: **la elaboración de una oferta comercial**. Cada oferta se compone de cuatro tareas secuenciales, ejecutadas por tres profesionales, dentro de plazos definidos en función del tamaño del proyecto.

Quedan **fuera del alcance** de esta versión:
- La elaboración del contenido técnico de los APUs (la aplicación gestiona el tiempo y el estado de la tarea, no calcula los APUs en sí).
- La facturación, la gestión contractual posterior y la relación comercial tras la entrega de la oferta.
- La gestión de actividades distintas a la elaboración de ofertas.

## 3. Definiciones y abreviaturas

| Término | Definición |
|---------|------------|
| **Oferta comercial** | Propuesta económica y técnica entregada a un cliente. Es la actividad principal del sistema. |
| **APU** | Análisis de Precios Unitarios. Desglose del costo de cada unidad de obra (insumos, mano de obra, equipos). |
| **Día hábil** | Día laborable, excluyendo fines de semana y festivos. |
| **Gestión** | Trabajo que realiza un profesional dentro de su tarea asignada. |
| **Entrega (hand-off)** | Momento en que un profesional comparte su resultado con el siguiente para que continúe el flujo. |

## 4. Roles y responsabilidades

| Rol | Responsabilidad principal | Tareas a su cargo |
|-----|---------------------------|-------------------|
| **Líder de proyectos** | Define el tamaño de la oferta al inicio. Realiza la visita técnica con el cliente y recolecta medidas y especificaciones técnicas. | Tareas 1 y 2 |
| **Profesional de compras y contratación** | Cotiza insumos y mano de obra con proveedores y contratistas. | Tarea 3 |
| **Líder de presupuestos y control** | Monta y calcula los APUs y determina el precio final de la oferta. | Tarea 4 |
| **Líder de la unidad** | Supervisa la operación. Tiene acceso a toda la gestión de los profesionales y a sus indicadores, así como a los procesos en curso y a los ya entregados. **Realiza la aprobación final de cada oferta**, con un plazo de **1 día hábil** para revisar y aprobar; su gestión también se mide. | Aprobación final (paso de cierre) |

## 5. Flujo de trabajo

La elaboración de una oferta sigue un flujo **secuencial**, donde cada profesional entrega su resultado al siguiente:

```
[Líder de proyectos]
    Tarea 1: Visita técnica con el cliente (define alcance)
    Tarea 2: Recolección de medidas y especificaciones técnicas
        │  comparte especificaciones
        ▼
[Profesional de compras y contratación]
    Tarea 3: Cotización de insumos y mano de obra con proveedores y contratistas
        │  comparte cotizaciones
        ▼
[Líder de presupuestos y control]
    Tarea 4: Construcción de APUs y cálculo del precio de la oferta
        │  envía la oferta para aprobación final
        ▼
[Líder de la unidad]
    Aprobación final de la oferta — plazo: 1 día hábil (paso medido)
        │  (si la rechaza, regresa al tramo correspondiente para corrección)
        ▼
    OFERTA COMERCIAL APROBADA Y FINALIZADA
```

> **Nota:** Las tareas 1 y 2 las ejecuta el mismo profesional (líder de proyectos), por lo que conforman el primer tramo del plazo. Los tramos de plazo se asignan por profesional, no por tarea individual. El **líder de la unidad** es el único que aprueba la oferta, y cierra el ciclo con la aprobación final, que también se mide en el tiempo (1 día hábil).

## 6. Reglas de negocio

| ID | Regla |
|----|-------|
| **RN-01** | Cada oferta tiene un **tamaño** definido por el líder de proyectos al inicio: *grande* o *pequeña*. |
| **RN-02** | El **plazo total** depende del tamaño: hasta **9 días hábiles** para ofertas grandes y hasta **6 días hábiles** para ofertas pequeñas. |
| **RN-03** | El plazo total se distribuye de forma **equitativa** entre los tres profesionales: **3-3-3** días en ofertas grandes y **2-2-2** días en ofertas pequeñas. |
| **RN-04** | El plazo (tramo) de cada profesional se **activa** en el momento en que recibe las especificaciones o cotizaciones del profesional anterior. |
| **RN-05** | El cálculo de fechas se realiza en **días hábiles**, excluyendo fines de semana y festivos. |
| **RN-06** | Una tarea no puede iniciarse hasta que la tarea anterior haya sido marcada como completada (entrega realizada). |
| **RN-07** | La **desviación de un tramo** se mide contra la **duración asignada a la actividad** (2 días en ofertas pequeñas, 3 en grandes), contada desde la fecha real en que el profesional **recibe** el trabajo (su activación), no contra una fecha fija del calendario. Es decir: `desviación = días_hábiles_usados − duración_asignada`. Valor negativo = adelanto, 0 = a tiempo, positivo = retraso. |
| **RN-08** | La oferta se considera **finalizada** cuando el **líder de la unidad** otorga la aprobación final. El **plazo total ofertado al cliente** es de 6 o 9 días hábiles según el tamaño; el día de aprobación final del líder de la unidad **se suma aparte** (no consume el plazo ofertado). La **desviación de la oferta** es la diferencia entre la fecha de finalización real y la fecha de entrega comprometida (plazo ofertado + día de aprobación), en días hábiles. |
| **RN-09** | El **indicador de cumplimiento de un tramo/oferta** se expresa como porcentaje. Se considera 100% si se entregó a tiempo o antes; por debajo de 100% cuando hay retraso, según la fórmula definida en la sección 11. |
| **RN-10** | El **indicador de cumplimiento de un profesional** se calcula a partir del histórico de sus tramos entregados (porcentaje de entregas a tiempo y/o desviación promedio). |
| **RN-11** | Tras la tarea 4, la oferta pasa a **pendiente de aprobación final** del líder de la unidad, quien dispone de **1 día hábil** para revisar y aprobar. Puede aprobar (la oferta queda finalizada) o rechazar (la devuelve al tramo correspondiente para corrección). |
| **RN-12** | El paso de aprobación final es un **tramo medido**: tiene fecha límite (1 día hábil desde su activación) y fecha de aprobación real, y su desviación se calcula igual que los demás tramos. |
| **RN-13** | El líder de la unidad tiene su propio **indicador de cumplimiento de gestión**, basado en el cumplimiento del plazo de 1 día en sus aprobaciones. Este paso también forma parte del **indicador de cumplimiento general de la oferta**. |
| **RN-14** | El **indicador de cumplimiento de la unidad** es el promedio de los indicadores de cumplimiento de todas las ofertas. El **rendimiento promedio** se calcula **para cada profesional**, como el promedio de sus calificaciones (los indicadores de cumplimiento de los tramos que ha gestionado). |
| **RN-15** | El **retraso de un tramo es responsabilidad exclusiva del profesional que lo gestiona**. Cada profesional se califica solo por cumplir la duración de su propia actividad (2 o 3 días). El retraso desplaza las fechas de las tareas siguientes y la fecha de entrega de la oferta, pero ese desplazamiento **no afecta la calificación** de los profesionales posteriores. |
| **RN-16** | Si un tramo se entrega tarde, el sistema **recalcula automáticamente** las fechas de inicio y límite de los tramos siguientes y la fecha de entrega de la oferta. |
| **RN-17** | Un profesional puede tener **varias ofertas activas en paralelo**; la aplicación las muestra todas en su agenda y tareas pendientes. |
| **RN-18** | Una tarea puede **reasignarse** a otro profesional del mismo rol cuando el titular no está disponible (reasignación forzosa). |
| **RN-19** | Si el líder de la unidad **rechaza** una oferta, esta vuelve al tramo correspondiente para corrección. El **tiempo de corrección se contabiliza aparte**: solo afecta la duración total de la oferta y **no se computa como un nuevo retraso** en la calificación del profesional. |

### Ejemplo de cálculo (oferta grande, inicio lunes)

| Tramo | Profesional | Días | Inicio | Fecha límite |
|-------|-------------|------|--------|--------------|
| 1 | Líder de proyectos | 3 | Lunes | Miércoles |
| 2 | Compras y contratación | 3 | Jueves | Lunes (sig.) |
| 3 | Presupuestos y control | 3 | Martes | Jueves |

## 7. Requisitos funcionales

| ID | Requisito |
|----|-----------|
| **RF-01** | El sistema debe permitir crear una nueva oferta, registrando cliente, tamaño (grande/pequeña) y fecha de inicio. |
| **RF-02** | Al crear la oferta, el sistema debe calcular automáticamente el plazo total y las fechas límite de cada uno de los tres tramos, en días hábiles. |
| **RF-03** | El sistema debe asignar automáticamente cada tarea al profesional correspondiente según su rol. |
| **RF-04** | Cada profesional debe poder visualizar una lista de sus **tareas pendientes**. |
| **RF-05** | Cada profesional debe poder visualizar su **agenda día a día** (vista de calendario o agenda con las tareas y sus fechas límite). |
| **RF-06** | El sistema debe permitir marcar una tarea como completada, lo cual registra la **entrega** y activa el tramo del siguiente profesional. |
| **RF-07** | El sistema debe mostrar el **estado** de cada tarea (pendiente, en curso, completada, vencida). |
| **RF-08** | El sistema debe indicar de forma visible las tareas **vencidas** o próximas a vencer. |
| **RF-09** | El sistema debe permitir consultar el estado general de cada oferta (en qué tramo se encuentra y el avance). |
| **RF-10** | El sistema debe permitir adjuntar o registrar la información que se comparte entre profesionales (especificaciones, cotizaciones). |
| **RF-11** | El sistema debe gestionar usuarios y autenticación, asociando cada usuario a uno de los cuatro roles. |
| **RF-12** | El sistema debe registrar la **fecha de entrega real** de cada tramo al marcarse la tarea como completada y compararla con la fecha límite planificada. |
| **RF-13** | El sistema debe indicar, en cada oferta, si se **cumplió** el tiempo ofertado al cliente o si hubo **retraso** o **adelanto**, mostrando la diferencia en días hábiles. |
| **RF-14** | El sistema debe calcular un **indicador de cumplimiento por oferta** (porcentaje). |
| **RF-15** | El sistema debe calcular un **indicador de cumplimiento por profesional**, acumulando su histórico de entregas. Esto incluye al **líder de la unidad**, cuyo indicador se basa en el cumplimiento del plazo de 1 día en sus aprobaciones. |
| **RF-16** | El sistema debe identificar al **profesional más cumplido** y al que **presenta más atrasos**, en un rango de fechas o sobre el total histórico. |
| **RF-17** | El sistema debe ofrecer un **panel de indicadores (dashboard)** con el desempeño general por oferta y por profesional. |
| **RF-18** | El sistema debe proveer al **líder de la unidad** acceso de solo lectura a la gestión de **todos** los profesionales y a todos sus indicadores. |
| **RF-19** | El líder de la unidad debe poder consultar tanto las ofertas **en curso** (con su tramo y avance actual) como las ofertas **ya entregadas** (con su histórico y cumplimiento). |
| **RF-20** | El sistema debe permitir al líder de la unidad filtrar y comparar el desempeño por profesional, por oferta, por tamaño y por rango de fechas. |
| **RF-21** | Tras completarse la tarea 4, el sistema debe poner la oferta en **pendiente de aprobación final**, notificar al líder de la unidad y activar su plazo de **1 día hábil**. |
| **RF-22** | El líder de la unidad debe poder dar la **aprobación final** o **rechazar** la oferta (indicando el motivo). Al aprobar, la oferta queda finalizada y se registra la fecha de aprobación final; al rechazar, debe devolverla al tramo correspondiente para corrección. |
| **RF-23** | El sistema debe registrar el **tiempo que tarda el líder de la unidad** en revisar y aprobar cada oferta, comparándolo con su plazo de 1 día, y reflejarlo en su indicador de cumplimiento de gestión y en el indicador general de la oferta. |
| **RF-24** | El sistema debe calcular un **indicador de cumplimiento de la unidad**, como promedio de los indicadores de cumplimiento de todas las ofertas. |
| **RF-25** | El sistema debe calcular el **rendimiento promedio de cada profesional**, como promedio de sus calificaciones (los indicadores de cumplimiento de los tramos que ha gestionado). |
| **RF-26** | El sistema debe mostrar ambos indicadores agregados en el **panel del líder de la unidad**, con posibilidad de filtrarlos por rango de fechas. |
| **RF-27** | El sistema debe enviar **notificaciones** (en la app y, opcionalmente, por correo) de **compromisos** (activación de un tramo, vencimiento próximo) y de **retrasos** (tramo vencido). |
| **RF-28** | El dashboard debe usar un **código de colores** para resaltar el nivel de criticidad de cada tarea/oferta (p. ej., verde a tiempo, amarillo próximo a vencer, rojo vencido), de modo que cada profesional identifique de inmediato lo más crítico. |
| **RF-29** | Cuando un tramo se entrega tarde, el sistema debe **recalcular automáticamente** las fechas de los tramos siguientes y la fecha de entrega de la oferta. |
| **RF-30** | El sistema debe permitir **reasignar** una tarea a otro profesional del mismo rol cuando el titular no esté disponible (reasignación forzosa), registrando el cambio. |

## 8. Requisitos no funcionales

| ID | Requisito |
|----|-----------|
| **RNF-01** | **Plataforma:** aplicación de escritorio. |
| **RNF-02** | **Usabilidad:** la vista de tareas pendientes y agenda debe ser clara e intuitiva, accesible en pocos clics. |
| **RNF-03** | **Persistencia:** los datos deben almacenarse de forma local o en base de datos, conservando el historial de ofertas. |
| **RNF-04** | **Confiabilidad:** el cálculo de días hábiles debe ser preciso y usar el **calendario nacional de festivos de Colombia** (incluyendo los festivos trasladables según la Ley Emiliani). El calendario debe poder actualizarse cada año. |
| **RNF-05** | **Rendimiento:** las vistas de agenda y tareas deben cargar sin demoras perceptibles. |
| **RNF-06** | **Seguridad:** el acceso se controla por rol. Cada uno de los tres profesionales accede solo a la información correspondiente a su rol y sus ofertas asignadas; el líder de la unidad tiene acceso de solo lectura a la información de todos los profesionales y todas las ofertas. |

## 9. Modelo de datos (propuesta inicial)

Entidades principales sugeridas para la implementación:

- **Usuario** — `id`, `nombre`, `rol` (líder de proyectos / compras y contratación / presupuestos y control / líder de la unidad), credenciales.
- **Oferta** — `id`, `cliente`, `tamaño` (grande/pequeña), `fecha_inicio`, `plazo_total`, `fecha_entrega_comprometida` (plazo ofertado + 1 día de aprobación), `fecha_finalizacion_real`, `fecha_aprob_unidad`, `aprobado_por`, `dias_correccion` (tiempo acumulado por rechazos, contabilizado aparte), `desviacion_dias`, `indicador_cumplimiento`, `estado` (en curso / pendiente de aprobación final / aprobada / rechazada).
- **Tarea / Tramo** — `id`, `oferta_id`, `tipo` (visita / recolección / cotización / APU / aprobación unidad), `responsable_id`, `tramo`, `duracion_asignada` (2 ó 3 días; 1 para aprobación), `fecha_activacion` (cuando recibe el trabajo), `fecha_limite`, `fecha_entrega_real`, `dias_habiles_usados`, `desviacion_dias`, `indicador_cumplimiento`, `reasignado_de` (id del responsable original, si hubo reasignación), `estado`. *(El paso de aprobación final del líder de la unidad es un tramo de tipo "aprobación unidad" con duración de 1 día hábil.)*
- **Indicador de profesional** — `usuario_id`, `total_tramos`, `tramos_a_tiempo`, `tramos_retrasados`, `desviacion_promedio`, `rendimiento_promedio` (promedio de sus calificaciones de tramo), `indicador_cumplimiento` (calculado, puede ser una vista o tabla agregada). *(Aplica también al líder de la unidad sobre sus tramos de aprobación.)*
- **Indicador de la unidad** — `indicador_cumplimiento_unidad` (promedio de los indicadores de todas las ofertas), `periodo` (rango de fechas del cálculo). *(Valor calculado; puede generarse como vista agregada.)*
- **Calendario de festivos** — `fecha`, `descripción` (festivos nacionales de Colombia, para el cálculo de días hábiles).
- **Notificación** — `id`, `usuario_id`, `oferta_id`, `tipo` (compromiso / vencimiento próximo / retraso), `mensaje`, `fecha`, `leída`.

## 10. Casos de uso principales

1. **Crear oferta:** el líder de proyectos crea una oferta, define el tamaño y el sistema genera las tareas y fechas límite automáticamente.
2. **Consultar agenda:** un profesional abre la aplicación y ve sus tareas del día y de los próximos días.
3. **Completar tarea y entregar:** un profesional marca su tarea como completada; el sistema activa el tramo del siguiente profesional.
4. **Aprobación final (líder de la unidad):** tras la tarea 4, la oferta pasa al líder de la unidad, que dispone de 1 día hábil para dar la aprobación final (queda finalizada) o rechazarla. El sistema mide su tiempo de revisión.
5. **Monitorear vencimientos:** el sistema resalta tareas vencidas o próximas a vencer en la agenda de cada profesional.
6. **Consultar cumplimiento de una oferta:** al finalizar (o en curso), se consulta si se cumplió el plazo ofertado, con la diferencia en días y el indicador de cumplimiento.
7. **Consultar desempeño por profesional:** un supervisor revisa el panel de indicadores y ve quién es el más cumplido y quién acumula más atrasos.
8. **Supervisar la operación (líder de la unidad):** accede a un tablero global con todas las ofertas en curso y entregadas, el avance de cada profesional y sus indicadores, con opciones de filtrado y comparación.

---

## 11. Indicadores de cumplimiento (métricas)

Esta sección define cómo se calculan las métricas requeridas. Todos los cálculos de tiempo se hacen en **días hábiles**.

### 11.1 Desviación

```
desviación_tramo  = días_hábiles_usados   − duración_asignada
                    (días_hábiles_usados = fecha_entrega_real − fecha_activación, contados en días hábiles)
                    (duración_asignada = 2 días en ofertas pequeñas, 3 en grandes; 1 día para la aprobación final)

desviación_oferta = fecha_finalización_real − fecha_entrega_comprometida
                    (fecha_entrega_comprometida = plazo ofertado [6 ó 9 días] + 1 día de aprobación final)
```

Interpretación: valor **negativo = adelanto**, **0 = a tiempo**, **positivo = retraso**.

> El tramo se mide siempre desde el momento en que el profesional **recibe** el trabajo, no contra una fecha fija. Así, un retraso heredado del tramo anterior no perjudica la calificación del profesional siguiente: cada quien responde solo por la duración de su propia actividad (RN-07, RN-15).

### 11.2 Indicador de cumplimiento por oferta

Propuesta de fórmula (ajustable según política de la empresa):

```
Si desviación ≤ 0  →  cumplimiento = 100%
Si desviación > 0  →  cumplimiento = máx(0, (1 − desviación / plazo_total) × 100)
```

Ejemplo: una oferta grande (plazo total 9 días) entregada con 2 días de retraso →
`(1 − 2/9) × 100 ≈ 77,8%`.

### 11.3 Indicador de cumplimiento por profesional

Calculado sobre el histórico de tramos entregados por el profesional. Dos enfoques complementarios:

- **Tasa de puntualidad:** `tramos_entregados_a_tiempo / total_tramos × 100`.
- **Desviación promedio:** promedio de la desviación de sus tramos (en días). Un valor ≤ 0 indica que, en promedio, entrega a tiempo o antes.

Este cálculo aplica también al **líder de la unidad**, tomando como tramos sus pasos de aprobación final (plazo de 1 día hábil cada uno).

### 11.4 Indicador de gestión del líder de la unidad

Mide el cumplimiento del plazo de **1 día hábil** para revisar y aprobar cada oferta:

```
tiempo_revisión   = fecha_aprob_unidad − fecha_activación_aprobación   (días hábiles)
cumplimiento_paso = 100% si tiempo_revisión ≤ 1 día; en caso contrario, penalizado por día de retraso
```

El indicador global del líder de la unidad acumula estos pasos (tasa de aprobaciones dentro del plazo y/o desviación promedio). Este paso forma parte del **indicador de cumplimiento general de la oferta** (sección 11.2), ya que la fecha de finalización de la oferta es la fecha de aprobación final.

### 11.5 Comparativa entre profesionales

- **Profesional más cumplido:** mayor tasa de puntualidad (o menor desviación promedio).
- **Profesional con más atrasos:** mayor número de tramos retrasados (o mayor desviación promedio positiva).

> El sistema debe permitir filtrar estos indicadores por **rango de fechas** y por **tamaño de oferta**, para comparaciones justas (un profesional que atiende más ofertas grandes no es directamente comparable con uno que atiende solo pequeñas).

### 11.6 Indicadores agregados

Dos niveles de agregación, mostrados en el panel del líder de la unidad:

```
indicador_cumplimiento_unidad  = promedio( indicador_cumplimiento de todas las ofertas )
rendimiento_promedio (por prof) = promedio( calificaciones de tramo de ese profesional )
```

- El **indicador de cumplimiento de la unidad** es un único valor global que resume qué tan bien cumple la unidad los plazos ofertados al cliente, mirando el resultado por **oferta**.
- El **rendimiento promedio** se calcula **por cada profesional**: es el promedio de las calificaciones de los tramos que esa persona ha gestionado. Sirve para evaluar el desempeño individual y para alimentar la comparativa de la sección 11.5.

> Ambos indicadores deben poder calcularse para un **rango de fechas** determinado, de modo que reflejen el desempeño de un periodo (mes, trimestre, etc.) y no solo el histórico completo.

---

## Anexo: decisiones de negocio (resueltas)

Decisiones tomadas que sustentan las reglas y requisitos anteriores:

- **Festivos:** se usa el **calendario nacional de festivos de Colombia** (incluye los festivos trasladables). Actualizable cada año. *(Ver RNF-04.)*
- **Reasignación:** una tarea **puede reasignarse** a otro profesional del mismo rol cuando el titular no está disponible (reasignación forzosa). *(Ver RN-18, RF-30.)*
- **Retrasos:** si un tramo se entrega tarde, el sistema **recalcula automáticamente** las fechas de los tramos siguientes y la fecha de entrega de la oferta. *(Ver RN-16, RF-29.)*
- **Ofertas en paralelo:** un profesional **sí** puede tener varias ofertas activas al mismo tiempo; la aplicación las muestra en su agenda para facilitar la visualización. *(Ver RN-17.)*
- **Notificaciones:** se requieren notificaciones de **compromisos** y de **retrasos**, y un **código de colores** en el dashboard para identificar lo más crítico. *(Ver RF-27, RF-28.)*
- **Fórmula de cumplimiento:** se mantiene la fórmula de la sección 11.2 (refleja la desviación real).
- **Responsabilidad del retraso:** el retraso de un tramo es **responsabilidad exclusiva del profesional que lo gestiona**. Cada profesional se califica solo por cumplir la duración de su actividad (2 ó 3 días), medida desde que recibe el trabajo. El desplazamiento que su retraso causa en los tramos siguientes **no afecta la calificación** de los demás, aunque sí mueve la fecha de entrega de la oferta. *(Ver RN-07, RN-15.)*
- **Adelantos:** un adelanto cuenta como **100%** (tope). *(Ver sección 11.2.)*
- **Tiempo de aprobación:** el día de aprobación final del líder de la unidad **se suma aparte**, fuera del plazo ofertado al cliente (6/9 días). *(Ver RN-08.)*
- **Efecto del rechazo:** el tiempo de corrección tras un rechazo **se contabiliza aparte**: solo afecta la duración total de la oferta y **no** se computa como retraso del profesional. *(Ver RN-19.)*
