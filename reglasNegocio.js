// ═══════════════════════════════════════════════════════════════
// reglasNegocio.js — OLVISIÓN · Centro de Inteligencia
// ═══════════════════════════════════════════════════════════════
// FUENTE ÚNICA DE VERDAD: cada regla es un objeto independiente con
// TODO lo que describe esa situación de negocio: nivel de severidad,
// impacto, dificultad y tiempo para resolverla. motorAnalisis.js NO
// vuelve a definir estos valores en ningún lado — solo los lee de acá.
//
// Para agregar una regla nueva: agregar un objeto más a REGLAS_NEGOCIO.
// No hace falta tocar motorAnalisis.js ni ningún otro archivo.
//
// condicion(ctx) => boolean
//   ctx = { kpis, objetivos, comparacion, ceoScore, productos }
//   (armado en inteligencia.html, ver pintarInforme())
//
// nivel: 'crítico' | 'alto' | 'medio' | 'informativo'
//   🔴 crítico     — el negocio está en riesgo real, actuar ya
//   🟠 alto        — impacta el resultado del mes, atender esta semana
//   🟡 medio       — vale la pena trabajarlo, no es urgente
//   🔵 informativo — dato de contexto, positivo o neutro
//
// impacto: 1-5 estrellas — cuánto cambiaría el negocio si se resuelve/aplica
// dificultad: 1-5 — 1 = inmediato y fácil, 5 = requiere semanas/estructura
// tiempoEstimado: texto libre corto ("2 semanas", "inmediato"...)
//
// alerta (opcional):        { mensaje, causa }          — para la sección Alertas
// recomendacion (opcional): { mensaje }                 — para Plan de acción / Recomendaciones
//
// mensaje/causa pueden ser texto fijo o función(ctx) => texto.
//
// 25 reglas cubriendo las 10 categorías pedidas originalmente. Escalable
// a 50+ agregando entradas nuevas, sin reescribir las existentes.
// ═══════════════════════════════════════════════════════════════

const REGLAS_NEGOCIO = [

  // ── Facturación / ritmo comercial ──────────────────────────
  {
    id: 'facturacion_cayo',
    nivel: 'alto', impacto: 4, dificultad: 2, tiempoEstimado: '1 semana',
    condicion: ctx => ctx.comparacion?.facturacion?.direccion === 'down' && Math.abs(ctx.comparacion.facturacion.pct) >= 10,
    alerta: { mensaje: ctx => `La facturación cayó ${Math.abs(ctx.comparacion.facturacion.pct).toFixed(0)}% respecto al mes anterior.`, causa: 'Menos operaciones, tickets más bajos, o estacionalidad.' },
    recomendacion: { mensaje: 'Revisar qué cambió respecto al mes pasado: tráfico, mix de productos o ausencias del equipo.' }
  },
  {
    id: 'facturacion_crecio_fuerte',
    nivel: 'informativo', impacto: 2, dificultad: 1, tiempoEstimado: 'unos días',
    condicion: ctx => ctx.comparacion?.facturacion?.direccion === 'up' && ctx.comparacion.facturacion.pct >= 15,
    alerta: { mensaje: ctx => `La facturación creció ${ctx.comparacion.facturacion.pct.toFixed(0)}% respecto al mes anterior. 🎉`, causa: 'Buen desempeño comercial general.' },
    recomendacion: { mensaje: 'Identificar qué funcionó este mes para repetirlo (producto, vendedor, campaña).' }
  },
  {
    id: 'facturacion_supera_objetivo',
    nivel: 'informativo', impacto: 1, dificultad: 1, tiempoEstimado: 'inmediato',
    condicion: ctx => ctx.objetivos?.facturacion > 0 && ctx.kpis.facturacion >= ctx.objetivos.facturacion,
    alerta: { mensaje: ctx => `La facturación superó el objetivo del mes ($${Math.round(ctx.objetivos.facturacion).toLocaleString('es-AR')}).`, causa: 'Buen ritmo comercial general.' },
    recomendacion: { mensaje: 'Subir un poco el objetivo del próximo mes para seguir exigiendo mejora continua.' }
  },

  // ── Ticket / órdenes ────────────────────────────────────────
  {
    id: 'ticket_cayo',
    nivel: 'alto', impacto: 4, dificultad: 3, tiempoEstimado: '2-3 semanas',
    condicion: ctx => ctx.comparacion?.ticketPromedio?.direccion === 'down' && Math.abs(ctx.comparacion.ticketPromedio.pct) >= 10,
    alerta: { mensaje: ctx => `El ticket promedio cayó ${Math.abs(ctx.comparacion.ticketPromedio.pct).toFixed(0)}% respecto al mes anterior.`, causa: 'Menos ventas de productos de mayor valor (multifocales, tratamientos premium).' },
    recomendacion: { mensaje: 'Ofrecer un tratamiento premium (antirreflejo, fotocromático o Blue HD) en cada presupuesto.' }
  },
  {
    id: 'ticket_por_debajo_objetivo',
    nivel: 'medio', impacto: 3, dificultad: 3, tiempoEstimado: '2-3 semanas',
    condicion: ctx => ctx.objetivos?.ticketPromedio > 0 && ctx.kpis.ticketPromedio < ctx.objetivos.ticketPromedio,
    alerta: { mensaje: ctx => `El ticket promedio ($${Math.round(ctx.kpis.ticketPromedio).toLocaleString('es-AR')}) está por debajo del objetivo ($${Math.round(ctx.objetivos.ticketPromedio).toLocaleString('es-AR')}).`, causa: 'Ventas concentradas en productos de menor valor.' },
    recomendacion: { mensaje: 'Ofrecer Blue HD u otro tratamiento premium en todos los presupuestos.' }
  },
  {
    id: 'ordenes_bajaron',
    nivel: 'alto', impacto: 4, dificultad: 2, tiempoEstimado: '2 semanas',
    condicion: ctx => ctx.comparacion?.cantOrdenes?.direccion === 'down' && Math.abs(ctx.comparacion.cantOrdenes.pct) >= 10,
    alerta: { mensaje: ctx => `La cantidad de órdenes bajó ${Math.abs(ctx.comparacion.cantOrdenes.pct).toFixed(0)}% respecto al mes anterior.`, causa: 'Menos tráfico de clientes o menor conversión.' },
    recomendacion: { mensaje: 'Contactar presupuestos pendientes de las últimas semanas y pedir reseñas de Google a clientes recientes.' }
  },

  // ── Cobranza / saldos ───────────────────────────────────────
  {
    id: 'saldos_pendientes_altos',
    nivel: 'medio', impacto: 3, dificultad: 1, tiempoEstimado: 'unos días',
    condicion: ctx => ctx.kpis.facturacion > 0 && (ctx.kpis.saldoPendiente / ctx.kpis.facturacion * 100) >= 15,
    alerta: { mensaje: ctx => `Los saldos pendientes representan el ${(ctx.kpis.saldoPendiente / ctx.kpis.facturacion * 100).toFixed(0)}% de la facturación del mes.`, causa: 'Señas altas sin completar el cobro, o clientes que no vuelven a pagar el resto.' },
    recomendacion: { mensaje: 'Contactar a los clientes con saldos pendientes más antiguos.' }
  },
  {
    id: 'cobranza_baja',
    nivel: 'alto', impacto: 4, dificultad: 2, tiempoEstimado: '1 semana',
    condicion: ctx => ctx.kpis.cobranzaPct < 70,
    alerta: { mensaje: ctx => `Se cobró solo el ${ctx.kpis.cobranzaPct.toFixed(0)}% de lo facturado este mes.`, causa: 'Muchas señas sin completar o ventas con saldo abierto.' },
    recomendacion: { mensaje: 'Priorizar el cobro de saldos antes de tomar nuevas señas grandes.' }
  },

  // ── Dependencia comercial / equipo ──────────────────────────
  {
    id: 'dependencia_alta_naranja',
    nivel: 'alto', impacto: 4, dificultad: 4, tiempoEstimado: '1-2 meses',
    // Umbrales compartidos con calcularCEOScore/generarSaludNegocio (motorAnalisis.js).
    // Por debajo de DEPENDENCIA_UMBRAL_NARANJA (65%) no es un problema real,
    // no se genera ninguna alerta.
    condicion: ctx => ctx.kpis.dependenciaPct >= DEPENDENCIA_UMBRAL_NARANJA && ctx.kpis.dependenciaPct < DEPENDENCIA_UMBRAL_ROJO,
    alerta: { mensaje: ctx => `${ctx.kpis.vendedorLider?.nombre || 'Un vendedor'} concentra el ${ctx.kpis.dependenciaPct.toFixed(0)}% de la facturación.`, causa: 'Empieza a ser una dependencia comercial importante de una sola persona.' },
    recomendacion: { mensaje: 'Capacitar a un segundo vendedor y derivar parte de la cartera de clientes.' }
  },
  {
    id: 'dependencia_alta_roja',
    nivel: 'crítico', impacto: 5, dificultad: 4, tiempoEstimado: '1-2 meses',
    condicion: ctx => ctx.kpis.dependenciaPct >= DEPENDENCIA_UMBRAL_ROJO,
    alerta: { mensaje: ctx => `${ctx.kpis.vendedorLider?.nombre || 'Un vendedor'} concentra el ${ctx.kpis.dependenciaPct.toFixed(0)}% de la facturación.`, causa: 'Dependencia comercial crítica de una sola persona para sostener el negocio.' },
    recomendacion: { mensaje: 'Capacitar a un segundo vendedor y derivar parte de la cartera de clientes con urgencia.' }
  },
  {
    id: 'comisionables_sin_vendedor',
    nivel: 'medio', impacto: 3, dificultad: 1, tiempoEstimado: 'inmediato',
    condicion: ctx => ctx.kpis.comisionablesSinVendedor > 0,
    alerta: {
      mensaje: ctx => `Exist${ctx.kpis.comisionablesSinVendedor !== 1 ? 'en' : 'e'} ${ctx.kpis.comisionablesSinVendedor} trabajo${ctx.kpis.comisionablesSinVendedor !== 1 ? 's' : ''} comisionable${ctx.kpis.comisionablesSinVendedor !== 1 ? 's' : ''} sin vendedor asignado.`,
      causa: 'Carga rápida sin completar el campo vendedor en ventas que sí generan comisión.'
    },
    recomendacion: { mensaje: 'Completar el vendedor en cada venta comisionable (recetados, PAMI, reposición, sol, pases) para no perder trazabilidad de comisiones.' }
  },
  {
    id: 'vendedor_bajo_volumen',
    nivel: 'informativo', impacto: 2, dificultad: 2, tiempoEstimado: '1 semana',
    condicion: ctx => ctx.kpis.cantOrdenes >= 15 && (ctx.kpis.rankingVendedores || []).some(v => v.cant > 0 && v.cant < 3),
    alerta: {
      mensaje: ctx => { const v = ctx.kpis.rankingVendedores.find(x => x.cant > 0 && x.cant < 3); return `${v.nombre} tuvo muy pocas ventas este mes (${v.cant}).`; },
      causa: 'Puede deberse a licencias, ausencias, o baja actividad comercial.'
    },
    recomendacion: { mensaje: 'Revisar la carga de trabajo y motivación del equipo comercial.' }
  },

  // ── Gastos ───────────────────────────────────────────────────
  {
    id: 'gastos_admin_altos',
    nivel: 'alto', impacto: 4, dificultad: 4, tiempoEstimado: '3-4 semanas',
    condicion: ctx => ctx.kpis.gastosPct >= 35,
    alerta: { mensaje: ctx => `Los gastos administrativos representan el ${ctx.kpis.gastosPct.toFixed(0)}% de la facturación.`, causa: 'Estructura de costos elevada respecto a lo facturado.' },
    recomendacion: { mensaje: 'Revisar la estructura de costos y renegociar los gastos fijos más grandes.' }
  },
  {
    id: 'gastos_bajo_control',
    nivel: 'informativo', impacto: 1, dificultad: 1, tiempoEstimado: 'continuo',
    condicion: ctx => ctx.kpis.facturacion > 0 && ctx.kpis.gastosPct > 0 && ctx.kpis.gastosPct <= 20,
    alerta: { mensaje: ctx => `Los gastos administrativos están controlados (${ctx.kpis.gastosPct.toFixed(0)}% de la facturación).`, causa: 'Buena disciplina en la estructura de costos.' },
    recomendacion: { mensaje: 'Mantener el mismo criterio de control de gastos.' }
  },

  // ── Mix de productos ─────────────────────────────────────────
  {
    id: 'pocos_multifocales',
    nivel: 'medio', impacto: 5, dificultad: 3, tiempoEstimado: '2 semanas',
    condicion: ctx => ctx.kpis.cantOpticas >= 5 && ctx.kpis.multifocalesPct < 10,
    alerta: { mensaje: ctx => `Solo el ${ctx.kpis.multifocalesPct.toFixed(0)}% de las órdenes ópticas fueron multifocales (progresivos).`, causa: 'Baja recomendación activa de multifocales por parte del equipo de venta.' },
    recomendacion: { mensaje: 'Publicar un posteo o Reel explicando los beneficios de los multifocales para présbitas.' }
  },
  {
    id: 'baja_fotocromatico',
    nivel: 'medio', impacto: 3, dificultad: 2, tiempoEstimado: '1-2 semanas',
    condicion: ctx => ctx.kpis.cantOpticas >= 5 && ctx.kpis.fotocromaticosPct < 15,
    alerta: { mensaje: ctx => `Solo el ${ctx.kpis.fotocromaticosPct.toFixed(0)}% de las órdenes incluyó tratamiento fotocromático.`, causa: 'Poca oferta activa de fotocromáticos en el mostrador.' },
    recomendacion: { mensaje: 'Ofrecer el tratamiento fotocromático en todos los presupuestos de recetados.' }
  },
  {
    id: 'mix_optico_bajo',
    nivel: 'medio', impacto: 3, dificultad: 3, tiempoEstimado: '2-3 semanas',
    condicion: ctx => ctx.kpis.mixOpticoPct < 40,
    alerta: { mensaje: ctx => `Los productos ópticos (recetados, PAMI, reposición, pase) son solo el ${ctx.kpis.mixOpticoPct.toFixed(0)}% de la facturación.`, causa: 'El negocio está apoyado en productos de menor especialización (sol, accesorios, líquidos).' },
    recomendacion: { mensaje: 'Reforzar la venta de recetados: son el corazón del negocio y suelen tener mejor ticket.' }
  },
  {
    id: 'sin_ventas_contacto',
    nivel: 'informativo', impacto: 2, dificultad: 2, tiempoEstimado: '2 semanas',
    condicion: ctx => ctx.kpis.cantOrdenes >= 10 && !(ctx.productos || []).find(p => p.nombre === 'Lentes' && p.cant > 0),
    alerta: { mensaje: 'No se registraron ventas de lentes de contacto este mes.', causa: 'Puede no ofrecerse activamente o no forma parte del mostrador.' },
    recomendacion: { mensaje: 'Evaluar si conviene ofrecer lentes de contacto de forma más activa.' }
  },
  {
    id: 'accesorios_altos',
    nivel: 'informativo', impacto: 1, dificultad: 1, tiempoEstimado: 'continuo',
    condicion: ctx => ((ctx.productos || []).find(p => p.nombre === 'Accesorio')?.pct || 0) >= 15,
    alerta: { mensaje: ctx => `Los accesorios representan el ${ctx.productos.find(p => p.nombre === 'Accesorio').pct.toFixed(0)}% de la facturación.`, causa: 'Buen desempeño en venta complementaria.' },
    recomendacion: { mensaje: 'Mantener visible el exhibidor de accesorios en el mostrador.' }
  },
  {
    id: 'reposicion_alta',
    nivel: 'informativo', impacto: 2, dificultad: 2, tiempoEstimado: '2 semanas',
    condicion: ctx => ((ctx.productos || []).find(p => p.nombre === 'Reposicion C.')?.pct || 0) >= 20,
    alerta: { mensaje: ctx => `La reposición de cristales representa el ${ctx.productos.find(p => p.nombre === 'Reposicion C.').pct.toFixed(0)}% de la facturación.`, causa: 'Buena base de clientes recurrentes.' },
    recomendacion: { mensaje: 'Aprovechar la base de clientes de reposición para ofrecer actualización de armazón.' }
  },

  // ── Actividad / continuidad ──────────────────────────────────
  {
    id: 'dias_sin_ventas',
    nivel: 'alto', impacto: 3, dificultad: 1, tiempoEstimado: 'inmediato',
    condicion: ctx => ctx.kpis.diasSinVentasConsecutivos >= 3,
    alerta: { mensaje: ctx => `Llevás ${ctx.kpis.diasSinVentasConsecutivos} días consecutivos sin ventas cargadas.`, causa: 'Puede ser un problema real de tráfico, o que no se está cargando la caja al día.' },
    recomendacion: { mensaje: 'Revisar los pedidos críticos y confirmar que la caja esté cargada al día.' }
  },
  {
    id: 'concentracion_forma_pago',
    nivel: 'informativo', impacto: 2, dificultad: 3, tiempoEstimado: '3-4 semanas',
    condicion: ctx => ctx.kpis.formaPagoMax && ctx.kpis.formaPagoMax.pct >= 70,
    alerta: { mensaje: ctx => `El ${ctx.kpis.formaPagoMax.pct.toFixed(0)}% de los cobros fue en "${ctx.kpis.formaPagoMax.nombre}".`, causa: 'Alta concentración en una sola forma de pago.' },
    recomendacion: { mensaje: 'Evaluar si conviene diversificar medios de pago (QR, transferencia) para reducir el manejo de efectivo.' }
  },

  // ── CEO Score / comparación interanual ──────────────────────
  {
    id: 'ceo_score_critico',
    nivel: 'crítico', impacto: 5, dificultad: 3, tiempoEstimado: 'esta semana',
    condicion: ctx => ctx.ceoScore && ctx.ceoScore.score !== null && ctx.ceoScore.score < 40,
    alerta: { mensaje: ctx => `El CEO Score está en nivel crítico (${ctx.ceoScore.score}/100).`, causa: 'Varios indicadores por debajo del objetivo al mismo tiempo.' },
    recomendacion: { mensaje: 'Revisar los pedidos críticos y priorizar las 2-3 alertas de mayor impacto antes de sumar nuevas iniciativas.' }
  },
  {
    id: 'buen_ceo_score',
    nivel: 'informativo', impacto: 2, dificultad: 1, tiempoEstimado: 'unos días',
    condicion: ctx => ctx.ceoScore && ctx.ceoScore.score !== null && ctx.ceoScore.score >= 80,
    alerta: { mensaje: ctx => `El negocio está en un mes excelente (CEO Score ${ctx.ceoScore.score}/100).`, causa: 'Buen desempeño combinado en varios indicadores.' },
    recomendacion: { mensaje: 'Solicitar 5 reseñas de Google a los últimos clientes satisfechos.' }
  },
  {
    id: 'mejora_vs_anio_pasado',
    nivel: 'informativo', impacto: 1, dificultad: 1, tiempoEstimado: 'unos días',
    condicion: ctx => ctx.comparacion?.vsAnioPasado?.facturacion?.direccion === 'up',
    alerta: { mensaje: ctx => `La facturación de este mes es ${ctx.comparacion.vsAnioPasado.facturacion.pct.toFixed(0)}% mayor que la del mismo mes del año pasado.`, causa: 'Crecimiento interanual positivo.' },
    recomendacion: { mensaje: 'Documentar qué cambió respecto al año pasado para sostenerlo.' }
  },
  {
    id: 'empeora_vs_anio_pasado',
    nivel: 'alto', impacto: 3, dificultad: 2, tiempoEstimado: '1 semana',
    condicion: ctx => ctx.comparacion?.vsAnioPasado?.facturacion?.direccion === 'down' && Math.abs(ctx.comparacion.vsAnioPasado.facturacion.pct) >= 10,
    alerta: { mensaje: ctx => `La facturación es ${Math.abs(ctx.comparacion.vsAnioPasado.facturacion.pct).toFixed(0)}% menor que la del mismo mes del año pasado.`, causa: 'Puede ser estacionalidad, competencia, o una baja real de actividad.' },
    recomendacion: { mensaje: 'Comparar qué acciones comerciales se hicieron el año pasado en este mismo mes.' }
  }

  // ─────────────────────────────────────────────────────────────
  // Para sumar una regla nueva, copiar este bloque y completarlo:
  //
  // {
  //   id: 'id_unico_de_la_regla',
  //   nivel: 'crítico'|'alto'|'medio'|'informativo',
  //   impacto: 1,        // 1 a 5 ★
  //   dificultad: 1,     // 1 a 5 (1 = fácil/rápido)
  //   tiempoEstimado: '...',
  //   condicion: ctx => /* devolver true/false */,
  //   alerta: { mensaje: ctx => `...`, causa: '...' },
  //   recomendacion: { mensaje: '...' }
  // },
  // ─────────────────────────────────────────────────────────────
];

// ═══════════════════════════════════════════════════════════════
// REGLAS_RACHAS — Memoria histórica (tendencias sostenidas)
// ═══════════════════════════════════════════════════════════════
// A diferencia de REGLAS_NEGOCIO (evalúan UN mes), estas evalúan una SERIE
// de meses consecutivos. condicion(mesActual, mesAnterior) recibe dos
// resultados de calcularKPIsMes() — mesAnterior es null en el primer mes
// de la serie. Se usan con detectarMemoriaHistorica() en motorAnalisis.js.
//
// minMeses: cuántos meses seguidos hacen falta para que la racha "cuente".
// ═══════════════════════════════════════════════════════════════

const REGLAS_RACHAS = [
  {
    id: 'racha_multifocales_bajo',
    minMeses: 3,
    condicion: (mesActual) => mesActual.cantOpticas >= 5 && mesActual.multifocalesPct < 10,
    mensaje: cant => `La venta de multifocales permanece por debajo del objetivo desde hace ${cant} mes${cant !== 1 ? 'es' : ''} consecutivo${cant !== 1 ? 's' : ''}.`
  },
  {
    id: 'racha_ticket_creciendo',
    minMeses: 3,
    condicion: (mesActual, mesAnterior) => !!mesAnterior && mesActual.ticketPromedio > mesAnterior.ticketPromedio,
    mensaje: cant => `${cant} meses consecutivos con crecimiento del ticket promedio.`
  },
  {
    id: 'racha_dependencia_alta',
    minMeses: 2,
    condicion: (mesActual) => mesActual.dependenciaPct >= DEPENDENCIA_UMBRAL_NARANJA,
    mensaje: cant => `La dependencia comercial se mantiene alta (65% o más) desde hace ${cant} meses.`
  },
  {
    id: 'racha_facturacion_cayendo',
    minMeses: 2,
    condicion: (mesActual, mesAnterior) => !!mesAnterior && mesActual.facturacion < mesAnterior.facturacion,
    mensaje: cant => `${cant} meses consecutivos con caída de facturación.`
  },
  {
    id: 'racha_cobranza_saludable',
    minMeses: 3,
    condicion: (mesActual) => mesActual.cobranzaPct >= 85,
    mensaje: cant => `${cant} meses consecutivos con buena cobranza (85% o más de lo facturado).`
  }

  // Mismo patrón para sumar una racha nueva:
  // { id:'...', minMeses:3, condicion:(actual,anterior)=>/* true/false */, mensaje: cant=>`...` }
];
