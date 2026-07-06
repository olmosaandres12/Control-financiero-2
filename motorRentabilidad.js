// ═══════════════════════════════════════════════════════════════
// motorRentabilidad.js — OLVISIÓN · Motor de Rentabilidad
// ═══════════════════════════════════════════════════════════════
// Motor de cálculo PURO (sin DOM, sin Supabase, sin depender visualmente de
// inteligencia.html). Recibe números y arrays planos, devuelve objetos
// planos. Se puede reutilizar en futuros reportes, simuladores, PDF o
// cualquier otro dashboard sin arrastrar ningún otro archivo del proyecto.
//
// Independiente de motorAnalisis.js a propósito: no lo importa, no depende
// de sus funciones. Comparte forma de datos por duck-typing (espera un
// objeto kpis con .facturacion/.cantOrdenes/.ticketPromedio, que es
// exactamente lo que ya devuelve calcularKPIsMes()), pero nunca lo llama.
//
// "Margen bruto estimado": todo el motor asume un % de margen CONFIGURADO
// a mano (no hay costo real por producto todavía). Cualquier pantalla que
// muestre estos números debe rotularlos siempre como "estimado" — el motor
// no inventa esa palabra, pero toda la nomenclatura de campos la respeta
// (margenBrutoEstimado, nunca "margen real").
//
// Funciones exportadas (quedan en window, sin bundler):
//   calcularCostosFijosTotales()
//   calcularMargenBrutoEstimado()
//   calcularPuntoEquilibrio()
//   calcularOrdenesNecesarias()
//   calcularTicketNecesario()
//   calcularAvanceEquilibrio()
//   calcularUtilidadEstimada()
//   calcularMargenSeguridad()
//   calcularResultadoRentabilidadDesdeTotales()
//   calcularResultadoRentabilidad()
//   simularEscenario()
//   generarDiagnosticoEstructural()
//   generarRecomendacionesRentabilidad()
//
// Depende de REGLAS_RENTABILIDAD (reglasRentabilidad.js) SOLO para las dos
// últimas funciones — igual que motorAnalisis.js depende de REGLAS_NEGOCIO.
// Todas las demás funciones no dependen de ningún otro archivo.
// ═══════════════════════════════════════════════════════════════

// ── 1. Costos fijos totales ─────────────────────────────────────
// gastosFijosConfigurados: array crudo de la tabla `gastos_fijos_configurados`
// del período. Solo suma los ítems activos (activo !== false).
function calcularCostosFijosTotales(gastosFijosConfigurados) {
  const activos = (gastosFijosConfigurados || []).filter(g => g.activo !== false);
  const total = activos.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);

  const porCategoriaMap = {};
  activos.forEach(g => {
    const cat = g.categoria || 'Otros';
    porCategoriaMap[cat] = (porCategoriaMap[cat] || 0) + (parseFloat(g.monto) || 0);
  });
  const porCategoria = Object.entries(porCategoriaMap)
    .map(([categoria, monto]) => ({ categoria, monto }))
    .sort((a, b) => b.monto - a.monto);

  return { total, porCategoria, cantidadItems: activos.length };
}

// ── 2. Margen bruto estimado ─────────────────────────────────────
// margenPct: número configurado a mano (ej: 45). Hasta que exista costo
// real por producto, TODO el motor gira sobre este supuesto.
function calcularMargenBrutoEstimado(facturacionActual, margenPct) {
  const pct = margenPct || 0;
  return { margenPct: pct, margenMonto: (facturacionActual || 0) * (pct / 100) };
}

// ── 3. Punto de equilibrio ───────────────────────────────────────
// Facturación necesaria para que el margen bruto cubra exactamente los
// costos fijos. null si no hay margen configurado (no se puede calcular).
function calcularPuntoEquilibrio(costosFijosTotal, margenPct) {
  if (!margenPct || margenPct <= 0) return null;
  return (costosFijosTotal || 0) / (margenPct / 100);
}

// ── 4. Órdenes necesarias para equilibrio ───────────────────────
// Camino alternativo al ticket necesario — NO son aditivos, son dos formas
// distintas de llegar al mismo punto de equilibrio (o subís uno, o el otro,
// o combinás ambos, pero no se suman).
function calcularOrdenesNecesarias(puntoEquilibrio, ticketPromedio) {
  if (puntoEquilibrio === null || !ticketPromedio || ticketPromedio <= 0) return null;
  return Math.ceil(puntoEquilibrio / ticketPromedio);
}

// ── 5. Ticket necesario para equilibrio ─────────────────────────
function calcularTicketNecesario(puntoEquilibrio, cantOrdenes) {
  if (puntoEquilibrio === null || !cantOrdenes || cantOrdenes <= 0) return null;
  return puntoEquilibrio / cantOrdenes;
}

// ── 6. Avance hacia el punto de equilibrio + faltante ───────────
function calcularAvanceEquilibrio(facturacionActual, puntoEquilibrio) {
  if (puntoEquilibrio === null || puntoEquilibrio <= 0) return { pctAvance: null, faltante: null };
  const pctAvance = ((facturacionActual || 0) / puntoEquilibrio) * 100;
  const faltante = Math.max(0, puntoEquilibrio - (facturacionActual || 0));
  return { pctAvance, faltante };
}

// ── 7. Utilidad estimada ─────────────────────────────────────────
// Puede dar negativa: margen bruto generado este mes menos costos fijos.
function calcularUtilidadEstimada(facturacionActual, margenPct, costosFijosTotal) {
  const margenMonto = (facturacionActual || 0) * ((margenPct || 0) / 100);
  return margenMonto - (costosFijosTotal || 0);
}

// ── 8. Margen de seguridad ───────────────────────────────────────
// Cuánto por encima (positivo) o por debajo (negativo) del punto de
// equilibrio está la facturación actual, en %. Estándar de gestión: valores
// bajos (<15%) implican que cualquier bache de ventas te manda a pérdida.
function calcularMargenSeguridad(facturacionActual, puntoEquilibrio) {
  if (!facturacionActual || facturacionActual <= 0 || puntoEquilibrio === null) return null;
  return ((facturacionActual - puntoEquilibrio) / facturacionActual) * 100;
}

// ── 9. Resultado consolidado — a partir de TOTALES ya calculados ─
// Núcleo reutilizado tanto por calcularResultadoRentabilidad() (datos
// reales) como por simularEscenario() (datos hipotéticos). Ninguna fórmula
// vive en un solo lugar.
function calcularResultadoRentabilidadDesdeTotales(facturacionActual, cantOrdenesActual, ticketPromedioActual, costosFijosTotal, margenPct) {
  const margenBrutoEstimado = calcularMargenBrutoEstimado(facturacionActual, margenPct);
  const puntoEquilibrio = calcularPuntoEquilibrio(costosFijosTotal, margenPct);
  const avanceEquilibrio = calcularAvanceEquilibrio(facturacionActual, puntoEquilibrio);
  const ordenesNecesarias = calcularOrdenesNecesarias(puntoEquilibrio, ticketPromedioActual);
  const ticketNecesario = calcularTicketNecesario(puntoEquilibrio, cantOrdenesActual);
  const utilidadEstimada = calcularUtilidadEstimada(facturacionActual, margenPct, costosFijosTotal);
  const margenSeguridad = calcularMargenSeguridad(facturacionActual, puntoEquilibrio);

  return {
    facturacionActual, cantOrdenesActual, ticketPromedioActual,
    costosFijosTotal, margenBrutoEstimado, puntoEquilibrio,
    avanceEquilibrio, ordenesNecesarias, ticketNecesario,
    utilidadEstimada, margenSeguridad
  };
}

// ── 10. Resultado consolidado — con datos REALES del mes ────────
// kpis: mismo objeto que devuelve calcularKPIsMes() de motorAnalisis.js
// (duck-typing: solo se leen .facturacion/.cantOrdenes/.ticketPromedio,
// este archivo nunca llama a motorAnalisis.js).
// gastosFijosConfigurados: array crudo de la tabla `gastos_fijos_configurados`.
function calcularResultadoRentabilidad(kpis, gastosFijosConfigurados, margenPct) {
  const costosFijos = calcularCostosFijosTotales(gastosFijosConfigurados);
  const resultado = calcularResultadoRentabilidadDesdeTotales(
    kpis.facturacion, kpis.cantOrdenes, kpis.ticketPromedio, costosFijos.total, margenPct
  );
  return {
    ...resultado,
    costosFijosDetalle: costosFijos.porCategoria,
    costosFijosCantidadItems: costosFijos.cantidadItems
  };
}

// ── 11. Simulador ────────────────────────────────────────────────
// Recalcula TODO a partir de valores hipotéticos (sliders), reusando
// calcularResultadoRentabilidadDesdeTotales — ninguna fórmula se repite acá.
// publicidadExtra: monto adicional de publicidad que el slider suma por
// encima de los costos fijos configurados (para simular "qué pasa si
// invierto más en Meta Ads").
function simularEscenario(params) {
  const {
    ticketPromedio = 0,
    cantOrdenes = 0,
    costosFijosTotales = 0,
    margenPct = 0,
    publicidadExtra = 0
  } = params || {};

  const facturacionSimulada = ticketPromedio * cantOrdenes;
  const costosFijosAjustados = costosFijosTotales + publicidadExtra;

  const resultado = calcularResultadoRentabilidadDesdeTotales(
    facturacionSimulada, cantOrdenes, ticketPromedio, costosFijosAjustados, margenPct
  );

  return { ...resultado, facturacionSimulada, publicidadExtra };
}

// ── 12/13. Diagnóstico estructural y recomendaciones ────────────
// Mismo patrón que detectarAlertas()/generarRecomendaciones() de
// motorAnalisis.js, pero leyendo REGLAS_RENTABILIDAD (reglasRentabilidad.js)
// en vez de REGLAS_NEGOCIO. Se duplica intencionalmente el pequeño helper
// _evaluarReglaRent() (en vez de reusar el de motorAnalisis.js) para que
// este motor pueda cargarse solo, sin depender de ningún otro archivo del
// proyecto — es el mismo criterio de independencia pedido para el módulo.
//
// ctx esperado: { kpis, rentabilidad, gastosFijos, margenPct }
//   rentabilidad = resultado de calcularResultadoRentabilidad()
function _evaluarReglaRent(regla, ctx) {
  try { return !!regla.condicion(ctx); } catch (e) { console.warn('Regla rentabilidad', regla.id, 'falló:', e); return false; }
}

function generarDiagnosticoEstructural(ctx) {
  if (typeof REGLAS_RENTABILIDAD === 'undefined') return [];
  return REGLAS_RENTABILIDAD.filter(r => r.diagnostico && _evaluarReglaRent(r, ctx)).map(r => ({
    id: r.id,
    tipo: r.tipo || 'estructural', // 'estructural' | 'operativo' — para Fase 6 (CEO Brief)
    nivel: r.nivel,
    mensaje: typeof r.diagnostico.mensaje === 'function' ? r.diagnostico.mensaje(ctx) : r.diagnostico.mensaje
  }));
}

function generarRecomendacionesRentabilidad(ctx) {
  if (typeof REGLAS_RENTABILIDAD === 'undefined') return [];
  return REGLAS_RENTABILIDAD.filter(r => r.recomendacion && _evaluarReglaRent(r, ctx)).map(r => ({
    id: r.id,
    mensaje: typeof r.recomendacion.mensaje === 'function' ? r.recomendacion.mensaje(ctx) : r.recomendacion.mensaje,
    impacto: r.impacto,
    dificultad: r.dificultad,
    tiempoEstimado: r.tiempoEstimado
  })).sort((a, b) => b.impacto - a.impacto);
}
