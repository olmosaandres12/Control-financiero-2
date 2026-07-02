// ═══════════════════════════════════════════════════════════════
// reglasNegocio.js — OLVISIÓN · Centro de Inteligencia
// ═══════════════════════════════════════════════════════════════
// Cada regla es un objeto independiente. Para agregar una regla
// nueva: agregar un objeto más a REGLAS_NEGOCIO. No hace falta
// tocar motorAnalisis.js ni ningún otro archivo.
//
// condicion(ctx) => boolean
//   ctx = { kpis, objetivos, comparacion, ceoScore, productos }
//   (armado en inteligencia.html, ver pintarInforme())
//
// alerta (opcional):        { nivel: 'crítico'|'atención'|'info', mensaje, causa }
// recomendacion (opcional): { mensaje, impacto: 1-5 }
//
// mensaje/causa pueden ser texto fijo o función(ctx) => texto.
//
// Arrancamos con 24 reglas cubriendo las 10 categorías pedidas.
// Quedan pensadas para escalar a 50+ agregando entradas nuevas,
// sin reescribir las existentes.
// ═══════════════════════════════════════════════════════════════

const REGLAS_NEGOCIO = [

  // ── Facturación / ritmo comercial ──────────────────────────
  {
    id: 'facturacion_cayo',
    condicion: ctx => ctx.comparacion?.facturacion?.direccion === 'down' && Math.abs(ctx.comparacion.facturacion.pct) >= 10,
    alerta: { nivel: 'atención', mensaje: ctx => `La facturación cayó ${Math.abs(ctx.comparacion.facturacion.pct).toFixed(0)}% respecto al mes anterior.`, causa: 'Menos operaciones, tickets más bajos, o estacionalidad.' },
    recomendacion: { mensaje: 'Revisar qué cambió respecto al mes pasado: tráfico, mix de productos o ausencias del equipo.', impacto: 4 }
  },
  {
    id: 'facturacion_crecio_fuerte',
    condicion: ctx => ctx.comparacion?.facturacion?.direccion === 'up' && ctx.comparacion.facturacion.pct >= 15,
    alerta: { nivel: 'info', mensaje: ctx => `La facturación creció ${ctx.comparacion.facturacion.pct.toFixed(0)}% respecto al mes anterior. 🎉`, causa: 'Buen desempeño comercial general.' },
    recomendacion: { mensaje: 'Identificar qué funcionó este mes para repetirlo (producto, vendedor, campaña).', impacto: 2 }
  },
  {
    id: 'facturacion_supera_objetivo',
    condicion: ctx => ctx.objetivos?.facturacion > 0 && ctx.kpis.facturacion >= ctx.objetivos.facturacion,
    alerta: { nivel: 'info', mensaje: ctx => `La facturación superó el objetivo del mes ($${Math.round(ctx.objetivos.facturacion).toLocaleString('es-AR')}).`, causa: 'Buen ritmo comercial general.' },
    recomendacion: { mensaje: 'Subir un poco el objetivo del próximo mes para seguir exigiendo mejora continua.', impacto: 1 }
  },

  // ── Ticket / órdenes ────────────────────────────────────────
  {
    id: 'ticket_cayo',
    condicion: ctx => ctx.comparacion?.ticketPromedio?.direccion === 'down' && Math.abs(ctx.comparacion.ticketPromedio.pct) >= 10,
    alerta: { nivel: 'atención', mensaje: ctx => `El ticket promedio cayó ${Math.abs(ctx.comparacion.ticketPromedio.pct).toFixed(0)}% respecto al mes anterior.`, causa: 'Menos ventas de productos de mayor valor (multifocales, tratamientos premium).' },
    recomendacion: { mensaje: 'Trabajar upselling: tratamientos, marcas premium y segundo par.', impacto: 4 }
  },
  {
    id: 'ticket_por_debajo_objetivo',
    condicion: ctx => ctx.objetivos?.ticketPromedio > 0 && ctx.kpis.ticketPromedio < ctx.objetivos.ticketPromedio,
    alerta: { nivel: 'info', mensaje: ctx => `El ticket promedio ($${Math.round(ctx.kpis.ticketPromedio).toLocaleString('es-AR')}) está por debajo del objetivo ($${Math.round(ctx.objetivos.ticketPromedio).toLocaleString('es-AR')}).`, causa: 'Ventas concentradas en productos de menor valor.' },
    recomendacion: { mensaje: 'Trabajar upselling en el mostrador: tratamientos, marcas premium.', impacto: 3 }
  },
  {
    id: 'ordenes_bajaron',
    condicion: ctx => ctx.comparacion?.cantOrdenes?.direccion === 'down' && Math.abs(ctx.comparacion.cantOrdenes.pct) >= 10,
    alerta: { nivel: 'atención', mensaje: ctx => `La cantidad de órdenes bajó ${Math.abs(ctx.comparacion.cantOrdenes.pct).toFixed(0)}% respecto al mes anterior.`, causa: 'Menos tráfico de clientes o menor conversión.' },
    recomendacion: { mensaje: 'Reforzar puntos de contacto: reseñas de Google, recordatorios de control anual.', impacto: 3 }
  },

  // ── Cobranza / saldos ───────────────────────────────────────
  {
    id: 'saldos_pendientes_altos',
    condicion: ctx => ctx.kpis.facturacion > 0 && (ctx.kpis.saldoPendiente / ctx.kpis.facturacion * 100) >= 15,
    alerta: { nivel: 'atención', mensaje: ctx => `Los saldos pendientes representan el ${(ctx.kpis.saldoPendiente / ctx.kpis.facturacion * 100).toFixed(0)}% de la facturación del mes.`, causa: 'Señas altas sin completar el cobro, o clientes que no vuelven a pagar el resto.' },
    recomendacion: { mensaje: 'Enviar recordatorios de cobro a los saldos más antiguos.', impacto: 3 }
  },
  {
    id: 'cobranza_baja',
    condicion: ctx => ctx.kpis.cobranzaPct < 70,
    alerta: { nivel: 'atención', mensaje: ctx => `Se cobró solo el ${ctx.kpis.cobranzaPct.toFixed(0)}% de lo facturado este mes.`, causa: 'Muchas señas sin completar o ventas con saldo abierto.' },
    recomendacion: { mensaje: 'Priorizar el cobro de saldos antes de tomar nuevas señas grandes.', impacto: 4 }
  },

  // ── Dependencia comercial / equipo ──────────────────────────
  {
    id: 'dependencia_alta',
    condicion: ctx => ctx.kpis.dependenciaPct >= 40,
    alerta: { nivel: 'crítico', mensaje: ctx => `${ctx.kpis.vendedorLider?.nombre || 'Un vendedor'} concentra el ${ctx.kpis.dependenciaPct.toFixed(0)}% de la facturación.`, causa: 'Alta dependencia de una sola persona para sostener el negocio.' },
    recomendacion: { mensaje: 'Capacitar a otro vendedor para distribuir mejor la carga comercial.', impacto: 5 }
  },
  {
    id: 'productos_sin_vendedor',
    condicion: ctx => ctx.kpis.productosSinVendedorPct >= 5,
    alerta: { nivel: 'info', mensaje: ctx => `El ${ctx.kpis.productosSinVendedorPct.toFixed(0)}% de las operaciones no tiene vendedor asignado.`, causa: 'Carga rápida sin completar el campo vendedor.' },
    recomendacion: { mensaje: 'Reforzar la carga completa del campo "Vendedor" en cada operación, para no perder trazabilidad de comisiones ni de performance.', impacto: 2 }
  },
  {
    id: 'vendedor_bajo_volumen',
    condicion: ctx => ctx.kpis.cantOrdenes >= 15 && (ctx.kpis.rankingVendedores || []).some(v => v.cant > 0 && v.cant < 3),
    alerta: {
      nivel: 'info',
      mensaje: ctx => { const v = ctx.kpis.rankingVendedores.find(x => x.cant > 0 && x.cant < 3); return `${v.nombre} tuvo muy pocas ventas este mes (${v.cant}).`; },
      causa: 'Puede deberse a licencias, ausencias, o baja actividad comercial.'
    },
    recomendacion: { mensaje: 'Revisar la carga de trabajo y motivación del equipo comercial.', impacto: 2 }
  },

  // ── Gastos ───────────────────────────────────────────────────
  {
    id: 'gastos_admin_altos',
    condicion: ctx => ctx.kpis.gastosPct >= 35,
    alerta: { nivel: 'atención', mensaje: ctx => `Los gastos administrativos representan el ${ctx.kpis.gastosPct.toFixed(0)}% de la facturación.`, causa: 'Estructura de costos elevada respecto a lo facturado.' },
    recomendacion: { mensaje: 'Revisar la estructura de costos y renegociar los gastos fijos más grandes.', impacto: 4 }
  },
  {
    id: 'gastos_bajo_control',
    condicion: ctx => ctx.kpis.facturacion > 0 && ctx.kpis.gastosPct > 0 && ctx.kpis.gastosPct <= 20,
    alerta: { nivel: 'info', mensaje: ctx => `Los gastos administrativos están controlados (${ctx.kpis.gastosPct.toFixed(0)}% de la facturación).`, causa: 'Buena disciplina en la estructura de costos.' },
    recomendacion: { mensaje: 'Mantener el mismo criterio de control de gastos.', impacto: 1 }
  },

  // ── Mix de productos ─────────────────────────────────────────
  {
    id: 'pocos_multifocales',
    condicion: ctx => ctx.kpis.cantOpticas >= 5 && ctx.kpis.multifocalesPct < 10,
    alerta: { nivel: 'info', mensaje: ctx => `Solo el ${ctx.kpis.multifocalesPct.toFixed(0)}% de las órdenes ópticas fueron multifocales (progresivos).`, causa: 'Baja recomendación activa de multifocales por parte del equipo de venta.' },
    recomendacion: { mensaje: 'Capacitar al equipo en argumentación y venta de multifocales.', impacto: 5 }
  },
  {
    id: 'baja_fotocromatico',
    condicion: ctx => ctx.kpis.cantOpticas >= 5 && ctx.kpis.fotocromaticosPct < 15,
    alerta: { nivel: 'info', mensaje: ctx => `Solo el ${ctx.kpis.fotocromaticosPct.toFixed(0)}% de las órdenes incluyó tratamiento fotocromático.`, causa: 'Poca oferta activa de fotocromáticos en el mostrador.' },
    recomendacion: { mensaje: 'Armar una campaña puntual de fotocromáticos (exhibición + mención directa en cada venta).', impacto: 3 }
  },
  {
    id: 'mix_optico_bajo',
    condicion: ctx => ctx.kpis.mixOpticoPct < 40,
    alerta: { nivel: 'info', mensaje: ctx => `Los productos ópticos (recetados, PAMI, reposición, pase) son solo el ${ctx.kpis.mixOpticoPct.toFixed(0)}% de la facturación.`, causa: 'El negocio está apoyado en productos de menor especialización (sol, accesorios, líquidos).' },
    recomendacion: { mensaje: 'Reforzar la venta de recetados: son el corazón del negocio y suelen tener mejor ticket.', impacto: 3 }
  },
  {
    id: 'sin_ventas_contacto',
    condicion: ctx => ctx.kpis.cantOrdenes >= 10 && !(ctx.productos || []).find(p => p.nombre === 'Lentes' && p.cant > 0),
    alerta: { nivel: 'info', mensaje: 'No se registraron ventas de lentes de contacto este mes.', causa: 'Puede no ofrecerse activamente o no forma parte del mostrador.' },
    recomendacion: { mensaje: 'Evaluar si conviene ofrecer lentes de contacto de forma más activa.', impacto: 2 }
  },
  {
    id: 'accesorios_altos',
    condicion: ctx => ((ctx.productos || []).find(p => p.nombre === 'Accesorio')?.pct || 0) >= 15,
    alerta: { nivel: 'info', mensaje: ctx => `Los accesorios representan el ${ctx.productos.find(p => p.nombre === 'Accesorio').pct.toFixed(0)}% de la facturación.`, causa: 'Buen desempeño en venta complementaria.' },
    recomendacion: { mensaje: 'Mantener visible el exhibidor de accesorios en el mostrador.', impacto: 1 }
  },
  {
    id: 'reposicion_alta',
    condicion: ctx => ((ctx.productos || []).find(p => p.nombre === 'Reposicion C.')?.pct || 0) >= 20,
    alerta: { nivel: 'info', mensaje: ctx => `La reposición de cristales representa el ${ctx.productos.find(p => p.nombre === 'Reposicion C.').pct.toFixed(0)}% de la facturación.`, causa: 'Buena base de clientes recurrentes.' },
    recomendacion: { mensaje: 'Aprovechar la base de clientes de reposición para ofrecer actualización de armazón.', impacto: 2 }
  },

  // ── Actividad / continuidad ──────────────────────────────────
  {
    id: 'dias_sin_ventas',
    condicion: ctx => ctx.kpis.diasSinVentasConsecutivos >= 3,
    alerta: { nivel: 'atención', mensaje: ctx => `Llevás ${ctx.kpis.diasSinVentasConsecutivos} días consecutivos sin ventas cargadas.`, causa: 'Puede ser un problema real de tráfico, o que no se está cargando la caja al día.' },
    recomendacion: { mensaje: 'Verificar si es una baja real de tráfico o una demora en la carga diaria de caja.', impacto: 3 }
  },
  {
    id: 'concentracion_forma_pago',
    condicion: ctx => ctx.kpis.formaPagoMax && ctx.kpis.formaPagoMax.pct >= 70,
    alerta: { nivel: 'info', mensaje: ctx => `El ${ctx.kpis.formaPagoMax.pct.toFixed(0)}% de los cobros fue en "${ctx.kpis.formaPagoMax.nombre}".`, causa: 'Alta concentración en una sola forma de pago.' },
    recomendacion: { mensaje: 'Evaluar si conviene diversificar medios de pago (QR, transferencia) para reducir el manejo de efectivo.', impacto: 2 }
  },

  // ── CEO Score / comparación interanual ──────────────────────
  {
    id: 'ceo_score_critico',
    condicion: ctx => ctx.ceoScore && ctx.ceoScore.score !== null && ctx.ceoScore.score < 40,
    alerta: { nivel: 'crítico', mensaje: ctx => `El CEO Score está en nivel crítico (${ctx.ceoScore.score}/100).`, causa: 'Varios indicadores por debajo del objetivo al mismo tiempo.' },
    recomendacion: { mensaje: 'Priorizar las 2-3 alertas de mayor impacto de este informe antes de sumar nuevas iniciativas.', impacto: 5 }
  },
  {
    id: 'buen_ceo_score',
    condicion: ctx => ctx.ceoScore && ctx.ceoScore.score !== null && ctx.ceoScore.score >= 80,
    alerta: { nivel: 'info', mensaje: ctx => `El negocio está en un mes excelente (CEO Score ${ctx.ceoScore.score}/100).`, causa: 'Buen desempeño combinado en varios indicadores.' },
    recomendacion: { mensaje: 'Aprovechar el buen momento para pedir reseñas de Google y reforzar la marca.', impacto: 2 }
  },
  {
    id: 'mejora_vs_anio_pasado',
    condicion: ctx => ctx.comparacion?.vsAnioPasado?.facturacion?.direccion === 'up',
    alerta: { nivel: 'info', mensaje: ctx => `La facturación de este mes es ${ctx.comparacion.vsAnioPasado.facturacion.pct.toFixed(0)}% mayor que la del mismo mes del año pasado.`, causa: 'Crecimiento interanual positivo.' },
    recomendacion: { mensaje: 'Documentar qué cambió respecto al año pasado para sostenerlo.', impacto: 1 }
  },
  {
    id: 'empeora_vs_anio_pasado',
    condicion: ctx => ctx.comparacion?.vsAnioPasado?.facturacion?.direccion === 'down' && Math.abs(ctx.comparacion.vsAnioPasado.facturacion.pct) >= 10,
    alerta: { nivel: 'atención', mensaje: ctx => `La facturación es ${Math.abs(ctx.comparacion.vsAnioPasado.facturacion.pct).toFixed(0)}% menor que la del mismo mes del año pasado.`, causa: 'Puede ser estacionalidad, competencia, o una baja real de actividad.' },
    recomendacion: { mensaje: 'Comparar qué acciones comerciales se hicieron el año pasado en este mismo mes.', impacto: 3 }
  }

  // ─────────────────────────────────────────────────────────────
  // Para sumar una regla nueva, copiar este bloque y completarlo:
  //
  // {
  //   id: 'id_unico_de_la_regla',
  //   condicion: ctx => /* devolver true/false */,
  //   alerta: { nivel: 'crítico'|'atención'|'info', mensaje: ctx => `...`, causa: '...' },
  //   recomendacion: { mensaje: '...', impacto: 1 }  // 1 a 5
  // },
  // ─────────────────────────────────────────────────────────────
];
