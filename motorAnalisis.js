// ═══════════════════════════════════════════════════════════════
// motorAnalisis.js — OLVISIÓN · Centro de Inteligencia
// ═══════════════════════════════════════════════════════════════
// Motor de cálculo puro (sin DOM). Recibe datos crudos de Supabase
// (registros, gastos, empleados) y devuelve indicadores y análisis.
// No hace llamadas a IA externa ni consume tokens: todo es JS local.
//
// Funciones exportadas (todas quedan en window, sin bundler):
//   calcularKPIsMes()
//   calcularObjetivosAutomaticos() / resolverObjetivos()
//   calcularCEOScore()
//   generarResumen()
//   detectarAlertas()
//   detectarOportunidades()
//   generarPlanAccion()
//   generarRecomendaciones()
//   compararMeses()
//   predecirCierre()
//   semaforoKPI()
//   comentarioVendedor()
//
// Depende de REGLAS_NEGOCIO, definido en reglasNegocio.js
// (cargar ese script ANTES que este, o después — el orden no
// importa porque las reglas se leen recién cuando se ejecuta
// detectarAlertas()/generarRecomendaciones(), no al cargar el archivo).
// ═══════════════════════════════════════════════════════════════

// ── Constantes de negocio (únicas, no repetidas por reglas) ──────
const PRODUCTOS_OPTICOS_IA = ['Recetado', 'Reposicion C.', 'PAMI', 'Pase'];
const TIPO_MULTIFOCAL_IA = 'progresivo'; // confirmado por Andrés: multifocal = progresivo

// Pesos del CEO Score sin el factor Margen (no hay datos de costo todavía).
// Editable acá o, más adelante, desde configuracion.ceo_score_pesos en Supabase.
const PESOS_CEO_SCORE_DEFAULT = {
  facturacion: 30,
  ordenes: 23,
  ticket: 18,
  dependencia: 12,
  mix: 6,
  cobranza: 6,
  gastos: 5
};

function clampIA(n, min, max) { return Math.max(min, Math.min(max, n)); }
function formatPesosIA(n) { if (!n || isNaN(n)) return '$0'; return '$' + Math.round(n).toLocaleString('es-AR'); }

// Normaliza variantes de escritura de productos (mismo criterio que caja.html)
function normalizarProductoIA(raw) {
  if (!raw) return raw;
  const s = raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mapa = {
    'recetado':'Recetado','sol':'Sol','lentes':'Lentes','taller':'Taller',
    'accesorio':'Accesorio','saldo':'Saldo','liquidos':'Liquidos','pase':'Pase','pami':'PAMI',
    'reposicion c.':'Reposicion C.','reposicion c':'Reposicion C.',
    'reposicion cristales':'Reposicion C.','reposicion':'Reposicion C.'
  };
  return mapa[s] || raw;
}

function parseDetalleIA(detalleJson) {
  if (!detalleJson) return null;
  try { return JSON.parse(detalleJson); } catch (e) { return null; }
}

// ── 1. KPIs del mes ────────────────────────────────────────────
// registrosMes: array crudo de la tabla `registros` (ventas + egresos mezclados)
// gastosMes: array crudo de la tabla `gastos`
// empleados: array de la tabla `empleados`
function calcularKPIsMes(registrosMes, gastosMes, empleados) {
  const regs = (registrosMes || []).map(r => ({ ...r, producto: normalizarProductoIA(r.producto) }));
  const ventas = regs.filter(r => !r.egreso || parseFloat(r.egreso) === 0);
  const egresosArr = regs.filter(r => parseFloat(r.egreso) > 0);
  const ventasReales = ventas.filter(r => r.producto !== 'Saldo'); // Saldo = cobro de deuda, no venta nueva

  const facturacion = ventasReales.reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
  const cantOrdenes = ventasReales.length;
  const ticketPromedio = cantOrdenes > 0 ? facturacion / cantOrdenes : 0;

  const cobrado = ventas.reduce((s, r) => s + (parseFloat(r.a_cuenta) > 0 ? parseFloat(r.a_cuenta) : parseFloat(r.total) || 0), 0);
  const egresosCaja = egresosArr.reduce((s, r) => s + (parseFloat(r.egreso) || 0), 0);
  const netoCaja = cobrado - egresosCaja;
  const saldoPendiente = ventasReales.reduce((s, r) => s + (parseFloat(r.saldo) || 0), 0);

  const opticas = ventasReales.filter(r => PRODUCTOS_OPTICOS_IA.includes(r.producto));
  const totalOptico = opticas.reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
  const cantOpticas = opticas.length;
  const ticketOptico = cantOpticas > 0 ? totalOptico / cantOpticas : 0;
  const mixOpticoPct = facturacion > 0 ? (totalOptico / facturacion * 100) : 0;

  // Multifocales / fotocromáticos: solo entre las ópticas que tienen "tipo" cargado
  let conTipo = 0, multifocales = 0, fotocromaticos = 0;
  opticas.forEach(r => {
    const d = parseDetalleIA(r.detalle_producto);
    if (!d || !d.tipo) return;
    conTipo++;
    if ((d.tipo || '').toLowerCase() === TIPO_MULTIFOCAL_IA) multifocales++;
    if ((d.tratamiento || '').toLowerCase().includes('fotocrom')) fotocromaticos++;
  });
  const multifocalesPct = conTipo > 0 ? (multifocales / conTipo * 100) : 0;
  const fotocromaticosPct = conTipo > 0 ? (fotocromaticos / conTipo * 100) : 0;

  const sinVendedor = ventasReales.filter(r => !r.vendedor).length;
  const productosSinVendedorPct = cantOrdenes > 0 ? (sinVendedor / cantOrdenes * 100) : 0;

  // Ranking por vendedor (por facturado)
  const porVendedor = {};
  ventasReales.forEach(r => {
    const v = r.vendedor || 'Sin asignar';
    if (!porVendedor[v]) porVendedor[v] = { monto: 0, cant: 0, mix: {} };
    porVendedor[v].monto += (parseFloat(r.total) || 0);
    porVendedor[v].cant += 1;
    porVendedor[v].mix[r.producto] = (porVendedor[v].mix[r.producto] || 0) + (parseFloat(r.total) || 0);
  });
  const rankingVendedores = Object.entries(porVendedor).map(([nombre, d]) => ({
    nombre, monto: d.monto, cant: d.cant,
    ticket: d.cant > 0 ? d.monto / d.cant : 0,
    pct: facturacion > 0 ? (d.monto / facturacion * 100) : 0,
    mix: d.mix
  })).sort((a, b) => b.monto - a.monto);
  const vendedorLider = rankingVendedores[0] || null;
  const dependenciaPct = vendedorLider ? vendedorLider.pct : 0;

  // Participación por producto
  const porProducto = {};
  ventasReales.forEach(r => {
    const p = r.producto || 'Otro';
    if (!porProducto[p]) porProducto[p] = { monto: 0, cant: 0 };
    porProducto[p].monto += (parseFloat(r.total) || 0);
    porProducto[p].cant += 1;
  });
  const participacionProductos = Object.entries(porProducto).map(([nombre, d]) => ({
    nombre, monto: d.monto, cant: d.cant, pct: facturacion > 0 ? (d.monto / facturacion * 100) : 0
  })).sort((a, b) => b.monto - a.monto);

  // Concentración por forma de pago
  const porForma = {};
  ventas.forEach(r => {
    const f = r.forma_pago || 'Sin dato';
    const monto = parseFloat(r.a_cuenta) > 0 ? parseFloat(r.a_cuenta) : parseFloat(r.total) || 0;
    porForma[f] = (porForma[f] || 0) + monto;
  });
  const formaPagoArr = Object.entries(porForma).map(([nombre, monto]) => ({
    nombre, monto, pct: cobrado > 0 ? (monto / cobrado * 100) : 0
  })).sort((a, b) => b.monto - a.monto);
  const formaPagoMax = formaPagoArr[0] || null;

  const gastosAdmin = (gastosMes || []).reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);
  const gastosPct = facturacion > 0 ? (gastosAdmin / facturacion * 100) : 0;
  const cobranzaPct = facturacion > 0 ? Math.min(100, cobrado / facturacion * 100) : 0;

  const diasSinVentasConsecutivos = calcularRachaSinVentasIA(regs);

  return {
    facturacion, cobrado, saldoPendiente, egresosCaja, gastosAdmin, netoCaja,
    cantOrdenes, ticketPromedio, cantOpticas, ticketOptico, mixOpticoPct,
    multifocalesPct, fotocromaticosPct, productosSinVendedorPct,
    dependenciaPct, vendedorLider, cobranzaPct, gastosPct,
    rankingVendedores, participacionProductos, formaPagoArr, formaPagoMax,
    diasSinVentasConsecutivos
  };
}

function calcularRachaSinVentasIA(regs) {
  const ventas = regs.filter(r => !r.egreso || parseFloat(r.egreso) === 0);
  const diasConVenta = new Set(ventas.map(r => r.fecha));
  let racha = 0;
  const hoy = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(hoy); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (diasConVenta.has(key)) break;
    racha++;
  }
  return racha;
}

// ── 2. Objetivos automáticos ───────────────────────────────────
// historicoMeses: array de resultados de calcularKPIsMes() de hasta 3 meses previos
function calcularObjetivosAutomaticos(historicoMeses) {
  if (!historicoMeses || !historicoMeses.length) return null;
  const prom = campo => historicoMeses.reduce((s, m) => s + (m[campo] || 0), 0) / historicoMeses.length;
  return {
    facturacion: Math.round(prom('facturacion') * 1.10),
    ticketPromedio: Math.round(prom('ticketPromedio') * 1.10),
    cantOrdenes: Math.round(prom('cantOrdenes') * 1.10),
    cobranzaPct: Math.min(100, Math.round(prom('cobranzaPct') * 1.05)),
    gastosPct: Math.round(prom('gastosPct') * 0.90),
    dependenciaPct: Math.round(prom('dependenciaPct') * 0.90)
  };
}

// Combina el objetivo automático con overrides manuales (futuro: configuracion.kpi_objetivos_manual)
function resolverObjetivos(objetivosAuto, overridesManual) {
  return { ...(objetivosAuto || {}), ...(overridesManual || {}) };
}

// ── 3. CEO Score ────────────────────────────────────────────────
function calcularCEOScore(kpis, objetivos, pesos) {
  pesos = pesos || PESOS_CEO_SCORE_DEFAULT;
  if (!objetivos) {
    return {
      score: null, nivel: 'Sin datos suficientes', emoji: '⚪', detalle: [],
      explicacion: 'Todavía no hay al menos un mes anterior con datos para calcular objetivos automáticos. El score se habilita a partir del segundo mes de uso.'
    };
  }
  const scoreFacturacion = objetivos.facturacion > 0 ? Math.min(100, kpis.facturacion / objetivos.facturacion * 100) : 0;
  const scoreOrdenes = objetivos.cantOrdenes > 0 ? Math.min(100, kpis.cantOrdenes / objetivos.cantOrdenes * 100) : 0;
  const scoreTicket = objetivos.ticketPromedio > 0 ? Math.min(100, kpis.ticketPromedio / objetivos.ticketPromedio * 100) : 0;
  const scoreDependencia = clampIA(100 - Math.max(0, (kpis.dependenciaPct - 30)) * 2, 0, 100);
  const scoreMix = clampIA(kpis.mixOpticoPct / 60 * 100, 0, 100); // objetivo interno: 60% ópticos
  const scoreCobranza = clampIA(kpis.cobranzaPct, 0, 100);
  const scoreGastos = clampIA(100 - Math.max(0, (kpis.gastosPct - 25)) * 3, 0, 100); // objetivo interno: gastos <=25%

  const detalle = [
    { factor: 'Facturación', peso: pesos.facturacion, score: scoreFacturacion },
    { factor: 'Órdenes', peso: pesos.ordenes, score: scoreOrdenes },
    { factor: 'Ticket promedio', peso: pesos.ticket, score: scoreTicket },
    { factor: 'Dependencia comercial', peso: pesos.dependencia, score: scoreDependencia },
    { factor: 'Mix de productos', peso: pesos.mix, score: scoreMix },
    { factor: 'Cobranza', peso: pesos.cobranza, score: scoreCobranza },
    { factor: 'Gastos', peso: pesos.gastos, score: scoreGastos }
  ];
  const score = Math.round(detalle.reduce((s, d) => s + (d.peso / 100 * d.score), 0));

  let nivel, emoji;
  if (score >= 80) { nivel = 'Excelente'; emoji = '🟢'; }
  else if (score >= 60) { nivel = 'Bueno'; emoji = '🟡'; }
  else if (score >= 40) { nivel = 'Atención'; emoji = '🟠'; }
  else { nivel = 'Crítico'; emoji = '🔴'; }

  const factorMasDebil = [...detalle].sort((a, b) => a.score - b.score)[0];
  const fuertes = detalle.filter(d => d.score >= 70).map(d => d.factor);
  const explicacion = `El puntaje se apoya en ${fuertes.length ? fuertes.join(', ') : 'ningún factor fuerte todavía'}. `
    + `El punto más débil es "${factorMasDebil.factor}" (${Math.round(factorMasDebil.score)}/100).`;

  return { score, nivel, emoji, detalle, explicacion };
}

// ── 4. Resumen ejecutivo (texto por reglas, sin IA) ────────────
function generarResumen(kpis, ceoScore, alertas, comparacion) {
  const frases = [];
  if (ceoScore.score !== null) {
    frases.push(`El negocio cierra el mes con un CEO Score de ${ceoScore.score}/100 (${ceoScore.nivel}).`);
  }
  if (comparacion && comparacion.facturacion) {
    const c = comparacion.facturacion;
    const verbo = c.direccion === 'up' ? 'creció' : c.direccion === 'down' ? 'cayó' : 'se mantuvo estable';
    frases.push(`La facturación ${verbo}${c.direccion !== '=' ? ' un ' + Math.abs(c.pct).toFixed(0) + '%' : ''} respecto al mes anterior.`);
  }
  if (kpis.dependenciaPct >= 40 && kpis.vendedorLider) {
    frases.push(`Hay una dependencia comercial alta: ${kpis.vendedorLider.nombre} concentra el ${kpis.dependenciaPct.toFixed(0)}% de las ventas.`);
  }
  if (kpis.cantOpticas >= 5 && kpis.multifocalesPct < 10) {
    frases.push(`Las ventas de multifocales están por debajo del potencial (${kpis.multifocalesPct.toFixed(0)}% de las órdenes ópticas), hay una oportunidad de crecimiento ahí.`);
  }
  const criticas = (alertas || []).filter(a => a.nivel === 'crítico');
  if (criticas.length) {
    frases.push(`Se detectaron ${criticas.length} situación${criticas.length !== 1 ? 'es' : ''} que requiere${criticas.length !== 1 ? 'n' : ''} atención inmediata este mes.`);
  } else {
    frases.push('No hay alertas críticas este mes.');
  }
  return frases.join(' ');
}

// ── 5/10. Alertas y recomendaciones (leen REGLAS_NEGOCIO) ──────
function _evaluarRegla(regla, ctx) {
  try { return !!regla.condicion(ctx); } catch (e) { console.warn('Regla', regla.id, 'falló:', e); return false; }
}

function detectarAlertas(ctx) {
  if (typeof REGLAS_NEGOCIO === 'undefined') return [];
  return REGLAS_NEGOCIO.filter(r => r.alerta && _evaluarRegla(r, ctx)).map(r => ({
    id: r.id,
    nivel: r.alerta.nivel,
    mensaje: typeof r.alerta.mensaje === 'function' ? r.alerta.mensaje(ctx) : r.alerta.mensaje,
    causa: typeof r.alerta.causa === 'function' ? r.alerta.causa(ctx) : r.alerta.causa
  }));
}

function generarRecomendaciones(ctx) {
  if (typeof REGLAS_NEGOCIO === 'undefined') return [];
  return REGLAS_NEGOCIO.filter(r => r.recomendacion && _evaluarRegla(r, ctx)).map(r => ({
    id: r.id,
    mensaje: typeof r.recomendacion.mensaje === 'function' ? r.recomendacion.mensaje(ctx) : r.recomendacion.mensaje,
    impacto: r.recomendacion.impacto
  })).sort((a, b) => b.impacto - a.impacto);
}

function generarPlanAccion(ctx, maxItems) {
  maxItems = maxItems || 6;
  const recs = generarRecomendaciones(ctx);
  const vistos = new Set();
  const plan = [];
  recs.forEach(r => { if (!vistos.has(r.mensaje)) { vistos.add(r.mensaje); plan.push(r); } });
  return plan.slice(0, maxItems);
}

// ── 6. Oportunidades (estimaciones "qué pasaría si") ───────────
function detectarOportunidades(kpis) {
  const oportunidades = [];
  if (kpis.ticketPromedio > 0 && kpis.cantOrdenes > 0) {
    const extra = kpis.ticketPromedio * 0.10 * kpis.cantOrdenes;
    oportunidades.push({ mensaje: 'Si el ticket promedio aumentara un 10%', estimado: extra, detalle: `facturación estimada adicional de ${formatPesosIA(extra)}` });
  }
  if (kpis.ticketOptico > 0) {
    const extra = kpis.ticketOptico * 5;
    oportunidades.push({ mensaje: 'Si se vendieran 5 multifocales más este mes', estimado: extra, detalle: `ingreso adicional estimado de ${formatPesosIA(extra)} (usando el ticket óptico promedio como referencia)` });
  }
  if (kpis.facturacion > 0) {
    const extra = kpis.facturacion * 0.05;
    oportunidades.push({ mensaje: 'Si la conversión de consultas a ventas mejorara un 5%', estimado: extra, detalle: `facturación estimada adicional de ${formatPesosIA(extra)} — estimación aproximada, la app no registra tráfico/consultas todavía` });
  }
  const contacto = (kpis.participacionProductos || []).find(p => p.nombre === 'Lentes');
  if (contacto && contacto.monto > 0) {
    const extra = contacto.monto * 0.15;
    oportunidades.push({ mensaje: 'Si crecieran un 15% las ventas de lentes de contacto', estimado: extra, detalle: `ingreso adicional estimado de ${formatPesosIA(extra)}` });
  }
  return oportunidades;
}

// ── 7. Comparación de meses ─────────────────────────────────────
function compararMeses(actual, anterior, mismoMesAnioPasado) {
  const campos = ['facturacion', 'ticketPromedio', 'cantOrdenes', 'cobrado', 'gastosAdmin'];
  const comparar = (a, b) => {
    if (!a || !b) return null;
    const out = {};
    campos.forEach(c => {
      const va = a[c] || 0, vb = b[c] || 0;
      let pct = 0, direccion = '=';
      if (vb > 0) pct = ((va - vb) / vb) * 100;
      else if (va > 0) pct = 100;
      if (pct > 1) direccion = 'up'; else if (pct < -1) direccion = 'down';
      out[c] = { pct, direccion, valorAnterior: vb, valorActual: va };
    });
    return out;
  };
  const vsAnterior = comparar(actual, anterior);
  return { ...(vsAnterior || {}), vsAnioPasado: mismoMesAnioPasado ? comparar(actual, mismoMesAnioPasado) : null };
}

// ── 8. Predicción de cierre ─────────────────────────────────────
function predecirCierre(kpis, fechaHoy, anio, mes) {
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const esMesEnCurso = (fechaHoy.getFullYear() === anio && fechaHoy.getMonth() === mes);
  const diaActual = esMesEnCurso ? fechaHoy.getDate() : diasEnMes;
  const pctTranscurrido = diaActual / diasEnMes;
  if (pctTranscurrido <= 0) return null;

  const ritmoFacturacion = kpis.facturacion / diaActual;
  const ritmoOrdenes = kpis.cantOrdenes / diaActual;
  const ritmoCobrado = kpis.cobrado / diaActual;

  let confianza = 'baja';
  if (!esMesEnCurso) confianza = 'alta (mes cerrado)';
  else if (pctTranscurrido >= 0.7) confianza = 'alta';
  else if (pctTranscurrido >= 0.3) confianza = 'media';

  return {
    esMesEnCurso,
    facturacionEstimada: Math.round(ritmoFacturacion * diasEnMes),
    ordenesEstimadas: Math.round(ritmoOrdenes * diasEnMes),
    cobradoEstimado: Math.round(ritmoCobrado * diasEnMes),
    confianza, diasTranscurridos: diaActual, diasEnMes,
    utilidadEstimada: null // no disponible: requiere datos de costo por venta
  };
}

// ── 9. Semáforo genérico para KPIs individuales ────────────────
// invertido = true para KPIs donde "menos es mejor" (ej: gastos, dependencia)
function semaforoKPI(actual, objetivo, invertido) {
  if (!objetivo || objetivo <= 0) return { emoji: '⚪', pct: null };
  const pct = invertido ? (objetivo / Math.max(actual, 0.0001) * 100) : (actual / objetivo * 100);
  if (pct >= 100) return { emoji: '🟢', pct };
  if (pct >= 80) return { emoji: '🟡', pct };
  if (pct >= 60) return { emoji: '🟠', pct };
  return { emoji: '🔴', pct };
}

// ── Detalle por vendedor: comentario automático ────────────────
function comentarioVendedor(v) {
  if (v.pct >= 40) return `${v.nombre} concentra el ${v.pct.toFixed(0)}% de las ventas. Riesgo de dependencia.`;
  if (v.pct < 10) return `${v.nombre} tiene baja participación (${v.pct.toFixed(0)}%). Revisar involucramiento comercial.`;
  return `${v.nombre} tiene una participación equilibrada (${v.pct.toFixed(0)}%).`;
}

// ── Serie diaria de facturación (para el gráfico de barras por día) ────
// Devuelve un array con TODOS los días del mes (aunque no haya ventas ese día),
// para que el gráfico muestre huecos reales en vez de saltarlos.
function calcularSerieDiaria(registrosMes, anio, mes) {
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const porDia = {};
  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    porDia[fecha] = 0;
  }
  (registrosMes || []).forEach(r => {
    if (parseFloat(r.egreso) > 0) return;
    const p = normalizarProductoIA(r.producto);
    if (p === 'Saldo') return;
    if (porDia[r.fecha] === undefined) return;
    porDia[r.fecha] += (parseFloat(r.total) || 0);
  });
  return Object.keys(porDia).sort().map(fecha => ({
    fecha, dia: parseInt(fecha.split('-')[2], 10), monto: porDia[fecha]
  }));
}
